import { InvoiceStatus, Prisma } from "@prisma/client";
import { parseSourceDebtReference } from "@/lib/debt-source-reference";
import { prisma } from "@/lib/prisma";
import { getInventoryDamageReportSummary } from "@/lib/services/inventoryDamageReportService";
import { reportService, type FinancialRange } from "@/lib/services/reportService";
import { softwareServiceService } from "@/lib/services/softwareServiceService";
import { getTransferCommissionReportSummary } from "@/lib/services/transferCommissionReportService";
import { getShopTimeZone } from "@/lib/shop-timezone";
import { dayUtcBoundsForTimeZone } from "@/lib/timezone";

export type DailySalesChannel = {
  key: "POS" | "REPAIR" | "SOFTWARE" | "RECHARGE" | "ELECTRONIC_OTHER" | "OTHER" | "WALLET_TRANSFERS";
  label: string;
  revenue: number;
  cost: number;
  profit: number;
  count: number;
  href: string;
  volumeOnly?: boolean;
};

export type DailyLiquiditySource = {
  id: string;
  label: string;
  balance: number;
  href: string;
  kind: "DRAWER" | "WALLET" | "PROVIDER";
};

export type DailyCollectionSource = {
  key: string;
  label: string;
  amount: number;
  href: string | null;
  kind: "DRAWER" | "WALLET" | "OTHER" | "ADJUSTMENT";
};

export type DailyDamageItem = {
  inventoryItemId: string;
  name: string;
  quantity: number;
  value: number;
};

export type DailyPeriodLiquiditySource = {
  id: string;
  label: string;
  kind: "DRAWER" | "WALLET" | "PROVIDER";
  openingBalance: number;
  inflow: number;
  outflow: number;
  closingBalance: number;
};

type DebtLedgerRow = {
  id: string;
  customerId: string;
  type: "DEBT" | "PAYMENT" | "OPENING_BALANCE" | "ADJUSTMENT_DEBIT" | "ADJUSTMENT_CREDIT";
  amount: Prisma.Decimal;
  reference: string | null;
  isReversed: boolean;
};

type ElectronicCategoryRow = {
  category: string;
  revenue: Prisma.Decimal;
  cost: Prisma.Decimal;
  profit: Prisma.Decimal;
  count: bigint;
};

