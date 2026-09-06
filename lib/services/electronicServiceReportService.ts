import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export type ElectronicServiceReportFilters = {
  from?: string;
  to?: string;
  providerId?: string;
  timeZone: string;
};

export type ElectronicServiceReportProviderRow = {
  providerId: string;
  providerName: string;
  currencyCode: string;
  operationCount: number;
  providerCost: Prisma.Decimal;
  customerCharge: Prisma.Decimal;
  profit: Prisma.Decimal;
};

export type ElectronicServiceReportServiceRow = {
  category: string;
  serviceName: string;
  operationCount: number;
  providerCost: Prisma.Decimal;
  customerCharge: Prisma.Decimal;
  profit: Prisma.Decimal;
};

export type ElectronicServiceReportDailyRow = {
  day: Date;
  operationCount: number;
  providerCost: Prisma.Decimal;
  customerCharge: Prisma.Decimal;
  profit: Prisma.Decimal;
};

function dateValue(value?: string) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  return value;
}

function buildTransactionWhere(shopId: string, filters: ElectronicServiceReportFilters) {
  const conditions: Prisma.Sql[] = [
    Prisma.sql`tx."shopId" = ${shopId}::uuid`,
    Prisma.sql`tx."status" = 'ACTIVE'`,
  ];
  const from = dateValue(filters.from);
  const to = dateValue(filters.to);
  if (from) conditions.push(Prisma.sql`DATE((tx."createdAt" AT TIME ZONE 'UTC') AT TIME ZONE ${filters.timeZone}) >= ${from}::date`);
  if (to) conditions.push(Prisma.sql`DATE((tx."createdAt" AT TIME ZONE 'UTC') AT TIME ZONE ${filters.timeZone}) <= ${to}::date`);
  if (filters.providerId) conditions.push(Prisma.sql`tx."providerId" = ${filters.providerId}::uuid`);
  return Prisma.join(conditions, " AND ");
}

