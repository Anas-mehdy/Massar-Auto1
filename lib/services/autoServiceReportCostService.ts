import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export type AutoServiceReportCostSummary = {
  usedCost: Prisma.Decimal;
  returnedCost: Prisma.Decimal;
  netCost: Prisma.Decimal;
};

export async function getAutoServiceInventoryCostForInvoiceRange(
  shopId: string,
  start: Date,
  end: Date,
): Promise<AutoServiceReportCostSummary> {
  const rows = await prisma.$queryRaw<Array<{
    usedCost: Prisma.Decimal;
    returnedCost: Prisma.Decimal;
    netCost: Prisma.Decimal;
  }>>`
    SELECT
      COALESCE(SUM(
        CASE WHEN wm."type" = 'SERVICE_USAGE'
          THEN ABS(wm."quantityChange") * COALESCE(wm."unitCostSnapshot", 0)
          ELSE 0 END
      ), 0) AS "usedCost",
      COALESCE(SUM(
        CASE WHEN wm."type" = 'SERVICE_RETURN'
          THEN ABS(wm."quantityChange") * COALESCE(wm."unitCostSnapshot", 0)
          ELSE 0 END
      ), 0) AS "returnedCost",
      COALESCE(SUM(
        CASE
          WHEN wm."type" = 'SERVICE_USAGE' THEN ABS(wm."quantityChange") * COALESCE(wm."unitCostSnapshot", 0)
          WHEN wm."type" = 'SERVICE_RETURN' THEN -ABS(wm."quantityChange") * COALESCE(wm."unitCostSnapshot", 0)
          ELSE 0
        END
      ), 0) AS "netCost"
    FROM "WarehouseMovement" wm
    WHERE wm."shopId" = ${shopId}::uuid
      AND wm."serviceOrderId" IS NOT NULL
      AND wm."type" IN ('SERVICE_USAGE', 'SERVICE_RETURN')
      AND EXISTS (
        SELECT 1
        FROM "Invoice" inv
        WHERE inv."shopId" = wm."shopId"
          AND inv."serviceOrderId" = wm."serviceOrderId"
          AND inv."deletedAt" IS NULL
          AND inv."status" <> 'VOID'::"InvoiceStatus"
          AND inv."issuedAt" >= ${start}
          AND inv."issuedAt" < ${end}
      )
  `;

  const row = rows[0];
  return {
    usedCost: row?.usedCost ?? new Prisma.Decimal(0),
    returnedCost: row?.returnedCost ?? new Prisma.Decimal(0),
    netCost: row?.netCost ?? new Prisma.Decimal(0),
  };
}

export const autoServiceReportCostService = { getAutoServiceInventoryCostForInvoiceRange };
