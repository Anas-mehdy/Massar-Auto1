import { randomBytes } from "node:crypto";
import { prisma } from "@/lib/prisma";

export type WarehouseRecord = {
  id: string;
  shopId: string;
  code: string | null;
  name: string;
  location: string | null;
  isDefault: boolean;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
};

function emptyToNull(value?: string | null) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function documentNumber(prefix: string) {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  return `${prefix}-${date}-${randomBytes(3).toString("hex").toUpperCase()}`;
}

async function assertWarehouse(shopId: string, warehouseId: string) {
  const rows = await prisma.$queryRaw<Array<{ id: string; name: string; isActive: boolean }>>`
    SELECT "id", "name", "isActive"
    FROM "Warehouse"
    WHERE "id" = ${warehouseId}::uuid AND "shopId" = ${shopId}::uuid AND "deletedAt" IS NULL
    LIMIT 1
  `;
  const warehouse = rows[0];
  if (!warehouse) throw new Error("المستودع غير موجود في هذا المركز.");
  if (!warehouse.isActive) throw new Error(`المستودع ${warehouse.name} غير نشط.`);
  return warehouse;
}

export async function listWarehouses(shopId: string): Promise<WarehouseRecord[]> {
  return prisma.$queryRaw<WarehouseRecord[]>`
    SELECT * FROM "Warehouse"
    WHERE "shopId" = ${shopId}::uuid AND "deletedAt" IS NULL
    ORDER BY "isDefault" DESC, "name" ASC
  `;
}

export async function createWarehouse(
  shopId: string,
  input: { name: string; code?: string | null; location?: string | null; isDefault?: boolean },
): Promise<WarehouseRecord> {
  const name = input.name.trim();
  if (!name) throw new Error("اسم المستودع مطلوب.");

  return prisma.$transaction(async (tx) => {
    if (input.isDefault) {
      await tx.$executeRaw`
        UPDATE "Warehouse"
        SET "isDefault" = false, "updatedAt" = now()
        WHERE "shopId" = ${shopId}::uuid AND "deletedAt" IS NULL AND "isDefault" = true
      `;
    }

    const rows = await tx.$queryRaw<WarehouseRecord[]>`
      INSERT INTO "Warehouse" ("shopId", "code", "name", "location", "isDefault")
      VALUES (${shopId}::uuid, ${emptyToNull(input.code)}, ${name}, ${emptyToNull(input.location)}, ${Boolean(input.isDefault)})
      RETURNING *
    `;
    return rows[0];
  });
}

export async function ensureDefaultWarehouse(shopId: string): Promise<WarehouseRecord> {
  const existing = await prisma.$queryRaw<WarehouseRecord[]>`
    SELECT * FROM "Warehouse"
    WHERE "shopId" = ${shopId}::uuid AND "deletedAt" IS NULL AND "isDefault" = true AND "isActive" = true
    LIMIT 1
  `;
  if (existing[0]) return existing[0];

  return prisma.$transaction(async (tx) => {
    // Serialize creation per shop to avoid two defaults during concurrent onboarding.
    await tx.$queryRaw<Array<{ id: string }>>`
      SELECT "id" FROM "Shop" WHERE "id" = ${shopId}::uuid FOR UPDATE
    `;
    const secondCheck = await tx.$queryRaw<WarehouseRecord[]>`
      SELECT * FROM "Warehouse"
      WHERE "shopId" = ${shopId}::uuid AND "deletedAt" IS NULL AND "isDefault" = true AND "isActive" = true
      LIMIT 1
    `;
    if (secondCheck[0]) return secondCheck[0];

    const rows = await tx.$queryRaw<WarehouseRecord[]>`
      INSERT INTO "Warehouse" ("shopId", "code", "name", "isDefault", "isActive")
      VALUES (${shopId}::uuid, 'MAIN', 'المستودع الرئيسي', true, true)
      RETURNING *
    `;
    return rows[0];
  });
}

