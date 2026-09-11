import { randomBytes, randomUUID } from "node:crypto";
import { InvoiceStatus, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { assertBusinessDateOpenTx } from "@/lib/services/businessDateLockService";
import { moneyAccountService, type MoneyAccountDestination } from "@/lib/services/moneyAccountService";

export const CREDIT_NOTE_REASON_CODES = [
  "PRICE_ADJUSTMENT",
  "CUSTOMER_COMPENSATION",
  "SERVICE_CORRECTION",
  "DISCOUNT_AFTER_DELIVERY",
  "OTHER",
] as const;

export type CreditNoteReasonCode = (typeof CREDIT_NOTE_REASON_CODES)[number];
export type CreditRefundAccountType = MoneyAccountDestination;

export type InvoiceCreditNoteRow = {
  id: string;
  creditNoteNumber: string;
  reasonCode: CreditNoteReasonCode;
  reason: string;
  amount: number;
  netAmount: number;
  taxAmount: number;
  originalInvoiceTotal: number;
  previousCreditTotal: number;
  effectiveInvoiceTotalAfter: number;
  issuedAt: Date;
  notes: string | null;
  createdByName: string | null;
};

export type InvoiceCreditRefundRow = {
  id: string;
  creditNoteId: string | null;
  refundNumber: string;
  amount: number;
  accountType: CreditRefundAccountType;
  sourceName: string | null;
  reference: string | null;
  notes: string | null;
  refundedAt: Date;
  createdByName: string | null;
};

export type AutoInvoiceCreditContext = {
  invoiceId: string;
  invoiceNumber: string;
  invoiceStatus: string;
  originalTotal: number;
  originalTaxTotal: number;
  amountPaid: number;
  balanceDue: number;
  serviceOrderId: string;
  orderNumber: string;
  orderStatus: string;
  customerId: string | null;
  customerName: string | null;
  activeInstallmentPlanId: string | null;
  activeInstallmentPlanNumber: string | null;
  creditTotal: number;
  creditNetTotal: number;
  creditTaxTotal: number;
  effectiveTotal: number;
  refundedTotal: number;
  refundableDue: number;
  remainingCreditable: number;
  creditNotes: InvoiceCreditNoteRow[];
  refunds: InvoiceCreditRefundRow[];
};

export type CreateInvoiceCreditNoteInput = {
  amount: string | number;
  reasonCode: CreditNoteReasonCode;
  reason: string;
  issuedAt?: string | Date | null;
  notes?: string | null;
};

export type CreateInvoiceCreditRefundInput = {
  amount: string | number;
  accountType: CreditRefundAccountType;
  walletId?: string | null;
  bankAccountId?: string | null;
  sourceName?: string | null;
  reference?: string | null;
  notes?: string | null;
  refundedAt?: string | Date | null;
};

function clean(value?: string | null) {
  const text = value?.trim();
  return text ? text : null;
}

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function parseMoney(value: string | number, label: string) {
  const number = Number(String(value).replace(",", "."));
  if (!Number.isFinite(number) || number <= 0) throw new Error(`${label} يجب أن يكون أكبر من صفر.`);
  return roundMoney(number);
}

function parseDate(value?: string | Date | null) {
  if (!value) return new Date();
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) throw new Error("التاريخ غير صالح.");
    return value;
  }
  const trimmed = value.trim();
  if (!trimmed) return new Date();
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
  const date = dateOnly
    ? new Date(Number(dateOnly[1]), Number(dateOnly[2]) - 1, Number(dateOnly[3]), 12, 0, 0)
    : new Date(trimmed);
  if (Number.isNaN(date.getTime())) throw new Error("التاريخ غير صالح.");
  return date;
}

function creditNoteNumber() {
  const date = new Date().toISOString().slice(0, 10).replaceAll("-", "");
  return `CN-A-${date}-${randomBytes(3).toString("hex").toUpperCase()}`;
}

function refundNumber() {
  const date = new Date().toISOString().slice(0, 10).replaceAll("-", "");
  return `CRF-A-${date}-${randomBytes(3).toString("hex").toUpperCase()}`;
}

