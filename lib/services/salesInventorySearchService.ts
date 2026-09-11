import { prisma } from "@/lib/prisma";

export type SaleWarehouseOption = {
  id: string;
  name: string;
  code: string | null;
  isDefault: boolean;
};

export type SaleInventorySearchResult = {
  id: string;
  name: string;
  sku: string | null;
  category: string | null;
  warehouseId: string;
  warehouseName: string;
  quantity: number;
  onHandQuantity: number;
  reservedQuantity: number;
  unitPrice: string;
};

export async function listActiveSaleWarehouses(shopId: string): Promise<SaleWarehouseOption[]> {
  return prisma.$queryRaw<SaleWarehouseOption[]>`
    SELECT "id", "name", "code", "isDefault"
    FROM "Warehouse"
    WHERE "shopId" = ${shopId}::uuid
      AND "deletedAt" IS NULL
      AND "isActive" = TRUE
    ORDER BY "isDefault" DESC, "name" ASC
  `;
}

export async function listInventoryForSale(
  shopId: string,
  warehouseId?: string | null,
  limit = 150,
): Promise<SaleInventorySearchResult[]> {
  const safeLimit = Math.min(Math.max(limit, 1), 500);
  return prisma.$queryRaw<SaleInventorySearchResult[]>`
    SELECT i."id", i."name", i."sku", i."category",
           w."id" AS "warehouseId", w."name" AS "warehouseName",
           GREATEST(ws."quantity" - ws."reservedQuantity", 0)::int AS "quantity",
           ws."quantity"::int AS "onHandQuantity",
           ws."reservedQuantity"::int AS "reservedQuantity",
           i."unitPrice"::text AS "unitPrice"
    FROM "WarehouseStock" ws
    JOIN "Warehouse" w
      ON w."id" = ws."warehouseId"
     AND w."shopId" = ws."shopId"
     AND w."deletedAt" IS NULL
     AND w."isActive" = TRUE
    JOIN "InventoryItem" i
      ON i."id" = ws."inventoryItemId"
     AND i."shopId" = ws."shopId"
     AND i."deletedAt" IS NULL
    WHERE ws."shopId" = ${shopId}::uuid
      AND (${warehouseId ?? null}::uuid IS NULL OR ws."warehouseId" = ${warehouseId ?? null}::uuid)
    ORDER BY w."isDefault" DESC, w."name" ASC, i."name" ASC, i."updatedAt" DESC
    LIMIT ${safeLimit}
  `;
}

export async function searchInventoryForSale(
  shopId: string,
  rawQuery: string,
  warehouseId: string,
  limit = 20,
): Promise<SaleInventorySearchResult[]> {
  const query = rawQuery.trim();
  if (!query) return [];
  const safeLimit = Math.min(Math.max(limit, 1), 30);
  const pattern = `%${query}%`;

  return prisma.$queryRaw<SaleInventorySearchResult[]>`
    SELECT i."id", i."name", i."sku", i."category",
           w."id" AS "warehouseId", w."name" AS "warehouseName",
           GREATEST(ws."quantity" - ws."reservedQuantity", 0)::int AS "quantity",
           ws."quantity"::int AS "onHandQuantity",
           ws."reservedQuantity"::int AS "reservedQuantity",
           i."unitPrice"::text AS "unitPrice"
    FROM "WarehouseStock" ws
    JOIN "Warehouse" w
      ON w."id" = ws."warehouseId"
     AND w."shopId" = ws."shopId"
     AND w."deletedAt" IS NULL
     AND w."isActive" = TRUE
    JOIN "InventoryItem" i
      ON i."id" = ws."inventoryItemId"
     AND i."shopId" = ws."shopId"
     AND i."deletedAt" IS NULL
    WHERE ws."shopId" = ${shopId}::uuid
      AND ws."warehouseId" = ${warehouseId}::uuid
      AND (
        i."name" ILIKE ${pattern}
        OR COALESCE(i."sku", '') ILIKE ${pattern}
        OR COALESCE(i."category", '') ILIKE ${pattern}
        OR COALESCE(i."barcode", '') ILIKE ${pattern}
      )
    ORDER BY CASE WHEN LOWER(i."name") = LOWER(${query}) THEN 0 ELSE 1 END,
             i."name" ASC,
             i."updatedAt" DESC
    LIMIT ${safeLimit}
  `;
}

export const salesInventorySearchService = {
  listActiveSaleWarehouses,
  listInventoryForSale,
  searchInventoryForSale,
};