export async function getElectronicServiceReport(shopId: string, filters: ElectronicServiceReportFilters) {
  const where = buildTransactionWhere(shopId, filters);
  const from = dateValue(filters.from);
  const to = dateValue(filters.to);
  const reconciliationConditions: Prisma.Sql[] = [Prisma.sql`r."shopId" = ${shopId}::uuid`];
  if (from) reconciliationConditions.push(Prisma.sql`DATE((r."createdAt" AT TIME ZONE 'UTC') AT TIME ZONE ${filters.timeZone}) >= ${from}::date`);
  if (to) reconciliationConditions.push(Prisma.sql`DATE((r."createdAt" AT TIME ZONE 'UTC') AT TIME ZONE ${filters.timeZone}) <= ${to}::date`);
  if (filters.providerId) reconciliationConditions.push(Prisma.sql`r."providerId" = ${filters.providerId}::uuid`);
  const reconciliationWhere = Prisma.join(reconciliationConditions, " AND ");

  const [providers, totalsRows, providerRows, serviceRows, paymentRows, dailyRows, reconciliationRows] = await Promise.all([
    prisma.$queryRaw<Array<{ id: string; name: string; currencyCode: string }>>`
      SELECT "id", "name", "currencyCode" FROM "ElectronicServiceProvider"
      WHERE "shopId" = ${shopId}::uuid ORDER BY lower("name") ASC
    `,
    prisma.$queryRaw<Array<{
      operationCount: number;
      providerCost: Prisma.Decimal;
      customerCharge: Prisma.Decimal;
      profit: Prisma.Decimal;
      collected: Prisma.Decimal;
      deferred: Prisma.Decimal;
    }>>(Prisma.sql`
      SELECT COUNT(*)::int AS "operationCount",
        COALESCE(SUM(tx."providerCost"),0) AS "providerCost",
        COALESCE(SUM(tx."customerCharge"),0) AS "customerCharge",
        COALESCE(SUM(tx."profit"),0) AS "profit",
        COALESCE(SUM(tx."customerCharge") FILTER (WHERE tx."paymentDestination" <> 'DEBT'),0) AS "collected",
        COALESCE(SUM(tx."customerCharge") FILTER (WHERE tx."paymentDestination" = 'DEBT'),0) AS "deferred"
      FROM "ElectronicServiceTransaction" tx WHERE ${where}
    `),
    prisma.$queryRaw<ElectronicServiceReportProviderRow[]>(Prisma.sql`
      SELECT tx."providerId", p."name" AS "providerName", p."currencyCode",
        COUNT(*)::int AS "operationCount", COALESCE(SUM(tx."providerCost"),0) AS "providerCost",
        COALESCE(SUM(tx."customerCharge"),0) AS "customerCharge", COALESCE(SUM(tx."profit"),0) AS "profit"
      FROM "ElectronicServiceTransaction" tx
      JOIN "ElectronicServiceProvider" p ON p."id" = tx."providerId" AND p."shopId" = tx."shopId"
      WHERE ${where}
      GROUP BY tx."providerId", p."name", p."currencyCode"
      ORDER BY "profit" DESC, "operationCount" DESC
    `),
    prisma.$queryRaw<ElectronicServiceReportServiceRow[]>(Prisma.sql`
      SELECT tx."category", tx."serviceName", COUNT(*)::int AS "operationCount",
        COALESCE(SUM(tx."providerCost"),0) AS "providerCost",
        COALESCE(SUM(tx."customerCharge"),0) AS "customerCharge", COALESCE(SUM(tx."profit"),0) AS "profit"
      FROM "ElectronicServiceTransaction" tx WHERE ${where}
      GROUP BY tx."category", tx."serviceName"
      ORDER BY "profit" DESC, "operationCount" DESC
      LIMIT 50
    `),
    prisma.$queryRaw<Array<{ paymentDestination: string; operationCount: number; amount: Prisma.Decimal }>>(Prisma.sql`
      SELECT tx."paymentDestination", COUNT(*)::int AS "operationCount", COALESCE(SUM(tx."customerCharge"),0) AS "amount"
      FROM "ElectronicServiceTransaction" tx WHERE ${where}
      GROUP BY tx."paymentDestination" ORDER BY "amount" DESC
    `),
    prisma.$queryRaw<ElectronicServiceReportDailyRow[]>(Prisma.sql`
      SELECT DATE((tx."createdAt" AT TIME ZONE 'UTC') AT TIME ZONE ${filters.timeZone}) AS "day",
        COUNT(*)::int AS "operationCount", COALESCE(SUM(tx."providerCost"),0) AS "providerCost",
        COALESCE(SUM(tx."customerCharge"),0) AS "customerCharge", COALESCE(SUM(tx."profit"),0) AS "profit"
      FROM "ElectronicServiceTransaction" tx WHERE ${where}
      GROUP BY 1
      ORDER BY "day" DESC LIMIT 62
    `),
    prisma.$queryRaw<Array<{ reconciliationCount: number; netDifference: Prisma.Decimal; absoluteDifference: Prisma.Decimal }>>(Prisma.sql`
      SELECT COUNT(*)::int AS "reconciliationCount", COALESCE(SUM(r."difference"),0) AS "netDifference",
        COALESCE(SUM(ABS(r."difference")),0) AS "absoluteDifference"
      FROM "ElectronicServiceProviderReconciliation" r WHERE ${reconciliationWhere}
    `),
  ]);

  const totals = totalsRows[0];
  const reconciliation = reconciliationRows[0];
  return {
    providers,
    totals: {
      operationCount: totals?.operationCount ?? 0,
      providerCost: Number(totals?.providerCost ?? 0),
      customerCharge: Number(totals?.customerCharge ?? 0),
      profit: Number(totals?.profit ?? 0),
      collected: Number(totals?.collected ?? 0),
      deferred: Number(totals?.deferred ?? 0),
    },
    providerRows,
    serviceRows,
    paymentRows,
    dailyRows,
    reconciliation: {
      count: reconciliation?.reconciliationCount ?? 0,
      netDifference: Number(reconciliation?.netDifference ?? 0),
      absoluteDifference: Number(reconciliation?.absoluteDifference ?? 0),
    },
  };
}

export const electronicServiceReportService = { getElectronicServiceReport };
