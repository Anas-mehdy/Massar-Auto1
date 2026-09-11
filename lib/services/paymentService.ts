import { InvoiceStatus, PaymentMethod, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { moneyAccountService, type MoneyAccountDestination } from "./moneyAccountService";
import { resolvePaymentSource, type PaymentSourceInput } from "./paymentSourceService";
import { dailyCashCloseService } from "./dailyCashCloseService";

export type AddPaymentInput = PaymentSourceInput & {
  amount: string;
  method: PaymentMethod;
  reference?: string;
  note?: string;
  paidAt?: string;
  moneyDestination?: MoneyAccountDestination;
  walletId?: string;
  bankAccountId?: string;
};

function emptyToNull(value?: string) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function decimal(value: string | number | Prisma.Decimal) {
  return new Prisma.Decimal(String(value).replace(",", "."));
}

function dateOrNow(value?: string) {
  const trimmed = value?.trim();
  if (!trimmed) return new Date();
  const dateOnlyMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
  if (dateOnlyMatch) {
    const date = new Date(Number(dateOnlyMatch[1]), Number(dateOnlyMatch[2]) - 1, Number(dateOnlyMatch[3]));
    return Number.isNaN(date.getTime()) ? new Date() : date;
  }
  const date = new Date(trimmed);
  return Number.isNaN(date.getTime()) ? new Date() : date;
}

async function getInvoiceEffectiveTotal(
  tx: Prisma.TransactionClient,
  shopId: string,
  invoiceId: string,
  originalTotal: Prisma.Decimal,
) {
  const tables = await tx.$queryRaw<Array<{ exists: boolean }>>`
    SELECT to_regclass('public."InvoiceCreditNote"') IS NOT NULL AS "exists"
  `;
  if (!tables[0]?.exists) return originalTotal;

  const rows = await tx.$queryRaw<Array<{ creditTotal: Prisma.Decimal }>>`
    SELECT COALESCE(SUM("amount"), 0) AS "creditTotal"
    FROM "InvoiceCreditNote"
    WHERE "shopId"=${shopId}::uuid AND "invoiceId"=${invoiceId}::uuid
  `;
  const effective = originalTotal.sub(rows[0]?.creditTotal ?? new Prisma.Decimal(0));
  return effective.gt(0) ? effective : new Prisma.Decimal(0);
}

export async function recalculateInvoicePaymentState(
  tx: Prisma.TransactionClient,
  shopId: string,
  invoiceId: string,
) {
  const invoice = await tx.invoice.findFirst({ where: { id: invoiceId, shopId, deletedAt: null } });
  if (!invoice) throw new Error("الفاتورة غير موجودة.");
  const payments = await tx.payment.findMany({
    where: { shopId, invoiceId, deletedAt: null },
    select: { amount: true },
  });
  const amountPaid = payments.reduce((sum, payment) => sum.add(payment.amount), new Prisma.Decimal(0));
  const effectiveTotal = await getInvoiceEffectiveTotal(tx, shopId, invoiceId, invoice.total);
  const rawBalance = effectiveTotal.sub(amountPaid);
  const balanceDue = rawBalance.gt(0) ? rawBalance : new Prisma.Decimal(0);
  let status: InvoiceStatus = InvoiceStatus.UNPAID;
  let paidAt: Date | null = null;
  if (amountPaid.gt(0) && balanceDue.gt(0)) status = InvoiceStatus.PARTIALLY_PAID;
  if (balanceDue.lte(0)) {
    status = InvoiceStatus.PAID;
    paidAt = amountPaid.gt(0) ? (invoice.paidAt ?? new Date()) : null;
  }
  return tx.invoice.update({
    where: { id: invoiceId },
    data: { amountPaid, balanceDue, status, paidAt, version: { increment: 1 } },
  });
}

export async function addPayment(
  shopId: string,
  invoiceId: string,
  createdByUserId: string | null,
  input: AddPaymentInput,
) {
  const amount = decimal(input.amount);
  if (amount.lte(0)) throw new Error("قيمة الدفعة يجب أن تكون أكبر من صفر.");
  const destination: MoneyAccountDestination = input.moneyDestination ?? "OTHER";
  if (destination === "WALLET" && !input.walletId) throw new Error("اختر المحفظة التي استلمت الدفعة.");
  if (destination === "BANK" && !input.bankAccountId) throw new Error("اختر الحساب البنكي الذي استلم الدفعة.");
  const actualPaidAt = dateOrNow(input.paidAt);
  await dailyCashCloseService.assertBusinessDateOpen(shopId, actualPaidAt);
  await moneyAccountService.prepareMoneyAccounts(shopId, destination);

  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`
      SELECT id FROM "Invoice"
      WHERE id = ${invoiceId}::uuid AND "shopId" = ${shopId}::uuid
      FOR UPDATE
    `;
    const invoice = await tx.invoice.findFirst({
      where: { id: invoiceId, shopId, deletedAt: null },
      include: { installmentPlan: { select: { id: true } } },
    });
    if (!invoice) throw new Error("الفاتورة غير موجودة.");
    if (invoice.status === InvoiceStatus.VOID) throw new Error("لا يمكن إضافة دفعة على فاتورة ملغاة.");
    if (invoice.installmentPlan) throw new Error("سجّل الدفعة من خطة الأقساط المرتبطة بهذه الفاتورة.");
    if (amount.gt(invoice.balanceDue)) throw new Error("قيمة الدفعة أكبر من الرصيد المتبقي.");

    const trackedSource = await moneyAccountService.applyIncomingMoneyTx(tx, shopId, createdByUserId, {
      destination,
      walletId: input.walletId,
      bankAccountId: input.bankAccountId,
      amount,
      reference: input.reference,
      description: `تحصيل فاتورة ${invoice.invoiceNumber}`,
      drawerType: "INVOICE_PAYMENT",
      occurredAt: actualPaidAt,
      source: {
        sourceType: "INVOICE",
        sourceId: invoice.id,
        sourceReference: invoice.invoiceNumber,
        customerId: invoice.customerId,
      },
    });
    const sourceName = trackedSource || await resolvePaymentSource(tx, shopId, input);

    const newAmountPaid = invoice.amountPaid.add(amount);
    const newBalanceDue = invoice.balanceDue.sub(amount);
    const normalizedBalance = newBalanceDue.gt(0) ? newBalanceDue : new Prisma.Decimal(0);
    const newStatus = normalizedBalance.lte(0) ? InvoiceStatus.PAID : InvoiceStatus.PARTIALLY_PAID;
    const paidAt = normalizedBalance.lte(0) ? invoice.paidAt ?? new Date() : invoice.paidAt;

    await tx.payment.create({
      data: {
        shopId,
        invoiceId,
        createdByUserId,
        method: input.method,
        sourceName,
        amount,
        reference: emptyToNull(input.reference),
        note: emptyToNull(input.note),
        paidAt: actualPaidAt,
      },
    });
    return tx.invoice.update({
      where: { id: invoiceId },
      data: {
        amountPaid: newAmountPaid,
        balanceDue: normalizedBalance,
        status: newStatus,
        paidAt,
        version: { increment: 1 },
      },
    });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 10_000 });
}

export const paymentService = { addPayment, recalculateInvoicePaymentState };
