import {
  InstallmentPlanStatus,
  InstallmentScheduleStatus,
  InvoiceStatus,
  PaymentMethod,
  Prisma,
} from "@prisma/client";

import { prisma } from "@/lib/prisma";
import {
  collectionMoneyService,
  type CollectionMoneyDestination,
} from "@/lib/services/collectionMoneyService";
import { installmentService } from "@/lib/services/installmentService";
import {
  resolvePaymentSource,
  type PaymentSourceInput,
} from "@/lib/services/paymentSourceService";

export type AddInstallmentCollectionInput = PaymentSourceInput & {
  clientGeneratedId?: string;
  amount: string;
  method: PaymentMethod;
  reference?: string;
  note?: string;
  paidAt?: string;
  moneyDestination: CollectionMoneyDestination;
  walletId?: string;
  bankAccountId?: string;
};

function emptyToNull(value?: string) {
  const trimmed = value?.trim();
  return trimmed || null;
}

function cents(value: string | number | Prisma.Decimal) {
  const normalized = String(value).trim().replace(",", ".");
  if (!/^\d+(?:\.\d{1,2})?$/.test(normalized)) throw new Error("المبلغ غير صحيح.");
  return Math.round(Number(normalized) * 100);
}

function money(valueInCents: number) {
  return new Prisma.Decimal(valueInCents).div(100);
}