async function getCreditTotalsTx(tx: Prisma.TransactionClient, shopId: string, invoiceId: string) {
  const rows = await tx.$queryRaw<Array<{
    creditTotal: number;
    creditNetTotal: number;
    creditTaxTotal: number;
    refundedTotal: number;
  }>>`
    SELECT
      COALESCE((SELECT SUM(cn."amount") FROM "InvoiceCreditNote" cn
        WHERE cn."shopId"=${shopId}::uuid AND cn."invoiceId"=${invoiceId}::uuid),0)::double precision AS "creditTotal",
      COALESCE((SELECT SUM(cn."netAmount") FROM "InvoiceCreditNote" cn
        WHERE cn."shopId"=${shopId}::uuid AND cn."invoiceId"=${invoiceId}::uuid),0)::double precision AS "creditNetTotal",
      COALESCE((SELECT SUM(cn."taxAmount") FROM "InvoiceCreditNote" cn
        WHERE cn."shopId"=${shopId}::uuid AND cn."invoiceId"=${invoiceId}::uuid),0)::double precision AS "creditTaxTotal",
      COALESCE((SELECT SUM(r."amount") FROM "InvoiceCreditRefund" r
        WHERE r."shopId"=${shopId}::uuid AND r."invoiceId"=${invoiceId}::uuid),0)::double precision AS "refundedTotal"
  `;
  return rows[0] ?? { creditTotal: 0, creditNetTotal: 0, creditTaxTotal: 0, refundedTotal: 0 };
}

export async function getAutoInvoiceCreditContext(shopId: string, invoiceId: string): Promise<AutoInvoiceCreditContext | null> {
  const headers = await prisma.$queryRaw<Array<{
    invoiceId: string;
    invoiceNumber: string;
    invoiceStatus: string;
    originalTotal: number;
    originalTaxTotal: number;
    amountPaid: number;
    balanceDue: number;
    serviceOrderId: string;
    orderNumber: string;
    orderStatus: string;
    customerId: string | null;
    customerName: string | null;
    activeInstallmentPlanId: string | null;
    activeInstallmentPlanNumber: string | null;
    creditTotal: number;
    creditNetTotal: number;
    creditTaxTotal: number;
    refundedTotal: number;
  }>>`
    SELECT
      i."id" AS "invoiceId",
      i."invoiceNumber",
      i."status"::text AS "invoiceStatus",
      i."total"::double precision AS "originalTotal",
      i."taxTotal"::double precision AS "originalTaxTotal",
      i."amountPaid"::double precision AS "amountPaid",
      i."balanceDue"::double precision AS "balanceDue",
      so."id" AS "serviceOrderId",
      so."orderNumber",
      so."status"::text AS "orderStatus",
      i."customerId",
      c."name" AS "customerName",
      ip."id" AS "activeInstallmentPlanId",
      ip."planNumber" AS "activeInstallmentPlanNumber",
      COALESCE(credits."creditTotal",0)::double precision AS "creditTotal",
      COALESCE(credits."creditNetTotal",0)::double precision AS "creditNetTotal",
      COALESCE(credits."creditTaxTotal",0)::double precision AS "creditTaxTotal",
      COALESCE(refunds."refundedTotal",0)::double precision AS "refundedTotal"
    FROM "Invoice" i
    JOIN "ServiceOrder" so
      ON so."id"=i."serviceOrderId" AND so."shopId"=i."shopId" AND so."deletedAt" IS NULL
    LEFT JOIN "Customer" c ON c."id"=i."customerId" AND c."shopId"=i."shopId"
    LEFT JOIN LATERAL (
      SELECT ip0."id", ip0."planNumber"
      FROM "InstallmentPlan" ip0
      WHERE ip0."shopId"=i."shopId" AND ip0."invoiceId"=i."id"
        AND ip0."deletedAt" IS NULL AND ip0."status"='ACTIVE'::"InstallmentPlanStatus"
      ORDER BY ip0."createdAt" DESC LIMIT 1
    ) ip ON TRUE
    LEFT JOIN LATERAL (
      SELECT SUM(cn."amount") AS "creditTotal", SUM(cn."netAmount") AS "creditNetTotal", SUM(cn."taxAmount") AS "creditTaxTotal"
      FROM "InvoiceCreditNote" cn
      WHERE cn."shopId"=i."shopId" AND cn."invoiceId"=i."id"
    ) credits ON TRUE
    LEFT JOIN LATERAL (
      SELECT SUM(r."amount") AS "refundedTotal"
      FROM "InvoiceCreditRefund" r
      WHERE r."shopId"=i."shopId" AND r."invoiceId"=i."id"
    ) refunds ON TRUE
    WHERE i."id"=${invoiceId}::uuid AND i."shopId"=${shopId}::uuid AND i."deletedAt" IS NULL
    LIMIT 1
  `;
  const header = headers[0];
  if (!header) return null;

  const [creditRows, refundRows] = await Promise.all([
    prisma.$queryRaw<Array<{
      id: string;
      creditNoteNumber: string;
      reasonCode: CreditNoteReasonCode;
      reason: string;
      amount: number;
      netAmount: number;
      taxAmount: number;
      originalInvoiceTotal: number;
      previousCreditTotal: number;
      effectiveInvoiceTotalAfter: number;
      issuedAt: Date;
      notes: string | null;
      createdByName: string | null;
    }>>`
      SELECT cn."id", cn."creditNoteNumber", cn."reasonCode", cn."reason",
             cn."amount"::double precision AS "amount",
             cn."netAmount"::double precision AS "netAmount",
             cn."taxAmount"::double precision AS "taxAmount",
             cn."originalInvoiceTotal"::double precision AS "originalInvoiceTotal",
             cn."previousCreditTotal"::double precision AS "previousCreditTotal",
             cn."effectiveInvoiceTotalAfter"::double precision AS "effectiveInvoiceTotalAfter",
             cn."issuedAt", cn."notes", u."name" AS "createdByName"
      FROM "InvoiceCreditNote" cn
      LEFT JOIN "User" u ON u."id"=cn."createdByUserId"
      WHERE cn."shopId"=${shopId}::uuid AND cn."invoiceId"=${invoiceId}::uuid
      ORDER BY cn."issuedAt" DESC, cn."createdAt" DESC
    `,
    prisma.$queryRaw<Array<{
      id: string;
      creditNoteId: string | null;
      refundNumber: string;
      amount: number;
      accountType: CreditRefundAccountType;
      sourceName: string | null;
      reference: string | null;
      notes: string | null;
      refundedAt: Date;
      createdByName: string | null;
    }>>`
      SELECT r."id", r."creditNoteId", r."refundNumber", r."amount"::double precision AS "amount",
             r."accountType", r."sourceName", r."reference", r."notes", r."refundedAt",
             u."name" AS "createdByName"
      FROM "InvoiceCreditRefund" r
      LEFT JOIN "User" u ON u."id"=r."createdByUserId"
      WHERE r."shopId"=${shopId}::uuid AND r."invoiceId"=${invoiceId}::uuid
      ORDER BY r."refundedAt" DESC, r."createdAt" DESC
    `,
  ]);

  const effectiveTotal = roundMoney(Math.max(0, header.originalTotal - header.creditTotal));
  const refundableTotal = roundMoney(Math.max(0, header.amountPaid - effectiveTotal));
  const refundableDue = roundMoney(Math.max(0, refundableTotal - header.refundedTotal));

  return {
    ...header,
    effectiveTotal,
    refundableDue,
    remainingCreditable: roundMoney(Math.max(0, header.originalTotal - header.creditTotal)),
    creditNotes: creditRows,
    refunds: refundRows,
  };
}

