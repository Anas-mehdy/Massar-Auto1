import { randomBytes } from "node:crypto";
import {
  InstallmentPlanSource,
  InvoiceStatus,
  PaymentMethod,
  Prisma,
} from "@prisma/client";

import { prisma } from "@/lib/prisma";
import {
  collectionMoneyService,
  type CollectionMoneyDestination,
} from "@/lib/services/collectionMoneyService";
import { normalizePhone } from "@/lib/services/customerService";
import {
  buildInstallmentSchedule,
  installmentService,
  type CreateInstallmentPlanInput,
} from "@/lib/services/installmentService";
import { dailyCashCloseService } from "@/lib/services/dailyCashCloseService";

export type CreateInstallmentPlanWithCollectionInput = CreateInstallmentPlanInput & {
  downPaymentDestination?: CollectionMoneyDestination;
  downPaymentWalletId?: string;
  downPaymentBankAccountId?: string;
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

function planNumber() {
  const date = new Date().toISOString().slice(2, 10).replaceAll("-", "");
  return `INS-${date}-${randomBytes(3).toString("hex").toUpperCase()}`;
}

export async function createPlan(
  shopId: string,
  createdByUserId: string,
  input: CreateInstallmentPlanWithCollectionInput,
) {
  if (input.clientGeneratedId) {
    const existing = await prisma.installmentPlan.findUnique({
      where: { shopId_clientGeneratedId: { shopId, clientGeneratedId: input.clientGeneratedId } },
      select: { id: true },
    });
    if (existing) return installmentService.getPlanById(shopId, existing.id);
  }

  const firstDueAt = parseDate(input.firstDueAt, "تاريخ أول قسط");
  const downCents = cents(input.downPayment || "0");
  let totalCents = cents(input.totalAmount);
  const downDestination = input.downPaymentDestination || "DRAWER";
  if (downCents > 0 && downDestination === "WALLET" && !input.downPaymentWalletId) {
    throw new Error("اختر المحفظة التي استلمت الدفعة الأولى.");
  }
  if (downCents > 0 && downDestination === "BANK" && !input.downPaymentBankAccountId) {
    throw new Error("اختر الحساب البنكي الذي استلمت الدفعة الأولى.");
  }
  if (downCents > 0) {
    await dailyCashCloseService.assertBusinessDateOpen(shopId, new Date());
    await collectionMoneyService.prepareCollectionMoneyAccount(shopId, downDestination);
  }

  const planId = await prisma.$transaction(async (tx) => {
    let customerId = input.customerId?.trim() || "";
    let invoiceId: string | null = null;
    let source: InstallmentPlanSource = InstallmentPlanSource.MANUAL;

    if (input.invoiceId) {
      await tx.$queryRaw`
        SELECT id FROM "Invoice"
        WHERE id = ${input.invoiceId}::uuid AND "shopId" = ${shopId}::uuid
        FOR UPDATE
      `;
      const invoice = await tx.invoice.findFirst({
        where: { id: input.invoiceId, shopId, deletedAt: null, status: { not: InvoiceStatus.VOID } },
        include: { installmentPlan: { select: { id: true } } },
      });
      if (!invoice) throw new Error("الفاتورة غير موجودة.");
      if (invoice.installmentPlan) throw new Error("توجد خطة أقساط لهذه الفاتورة مسبقاً.");
      if (!invoice.customerId) throw new Error("يجب ربط الفاتورة بعميل قبل تقسيطها.");
      if (downCents !== 0) throw new Error("سجّل الدفعة الأولى على الفاتورة قبل إنشاء الخطة.");
      totalCents = cents(invoice.balanceDue);
      if (totalCents <= 0) throw new Error("لا يوجد رصيد متبقٍ على الفاتورة.");
      customerId = invoice.customerId;
      invoiceId = invoice.id;
      source = InstallmentPlanSource.INVOICE;
    } else if (customerId) {
      const customer = await tx.customer.findFirst({
        where: { id: customerId, shopId, deletedAt: null },
        select: { id: true },
      });
      if (!customer) throw new Error("العميل غير موجود.");
    } else {
      const customerName = input.customerName?.trim();
      if (!customerName) throw new Error("اسم العميل مطلوب.");
      const phone = emptyToNull(input.customerPhone);
      const customer = await tx.customer.create({
        data: { shopId, name: customerName, phone, phoneNormalized: normalizePhone(phone) },
        select: { id: true },
      });
      customerId = customer.id;
    }

    if (totalCents <= 0) throw new Error("المبلغ الإجمالي يجب أن يكون أكبر من صفر.");
    if (downCents < 0 || downCents >= totalCents) {
      throw new Error("الدفعة الأولى يجب أن تكون أقل من المبلغ الإجمالي.");
    }

    const financedCents = totalCents - downCents;
    const schedules = buildInstallmentSchedule(
      financedCents,
      input.installmentCount,
      firstDueAt,
      input.frequency,
    );
    const generatedPlanNumber = planNumber();

    const plan = await tx.installmentPlan.create({
      data: {
        shopId,
        customerId,
        invoiceId,
        createdByUserId,
        clientGeneratedId: emptyToNull(input.clientGeneratedId),
        planNumber: generatedPlanNumber,
        source,
        title: input.title.trim(),
        notes: emptyToNull(input.notes),
        totalAmount: money(totalCents),
        downPayment: money(downCents),
        financedAmount: money(financedCents),
        amountPaid: money(downCents),
        balanceDue: money(financedCents),
        installmentCount: input.installmentCount,
        frequency: input.frequency,
        firstDueAt,
        schedules: { create: schedules },
      },
      select: { id: true },
    });

    if (downCents > 0) {
      const payment = await tx.installmentPayment.create({
        data: {
          shopId,
          planId: plan.id,
          createdByUserId,
          amount: money(downCents),
          method: input.downPaymentMethod || PaymentMethod.CASH,
          isDownPayment: true,
          note: "الدفعة الأولى عند إنشاء الخطة",
        },
      });

      const trackedSourceName = await collectionMoneyService.applyCollectionIncomingTx(
        tx,
        shopId,
        createdByUserId,
        {
          destination: downDestination,
          walletId: input.downPaymentWalletId,
          bankAccountId: input.downPaymentBankAccountId,
          amount: money(downCents),
          reference: generatedPlanNumber,
          description: `دفعة أولى لخطة ${generatedPlanNumber} [INSTALLMENT-DOWN:${payment.id}]`,
          movementType: "INSTALLMENT_DOWN_PAYMENT",
          sourceType: "INSTALLMENT_DOWN_PAYMENT",
          sourceId: plan.id,
          sourceReference: generatedPlanNumber,
          customerId,
        },
      );
      if (trackedSourceName) {
        await tx.installmentPayment.update({
          where: { id: payment.id },
          data: { sourceName: trackedSourceName },
        });
      }
    }

    return plan.id;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 15_000 });

  return installmentService.getPlanById(shopId, planId);
}

export const installmentPlanCollectionService = { createPlan };
