import { prisma } from "@/lib/prisma";

export type SaleItemWarehouseSource = {
  saleItemId: string;
  inventoryItemId: string | null;
  warehouseId: string | null;
  warehouseName: string | null;
  warehouseActive: boolean | null;
};

export type SalesReturnWarehouseSummary = {
  salesReturnId: string;
  warehouseNames: string[];
  nonRestockedCount: number;
};

type ReturnLineLike = {
  saleItemId: string;
  restock?: boolean;
  warehouseId?: string | null;
};

export async function getSaleItemWarehouseSources(shopId: string, saleId: string): Promise<SaleItemWarehouseSource[]> {
  return prisma.$queryRaw<SaleItemWarehouseSource[]>`
    SELECT
      si."id" AS "saleItemId",
      si."inventoryItemId",
      source."warehouseId",
      source."warehouseName",
      source."warehouseActive"
    FROM "SaleItem" si
    LEFT JOIN LATERAL (
      SELECT
        wm."warehouseId" AS "warehouseId",
        w."name" AS "warehouseName",
        w."isActive" AS "warehouseActive"
      FROM "WarehouseMovement" wm
      JOIN "Warehouse" w
        ON w."id" = wm."warehouseId"
       AND w."shopId" = wm."shopId"
       AND w."deletedAt" IS NULL
      WHERE wm."shopId" = ${shopId}::uuid
        AND wm."saleId" = ${saleId}::uuid
        AND wm."inventoryItemId" = si."inventoryItemId"
        AND wm."type" = 'SALE_OUT'
      ORDER BY wm."createdAt" ASC
      LIMIT 1
    ) source ON TRUE
    WHERE si."shopId" = ${shopId}::uuid
      AND si."saleId" = ${saleId}::uuid
      AND si."deletedAt" IS NULL
    ORDER BY si."createdAt" ASC
  `;
}

export async function resolveSalesReturnWarehouses<T extends ReturnLineLike>(
  shopId: string,
  saleId: string,
  lines: T[],
): Promise<T[]> {
  const sources = await getSaleItemWarehouseSources(shopId, saleId);
  const sourceBySaleItemId = new Map(sources.map((source) => [source.saleItemId, source]));

  return lines.map((line) => {
    if (line.restock === false || line.warehouseId) return line;

    const source = sourceBySaleItemId.get(line.saleItemId);
    if (!source?.inventoryItemId) return line;
    if (!source.warehouseId) {
      throw new Error("تعذر تحديد المستودع الأصلي لأحد بنود البيع القديمة. اختر مستودع الإرجاع يدوياً.");
    }
    if (!source.warehouseActive) {
      throw new Error(`المستودع الأصلي «${source.warehouseName ?? "غير معروف"}» غير نشط. اختر مستودعاً نشطاً لإرجاع القطعة.`);
    }

    return { ...line, warehouseId: source.warehouseId };
  });
}

export async function listSalesReturnWarehouseSummaries(shopId: string): Promise<SalesReturnWarehouseSummary[]> {
  return prisma.$queryRaw<SalesReturnWarehouseSummary[]>`
    SELECT
      srl."salesReturnId",
      COALESCE(
        ARRAY_AGG(DISTINCT w."name" ORDER BY w."name") FILTER (WHERE srl."restock" = TRUE AND w."id" IS NOT NULL),
        ARRAY[]::text[]
      ) AS "warehouseNames",
      COUNT(*) FILTER (WHERE srl."restock" = FALSE)::int AS "nonRestockedCount"
    FROM "SalesReturnLine" srl
    LEFT JOIN "Warehouse" w
      ON w."id" = srl."warehouseId"
     AND w."shopId" = srl."shopId"
    WHERE srl."shopId" = ${shopId}::uuid
    GROUP BY srl."salesReturnId"
  `;
}

export const salesWarehouseSourceService = {
  getSaleItemWarehouseSources,
  resolveSalesReturnWarehouses,
  listSalesReturnWarehouseSummaries,
};