export async function createAutoInvoiceCreditNote(
  shopId: string,
  invoiceId: string,
  createdByUserId: string,
  input: CreateInvoiceCreditNoteInput,
) {
  const amount = parseMoney(input.amount, "قيمة الإشعار الدائن");
  const reason = clean(input.reason);
  if (!reason) throw new Error("سبب الإشعار الدائن مطلوب.");
  if (!CREDIT_NOTE_REASON_CODES.includes(input.reasonCode)) throw new Error("نوع سبب الإشعار الدائن غير صالح.");
  const issuedAt = parseDate(input.issuedAt);

  return prisma.$transaction(async (tx) => {
    await assertBusinessDateOpenTx(tx, shopId, issuedAt);
    const rows = await tx.$queryRaw<Array<{
      id: string;
      customerId: string | null;
      serviceOrderId: string | null;
      total: Prisma.Decimal;
      taxTotal: Prisma.Decimal;
      amountPaid: Prisma.Decimal;
      paidAt: Date | null;
      status: string;
      invoiceNumber: string;
      orderStatus: string | null;
    }>>`
      SELECT i."id", i."customerId", i."serviceOrderId", i."total", i."taxTotal", i."amountPaid", i."paidAt",
             i."status"::text AS "status", i."invoiceNumber", so."status"::text AS "orderStatus"
      FROM "Invoice" i
      LEFT JOIN "ServiceOrder" so
        ON so."id"=i."serviceOrderId" AND so."shopId"=i."shopId" AND so."deletedAt" IS NULL
      WHERE i."id"=${invoiceId}::uuid AND i."shopId"=${shopId}::uuid AND i."deletedAt" IS NULL
      FOR UPDATE OF i
    `;
    const invoice = rows[0];
    if (!invoice || invoice.status === "VOID") throw new Error("الفاتورة غير موجودة أو ملغاة.");
    if (!invoice.serviceOrderId || !invoice.orderStatus) throw new Error("الإشعار الدائن في هذه المرحلة متاح لفواتير صيانة المركبات فقط.");
    if (!["DELIVERED", "CLOSED"].includes(invoice.orderStatus)) {
      throw new Error("قبل تسليم المركبة استخدم إلغاء الفاتورة وإعادة إصدارها. الإشعار الدائن مخصص للتصحيح بعد التسليم.");
    }

    const activePlans = await tx.$queryRaw<Array<{ id: string; planNumber: string }>>`
      SELECT "id", "planNumber"
      FROM "InstallmentPlan"
      WHERE "shopId"=${shopId}::uuid AND "invoiceId"=${invoiceId}::uuid
        AND "deletedAt" IS NULL AND "status"='ACTIVE'::"InstallmentPlanStatus"
      LIMIT 1
      FOR UPDATE
    `;
    if (activePlans[0]) {
      throw new Error(`الفاتورة مرتبطة بخطة أقساط نشطة (${activePlans[0].planNumber}). يلزم تسوية خطة الأقساط أولاً قبل إصدار إشعار دائن حتى لا يصبح جدول الأقساط غير متطابق.`);
    }

    const totals = await getCreditTotalsTx(tx, shopId, invoiceId);
    const originalTotal = Number(invoice.total);
    const originalTax = Number(invoice.taxTotal);
    const remainingGross = roundMoney(Math.max(0, originalTotal - totals.creditTotal));
    const remainingTax = roundMoney(Math.max(0, originalTax - totals.creditTaxTotal));
    if (amount - remainingGross > 0.005) {
      throw new Error(`قيمة الإشعار أكبر من المبلغ المتبقي القابل للتصحيح (${remainingGross.toFixed(2)}).`);
    }

    const taxAmount = remainingGross <= 0 || remainingTax <= 0
      ? 0
      : Math.abs(amount - remainingGross) <= 0.005
        ? remainingTax
        : roundMoney(Math.min(remainingTax, amount, amount * (remainingTax / remainingGross)));
    const netAmount = roundMoney(amount - taxAmount);
    const number = creditNoteNumber();

    const inserted = await tx.$queryRaw<Array<{
      id: string;
      creditNoteNumber: string;
      effectiveInvoiceTotalAfter: Prisma.Decimal;
    }>>`
      INSERT INTO "InvoiceCreditNote" (
        "shopId", "invoiceId", "serviceOrderId", "createdByUserId", "creditNoteNumber",
        "reasonCode", "reason", "amount", "netAmount", "taxAmount",
        "originalInvoiceTotal", "previousCreditTotal", "effectiveInvoiceTotalAfter", "issuedAt", "notes"
      ) VALUES (
        ${shopId}::uuid, ${invoiceId}::uuid, ${invoice.serviceOrderId}::uuid, ${createdByUserId}::uuid, ${number},
        ${input.reasonCode}, ${reason}, ${amount}, ${netAmount}, ${taxAmount},
        ${originalTotal}, ${totals.creditTotal}, ${remainingGross - amount}, ${issuedAt}, ${clean(input.notes)}
      )
      RETURNING "id", "creditNoteNumber", "effectiveInvoiceTotalAfter"
    `;
    const note = inserted[0];
    if (!note) throw new Error("تعذر إنشاء الإشعار الدائن.");

    const effectiveTotal = new Prisma.Decimal(note.effectiveInvoiceTotalAfter);
    const rawBalance = effectiveTotal.sub(invoice.amountPaid);
    const balanceDue = rawBalance.gt(0) ? rawBalance : new Prisma.Decimal(0);
    let status: InvoiceStatus = InvoiceStatus.UNPAID;
    if (balanceDue.gt(0) && invoice.amountPaid.gt(0)) status = InvoiceStatus.PARTIALLY_PAID;
    if (balanceDue.lte(0)) status = InvoiceStatus.PAID;
    const paidAt = balanceDue.lte(0) && invoice.amountPaid.gt(0) ? (invoice.paidAt ?? issuedAt) : null;

    await tx.invoice.update({
      where: { id: invoiceId },
      data: { balanceDue, status, paidAt, version: { increment: 1 } },
    });
    await tx.$executeRaw`
      UPDATE "ServiceOrder"
      SET "finalTotal"=${effectiveTotal}, "updatedByUserId"=${createdByUserId}::uuid,
          "updatedAt"=NOW(), "version"="version"+1
      WHERE "id"=${invoice.serviceOrderId}::uuid AND "shopId"=${shopId}::uuid
    `;

    return {
      id: note.id,
      creditNoteNumber: note.creditNoteNumber,
      amount,
      netAmount,
      taxAmount,
      effectiveTotal: Number(effectiveTotal),
      balanceDue: Number(balanceDue),
      refundableDue: roundMoney(Math.max(0, Number(invoice.amountPaid) - Number(effectiveTotal) - totals.refundedTotal)),
    };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 10_000 });
}