export async function listWarehouseStock(shopId: string, warehouseId: string, search?: string) {
  await assertWarehouse(shopId, warehouseId);
  const pattern = search?.trim() ? `%${search.trim()}%` : null;

  return prisma.$queryRaw<Array<Record<string, unknown>>>`
    SELECT ws.*, i."name" AS "itemName", i."sku", i."barcode", i."unitPrice", i."unitCost",
           (ws."quantity" - ws."reservedQuantity") AS "availableQuantity"
    FROM "WarehouseStock" ws
    JOIN "InventoryItem" i ON i."id" = ws."inventoryItemId" AND i."shopId" = ws."shopId"
    WHERE ws."shopId" = ${shopId}::uuid
      AND ws."warehouseId" = ${warehouseId}::uuid
      AND i."deletedAt" IS NULL
      AND (
        ${pattern}::text IS NULL OR i."name" ILIKE ${pattern}::text OR COALESCE(i."sku", '') ILIKE ${pattern}::text OR COALESCE(i."barcode", '') ILIKE ${pattern}::text
      )
    ORDER BY i."name" ASC
    LIMIT 500
  `;
}

export async function postStockTransfer(
  shopId: string,
  createdByUserId: string,
  input: {
    fromWarehouseId: string;
    toWarehouseId: string;
    notes?: string | null;
    items: Array<{ inventoryItemId: string; quantity: number }>;
  },
) {
  if (input.fromWarehouseId === input.toWarehouseId) throw new Error("يجب اختيار مستودعين مختلفين للتحويل.");
  if (!input.items.length) throw new Error("أضف قطعة واحدة على الأقل للتحويل.");

  const combined = new Map<string, number>();
  for (const item of input.items) {
    if (!item.inventoryItemId) throw new Error("معرف قطعة المخزون مفقود.");
    if (!Number.isInteger(item.quantity) || item.quantity <= 0) throw new Error("كمية التحويل غير صالحة.");
    combined.set(item.inventoryItemId, (combined.get(item.inventoryItemId) ?? 0) + item.quantity);
  }
  const items = [...combined.entries()]
    .map(([inventoryItemId, quantity]) => ({ inventoryItemId, quantity }))
    .sort((a, b) => a.inventoryItemId.localeCompare(b.inventoryItemId));

  await Promise.all([
    assertWarehouse(shopId, input.fromWarehouseId),
    assertWarehouse(shopId, input.toWarehouseId),
  ]);

  const transferNumber = documentNumber("TR");
  return prisma.$transaction(async (tx) => {
    const transfers = await tx.$queryRaw<Array<{ id: string; transferNumber: string }>>`
      INSERT INTO "StockTransfer" (
        "shopId", "transferNumber", "fromWarehouseId", "toWarehouseId", "status", "notes", "createdByUserId"
      ) VALUES (
        ${shopId}::uuid, ${transferNumber}, ${input.fromWarehouseId}::uuid, ${input.toWarehouseId}::uuid,
        'DRAFT', ${emptyToNull(input.notes)}, ${createdByUserId}::uuid
      )
      RETURNING "id", "transferNumber"
    `;
    const transfer = transfers[0];

    for (const item of items) {
      const inventoryRows = await tx.$queryRaw<Array<{ id: string; unitCost: string | number | null }>>`
        SELECT "id", "unitCost"
        FROM "InventoryItem"
        WHERE "id" = ${item.inventoryItemId}::uuid AND "shopId" = ${shopId}::uuid AND "deletedAt" IS NULL
        LIMIT 1
      `;
      const inventoryItem = inventoryRows[0];
      if (!inventoryItem) throw new Error("إحدى القطع المطلوبة للتحويل غير موجودة في هذا المركز.");

      const sourceRows = await tx.$queryRaw<Array<{ quantity: number; reservedQuantity: number; averageCost: string | number | null }>>`
        SELECT "quantity", "reservedQuantity", "averageCost"
        FROM "WarehouseStock"
        WHERE "shopId" = ${shopId}::uuid
          AND "warehouseId" = ${input.fromWarehouseId}::uuid
          AND "inventoryItemId" = ${item.inventoryItemId}::uuid
        FOR UPDATE
      `;
      const source = sourceRows[0];
      const available = source ? source.quantity - source.reservedQuantity : 0;
      if (!source || available < item.quantity) {
        throw new Error(`الرصيد المتاح غير كافٍ لتحويل القطعة المطلوبة. المتاح: ${available}.`);
      }

      await tx.$executeRaw`
        INSERT INTO "WarehouseStock" ("shopId", "warehouseId", "inventoryItemId", "quantity", "reservedQuantity", "reorderLevel", "averageCost")
        VALUES (${shopId}::uuid, ${input.toWarehouseId}::uuid, ${item.inventoryItemId}::uuid, 0, 0, 0, ${source.averageCost ?? inventoryItem.unitCost})
        ON CONFLICT ("warehouseId", "inventoryItemId") DO NOTHING
      `;
      const destinationRows = await tx.$queryRaw<Array<{ quantity: number; averageCost: string | number | null }>>`
        SELECT "quantity", "averageCost"
        FROM "WarehouseStock"
        WHERE "shopId" = ${shopId}::uuid
          AND "warehouseId" = ${input.toWarehouseId}::uuid
          AND "inventoryItemId" = ${item.inventoryItemId}::uuid
        FOR UPDATE
      `;
      const destination = destinationRows[0];
      if (!destination) throw new Error("تعذر تهيئة رصيد القطعة في المستودع المستلم.");

      const sourceAfter = source.quantity - item.quantity;
      const destinationAfter = destination.quantity + item.quantity;
      const unitCost = source.averageCost ?? inventoryItem.unitCost;

      await tx.$executeRaw`
        UPDATE "WarehouseStock"
        SET "quantity" = ${sourceAfter}, "updatedAt" = now()
        WHERE "shopId" = ${shopId}::uuid AND "warehouseId" = ${input.fromWarehouseId}::uuid AND "inventoryItemId" = ${item.inventoryItemId}::uuid
      `;
      await tx.$executeRaw`
        UPDATE "WarehouseStock"
        SET "quantity" = ${destinationAfter},
            "averageCost" = COALESCE("averageCost", ${unitCost}),
            "updatedAt" = now()
        WHERE "shopId" = ${shopId}::uuid AND "warehouseId" = ${input.toWarehouseId}::uuid AND "inventoryItemId" = ${item.inventoryItemId}::uuid
      `;
      await tx.$executeRaw`
        INSERT INTO "StockTransferItem" ("shopId", "stockTransferId", "inventoryItemId", "quantity", "unitCostSnapshot")
        VALUES (${shopId}::uuid, ${transfer.id}::uuid, ${item.inventoryItemId}::uuid, ${item.quantity}, ${unitCost})
      `;
      await tx.$executeRaw`
        INSERT INTO "WarehouseMovement" (
          "shopId", "warehouseId", "inventoryItemId", "type", "quantityChange", "quantityBefore", "quantityAfter", "unitCostSnapshot", "stockTransferId", "createdByUserId", "reference"
        ) VALUES (
          ${shopId}::uuid, ${input.fromWarehouseId}::uuid, ${item.inventoryItemId}::uuid, 'TRANSFER_OUT', ${-item.quantity}, ${source.quantity}, ${sourceAfter}, ${unitCost}, ${transfer.id}::uuid, ${createdByUserId}::uuid, ${transfer.transferNumber}
        )
      `;
      await tx.$executeRaw`
        INSERT INTO "WarehouseMovement" (
          "shopId", "warehouseId", "inventoryItemId", "type", "quantityChange", "quantityBefore", "quantityAfter", "unitCostSnapshot", "stockTransferId", "createdByUserId", "reference"
        ) VALUES (
          ${shopId}::uuid, ${input.toWarehouseId}::uuid, ${item.inventoryItemId}::uuid, 'TRANSFER_IN', ${item.quantity}, ${destination.quantity}, ${destinationAfter}, ${unitCost}, ${transfer.id}::uuid, ${createdByUserId}::uuid, ${transfer.transferNumber}
        )
      `;
    }

    await tx.$executeRaw`
      UPDATE "StockTransfer"
      SET "status" = 'POSTED', "postedByUserId" = ${createdByUserId}::uuid, "postedAt" = now(), "updatedAt" = now()
      WHERE "id" = ${transfer.id}::uuid AND "shopId" = ${shopId}::uuid
    `;

    return { ...transfer, status: "POSTED" as const };
  });
}