function money(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function number(value: Prisma.Decimal | string | number | bigint | null | undefined) {
  return Number(value ?? 0);
}

function isRechargeCategory(category: string) {
  const normalized = category.replace(/\s+/g, " ").trim().toLowerCase();
  return normalized.includes("شحن") || normalized.includes("رصيد") || normalized.includes("باقة");
}

function paymentMethodLabel(method: string | null | undefined) {
  if (method === "CASH") return "الدرج النقدي";
  if (method === "CARD") return "بطاقة";
  if (method === "BANK_TRANSFER") return "تحويل بنكي";
  return "مصدر آخر";
}

async function getDebtSnapshot(shopId: string) {
  const rows = await prisma.$queryRaw<DebtLedgerRow[]>`
    SELECT "id", "customerId", "type", "amount", "reference", "isReversed"
    FROM "DebtLedgerEntry"
    WHERE "shopId" = ${shopId}::uuid
    ORDER BY "customerId" ASC, "occurredAt" ASC, "createdAt" ASC, "id" ASC
  `;

  const queues = new Map<string, Array<{ remaining: Prisma.Decimal; external: boolean }>>();
  for (const row of rows) {
    if (row.isReversed) continue;
    const amount = new Prisma.Decimal(row.amount);
    const queue = queues.get(row.customerId) ?? [];
    if (!queues.has(row.customerId)) queues.set(row.customerId, queue);

    if (row.type === "DEBT" || row.type === "OPENING_BALANCE" || row.type === "ADJUSTMENT_DEBIT") {
      const parsedSource = row.type === "DEBT" ? parseSourceDebtReference(row.reference) : null;
      queue.push({
        remaining: amount,
        external: row.type !== "DEBT" || !parsedSource,
      });
      continue;
    }

    let credit = amount;
    for (const debit of queue) {
      if (credit.lte(0)) break;
      if (debit.remaining.lte(0)) continue;
      const applied = debit.remaining.lte(credit) ? debit.remaining : credit;
      debit.remaining = debit.remaining.sub(applied);
      credit = credit.sub(applied);
    }
  }

  let totalOutstanding = 0;
  let externalOutstanding = 0;
  for (const queue of queues.values()) {
    for (const debit of queue) {
      if (debit.remaining.lte(0)) continue;
      totalOutstanding += Number(debit.remaining);
      if (debit.external) externalOutstanding += Number(debit.remaining);
    }
  }

  return {
    totalOutstanding: money(totalOutstanding),
    externalOutstanding: money(externalOutstanding),
  };
}

async function getSupplierPayables(shopId: string) {
  const rows = await prisma.$queryRaw<Array<{
    manualOutstanding: Prisma.Decimal;
    purchaseOutstanding: Prisma.Decimal;
    supplierCredit: Prisma.Decimal;
  }>>`
    SELECT
      COALESCE((
        SELECT SUM(GREATEST(balance, 0))
        FROM (
          SELECT e."supplierId", SUM(CASE
            WHEN e."status" <> 'ACTIVE' THEN 0
            WHEN e."type" IN ('OPENING_BALANCE','ADJUSTMENT_DEBIT') THEN e."amount"
            WHEN e."type" = 'PAYMENT' THEN -e."manualAppliedAmount"
            WHEN e."type" = 'ADJUSTMENT_CREDIT' THEN -e."amount"
            ELSE 0 END) AS balance
          FROM "SupplierLedgerEntry" e
          WHERE e."shopId" = ${shopId}::uuid
          GROUP BY e."supplierId"
        ) manual_balances
      ), 0) AS "manualOutstanding",
      COALESCE((
        SELECT SUM(p."balanceDue")
        FROM "PurchaseInvoice" p
        WHERE p."shopId" = ${shopId}::uuid
          AND p."status" = 'POSTED'
          AND p."deletedAt" IS NULL
          AND p."balanceDue" > 0
      ), 0) AS "purchaseOutstanding",
      COALESCE((
        SELECT SUM(srs."amount")
        FROM "SupplierReturnSettlement" srs
        WHERE srs."shopId" = ${shopId}::uuid
          AND srs."type" = 'SUPPLIER_CREDIT'
      ), 0) AS "supplierCredit"
  `;

  const manualOutstanding = number(rows[0]?.manualOutstanding);
  const purchaseOutstanding = number(rows[0]?.purchaseOutstanding);
  const supplierCredit = number(rows[0]?.supplierCredit);
  const totalPayable = money(manualOutstanding + purchaseOutstanding);

  return {
    manualOutstanding: money(manualOutstanding),
    purchaseOutstanding: money(purchaseOutstanding),
    supplierCredit: money(supplierCredit),
    totalPayable,
    netPayable: money(Math.max(0, totalPayable - supplierCredit)),
  };
}

async function getPeriodLiquidity(shopId: string, range: FinancialRange) {
  const [drawerRows, walletRows, providerRows] = await Promise.all([
    prisma.$queryRaw<Array<{
      id: string;
      currentBalance: Prisma.Decimal;
      periodIn: Prisma.Decimal;
      periodOut: Prisma.Decimal;
      afterNet: Prisma.Decimal;
    }>>`
      SELECT d."id", d."currentBalance",
        COALESCE(SUM(m."amount") FILTER (
          WHERE m."status" = 'ACTIVE' AND m."direction" = 'IN'
            AND m."createdAt" >= ${range.start} AND m."createdAt" < ${range.end}
        ), 0) AS "periodIn",
        COALESCE(SUM(m."amount") FILTER (
          WHERE m."status" = 'ACTIVE' AND m."direction" = 'OUT'
            AND m."createdAt" >= ${range.start} AND m."createdAt" < ${range.end}
        ), 0) AS "periodOut",
        COALESCE(SUM(CASE WHEN m."direction" = 'IN' THEN m."amount" ELSE -m."amount" END) FILTER (
          WHERE m."status" = 'ACTIVE' AND m."createdAt" >= ${range.end}
        ), 0) AS "afterNet"
      FROM "CashDrawer" d
      LEFT JOIN "CashDrawerMovement" m ON m."drawerId" = d."id" AND m."shopId" = ${shopId}::uuid
      WHERE d."shopId" = ${shopId}::uuid
      GROUP BY d."id", d."currentBalance"
    `,
    prisma.$queryRaw<Array<{
      id: string;
      name: string;
      currentBalance: Prisma.Decimal;
      periodIn: Prisma.Decimal;
      periodOut: Prisma.Decimal;
      afterNet: Prisma.Decimal;
    }>>`
      SELECT w."id", w."name", w."currentBalance",
        COALESCE(SUM(t."walletAmount") FILTER (
          WHERE t."status" = 'ACTIVE' AND t."deletedAt" IS NULL
            AND t."operationType" IN ('CUSTOMER_WITHDRAWAL','WALLET_TOPUP')
            AND t."createdAt" >= ${range.start} AND t."createdAt" < ${range.end}
        ), 0) AS "periodIn",
        COALESCE(SUM(t."walletAmount") FILTER (
          WHERE t."status" = 'ACTIVE' AND t."deletedAt" IS NULL
            AND t."operationType" IN ('CUSTOMER_DEPOSIT','WALLET_WITHDRAWAL')
            AND t."createdAt" >= ${range.start} AND t."createdAt" < ${range.end}
        ), 0) AS "periodOut",
        COALESCE(SUM(CASE
          WHEN t."operationType" IN ('CUSTOMER_WITHDRAWAL','WALLET_TOPUP') THEN t."walletAmount"
          ELSE -t."walletAmount"
        END) FILTER (
          WHERE t."status" = 'ACTIVE' AND t."deletedAt" IS NULL
            AND t."operationType" IN ('CUSTOMER_DEPOSIT','CUSTOMER_WITHDRAWAL','WALLET_TOPUP','WALLET_WITHDRAWAL')
            AND t."createdAt" >= ${range.end}
        ), 0) AS "afterNet"
      FROM "FinancialWallet" w
      LEFT JOIN "FinancialTransfer" t ON t."walletId" = w."id" AND t."shopId" = ${shopId}::uuid
      WHERE w."shopId" = ${shopId}::uuid
      GROUP BY w."id", w."name", w."currentBalance"
      ORDER BY w."name" ASC
    `,
    prisma.$queryRaw<Array<{
      id: string;
      name: string;
      currentBalance: Prisma.Decimal;
      periodIn: Prisma.Decimal;
      periodOut: Prisma.Decimal;
      afterNet: Prisma.Decimal;
    }>>`
      SELECT p."id", p."name", p."currentBalance",
        COALESCE(SUM(m."amount") FILTER (
          WHERE m."direction" = 'IN' AND m."createdAt" >= ${range.start} AND m."createdAt" < ${range.end}
        ), 0) AS "periodIn",
        COALESCE(SUM(m."amount") FILTER (
          WHERE m."direction" = 'OUT' AND m."createdAt" >= ${range.start} AND m."createdAt" < ${range.end}
        ), 0) AS "periodOut",
        COALESCE(SUM(CASE WHEN m."direction" = 'IN' THEN m."amount" ELSE -m."amount" END) FILTER (
          WHERE m."createdAt" >= ${range.end}
        ), 0) AS "afterNet"
      FROM "ElectronicServiceProvider" p
      LEFT JOIN "ElectronicServiceProviderMovement" m ON m."providerId" = p."id" AND m."shopId" = ${shopId}::uuid
      WHERE p."shopId" = ${shopId}::uuid
      GROUP BY p."id", p."name", p."currentBalance"
      ORDER BY p."name" ASC
    `,
  ]);

  const buildSource = (
    row: { id: string; currentBalance: Prisma.Decimal; periodIn: Prisma.Decimal; periodOut: Prisma.Decimal; afterNet: Prisma.Decimal },
    label: string,
    kind: DailyPeriodLiquiditySource["kind"],
  ): DailyPeriodLiquiditySource => {
    const inflow = money(number(row.periodIn));
    const outflow = money(number(row.periodOut));
    const closingBalance = money(number(row.currentBalance) - number(row.afterNet));
    const openingBalance = money(closingBalance - inflow + outflow);
    return { id: row.id, label, kind, openingBalance, inflow, outflow, closingBalance };
  };

  const sources: DailyPeriodLiquiditySource[] = [
    ...drawerRows.map((row) => buildSource(row, "الدرج النقدي", "DRAWER")),
    ...walletRows.map((row) => buildSource(row, row.name, "WALLET")),
    ...providerRows.map((row) => buildSource(row, row.name, "PROVIDER")),
  ];

  return {
    sources,
    openingBalance: money(sources.reduce((sum, source) => sum + source.openingBalance, 0)),
    inflow: money(sources.reduce((sum, source) => sum + source.inflow, 0)),
    outflow: money(sources.reduce((sum, source) => sum + source.outflow, 0)),
    closingBalance: money(sources.reduce((sum, source) => sum + source.closingBalance, 0)),
  };
}

async function getDailyFinancialCore(shopId: string, requestedRange?: FinancialRange) {
  const timeZone = await getShopTimeZone(shopId);
  const range = requestedRange ?? dayUtcBoundsForTimeZone(new Date(), timeZone);
  const [report, transferCommission] = await Promise.all([
    reportService.getFinancialReport(shopId, range),
    getTransferCommissionReportSummary(shopId, range.start, range.end).catch(() => ({ totalProfit: 0, operationCount: 0 })),
  ]);
  const grossProfit = money(report.metrics.grossProfit + transferCommission.totalProfit);
  const netProfit = money(report.metrics.netProfit + transferCommission.totalProfit);
  return {
    timeZone,
    range,
    report,
    transferCommission,
    totals: {
      sales: report.metrics.grossRevenue,
      costs: report.metrics.directCosts,
      collected: report.metrics.collected,
      outstandingFromToday: report.metrics.outstanding,
      grossProfit,
      expenses: report.metrics.expenseTotal,
      netProfit,
      transferCommissionProfit: money(transferCommission.totalProfit),
    },
  };
}

export async function getDailySummaryHeadline(shopId: string) {
  const { timeZone, range, totals } = await getDailyFinancialCore(shopId);
  return { timeZone, range, totals };
}

export async function getDailySummary(shopId: string, requestedRange?: FinancialRange) {
  const { timeZone, range, report, transferCommission, totals } = await getDailyFinancialCore(shopId, requestedRange);
  const periodLiquidityPromise = getPeriodLiquidity(shopId, range);

  const [
    damageSummary,
    softwareRows,
    posRows,
    posCostRows,
    repairRows,
    repairCostRows,
    otherInvoiceRows,
    manualPlanRows,
    electronicCategoryRows,
    walletTransferRows,
    invoiceCollectionRows,
    installmentCollectionRows,
    debtCollectionRows,
    electronicCollectionRows,
    posAccountRows,
    drawerRows,
    walletRows,
    providerRows,
    damageItems,
    debt,
    supplierPayables,
  ] = await Promise.all([
    getInventoryDamageReportSummary(shopId, range.start, range.end),
    softwareServiceService.getFinancialRows(shopId, range.start, range.end).catch(() => []),
    prisma.$queryRaw<Array<{ revenue: Prisma.Decimal; count: bigint }>>`
      SELECT COALESCE(SUM("total"), 0) AS revenue, COUNT(*) AS count
      FROM "Sale"
      WHERE "shopId" = ${shopId}::uuid
        AND "deletedAt" IS NULL
        AND "status" = 'COMPLETED'
        AND "soldAt" >= ${range.start}
        AND "soldAt" < ${range.end}
    `,
    prisma.$queryRaw<Array<{ cost: Prisma.Decimal }>>`
      SELECT COALESCE(SUM(CASE
        WHEN m."type" = 'RETURN' THEN -ABS(m."quantityChange") * COALESCE(m."unitCostSnapshot", 0)
        ELSE ABS(m."quantityChange") * COALESCE(m."unitCostSnapshot", 0)
      END), 0) AS cost
      FROM "InventoryMovement" m
      LEFT JOIN "Sale" s ON s."id" = m."saleId"
      WHERE m."shopId" = ${shopId}::uuid
        AND m."deletedAt" IS NULL
        AND m."type" IN ('SALE','RETURN')
        AND m."createdAt" >= ${range.start}
        AND m."createdAt" < ${range.end}
        AND s."deletedAt" IS NULL
        AND s."status" = 'COMPLETED'
    `,
    prisma.$queryRaw<Array<{ revenue: Prisma.Decimal; count: bigint }>>`
      SELECT COALESCE(SUM(i."total"), 0) AS revenue, COUNT(*) AS count
      FROM "Invoice" i
      WHERE i."shopId" = ${shopId}::uuid
        AND i."deletedAt" IS NULL
        AND i."status" <> 'VOID'
        AND i."repairOrderId" IS NOT NULL
        AND i."issuedAt" >= ${range.start}
        AND i."issuedAt" < ${range.end}
    `,
    prisma.$queryRaw<Array<{ cost: Prisma.Decimal }>>`
      SELECT
        COALESCE((
          SELECT SUM(CASE
            WHEN m."type" = 'REPAIR_RETURN' THEN -ABS(m."quantityChange") * COALESCE(m."unitCostSnapshot", 0)
            ELSE ABS(m."quantityChange") * COALESCE(m."unitCostSnapshot", 0)
          END)
          FROM "InventoryMovement" m
          JOIN "RepairOrder" ro ON ro."id" = m."repairOrderId"
          WHERE m."shopId" = ${shopId}::uuid
            AND m."deletedAt" IS NULL
            AND m."type" IN ('REPAIR_USAGE','REPAIR_RETURN')
            AND m."createdAt" < ${range.end}
            AND ro."deletedAt" IS NULL
            AND ro."status" <> 'CANCELLED'
            AND EXISTS (
              SELECT 1 FROM "Invoice" i
              WHERE i."repairOrderId" = ro."id"
                AND i."shopId" = ${shopId}::uuid
                AND i."deletedAt" IS NULL
                AND i."status" <> 'VOID'
                AND i."issuedAt" >= ${range.start}
                AND i."issuedAt" < ${range.end}
            )
        ), 0)
        + COALESCE((
          SELECT SUM(roi."quantity" * COALESCE(roi."unitCost", 0))
          FROM "RepairOrderItem" roi
          JOIN "RepairOrder" ro ON ro."id" = roi."repairOrderId"
          WHERE roi."shopId" = ${shopId}::uuid
            AND roi."deletedAt" IS NULL
            AND roi."inventoryItemId" IS NULL
            AND roi."unitCost" IS NOT NULL
            AND roi."createdAt" < ${range.end}
            AND ro."deletedAt" IS NULL
            AND ro."status" <> 'CANCELLED'
            AND EXISTS (
              SELECT 1 FROM "Invoice" i
              WHERE i."repairOrderId" = ro."id"
                AND i."shopId" = ${shopId}::uuid
                AND i."deletedAt" IS NULL
                AND i."status" <> 'VOID'
                AND i."issuedAt" >= ${range.start}
                AND i."issuedAt" < ${range.end}
            )
        ), 0)
        + COALESCE((
          SELECT SUM(COALESCE(ro."partCost", 0))
          FROM "RepairOrder" ro
          WHERE ro."shopId" = ${shopId}::uuid
            AND ro."deletedAt" IS NULL
            AND ro."status" <> 'CANCELLED'
            AND ro."deductPartCost" = TRUE
            AND ro."partCost" IS NOT NULL
            AND ro."createdAt" < ${range.end}
            AND NOT EXISTS (
              SELECT 1 FROM "RepairOrderItem" roi
              WHERE roi."repairOrderId" = ro."id" AND roi."deletedAt" IS NULL
            )
            AND EXISTS (
              SELECT 1 FROM "Invoice" i
              WHERE i."repairOrderId" = ro."id"
                AND i."shopId" = ${shopId}::uuid
                AND i."deletedAt" IS NULL
                AND i."status" <> 'VOID'
                AND i."issuedAt" >= ${range.start}
                AND i."issuedAt" < ${range.end}
            )
        ), 0) AS cost
    `,
    prisma.$queryRaw<Array<{ revenue: Prisma.Decimal; count: bigint }>>`
      SELECT COALESCE(SUM(i."total"), 0) AS revenue, COUNT(*) AS count
      FROM "Invoice" i
      LEFT JOIN "SoftwareServiceSale" s
        ON s."invoiceId" = i."id" AND s."shopId" = ${shopId}::uuid AND s."deletedAt" IS NULL
      WHERE i."shopId" = ${shopId}::uuid
        AND i."deletedAt" IS NULL
        AND i."status" <> 'VOID'
        AND i."saleId" IS NULL
        AND i."repairOrderId" IS NULL
        AND s."id" IS NULL
        AND i."issuedAt" >= ${range.start}
        AND i."issuedAt" < ${range.end}
    `,
    prisma.$queryRaw<Array<{ revenue: Prisma.Decimal; count: bigint }>>`
      SELECT COALESCE(SUM("totalAmount"), 0) AS revenue, COUNT(*) AS count
      FROM "InstallmentPlan"
      WHERE "shopId" = ${shopId}::uuid
        AND "deletedAt" IS NULL
        AND "source" = 'MANUAL'
        AND "status" <> 'CANCELLED'
        AND "createdAt" >= ${range.start}
        AND "createdAt" < ${range.end}
    `,
    prisma.$queryRaw<ElectronicCategoryRow[]>`
      SELECT COALESCE(NULLIF(TRIM("category"), ''), 'خدمات إلكترونية أخرى') AS category,
        COALESCE(SUM("customerCharge"), 0) AS revenue,
        COALESCE(SUM("providerCost"), 0) AS cost,
        COALESCE(SUM("profit"), 0) AS profit,
        COUNT(*) AS count
      FROM "ElectronicServiceTransaction"
      WHERE "shopId" = ${shopId}::uuid
        AND "status" = 'ACTIVE'
        AND "createdAt" >= ${range.start}
        AND "createdAt" < ${range.end}
      GROUP BY COALESCE(NULLIF(TRIM("category"), ''), 'خدمات إلكترونية أخرى')
      ORDER BY revenue DESC
    `,
    prisma.$queryRaw<Array<{ volume: Prisma.Decimal; profit: Prisma.Decimal; count: bigint }>>`
      SELECT COALESCE(SUM("amount"), 0) AS volume,
        COALESCE(SUM("commission"), 0) AS profit,
        COUNT(*) AS count
      FROM "FinancialTransfer"
      WHERE "shopId" = ${shopId}::uuid
        AND "deletedAt" IS NULL
        AND "status" = 'ACTIVE'
        AND "sourceType" = 'CUSTOMER_TRANSFER'
        AND "operationType" IN ('CUSTOMER_DEPOSIT','CUSTOMER_WITHDRAWAL')
        AND "createdAt" >= ${range.start}
        AND "createdAt" < ${range.end}
    `,
    prisma.$queryRaw<Array<{ sourceName: string | null; paymentMethod: string | null; amount: Prisma.Decimal }>>`
      SELECT p."sourceName", p."method"::text AS "paymentMethod", COALESCE(SUM(p."amount"), 0) AS amount
      FROM "Payment" p
      JOIN "Invoice" i ON i."id" = p."invoiceId"
      WHERE p."shopId" = ${shopId}::uuid
        AND p."deletedAt" IS NULL
        AND p."paidAt" >= ${range.start}
        AND p."paidAt" < ${range.end}
        AND i."deletedAt" IS NULL
        AND i."status" <> 'VOID'
      GROUP BY p."sourceName", p."method"
    `,
    prisma.$queryRaw<Array<{ sourceName: string | null; paymentMethod: string | null; amount: Prisma.Decimal }>>`
      SELECT ip."sourceName", ip."method"::text AS "paymentMethod", COALESCE(SUM(ip."amount"), 0) AS amount
      FROM "InstallmentPayment" ip
      JOIN "InstallmentPlan" plan ON plan."id" = ip."planId"
      WHERE ip."shopId" = ${shopId}::uuid
        AND ip."voidedAt" IS NULL
        AND ip."paidAt" >= ${range.start}
        AND ip."paidAt" < ${range.end}
        AND plan."deletedAt" IS NULL
        AND plan."source" = 'MANUAL'
        AND plan."status" <> 'CANCELLED'
      GROUP BY ip."sourceName", ip."method"
    `,
    prisma.$queryRaw<Array<{ sourceName: string | null; paymentMethod: string | null; amount: Prisma.Decimal }>>`
      SELECT d."sourceName", d."paymentMethod", COALESCE(SUM(d."amount"), 0) AS amount
      FROM "DebtLedgerEntry" d
      WHERE d."shopId" = ${shopId}::uuid
        AND d."type" = 'PAYMENT'
        AND d."isReversed" = FALSE
        AND d."occurredAt" >= ${range.start}
        AND d."occurredAt" < ${range.end}
      GROUP BY d."sourceName", d."paymentMethod"
    `,
    prisma.$queryRaw<Array<{ paymentDestination: string; walletId: string | null; walletName: string | null; amount: Prisma.Decimal }>>`
      SELECT tx."paymentDestination", tx."walletId", w."name" AS "walletName",
        COALESCE(SUM(tx."customerCharge"), 0) AS amount
      FROM "ElectronicServiceTransaction" tx
      LEFT JOIN "FinancialWallet" w ON w."id" = tx."walletId" AND w."shopId" = ${shopId}::uuid
      WHERE tx."shopId" = ${shopId}::uuid
        AND tx."status" = 'ACTIVE'
        AND tx."paymentDestination" <> 'DEBT'
        AND tx."createdAt" >= ${range.start}
        AND tx."createdAt" < ${range.end}
      GROUP BY tx."paymentDestination", tx."walletId", w."name"
    `,
    prisma.$queryRaw<Array<{ kind: "DRAWER" | "WALLET"; walletId: string | null; walletName: string | null; amount: Prisma.Decimal }>>`
      SELECT 'DRAWER'::text AS kind, NULL::uuid AS "walletId", NULL::text AS "walletName",
        COALESCE(SUM(CASE WHEN m."direction" = 'IN' THEN m."amount" ELSE -m."amount" END), 0) AS amount
      FROM "CashDrawerMovement" m
      JOIN "Sale" s ON m."sourceId" = s."id"::text AND s."shopId" = ${shopId}::uuid
      WHERE m."shopId" = ${shopId}::uuid
        AND m."status" = 'ACTIVE'
        AND m."sourceType" IN ('SALE','SALE_CHANGE')
        AND s."deletedAt" IS NULL
        AND s."status" = 'COMPLETED'
        AND s."soldAt" >= ${range.start}
        AND s."soldAt" < ${range.end}
        AND NOT EXISTS (SELECT 1 FROM "Invoice" i WHERE i."saleId" = s."id" AND i."deletedAt" IS NULL AND i."status" <> 'VOID')
      UNION ALL
      SELECT 'WALLET'::text AS kind, t."walletId", w."name" AS "walletName",
        COALESCE(SUM(CASE WHEN t."operationType" = 'WALLET_TOPUP' THEN t."walletAmount" ELSE -t."walletAmount" END), 0) AS amount
      FROM "FinancialTransfer" t
      JOIN "Sale" s ON t."sourceId" = s."id"::text AND s."shopId" = ${shopId}::uuid
      JOIN "FinancialWallet" w ON w."id" = t."walletId"
      WHERE t."shopId" = ${shopId}::uuid
        AND t."deletedAt" IS NULL
        AND t."status" = 'ACTIVE'
        AND t."sourceType" IN ('SALE','SALE_CHANGE')
        AND t."operationType" IN ('WALLET_TOPUP','WALLET_WITHDRAWAL')
        AND s."deletedAt" IS NULL
        AND s."status" = 'COMPLETED'
        AND s."soldAt" >= ${range.start}
        AND s."soldAt" < ${range.end}
        AND NOT EXISTS (SELECT 1 FROM "Invoice" i WHERE i."saleId" = s."id" AND i."deletedAt" IS NULL AND i."status" <> 'VOID')
      GROUP BY t."walletId", w."name"
    `,
    prisma.$queryRaw<Array<{ currentBalance: Prisma.Decimal }>>`
      SELECT "currentBalance" FROM "CashDrawer" WHERE "shopId" = ${shopId}::uuid LIMIT 1
    `,
    prisma.$queryRaw<Array<{ id: string; name: string; currentBalance: Prisma.Decimal }>>`
      SELECT "id", "name", "currentBalance"
      FROM "FinancialWallet"
      WHERE "shopId" = ${shopId}::uuid AND "deletedAt" IS NULL AND "isActive" = TRUE
      ORDER BY "name" ASC
    `,
    prisma.$queryRaw<Array<{ id: string; name: string; currentBalance: Prisma.Decimal }>>`
      SELECT "id", "name", "currentBalance"
      FROM "ElectronicServiceProvider"
      WHERE "shopId" = ${shopId}::uuid AND "isActive" = TRUE
      ORDER BY "name" ASC
    `,
    prisma.$queryRaw<Array<{ inventoryItemId: string; name: string; quantity: bigint; value: Prisma.Decimal }>>`
      SELECT d."inventoryItemId", i."name", SUM(d."quantity") AS quantity,
        COALESCE(SUM(d."quantity" * COALESCE(d."unitCostSnapshot", 0)), 0) AS value
      FROM "InventoryDamage" d
      JOIN "InventoryItem" i ON i."id" = d."inventoryItemId" AND i."shopId" = ${shopId}::uuid
      WHERE d."shopId" = ${shopId}::uuid
        AND d."createdAt" >= ${range.start}
        AND d."createdAt" < ${range.end}
      GROUP BY d."inventoryItemId", i."name"
      ORDER BY value DESC, i."name" ASC
      LIMIT 20
    `,
    getDebtSnapshot(shopId),
    getSupplierPayables(shopId),
  ]);
  const periodLiquidity = await periodLiquidityPromise;

  const posRevenue = number(posRows[0]?.revenue);
  const posCost = number(posCostRows[0]?.cost);
  const repairRevenue = number(repairRows[0]?.revenue);
  const repairCost = number(repairCostRows[0]?.cost);
  const softwareRevenue = softwareRows
    .filter((row) => row.invoiceStatus !== InvoiceStatus.VOID)
    .reduce((sum, row) => sum + number(row.invoiceTotal), 0);
  const softwareCost = softwareRows
    .filter((row) => row.invoiceStatus !== InvoiceStatus.VOID)
    .reduce((sum, row) => sum + number(row.serviceCost), 0);

  const recharge = electronicCategoryRows
    .filter((row) => isRechargeCategory(row.category))
    .reduce((sum, row) => ({
      revenue: sum.revenue + number(row.revenue),
      cost: sum.cost + number(row.cost),
      profit: sum.profit + number(row.profit),
      count: sum.count + Number(row.count),
    }), { revenue: 0, cost: 0, profit: 0, count: 0 });

  const electronicOther = electronicCategoryRows
    .filter((row) => !isRechargeCategory(row.category))
    .reduce((sum, row) => ({
      revenue: sum.revenue + number(row.revenue),
      cost: sum.cost + number(row.cost),
      profit: sum.profit + number(row.profit),
      count: sum.count + Number(row.count),
    }), { revenue: 0, cost: 0, profit: 0, count: 0 });

  const otherRevenue = number(otherInvoiceRows[0]?.revenue) + number(manualPlanRows[0]?.revenue);
  const knownCosts = posCost + repairCost + softwareCost + report.metrics.electronicServiceCost;
  const otherCost = money(Math.max(0, report.metrics.directCosts - knownCosts));
  const walletVolume = number(walletTransferRows[0]?.volume);
  const walletProfit = money(transferCommission.totalProfit || number(walletTransferRows[0]?.profit));

  const channels: DailySalesChannel[] = [
    { key: "POS", label: "الإكسسوار وبيع القطع (POS)", revenue: money(posRevenue), cost: money(posCost), profit: money(posRevenue - posCost), count: Number(posRows[0]?.count ?? 0), href: "/sales" },
    { key: "REPAIR", label: "الصيانة المفوترة", revenue: money(repairRevenue), cost: money(repairCost), profit: money(repairRevenue - repairCost), count: Number(repairRows[0]?.count ?? 0), href: "/repair-orders" },
    { key: "SOFTWARE", label: "خدمات السوفتوير", revenue: money(softwareRevenue), cost: money(softwareCost), profit: money(softwareRevenue - softwareCost), count: softwareRows.filter((row) => row.invoiceStatus !== InvoiceStatus.VOID).length, href: "/software-services" },
    { key: "RECHARGE", label: "شحن الرصيد والباقات", revenue: money(recharge.revenue), cost: money(recharge.cost), profit: money(recharge.profit), count: recharge.count, href: "/electronic-services" },
    { key: "ELECTRONIC_OTHER", label: "خدمات إلكترونية أخرى", revenue: money(electronicOther.revenue), cost: money(electronicOther.cost), profit: money(electronicOther.profit), count: electronicOther.count, href: "/electronic-services" },
    { key: "OTHER", label: "فواتير وخطط أخرى", revenue: money(otherRevenue), cost: otherCost, profit: money(otherRevenue - otherCost), count: Number(otherInvoiceRows[0]?.count ?? 0) + Number(manualPlanRows[0]?.count ?? 0), href: "/invoices" },
    { key: "WALLET_TRANSFERS", label: "عمليات المحافظ الإلكترونية", revenue: money(walletVolume), cost: 0, profit: walletProfit, count: Number(walletTransferRows[0]?.count ?? 0), href: "/transfers", volumeOnly: true },
  ];

  const drawerBalance = money(number(drawerRows[0]?.currentBalance));
  const wallets: DailyLiquiditySource[] = walletRows.map((wallet) => ({
    id: wallet.id,
    label: wallet.name,
    balance: money(number(wallet.currentBalance)),
    href: `/transfers?walletId=${wallet.id}`,
    kind: "WALLET",
  }));
  const providers: DailyLiquiditySource[] = providerRows.map((provider) => ({
    id: provider.id,
    label: provider.name,
    balance: money(number(provider.currentBalance)),
    href: "/electronic-services",
    kind: "PROVIDER",
  }));
  const liquiditySources: DailyLiquiditySource[] = [
    { id: "cash-drawer", label: "الدرج النقدي", balance: drawerBalance, href: "/cash-drawer", kind: "DRAWER" },
    ...wallets,
    ...providers,
  ];
  const liquidityTotal = money(liquiditySources.reduce((sum, source) => sum + source.balance, 0));

  const walletByName = new Map(wallets.map((wallet) => [wallet.label.trim(), wallet]));
  const collectionMap = new Map<string, DailyCollectionSource>();
  const addCollection = (labelValue: string, amountValue: number, options?: { kind?: DailyCollectionSource["kind"]; href?: string | null; key?: string }) => {
    const label = labelValue.trim() || "مصدر آخر";
    const amount = money(amountValue);
    if (Math.abs(amount) < 0.005) return;
    const matchedWallet = walletByName.get(label);
    const kind = options?.kind ?? (label === "الدرج النقدي" ? "DRAWER" : matchedWallet ? "WALLET" : "OTHER");
    const href = options?.href !== undefined ? options.href : kind === "DRAWER" ? "/cash-drawer" : matchedWallet?.href ?? null;
    const key = options?.key ?? `${kind}:${matchedWallet?.id ?? label}`;
    const existing = collectionMap.get(key);
    if (existing) existing.amount = money(existing.amount + amount);
    else collectionMap.set(key, { key, label, amount, href, kind });
  };

  for (const row of invoiceCollectionRows) addCollection(row.sourceName?.trim() || paymentMethodLabel(row.paymentMethod), number(row.amount));
  for (const row of installmentCollectionRows) addCollection(row.sourceName?.trim() || paymentMethodLabel(row.paymentMethod), number(row.amount));
  for (const row of debtCollectionRows) addCollection(row.sourceName?.trim() || paymentMethodLabel(row.paymentMethod), number(row.amount));
  for (const row of electronicCollectionRows) {
    if (row.paymentDestination === "DRAWER") addCollection("الدرج النقدي", number(row.amount), { kind: "DRAWER", href: "/cash-drawer", key: "DRAWER:cash-drawer" });
    else if (row.paymentDestination === "WALLET") addCollection(row.walletName?.trim() || "محفظة إلكترونية", number(row.amount), { kind: "WALLET", href: row.walletId ? `/transfers?walletId=${row.walletId}` : "/transfers", key: `WALLET:${row.walletId ?? row.walletName ?? "unknown"}` });
    else addCollection("مصدر آخر للخدمات الإلكترونية", number(row.amount), { kind: "OTHER", href: "/electronic-services", key: "OTHER:electronic-services" });
  }
  for (const row of posAccountRows) {
    if (row.kind === "DRAWER") addCollection("الدرج النقدي", number(row.amount), { kind: "DRAWER", href: "/cash-drawer", key: "DRAWER:cash-drawer" });
    else addCollection(row.walletName?.trim() || "محفظة إلكترونية", number(row.amount), { kind: "WALLET", href: row.walletId ? `/transfers?walletId=${row.walletId}` : "/transfers", key: `WALLET:${row.walletId ?? row.walletName ?? "unknown"}` });
  }

  const trackedCollection = money([...collectionMap.values()].reduce((sum, source) => sum + source.amount, 0));
  const reconciliationDifference = money(totals.collected - trackedCollection);
  if (Math.abs(reconciliationDifference) >= 0.01) {
    addCollection(
      reconciliationDifference > 0 ? "مصدر آخر / غير مربوط بحساب مالي" : "إرجاعات أو تسويات على التحصيل",
      reconciliationDifference,
      { kind: "ADJUSTMENT", href: null, key: "ADJUSTMENT:reconciliation" },
    );
  }
  const collectionSources = [...collectionMap.values()].sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount));

  return {
    timeZone,
    range,
    totals,
    channels,
    electronicCategories: electronicCategoryRows.map((row) => ({
      category: row.category,
      revenue: money(number(row.revenue)),
      cost: money(number(row.cost)),
      profit: money(number(row.profit)),
      count: Number(row.count),
    })),
    liquidity: {
      drawerBalance,
      wallets,
      providers,
      sources: liquiditySources,
      total: liquidityTotal,
    },
    collections: {
      sources: collectionSources,
      total: totals.collected,
      trackedBeforeReconciliation: trackedCollection,
      reconciliationDifference,
    },
    periodLiquidity,
    inventory: {
      valueAtCost: report.metrics.inventoryValue,
      damageValue: money(damageSummary.totalValue),
      damageCount: damageSummary.movementCount,
      damageItems: damageItems.map((item) => ({
        inventoryItemId: item.inventoryItemId,
        name: item.name,
        quantity: Number(item.quantity),
        value: money(number(item.value)),
      })) satisfies DailyDamageItem[],
    },
    debts: {
      customerOutstanding: debt.totalOutstanding,
      externalOutstanding: debt.externalOutstanding,
      supplierManualOutstanding: supplierPayables.manualOutstanding,
      supplierPurchaseOutstanding: supplierPayables.purchaseOutstanding,
      supplierCredit: supplierPayables.supplierCredit,
      supplierPayable: supplierPayables.totalPayable,
      supplierNetPayable: supplierPayables.netPayable,
    },
  };
}

export const dailySummaryService = { getDailySummary, getDailySummaryHeadline };