async function resolveRefundSourceNameTx(
  tx: Prisma.TransactionClient,
  shopId: string,
  input: CreateInvoiceCreditRefundInput,
) {
  if (input.accountType === "DRAWER") return "الدرج النقدي";
  if (input.accountType === "OTHER") return clean(input.sourceName) ?? "استرداد خارجي";
  if (input.accountType === "WALLET") {
    if (!input.walletId) throw new Error("اختر المحفظة التي سيخرج منها مبلغ الاسترداد.");
    const rows = await tx.$queryRaw<Array<{ name: string }>>`
      SELECT "name" FROM "FinancialWallet"
      WHERE "id"=${input.walletId}::uuid AND "shopId"=${shopId}::uuid AND "deletedAt" IS NULL AND "isActive"=TRUE
      LIMIT 1
    `;
    if (!rows[0]) throw new Error("المحفظة المحددة غير موجودة أو متوقفة.");
    return rows[0].name;
  }
  if (!input.bankAccountId) throw new Error("اختر الحساب البنكي الذي سيخرج منه مبلغ الاسترداد.");
  const rows = await tx.$queryRaw<Array<{ name: string; bankName: string | null }>>`
    SELECT "name", "bankName" FROM "BankAccount"
    WHERE "id"=${input.bankAccountId}::uuid AND "shopId"=${shopId}::uuid AND "deletedAt" IS NULL AND "isActive"=TRUE
    LIMIT 1
  `;
  if (!rows[0]) throw new Error("الحساب البنكي المحدد غير موجود أو متوقف.");
  return rows[0].bankName ? `${rows[0].name} — ${rows[0].bankName}` : rows[0].name;
}

