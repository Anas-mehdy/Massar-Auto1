import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export type AutoServiceReportCostSummary = {
  usedCost: Prisma.Decimal;
  returnedCost: Prisma.Decimal;
  netCost: Prisma.Decimal;
  manualPartCost: Prisma.Decimal;
  laborCost: Prisma.Decimal;
  totalCost: Prisma.Decimal;
};

export async function getAutoServiceInventoryCostForInvoiceRange(
  shopId: string,
  start: Date,
  end: Date,
): Promise<AutoServiceReportCostSummary> {
  const movementRows = await prisma.$queryRaw<Array<{
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

  const manualRows = await prisma.$queryRaw<Array<{ manualPartCost: Prisma.Decimal }>>`
    SELECT COALESCE(SUM(sp."quantity" * COALESCE(sp."unitCost", 0)), 0) AS "manualPartCost"
    FROM "ServicePartLine" sp
    WHERE sp."shopId" = ${shopId}::uuid
      AND sp."inventoryItemId" IS NULL
      AND sp."status" NOT IN ('CANCELLED','RETURNED')
      AND EXISTS (
        SELECT 1
        FROM "Invoice" inv
        WHERE inv."shopId" = sp."shopId"
          AND inv."serviceOrderId" = sp."serviceOrderId"
          AND inv."deletedAt" IS NULL
          AND inv."status" <> 'VOID'::"InvoiceStatus"
          AND inv."issuedAt" >= ${start}
          AND inv."issuedAt" < ${end}
      )
  `;

  const laborRows = await prisma.$queryRaw<Array<{ laborCost: Prisma.Decimal }>>`
    SELECT COALESCE(SUM(COALESCE(sl."costAmount", 0)), 0) AS "laborCost"
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
          AND inv."issuedAt" >= ${start}
          AND inv."issuedAt" < ${end}
      )
  `;

  const movement = movementRows[0];
  const usedCost = movement?.usedCost ?? new Prisma.Decimal(0);
  const returnedCost = movement?.returnedCost ?? new Prisma.Decimal(0);
  const netCost = movement?.netCost ?? new Prisma.Decimal(0);
  const manualPartCost = manualRows[0]?.manualPartCost ?? new Prisma.Decimal(0);
  const laborCost = laborRows[0]?.laborCost ?? new Prisma.Decimal(0);
  const totalCost = netCost.add(manualPartCost).add(laborCost);

  return { usedCost, returnedCost, netCost, manualPartCost, laborCost, totalCost };
}

export const autoServiceReportCostService = { getAutoServiceInventoryCostForInvoiceRange };
