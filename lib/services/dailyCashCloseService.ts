import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { cashDrawerService } from "@/lib/services/cashDrawerService";
import { getShopTimeZone } from "@/lib/shop-timezone";
import {
  dateInputEndUtcForTimeZone,
  dateInputStartUtcForTimeZone,
  localDateString,
} from "@/lib/timezone";

export type DailyCashCloseTotals = {
  businessDate: string;
  openingBalance: number;
  cashSalesTotal: number;
  customerReceiptsTotal: number;
  receiptVouchersTotal: number;
  otherCashInTotal: number;
  supplierPaymentsTotal: number;
  expensesTotal: number;
  paymentVouchersTotal: number;
  otherCashOutTotal: number;
  expectedCash: number;
};

function toNumber(value: Prisma.Decimal | string | number | bigint | null | undefined) {
  return Number(value ?? 0);
}

function parseBusinessDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error("تاريخ الإغلاق غير صالح.");
  return value;
}

export async function assertBusinessDateOpen(shopId: string, occurredAt: Date | string = new Date()) {
  const timeZone = await getShopTimeZone(shopId);
  const businessDate = localDateString(occurredAt, timeZone);
  const rows = await prisma.$queryRaw<Array<{ status: string }>>`
    SELECT "status"
    FROM "DailyCashClose"
    WHERE "shopId" = ${shopId}::uuid AND "businessDate" = ${businessDate}::date
    LIMIT 1
  `;
  if (rows[0]?.status === "CLOSED") {
    throw new Error(`يوم ${businessDate} مغلق نقدياً. يجب إعادة فتح اليوم بصلاحية المدير قبل تسجيل أو تعديل حركة مالية.`);
  }
}