async function captureRefundMovementIdsTx(
  tx: Prisma.TransactionClient,
  shopId: string,
  refundId: string,
  accountType: CreditRefundAccountType,
) {
  if (accountType === "DRAWER") {
    const rows = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT "id" FROM "CashDrawerMovement"
      WHERE "shopId"=${shopId}::uuid AND "sourceType"='CREDIT_NOTE' AND "sourceId"=${refundId} AND "status"='ACTIVE'
      ORDER BY "createdAt" DESC LIMIT 1
    `;
    return { cashDrawerMovementId: rows[0]?.id ?? null, bankAccountMovementId: null, financialTransferId: null };
  }
  if (accountType === "BANK") {
    const rows = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT "id" FROM "BankAccountMovement"
      WHERE "shopId"=${shopId}::uuid AND "sourceType"='CREDIT_NOTE' AND "sourceId"=${refundId} AND "status"='ACTIVE'
      ORDER BY "createdAt" DESC LIMIT 1
    `;
    return { cashDrawerMovementId: null, bankAccountMovementId: rows[0]?.id ?? null, financialTransferId: null };
  }
  if (accountType === "WALLET") {
    const rows = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT "id" FROM "FinancialTransfer"
      WHERE "shopId"=${shopId}::uuid AND "sourceType"='CREDIT_NOTE' AND "sourceId"=${refundId}
        AND "status"='ACTIVE' AND "deletedAt" IS NULL
      ORDER BY "createdAt" DESC LIMIT 1
    `;
    return { cashDrawerMovementId: null, bankAccountMovementId: null, financialTransferId: rows[0]?.id ?? null };
  }
  return { cashDrawerMovementId: null, bankAccountMovementId: null, financialTransferId: null };
}

export async function refundAutoInvoiceCredit(
  shopId: string,
  invoiceId: string,
  createdByUserId: string,
  input: CreateInvoiceCreditRefundInput,
) {
  const amount = parseMoney(input.amount, "قيمة الاسترداد");
  const refundedAt = parseDate(input.refundedAt);
  if (input.accountType === "WALLET" && !input.walletId) throw new Error("اختر المحفظة التي سيخرج منها مبلغ الاسترداد.");
  if (input.accountType === "BANK" && !input.bankAccountId) throw new Error("اختر الحساب البنكي الذي سيخرج منه مبلغ الاسترداد.");
  await moneyAccountService.prepareMoneyAccounts(shopId, input.accountType);

  return prisma.$transaction(async (tx) => {
    await assertBusinessDateOpenTx(tx, shopId, refundedAt);
    const invoices = await tx.$queryRaw<Array<{
      id: string;
      customerId: string | null;
      invoiceNumber: string;
      total: Prisma.Decimal;
      amountPaid: Prisma.Decimal;
      serviceOrderId: string | null;
      orderStatus: string | null;
      customerName: string | null;
      customerPhone: string | null;
    }>>`
      SELECT i."id", i."customerId", i."invoiceNumber", i."total", i."amountPaid", i."serviceOrderId",
             so."status"::text AS "orderStatus", c."name" AS "customerName", c."phone" AS "customerPhone"
      FROM "Invoice" i
      LEFT JOIN "ServiceOrder" so ON so."id"=i."serviceOrderId" AND so."shopId"=i."shopId" AND so."deletedAt" IS NULL
      LEFT JOIN "Customer" c ON c."id"=i."customerId" AND c."shopId"=i."shopId"
      WHERE i."id"=${invoiceId}::uuid AND i."shopId"=${shopId}::uuid AND i."deletedAt" IS NULL
        AND i."status" <> 'VOID'::"InvoiceStatus"
      FOR UPDATE OF i
    `;
    const invoice = invoices[0];
    if (!invoice) throw new Error("الفاتورة غير موجودة أو ملغاة.");
    if (!invoice.serviceOrderId || !invoice.orderStatus || !["DELIVERED", "CLOSED"].includes(invoice.orderStatus)) {
      throw new Error("استرداد الإشعار الدائن في هذه المرحلة مخصص لفواتير صيانة المركبات المسلّمة أو المغلقة.");
    }

    const totals = await getCreditTotalsTx(tx, shopId, invoiceId);
    const effectiveTotal = roundMoney(Math.max(0, Number(invoice.total) - totals.creditTotal));
    const refundableTotal = roundMoney(Math.max(0, Number(invoice.amountPaid) - effectiveTotal));
    const refundableDue = roundMoney(Math.max(0, refundableTotal - totals.refundedTotal));
    if (amount - refundableDue > 0.005) {
      throw new Error(`قيمة الاسترداد أكبر من المبلغ الواجب رده للعميل (${refundableDue.toFixed(2)}).`);
    }

    const latestNotes = await tx.$queryRaw<Array<{ id: string; creditNoteNumber: string }>>`
      SELECT "id", "creditNoteNumber"
      FROM "InvoiceCreditNote"
      WHERE "shopId"=${shopId}::uuid AND "invoiceId"=${invoiceId}::uuid
      ORDER BY "issuedAt" DESC, "createdAt" DESC LIMIT 1
    `;
    const latestNote = latestNotes[0];
    if (!latestNote) throw new Error("لا يوجد إشعار دائن على هذه الفاتورة.");

    const sourceName = await resolveRefundSourceNameTx(tx, shopId, input);
    const id = randomUUID();
    const number = refundNumber();

    if (input.accountType !== "OTHER") {
      await moneyAccountService.applyOutgoingMoneyTx(tx, shopId, createdByUserId, {
        destination: input.accountType,
        walletId: input.walletId ?? undefined,
        bankAccountId: input.bankAccountId ?? undefined,
        amount,
        reference: clean(input.reference) ?? number,
        description: `استرداد إشعار دائن ${latestNote.creditNoteNumber} للفاتورة ${invoice.invoiceNumber}`,
        movementType: "INVOICE_CREDIT_REFUND",
        contextLabel: `استرداد الإشعار الدائن ${latestNote.creditNoteNumber}`,
        occurredAt: refundedAt,
        source: {
          sourceType: "CREDIT_NOTE",
          sourceId: id,
          sourceReference: number,
          customerId: invoice.customerId,
          customerName: invoice.customerName,
          customerPhone: invoice.customerPhone,
        },
      });
    }

    const movementIds = await captureRefundMovementIdsTx(tx, shopId, id, input.accountType);
    await tx.$executeRaw`
      INSERT INTO "InvoiceCreditRefund" (
        "id", "shopId", "invoiceId", "creditNoteId", "customerId", "createdByUserId",
        "refundNumber", "amount", "accountType", "walletId", "bankAccountId", "sourceName",
        "reference", "notes", "refundedAt", "cashDrawerMovementId", "bankAccountMovementId", "financialTransferId"
      ) VALUES (
        ${id}::uuid, ${shopId}::uuid, ${invoiceId}::uuid, ${latestNote.id}::uuid, ${invoice.customerId}::uuid, ${createdByUserId}::uuid,
        ${number}, ${amount}, ${input.accountType}, ${input.walletId ?? null}::uuid, ${input.bankAccountId ?? null}::uuid, ${sourceName},
        ${clean(input.reference)}, ${clean(input.notes)}, ${refundedAt},
        ${movementIds.cashDrawerMovementId}::uuid, ${movementIds.bankAccountMovementId}::uuid, ${movementIds.financialTransferId}::uuid
      )
    `;

    return { id, refundNumber: number, amount, refundableDueAfter: roundMoney(refundableDue - amount) };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 10_000 });
}

export async function getCreditNotePrintData(shopId: string, creditNoteId: string) {
  const rows = await prisma.$queryRaw<Array<{
    id: string;
    creditNoteNumber: string;
    invoiceId: string;
    invoiceNumber: string;
    invoiceIssuedAt: Date;
    reasonCode: CreditNoteReasonCode;
    reason: string;
    amount: number;
    netAmount: number;
    taxAmount: number;
    originalInvoiceTotal: number;
    previousCreditTotal: number;
    effectiveInvoiceTotalAfter: number;
    issuedAt: Date;
    notes: string | null;
    customerName: string | null;
    customerPhone: string | null;
    orderNumber: string | null;
    vehicleMake: string | null;
    vehicleModel: string | null;
    vehicleYear: number | null;
    plateNumber: string | null;
    vin: string | null;
    createdByName: string | null;
  }>>`
    SELECT cn."id", cn."creditNoteNumber", i."id" AS "invoiceId", i."invoiceNumber", i."issuedAt" AS "invoiceIssuedAt",
           cn."reasonCode", cn."reason", cn."amount"::double precision AS "amount",
           cn."netAmount"::double precision AS "netAmount", cn."taxAmount"::double precision AS "taxAmount",
           cn."originalInvoiceTotal"::double precision AS "originalInvoiceTotal",
           cn."previousCreditTotal"::double precision AS "previousCreditTotal",
           cn."effectiveInvoiceTotalAfter"::double precision AS "effectiveInvoiceTotalAfter",
           cn."issuedAt", cn."notes", c."name" AS "customerName", c."phone" AS "customerPhone",
           so."orderNumber", v."make" AS "vehicleMake", v."model" AS "vehicleModel", v."year" AS "vehicleYear",
           v."plateNumber", v."vin", u."name" AS "createdByName"
    FROM "InvoiceCreditNote" cn
    JOIN "Invoice" i ON i."id"=cn."invoiceId" AND i."shopId"=cn."shopId"
    LEFT JOIN "Customer" c ON c."id"=i."customerId" AND c."shopId"=i."shopId"
    LEFT JOIN "ServiceOrder" so ON so."id"=cn."serviceOrderId" AND so."shopId"=cn."shopId"
    LEFT JOIN "Vehicle" v ON v."id"=so."vehicleId" AND v."shopId"=so."shopId"
    LEFT JOIN "User" u ON u."id"=cn."createdByUserId"
    WHERE cn."id"=${creditNoteId}::uuid AND cn."shopId"=${shopId}::uuid
    LIMIT 1
  `;
  return rows[0] ?? null;
}

export const invoiceCreditNoteService = {
  getAutoInvoiceCreditContext,
  createAutoInvoiceCreditNote,
  refundAutoInvoiceCredit,
  getCreditNotePrintData,
};