export async function createStockTake(
  shopId: string,
  warehouseId: string,
  createdByUserId: string,
  notes?: string | null,
) {
  await assertWarehouse(shopId, warehouseId);
  const stockTakeNumber = documentNumber("ST");

  return prisma.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<Array<{ id: string; stockTakeNumber: string }>>`
      INSERT INTO "StockTake" ("shopId", "warehouseId", "stockTakeNumber", "status", "notes", "createdByUserId", "countedAt")
      VALUES (${shopId}::uuid, ${warehouseId}::uuid, ${stockTakeNumber}, 'COUNTING', ${emptyToNull(notes)}, ${createdByUserId}::uuid, now())
      RETURNING "id", "stockTakeNumber"
    `;
    const stockTake = rows[0];

    await tx.$executeRaw`
      INSERT INTO "StockTakeLine" (
        "shopId", "stockTakeId", "inventoryItemId", "systemQuantity", "actualQuantity", "difference", "unitCostSnapshot"
      )
      SELECT ws."shopId", ${stockTake.id}::uuid, ws."inventoryItemId", ws."quantity", ws."quantity", 0,
             COALESCE(ws."averageCost", i."unitCost")
      FROM "WarehouseStock" ws
      JOIN "InventoryItem" i ON i."id" = ws."inventoryItemId" AND i."shopId" = ws."shopId"
      WHERE ws."shopId" = ${shopId}::uuid AND ws."warehouseId" = ${warehouseId}::uuid AND i."deletedAt" IS NULL
    `;

    return { ...stockTake, status: "COUNTING" as const };
  });
}

