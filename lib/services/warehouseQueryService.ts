import { prisma } from "@/lib/prisma";
import { warehouseService, type WarehouseRecord } from "@/lib/services/warehouseService";

export type WarehouseStockRow = {
  warehouseId: string;
  inventoryItemId: string;
  itemName: string;
  sku: string | null;
  barcode: string | null;
  quantity: number;
  reservedQuantity: number;
  availableQuantity: number;
  reorderLevel: number;
  averageCost: string | number | null;
  unitPrice: string | number;
  unitCost: string | number | null;
  lastCountedAt: Date | null;
};

export type StockTransferSummary = {
  id: string;
  transferNumber: string;
  status: string;
  fromWarehouseId: string;
  fromWarehouseName: string;
  toWarehouseId: string;
  toWarehouseName: string;
  notes: string | null;
  createdAt: Date;
  postedAt: Date | null;
  itemCount: number;
  totalQuantity: number;
};

export type StockTakeSummary = {
  id: string;
  warehouseId: string;
  warehouseName: string;
  stockTakeNumber: string;
  status: string;
  notes: string | null;
  createdAt: Date;
  countedAt: Date | null;
  postedAt: Date | null;
  lineCount: number;
  differenceCount: number;
};

export type StockTakeLineRow = {
  id: string;
  inventoryItemId: string;
  itemName: string;
  sku: string | null;
  barcode: string | null;
  systemQuantity: number;
  actualQuantity: number;
  difference: number;
  unitCostSnapshot: string | number | null;
};

async function syncLegacyInventoryIntoDefaultWarehouse(shopId: string, warehouse: WarehouseRecord) {
  if (!warehouse.isDefault) return;
  await prisma.$executeRaw`
    INSERT INTO "WarehouseStock" (
      "shopId", "warehouseId", "inventoryItemId", "quantity", "reservedQuantity", "reorderLevel", "averageCost"
    )
    SELECT
      i."shopId", ${warehouse.id}::uuid, i."id", i."quantity", 0, i."reorderLevel", i."unitCost"
    FROM "InventoryItem" i
    WHERE i."shopId" = ${shopId}::uuid
      AND i."deletedAt" IS NULL
    ON CONFLICT ("warehouseId", "inventoryItemId") DO NOTHING
  `;
}

export async function listWarehouseStock(shopId: string, warehouseId: string, search?: string): Promise<WarehouseStockRow[]> {
  const warehouses = await warehouseService.listWarehouses(shopId);
  const warehouse = warehouses.find((entry) => entry.id === warehouseId);
  if (!warehouse) throw new Error("المستودع غير موجود في هذا المركز.");
  await syncLegacyInventoryIntoDefaultWarehouse(shopId, warehouse);
  return warehouseService.listWarehouseStock(shopId, warehouseId, search) as Promise<WarehouseStockRow[]>;
}

export async function listTransferableInventory(shopId: string, warehouseId: string) {
  const stock = await listWarehouseStock(shopId, warehouseId);
  return stock
    .filter((row) => Number(row.availableQuantity) > 0)
    .map((row) => ({
      id: row.inventoryItemId,
      name: row.itemName,
      sku: row.sku,
      barcode: row.barcode,
      availableQuantity: Number(row.availableQuantity),
    }));
}

export async function listStockTransfers(shopId: string, limit = 100): Promise<StockTransferSummary[]> {
  return prisma.$queryRaw<StockTransferSummary[]>`
    SELECT
      st."id", st."transferNumber", st."status", st."fromWarehouseId", fw."name" AS "fromWarehouseName",
      st."toWarehouseId", tw."name" AS "toWarehouseName", st."notes", st."createdAt", st."postedAt",
      COUNT(sti."id")::int AS "itemCount",
      COALESCE(SUM(sti."quantity"), 0)::int AS "totalQuantity"
    FROM "StockTransfer" st
    JOIN "Warehouse" fw ON fw."id" = st."fromWarehouseId" AND fw."shopId" = st."shopId"
    JOIN "Warehouse" tw ON tw."id" = st."toWarehouseId" AND tw."shopId" = st."shopId"
    LEFT JOIN "StockTransferItem" sti ON sti."stockTransferId" = st."id" AND sti."shopId" = st."shopId"
    WHERE st."shopId" = ${shopId}::uuid
    GROUP BY st."id", fw."name", tw."name"
    ORDER BY st."createdAt" DESC
    LIMIT ${Math.max(1, Math.min(limit, 250))}
  `;
}

export async function listStockTakes(shopId: string, limit = 100): Promise<StockTakeSummary[]> {
  return prisma.$queryRaw<StockTakeSummary[]>`
    SELECT
      st."id", st."warehouseId", w."name" AS "warehouseName", st."stockTakeNumber", st."status", st."notes",
      st."createdAt", st."countedAt", st."postedAt",
      COUNT(stl."id")::int AS "lineCount",
      COUNT(stl."id") FILTER (WHERE stl."difference" <> 0)::int AS "differenceCount"
    FROM "StockTake" st
    JOIN "Warehouse" w ON w."id" = st."warehouseId" AND w."shopId" = st."shopId"
    LEFT JOIN "StockTakeLine" stl ON stl."stockTakeId" = st."id" AND stl."shopId" = st."shopId"
    WHERE st."shopId" = ${shopId}::uuid
    GROUP BY st."id", w."name"
    ORDER BY st."createdAt" DESC
    LIMIT ${Math.max(1, Math.min(limit, 250))}
  `;
}

export async function getStockTake(shopId: string, stockTakeId: string) {
  const headers = await prisma.$queryRaw<Array<{
    id: string;
    warehouseId: string;
    warehouseName: string;
    stockTakeNumber: string;
    status: string;
    notes: string | null;
    createdAt: Date;
    countedAt: Date | null;
    postedAt: Date | null;
  }>>`
    SELECT st."id", st."warehouseId", w."name" AS "warehouseName", st."stockTakeNumber", st."status", st."notes",
           st."createdAt", st."countedAt", st."postedAt"
    FROM "StockTake" st
    JOIN "Warehouse" w ON w."id" = st."warehouseId" AND w."shopId" = st."shopId"
    WHERE st."id" = ${stockTakeId}::uuid AND st."shopId" = ${shopId}::uuid
    LIMIT 1
  `;
  const header = headers[0];
  if (!header) return null;

  const lines = await prisma.$queryRaw<StockTakeLineRow[]>`
    SELECT stl."id", stl."inventoryItemId", i."name" AS "itemName", i."sku", i."barcode",
           stl."systemQuantity", stl."actualQuantity", stl."difference", stl."unitCostSnapshot"
    FROM "StockTakeLine" stl
    JOIN "InventoryItem" i ON i."id" = stl."inventoryItemId" AND i."shopId" = stl."shopId"
    WHERE stl."shopId" = ${shopId}::uuid AND stl."stockTakeId" = ${stockTakeId}::uuid
    ORDER BY i."name" ASC
  `;

  return { ...header, lines };
}

export const warehouseQueryService = {
  listWarehouseStock,
  listTransferableInventory,
  listStockTransfers,
  listStockTakes,
  getStockTake,
};