export async function calculateDailyCashClose(shopId: string, dateInput: string): Promise<DailyCashCloseTotals> {
  const businessDate = parseBusinessDate(dateInput);
  const timeZone = await getShopTimeZone(shopId);
  const start = dateInputStartUtcForTimeZone(businessDate, timeZone);
  const end = dateInputEndUtcForTimeZone(businessDate, timeZone);
  if (!start || !end) throw new Error("تعذر تحديد حدود يوم العمل.");

  // Also guarantees that the shop has one cash drawer before reading its movement ledger.
  const drawer = await cashDrawerService.getSnapshot(shopId, 1);

  const rows = await prisma.$queryRaw<Array<{
    balanceBeforeStart: Prisma.Decimal;
    openingMovements: Prisma.Decimal;
    cashSales: Prisma.Decimal;
    customerReceipts: Prisma.Decimal;
    receiptVouchers: Prisma.Decimal;
    otherIn: Prisma.Decimal;
    supplierPayments: Prisma.Decimal;
    expenses: Prisma.Decimal;
    paymentVouchers: Prisma.Decimal;
    otherOut: Prisma.Decimal;
  }>>`
    WITH day_moves AS (
      SELECT *
      FROM "CashDrawerMovement"
      WHERE "shopId" = ${shopId}::uuid
        AND "drawerId" = ${drawer.id}::uuid
        AND "status" = 'ACTIVE'
        AND "createdAt" >= ${start}
        AND "createdAt" < ${end}
    ), after_start AS (
      SELECT COALESCE(SUM(CASE WHEN "direction" = 'IN' THEN "amount" ELSE -"amount" END), 0) AS net
      FROM "CashDrawerMovement"
      WHERE "shopId" = ${shopId}::uuid
        AND "drawerId" = ${drawer.id}::uuid
        AND "status" = 'ACTIVE'
        AND "createdAt" >= ${start}
    )
    SELECT
      (${drawer.currentBalance}::numeric - (SELECT net FROM after_start)) AS "balanceBeforeStart",
      COALESCE(SUM("amount") FILTER (WHERE "type" = 'OPENING_BALANCE'), 0) AS "openingMovements",
      COALESCE(SUM("amount") FILTER (WHERE "direction" = 'IN' AND "type" = 'SALE_CASH'), 0) AS "cashSales",
      COALESCE(SUM("amount") FILTER (WHERE "direction" = 'IN' AND "type" IN ('INVOICE_PAYMENT','INSTALLMENT_PAYMENT','INSTALLMENT_DOWN_PAYMENT','DEBT_PAYMENT')), 0) AS "customerReceipts",
      COALESCE(SUM("amount") FILTER (WHERE "direction" = 'IN' AND "sourceType" = 'RECEIPT_VOUCHER'), 0) AS "receiptVouchers",
      COALESCE(SUM("amount") FILTER (
        WHERE "direction" = 'IN'
          AND "type" <> 'OPENING_BALANCE'
          AND "type" <> 'SALE_CASH'
          AND "type" NOT IN ('INVOICE_PAYMENT','INSTALLMENT_PAYMENT','INSTALLMENT_DOWN_PAYMENT','DEBT_PAYMENT')
          AND COALESCE("sourceType", '') <> 'RECEIPT_VOUCHER'
      ), 0) AS "otherIn",
      COALESCE(SUM("amount") FILTER (WHERE "direction" = 'OUT' AND "type" IN ('PURCHASE_PAYMENT','SUPPLIER_PAYMENT')), 0) AS "supplierPayments",
      COALESCE(SUM("amount") FILTER (WHERE "direction" = 'OUT' AND "type" = 'EXPENSE_PAYMENT'), 0) AS "expenses",
      COALESCE(SUM("amount") FILTER (WHERE "direction" = 'OUT' AND "sourceType" = 'PAYMENT_VOUCHER'), 0) AS "paymentVouchers",
      COALESCE(SUM("amount") FILTER (
        WHERE "direction" = 'OUT'
          AND "type" NOT IN ('PURCHASE_PAYMENT','SUPPLIER_PAYMENT','EXPENSE_PAYMENT')
          AND COALESCE("sourceType", '') <> 'PAYMENT_VOUCHER'
      ), 0) AS "otherOut"
    FROM day_moves
  `;
  const row = rows[0];
  const openingBalance = toNumber(row?.balanceBeforeStart) + toNumber(row?.openingMovements);
  const cashSalesTotal = toNumber(row?.cashSales);
  const customerReceiptsTotal = toNumber(row?.customerReceipts);
  const receiptVouchersTotal = toNumber(row?.receiptVouchers);
  const otherCashInTotal = toNumber(row?.otherIn);
  const supplierPaymentsTotal = toNumber(row?.supplierPayments);
  const expensesTotal = toNumber(row?.expenses);
  const paymentVouchersTotal = toNumber(row?.paymentVouchers);
  const otherCashOutTotal = toNumber(row?.otherOut);
  const expectedCash = Math.round((
    openingBalance + cashSalesTotal + customerReceiptsTotal + receiptVouchersTotal + otherCashInTotal
    - supplierPaymentsTotal - expensesTotal - paymentVouchersTotal - otherCashOutTotal
  ) * 100) / 100;

  return {
    businessDate,
    openingBalance,
    cashSalesTotal,
    customerReceiptsTotal,
    receiptVouchersTotal,
    otherCashInTotal,
    supplierPaymentsTotal,
    expensesTotal,
    paymentVouchersTotal,
    otherCashOutTotal,
    expectedCash,
  };
}

