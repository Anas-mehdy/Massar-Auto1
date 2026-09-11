import { prisma } from "@/lib/prisma";
import { autoServiceReportCostService } from "@/lib/services/autoServiceReportCostService";

export type AutoReportRange = { start: Date; end: Date };

export type AutoStatusCount = {
  status: string;
  count: number;
};

export type AutoTechnicianPerformance = {
  userId: string;
  name: string;
  completedOrders: number;
  activeOrders: number;
  laborLineCount: number;
  laborHours: number;
  laborValue: number;
};

export type AutoTopService = {
  description: string;
  lineCount: number;
  quantity: number;
  revenue: number;
};

export type AutoTopIssue = {
  issue: string;
  count: number;
};

export type AutoOverdueOrder = {
  id: string;
  orderNumber: string;
  status: string;
  receivedAt: Date;
  promisedAt: Date;
  customerName: string;
  vehicleMake: string;
  vehicleModel: string;
  plateNumber: string | null;
  assignedTechnicianName: string | null;
};

export type AutoOperationalReport = {
  period: {
    receivedOrders: number;
    deliveredOrders: number;
    closedOrders: number;
    invoicedOrders: number;
    averageTurnaroundHours: number;
    serviceRevenueBeforeTax: number;
    laborRevenue: number;
    laborCost: number;
    laborProfit: number;
    partsRevenue: number;
    partsCost: number;
    partsProfit: number;
  };
  current: {
    activeOrders: number;
    overdueOrders: number;
    waitingParts: number;
    readyForDelivery: number;
    byStatus: AutoStatusCount[];
  };
  technicians: AutoTechnicianPerformance[];
  topServices: AutoTopService[];
  topIssues: AutoTopIssue[];
  overdueOrders: AutoOverdueOrder[];
};

function money(value: number) {
  return Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
}

function number(value: number | bigint | string | null | undefined) {
  return Number(value ?? 0);
}