export async function updateStockTakeLine(
  shopId: string,
  stockTakeId: string,
  inventoryItemId: string,
  actualQuantity: number,
) {
  if (!Number.isInteger(actualQuantity) || actualQuantity < 0) throw new Error("الكمية الفعلية غير صالحة.");

  const changed = await prisma.$executeRaw`
    UPDATE "StockTakeLine" stl
    SET "actualQuantity" = ${actualQuantity},
        "difference" = ${actualQuantity} - stl."systemQuantity",
        "updatedAt" = now()
    FROM "StockTake" st
    WHERE stl."stockTakeId" = st."id"
      AND stl."shopId" = ${shopId}::uuid
      AND stl."stockTakeId" = ${stockTakeId}::uuid
      AND stl."inventoryItemId" = ${inventoryItemId}::uuid
      AND st."shopId" = ${shopId}::uuid
      AND st."status" = 'COUNTING'
  `;
  if (changed === 0) throw new Error("بند الجرد غير موجود أو تم إغلاق جلسة الجرد.");
}

export async function postStockTake(shopId: string, stockTakeId: string, postedByUserId: string) {
  return prisma.$transaction(async (tx) => {
    const takes = await tx.$queryRaw<Array<{ id: string; warehouseId: string; stockTakeNumber: string; status: string }>>`
      SELECT "id", "warehouseId", "stockTakeNumber", "status"
      FROM "StockTake"
      WHERE "id" = ${stockTakeId}::uuid AND "shopId" = ${shopId}::uuid
      FOR UPDATE
    `;
    const take = takes[0];
    if (!take) throw new Error("جلسة الجرد غير موجودة.");
    if (take.status !== "COUNTING" && take.status !== "DRAFT") throw new Error("تم اعتماد أو إلغاء جلسة الجرد مسبقاً.");

    const lines = await tx.$queryRaw<Array<{ inventoryItemId: string; systemQuantity: number; actualQuantity: number; difference: number; unitCostSnapshot: string | number | null }>>`
      SELECT "inventoryItemId", "systemQuantity", "actualQuantity", "difference", "unitCostSnapshot"
      FROM "StockTakeLine"
      WHERE "shopId" = ${shopId}::uuid AND "stockTakeId" = ${stockTakeId}::uuid
      ORDER BY "inventoryItemId"
      FOR UPDATE
    `;

    for (const line of lines) {
      const stockRows = await tx.$queryRaw<Array<{ quantity: number }>>`
        SELECT "quantity" FROM "WarehouseStock"
        WHERE "shopId" = ${shopId}::uuid
          AND "warehouseId" = ${take.warehouseId}::uuid
          AND "inventoryItemId" = ${line.inventoryItemId}::uuid
        FOR UPDATE
      `;
      const stock = stockRows[0];
      if (!stock) throw new Error("تغيرت بيانات المخزون بعد بدء الجرد. ألغِ الجرد وابدأ جلسة جديدة.");
      if (stock.quantity !== line.systemQuantity) {
        throw new Error("تغير رصيد إحدى القطع بعد بدء الجرد. أعد فتح جرد جديد لضمان دقة الأرقام.");
      }
      if (line.difference === 0) {
        await tx.$executeRaw`
          UPDATE "WarehouseStock" SET "lastCountedAt" = now(), "updatedAt" = now()
          WHERE "shopId" = ${shopId}::uuid AND "warehouseId" = ${take.warehouseId}::uuid AND "inventoryItemId" = ${line.inventoryItemId}::uuid
        `;
        continue;
      }

      await tx.$executeRaw`
        UPDATE "WarehouseStock"
        SET "quantity" = ${line.actualQuantity}, "lastCountedAt" = now(), "updatedAt" = now()
        WHERE "shopId" = ${shopId}::uuid AND "warehouseId" = ${take.warehouseId}::uuid AND "inventoryItemId" = ${line.inventoryItemId}::uuid
      `;
      const movementType = line.difference > 0 ? "STOCKTAKE_GAIN" : "STOCKTAKE_LOSS";
      await tx.$executeRaw`
        INSERT INTO "WarehouseMovement" (
          "shopId", "warehouseId", "inventoryItemId", "type", "quantityChange", "quantityBefore", "quantityAfter", "unitCostSnapshot", "stockTakeId", "createdByUserId", "reference"
        ) VALUES (
          ${shopId}::uuid, ${take.warehouseId}::uuid, ${line.inventoryItemId}::uuid, ${movementType}, ${line.difference},
          ${line.systemQuantity}, ${line.actualQuantity}, ${line.unitCostSnapshot}, ${take.id}::uuid, ${postedByUserId}::uuid, ${take.stockTakeNumber}
        )
      `;
    }

    await tx.$executeRaw`
      UPDATE "StockTake"
      SET "status" = 'COMPLETED', "postedByUserId" = ${postedByUserId}::uuid, "postedAt" = now(), "updatedAt" = now()
      WHERE "id" = ${take.id}::uuid AND "shopId" = ${shopId}::uuid
    `;

    return { id: take.id, stockTakeNumber: take.stockTakeNumber, status: "COMPLETED" as const };
  });
}

export const warehouseService = {
  listWarehouses,
  createWarehouse,
  ensureDefaultWarehouse,
  listWarehouseStock,
  postStockTransfer,
  createStockTake,
  updateStockTakeLine,
  postStockTake,
};