export async function closeBusinessDay(
  shopId: string,
  businessDateInput: string,
  actualCash: number,
  closedByUserId: string,
  notes?: string | null,
) {
  if (!Number.isFinite(actualCash) || actualCash < 0) throw new Error("الرصيد النقدي الفعلي غير صالح.");
  const totals = await calculateDailyCashClose(shopId, businessDateInput);
  const variance = Math.round((actualCash - totals.expectedCash) * 100) / 100;

  return prisma.$transaction(async (tx) => {
    const currentRows = await tx.$queryRaw<Array<{ id: string; status: string; closeVersion: number }>>`
      SELECT "id", "status", "closeVersion"
      FROM "DailyCashClose"
      WHERE "shopId" = ${shopId}::uuid AND "businessDate" = ${totals.businessDate}::date
      FOR UPDATE
    `;
    const current = currentRows[0];
    if (current?.status === "CLOSED") throw new Error("تم إغلاق هذا اليوم مسبقاً.");

    const version = current?.status === "REOPENED" ? current.closeVersion + 1 : (current?.closeVersion ?? 1);
    const action = current?.status === "REOPENED" ? "RECLOSED" : "CLOSED";

    const rows = await tx.$queryRaw<Array<{ id: string; businessDate: Date; closeVersion: number }>>`
      INSERT INTO "DailyCashClose" (
        "shopId", "businessDate", "status", "openingBalance", "cashSalesTotal", "customerReceiptsTotal",
        "receiptVouchersTotal", "otherCashInTotal", "supplierPaymentsTotal", "expensesTotal", "paymentVouchersTotal",
        "otherCashOutTotal", "expectedCash", "actualCash", "variance", "notes", "closedByUserId", "closedAt", "closeVersion"
      ) VALUES (
        ${shopId}::uuid, ${totals.businessDate}::date, 'CLOSED', ${totals.openingBalance}, ${totals.cashSalesTotal}, ${totals.customerReceiptsTotal},
        ${totals.receiptVouchersTotal}, ${totals.otherCashInTotal}, ${totals.supplierPaymentsTotal}, ${totals.expensesTotal}, ${totals.paymentVouchersTotal},
        ${totals.otherCashOutTotal}, ${totals.expectedCash}, ${actualCash}, ${variance}, ${notes?.trim() || null}, ${closedByUserId}::uuid, now(), ${version}
      )
      ON CONFLICT ("shopId", "businessDate") DO UPDATE SET
        "status" = 'CLOSED',
        "openingBalance" = EXCLUDED."openingBalance",
        "cashSalesTotal" = EXCLUDED."cashSalesTotal",
        "customerReceiptsTotal" = EXCLUDED."customerReceiptsTotal",
        "receiptVouchersTotal" = EXCLUDED."receiptVouchersTotal",
        "otherCashInTotal" = EXCLUDED."otherCashInTotal",
        "supplierPaymentsTotal" = EXCLUDED."supplierPaymentsTotal",
        "expensesTotal" = EXCLUDED."expensesTotal",
        "paymentVouchersTotal" = EXCLUDED."paymentVouchersTotal",
        "otherCashOutTotal" = EXCLUDED."otherCashOutTotal",
        "expectedCash" = EXCLUDED."expectedCash",
        "actualCash" = EXCLUDED."actualCash",
        "variance" = EXCLUDED."variance",
        "notes" = EXCLUDED."notes",
        "closedByUserId" = EXCLUDED."closedByUserId",
        "closedAt" = now(),
        "reopenedByUserId" = NULL,
        "reopenedAt" = NULL,
        "reopenReason" = NULL,
        "closeVersion" = EXCLUDED."closeVersion",
        "updatedAt" = now()
      RETURNING "id", "businessDate", "closeVersion"
    `;
    const close = rows[0];
    const snapshot = JSON.stringify({ ...totals, actualCash, variance });

    await tx.$executeRaw`
      INSERT INTO "DailyCashCloseEvent" (
        "shopId", "dailyCashCloseId", "action", "version", "reason", "snapshot", "performedByUserId"
      ) VALUES (
        ${shopId}::uuid, ${close.id}::uuid, ${action}, ${close.closeVersion}, ${notes?.trim() || null}, ${snapshot}::jsonb, ${closedByUserId}::uuid
      )
    `;

    return { id: close.id, ...totals, actualCash, variance, closeVersion: close.closeVersion };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 10_000 });
}