function parseDate(value: string, label: string) {
  const date = new Date(`${value}T12:00:00.000Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(date.getTime())) {
    throw new Error(`${label} غير صحيح.`);
  }
  return date;
}

function paidDate(value?: string) {
  return value?.trim() ? parseDate(value.trim(), "تاريخ الدفع") : new Date();
}

export async function addPayment(
  shopId: string,
  planId: string,
  createdByUserId: string,
  input: AddInstallmentCollectionInput,
) {
  if (input.clientGeneratedId) {
    const existing = await prisma.installmentPayment.findUnique({
      where: { shopId_clientGeneratedId: { shopId, clientGeneratedId: input.clientGeneratedId } },
      select: { planId: true },
    });
    if (existing) return installmentService.getPlanById(shopId, existing.planId);
  }

  const paymentCents = cents(input.amount);
  if (paymentCents <= 0) throw new Error("قيمة الدفعة يجب أن تكون أكبر من صفر.");
  if (input.moneyDestination === "WALLET" && !input.walletId) {
    throw new Error("اختر المحفظة التي استلمت الدفعة.");
  }
  if (input.moneyDestination === "BANK" && !input.bankAccountId) {
    throw new Error("اختر الحساب البنكي الذي استلم الدفعة.");
  }

  await collectionMoneyService.prepareCollectionMoneyAccount(shopId, input.moneyDestination);
  const actualPaidAt = paidDate(input.paidAt);

  await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`
      SELECT id FROM "InstallmentPlan"
      WHERE id = ${planId}::uuid AND "shopId" = ${shopId}::uuid
      FOR UPDATE
    `;
    const plan = await tx.installmentPlan.findFirst({
      where: { id: planId, shopId, deletedAt: null },
      include: { schedules: { orderBy: [{ dueAt: "asc" }, { installmentNo: "asc" }] } },
    });
    if (!plan) throw new Error("خطة الأقساط غير موجودة.");
    if (plan.status !== InstallmentPlanStatus.ACTIVE) {
      throw new Error("لا يمكن تسجيل دفعة على خطة غير نشطة.");
    }
    if (paymentCents > cents(plan.balanceDue)) {
      throw new Error("قيمة الدفعة أكبر من الرصيد المتبقي.");
    }

    const paymentSourceName = await resolvePaymentSource(tx, shopId, input);
    const payment = await tx.installmentPayment.create({
      data: {
        shopId,
        planId,
        createdByUserId,
        clientGeneratedId: emptyToNull(input.clientGeneratedId),
        amount: money(paymentCents),
        method: input.method,
        sourceName: paymentSourceName,
        reference: emptyToNull(input.reference),
        note: emptyToNull(input.note),
        paidAt: actualPaidAt,
      },
    });

    const trackedSourceName = await collectionMoneyService.applyCollectionIncomingTx(
      tx,
      shopId,
      createdByUserId,
      {
        destination: input.moneyDestination,
        walletId: input.walletId,
        bankAccountId: input.bankAccountId,
        amount: money(paymentCents),
        reference: input.reference || plan.planNumber,
        description: `دفعة أقساط ${plan.planNumber} [INSTALLMENT-PAYMENT:${payment.id}]`,
        movementType: "INSTALLMENT_PAYMENT",
        occurredAt: actualPaidAt,
        sourceType: "INSTALLMENT",
        sourceId: plan.id,
        sourceReference: plan.planNumber,
        customerId: plan.customerId,
      },
    );
    const finalSourceName = trackedSourceName || paymentSourceName;
    if (finalSourceName !== paymentSourceName) {
      await tx.installmentPayment.update({
        where: { id: payment.id },
        data: { sourceName: finalSourceName },
      });
    }

    let remaining = paymentCents;
    for (const schedule of plan.schedules) {
      if (remaining <= 0 || schedule.status === InstallmentScheduleStatus.PAID) continue;
      const outstanding = cents(schedule.amount) - cents(schedule.amountPaid);
      const allocated = Math.min(remaining, outstanding);
      if (allocated <= 0) continue;

      const newPaid = cents(schedule.amountPaid) + allocated;
      await tx.installmentPaymentAllocation.create({
        data: {
          paymentId: payment.id,
          installmentId: schedule.id,
          amount: money(allocated),
        },
      });
      await tx.installmentSchedule.update({
        where: { id: schedule.id },
        data: {
          amountPaid: money(newPaid),
          status: newPaid >= cents(schedule.amount)
            ? InstallmentScheduleStatus.PAID
            : InstallmentScheduleStatus.PARTIALLY_PAID,
          paidAt: newPaid >= cents(schedule.amount) ? actualPaidAt : null,
        },
      });
      remaining -= allocated;
    }
    if (remaining !== 0) throw new Error("تعذر توزيع كامل الدفعة على الأقساط.");

    const newAmountPaid = cents(plan.amountPaid) + paymentCents;
    const newBalance = cents(plan.totalAmount) - newAmountPaid;
    await tx.installmentPlan.update({
      where: { id: plan.id },
      data: {
        amountPaid: money(newAmountPaid),
        balanceDue: money(newBalance),
        status: newBalance === 0 ? InstallmentPlanStatus.COMPLETED : InstallmentPlanStatus.ACTIVE,
        completedAt: newBalance === 0 ? actualPaidAt : null,
        version: { increment: 1 },
      },
    });

    if (plan.invoiceId) {
      await tx.$queryRaw`
        SELECT id FROM "Invoice"
        WHERE id = ${plan.invoiceId}::uuid AND "shopId" = ${shopId}::uuid
        FOR UPDATE
      `;
      const invoice = await tx.invoice.findFirst({
        where: { id: plan.invoiceId, shopId, deletedAt: null },
      });
      if (!invoice || invoice.status === InvoiceStatus.VOID) {
        throw new Error("الفاتورة المرتبطة غير صالحة.");
      }
      if (paymentCents > cents(invoice.balanceDue)) {
        throw new Error("الدفعة أكبر من رصيد الفاتورة.");
      }

      const invoicePaid = cents(invoice.amountPaid) + paymentCents;
      const invoiceBalance = cents(invoice.total) - invoicePaid;
      await tx.payment.create({
        data: {
          shopId,
          invoiceId: invoice.id,
          createdByUserId,
          clientGeneratedId: input.clientGeneratedId ? `installment:${input.clientGeneratedId}` : null,
          amount: money(paymentCents),
          method: input.method,
          sourceName: finalSourceName,
          reference: emptyToNull(input.reference) || plan.planNumber,
          note: emptyToNull(input.note) || `دفعة أقساط ${plan.planNumber}`,
          paidAt: actualPaidAt,
        },
      });
      await tx.invoice.update({
        where: { id: invoice.id },
        data: {
          amountPaid: money(invoicePaid),
          balanceDue: money(invoiceBalance),
          status: invoiceBalance === 0 ? InvoiceStatus.PAID : InvoiceStatus.PARTIALLY_PAID,
          paidAt: invoiceBalance === 0 ? actualPaidAt : null,
          version: { increment: 1 },
        },
      });
    }
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 15_000 });

  return installmentService.getPlanById(shopId, planId);
}

export const installmentCollectionService = { addPayment };