export async function getAutoOperationalReport(
  shopId: string,
  range: AutoReportRange,
): Promise<AutoOperationalReport> {
  const [periodRows, revenueRows, statusRows, technicianRows, topServiceRows, topIssueRows, overdueRows, costs] = await Promise.all([
    prisma.$queryRaw<Array<{
      receivedOrders: bigint;
      deliveredOrders: bigint;
      closedOrders: bigint;
      averageTurnaroundHours: number | null;
    }>>`
      SELECT
        COUNT(*) FILTER (
          WHERE so."receivedAt" >= ${range.start} AND so."receivedAt" < ${range.end}
        )::bigint AS "receivedOrders",
        COUNT(*) FILTER (
          WHERE so."deliveredAt" >= ${range.start} AND so."deliveredAt" < ${range.end}
        )::bigint AS "deliveredOrders",
        COUNT(*) FILTER (
          WHERE so."closedAt" >= ${range.start} AND so."closedAt" < ${range.end}
        )::bigint AS "closedOrders",
        AVG(EXTRACT(EPOCH FROM (so."deliveredAt" - so."receivedAt")) / 3600.0) FILTER (
          WHERE so."deliveredAt" >= ${range.start}
            AND so."deliveredAt" < ${range.end}
            AND so."deliveredAt" >= so."receivedAt"
        )::double precision AS "averageTurnaroundHours"
      FROM "ServiceOrder" so
      WHERE so."shopId" = ${shopId}::uuid
        AND so."deletedAt" IS NULL
    `,
    prisma.$queryRaw<Array<{
      invoicedOrders: bigint;
      serviceRevenueBeforeTax: number;
      laborRevenue: number;
      partsRevenue: number;
    }>>`
      WITH invoice_orders AS (
        SELECT
          inv."serviceOrderId",
          GREATEST((inv."subtotal" - inv."discountTotal")::double precision, 0) AS "netBeforeTax"
        FROM "Invoice" inv
        WHERE inv."shopId" = ${shopId}::uuid
          AND inv."serviceOrderId" IS NOT NULL
          AND inv."deletedAt" IS NULL
          AND inv."status" <> 'VOID'::"InvoiceStatus"
          AND inv."issuedAt" >= ${range.start}
          AND inv."issuedAt" < ${range.end}
      ), line_totals AS (
        SELECT
          io."serviceOrderId",
          io."netBeforeTax",
          COALESCE((
            SELECT SUM(sl."lineTotal")::double precision
            FROM "ServiceLaborLine" sl
            WHERE sl."shopId" = ${shopId}::uuid
              AND sl."serviceOrderId" = io."serviceOrderId"
              AND sl."status" <> 'CANCELLED'
          ), 0) AS "laborSubtotal",
          COALESCE((
            SELECT SUM(sp."lineTotal")::double precision
            FROM "ServicePartLine" sp
            WHERE sp."shopId" = ${shopId}::uuid
              AND sp."serviceOrderId" = io."serviceOrderId"
              AND sp."status" NOT IN ('CANCELLED','RETURNED')
          ), 0) AS "partsSubtotal"
        FROM invoice_orders io
      )
      SELECT
        COUNT(*)::bigint AS "invoicedOrders",
        COALESCE(SUM(lt."netBeforeTax"), 0)::double precision AS "serviceRevenueBeforeTax",
        COALESCE(SUM(
          CASE
            WHEN (lt."laborSubtotal" + lt."partsSubtotal") > 0
              THEN lt."netBeforeTax" * lt."laborSubtotal" / (lt."laborSubtotal" + lt."partsSubtotal")
            ELSE 0
          END
        ), 0)::double precision AS "laborRevenue",
        COALESCE(SUM(
          CASE
            WHEN (lt."laborSubtotal" + lt."partsSubtotal") > 0
              THEN lt."netBeforeTax" * lt."partsSubtotal" / (lt."laborSubtotal" + lt."partsSubtotal")
            ELSE 0
          END
        ), 0)::double precision AS "partsRevenue"
      FROM line_totals lt
    `,
    prisma.$queryRaw<Array<{ status: string; count: bigint }>>`
      SELECT so."status", COUNT(*)::bigint AS "count"
      FROM "ServiceOrder" so
      WHERE so."shopId" = ${shopId}::uuid
        AND so."deletedAt" IS NULL
        AND so."status" NOT IN ('CLOSED','CANCELLED','REJECTED')
      GROUP BY so."status"
      ORDER BY COUNT(*) DESC, so."status"
    `,
    prisma.$queryRaw<Array<{
      userId: string;
      name: string;
      completedOrders: bigint;
      activeOrders: bigint;
      laborLineCount: bigint;
      laborHours: number;
      laborValue: number;
    }>>`
      WITH relevant_users AS (
        SELECT DISTINCT so."assignedToUserId" AS "userId"
        FROM "ServiceOrder" so
        WHERE so."shopId" = ${shopId}::uuid
          AND so."deletedAt" IS NULL
          AND so."assignedToUserId" IS NOT NULL
          AND (
            (so."deliveredAt" >= ${range.start} AND so."deliveredAt" < ${range.end})
            OR so."status" NOT IN ('CLOSED','CANCELLED','REJECTED')
          )
      )
      SELECT
        u."id" AS "userId",
        u."name",
        COUNT(DISTINCT period_order."id")::bigint AS "completedOrders",
        COUNT(DISTINCT active_order."id")::bigint AS "activeOrders",
        COUNT(period_labor."id")::bigint AS "laborLineCount",
        COALESCE(SUM(period_labor."hours"), 0)::double precision AS "laborHours",
        COALESCE(SUM(period_labor."lineTotal"), 0)::double precision AS "laborValue"
      FROM relevant_users ru
      JOIN "User" u ON u."id" = ru."userId" AND u."deletedAt" IS NULL
      LEFT JOIN "ServiceOrder" period_order
        ON period_order."shopId" = ${shopId}::uuid
        AND period_order."assignedToUserId" = u."id"
        AND period_order."deletedAt" IS NULL
        AND period_order."deliveredAt" >= ${range.start}
        AND period_order."deliveredAt" < ${range.end}
      LEFT JOIN "ServiceLaborLine" period_labor
        ON period_labor."shopId" = ${shopId}::uuid
        AND period_labor."serviceOrderId" = period_order."id"
        AND period_labor."status" <> 'CANCELLED'
      LEFT JOIN "ServiceOrder" active_order
        ON active_order."shopId" = ${shopId}::uuid
        AND active_order."assignedToUserId" = u."id"
        AND active_order."deletedAt" IS NULL
        AND active_order."status" NOT IN ('CLOSED','CANCELLED','REJECTED','DELIVERED')
      GROUP BY u."id", u."name"
      ORDER BY "completedOrders" DESC, "laborValue" DESC, u."name"
      LIMIT 20
    `,
    prisma.$queryRaw<Array<{
      description: string;
      lineCount: bigint;
      quantity: number;
      revenue: number;
    }>>`
      SELECT
        MIN(sl."description") AS "description",
        COUNT(*)::bigint AS "lineCount",
        COALESCE(SUM(sl."quantity"), 0)::double precision AS "quantity",
        COALESCE(SUM(sl."lineTotal"), 0)::double precision AS "revenue"
      FROM "ServiceLaborLine" sl
      WHERE sl."shopId" = ${shopId}::uuid
        AND sl."status" <> 'CANCELLED'
        AND EXISTS (
          SELECT 1
          FROM "Invoice" inv
          WHERE inv."shopId" = sl."shopId"
            AND inv."serviceOrderId" = sl."serviceOrderId"
            AND inv."deletedAt" IS NULL
            AND inv."status" <> 'VOID'::"InvoiceStatus"
            AND inv."issuedAt" >= ${range.start}
            AND inv."issuedAt" < ${range.end}
        )
      GROUP BY lower(regexp_replace(btrim(sl."description"), '\\s+', ' ', 'g'))
      ORDER BY COUNT(*) DESC, SUM(sl."lineTotal") DESC
      LIMIT 8
    `,
    prisma.$queryRaw<Array<{ issue: string; count: bigint }>>`
      SELECT
        MIN(so."reportedIssue") AS "issue",
        COUNT(*)::bigint AS "count"
      FROM "ServiceOrder" so
      WHERE so."shopId" = ${shopId}::uuid
        AND so."deletedAt" IS NULL
        AND so."receivedAt" >= ${range.start}
        AND so."receivedAt" < ${range.end}
        AND btrim(so."reportedIssue") <> ''
      GROUP BY lower(regexp_replace(btrim(so."reportedIssue"), '\\s+', ' ', 'g'))
      ORDER BY COUNT(*) DESC, MIN(so."reportedIssue")
      LIMIT 8
    `,
    prisma.$queryRaw<AutoOverdueOrder[]>`
      SELECT
        so."id", so."orderNumber", so."status", so."receivedAt", so."promisedAt",
        c."name" AS "customerName",
        v."make" AS "vehicleMake", v."model" AS "vehicleModel", v."plateNumber",
        tech."name" AS "assignedTechnicianName"
      FROM "ServiceOrder" so
      JOIN "Customer" c ON c."id" = so."customerId" AND c."shopId" = so."shopId"
      JOIN "Vehicle" v ON v."id" = so."vehicleId" AND v."shopId" = so."shopId"
      LEFT JOIN "User" tech ON tech."id" = so."assignedToUserId"
      WHERE so."shopId" = ${shopId}::uuid
        AND so."deletedAt" IS NULL
        AND so."promisedAt" IS NOT NULL
        AND so."promisedAt" < now()
        AND so."status" NOT IN ('DELIVERED','CLOSED','CANCELLED','REJECTED')
      ORDER BY so."promisedAt" ASC, so."receivedAt" ASC
      LIMIT 20
    `,
    autoServiceReportCostService.getAutoServiceInventoryCostForInvoiceRange(shopId, range.start, range.end),
  ]);

  const period = periodRows[0];
  const revenue = revenueRows[0];
  const laborRevenue = money(number(revenue?.laborRevenue));
  const partsRevenue = money(number(revenue?.partsRevenue));
  const laborCost = money(Number(costs.laborCost));
  const partsCost = money(Number(costs.netCost) + Number(costs.manualPartCost));
  const byStatus = statusRows.map((row) => ({ status: row.status, count: Number(row.count) }));
  const statusCount = (status: string) => byStatus.find((row) => row.status === status)?.count ?? 0;

  return {
    period: {
      receivedOrders: Number(period?.receivedOrders ?? 0),
      deliveredOrders: Number(period?.deliveredOrders ?? 0),
      closedOrders: Number(period?.closedOrders ?? 0),
      invoicedOrders: Number(revenue?.invoicedOrders ?? 0),
      averageTurnaroundHours: Math.round(number(period?.averageTurnaroundHours) * 10) / 10,
      serviceRevenueBeforeTax: money(number(revenue?.serviceRevenueBeforeTax)),
      laborRevenue,
      laborCost,
      laborProfit: money(laborRevenue - laborCost),
      partsRevenue,
      partsCost,
      partsProfit: money(partsRevenue - partsCost),
    },
    current: {
      activeOrders: byStatus.reduce((sum, row) => sum + row.count, 0),
      overdueOrders: overdueRows.length,
      waitingParts: statusCount("WAITING_PARTS"),
      readyForDelivery: statusCount("READY_FOR_DELIVERY"),
      byStatus,
    },
    technicians: technicianRows.map((row) => ({
      userId: row.userId,
      name: row.name,
      completedOrders: Number(row.completedOrders),
      activeOrders: Number(row.activeOrders),
      laborLineCount: Number(row.laborLineCount),
      laborHours: number(row.laborHours),
      laborValue: money(number(row.laborValue)),
    })),
    topServices: topServiceRows.map((row) => ({
      description: row.description,
      lineCount: Number(row.lineCount),
      quantity: number(row.quantity),
      revenue: money(number(row.revenue)),
    })),
    topIssues: topIssueRows.map((row) => ({ issue: row.issue, count: Number(row.count) })),
    overdueOrders,
  };
}

export const autoOperationalReportService = { getAutoOperationalReport };