export async function reopenBusinessDay(
  shopId: string,
  businessDateInput: string,
  reopenedByUserId: string,
  reason: string,
) {
  const businessDate = parseBusinessDate(businessDateInput);
  const trimmedReason = reason.trim();
  if (!trimmedReason) throw new Error("سبب إعادة فتح اليوم مطلوب.");

  return prisma.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<Array<{
      id: string;
      status: string;
      closeVersion: number;
      openingBalance: Prisma.Decimal;
      expectedCash: Prisma.Decimal;
      actualCash: Prisma.Decimal | null;
      variance: Prisma.Decimal | null;
    }>>`
      SELECT "id", "status", "closeVersion", "openingBalance", "expectedCash", "actualCash", "variance"
      FROM "DailyCashClose"
      WHERE "shopId" = ${shopId}::uuid AND "businessDate" = ${businessDate}::date
      FOR UPDATE
    `;
    const close = rows[0];
    if (!close) throw new Error("لا يوجد إغلاق مسجل لهذا اليوم.");
    if (close.status !== "CLOSED") throw new Error("هذا اليوم غير مغلق حالياً.");

    await tx.$executeRaw`
      UPDATE "DailyCashClose"
      SET "status" = 'REOPENED', "reopenedByUserId" = ${reopenedByUserId}::uuid,
          "reopenedAt" = now(), "reopenReason" = ${trimmedReason}, "updatedAt" = now()
      WHERE "id" = ${close.id}::uuid AND "shopId" = ${shopId}::uuid
    `;

    const snapshot = JSON.stringify({
      businessDate,
      openingBalance: toNumber(close.openingBalance),
      expectedCash: toNumber(close.expectedCash),
      actualCash: close.actualCash == null ? null : toNumber(close.actualCash),
      variance: close.variance == null ? null : toNumber(close.variance),
    });
    await tx.$executeRaw`
      INSERT INTO "DailyCashCloseEvent" (
        "shopId", "dailyCashCloseId", "action", "version", "reason", "snapshot", "performedByUserId"
      ) VALUES (${shopId}::uuid, ${close.id}::uuid, 'REOPENED', ${close.closeVersion}, ${trimmedReason}, ${snapshot}::jsonb, ${reopenedByUserId}::uuid)
    `;

    return { id: close.id, businessDate, status: "REOPENED" as const };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 10_000 });
}

export async function getDailyCashClose(shopId: string, businessDateInput: string) {
  const businessDate = parseBusinessDate(businessDateInput);
  const rows = await prisma.$queryRaw<Array<Record<string, unknown>>>`
    SELECT dc.*, closer."name" AS "closedByName", reopener."name" AS "reopenedByName"
    FROM "DailyCashClose" dc
    LEFT JOIN "User" closer ON closer."id" = dc."closedByUserId"
    LEFT JOIN "User" reopener ON reopener."id" = dc."reopenedByUserId"
    WHERE dc."shopId" = ${shopId}::uuid AND dc."businessDate" = ${businessDate}::date
    LIMIT 1
  `;
  return rows[0] ?? null;
}

export async function listDailyCashCloses(shopId: string, limit = 60) {
  return prisma.$queryRaw<Array<Record<string, unknown>>>`
    SELECT dc.*, closer."name" AS "closedByName", reopener."name" AS "reopenedByName"
    FROM "DailyCashClose" dc
    LEFT JOIN "User" closer ON closer."id" = dc."closedByUserId"
    LEFT JOIN "User" reopener ON reopener."id" = dc."reopenedByUserId"
    WHERE dc."shopId" = ${shopId}::uuid
    ORDER BY dc."businessDate" DESC
    LIMIT ${Math.max(1, Math.min(limit, 180))}
  `;
}

export const dailyCashCloseService = {
  assertBusinessDateOpen,
  calculateDailyCashClose,
  closeBusinessDay,
  reopenBusinessDay,
  getDailyCashClose,
  listDailyCashCloses,
};
