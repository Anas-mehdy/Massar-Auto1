import { InventoryMovementType, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

type Tx = Prisma.TransactionClient;

type StockRow = {
  warehouseId: string;
  warehouseName: string;
  quantity: number;
  reservedQuantity: number;
  averageCost: Prisma.Decimal | null;
  itemUnitCost: Prisma.Decimal | null;
};

type PartLineRow = {
  id: string;
  inventoryItemId: string | null;
  warehouseId: string | null;
  partName: string;
  quantity: number;
  status: string;
};

export type MissingServicePart = {
  servicePartLineId: string;
  partName: string;
  requiredQuantity: number;
  availableQuantity: number;
  warehouseName: string | null;
};

export type ServicePartInventoryChoice = {
  inventoryItemId: string;
  warehouseId: string;
  itemName: string;
  sku: string | null;
  barcode: string | null;
  warehouseName: string;
  quantity: number;
  reservedQuantity: number;
  availableQuantity: number;
  unitPrice: number;
  unitCost: number | null;
};

export async function listServicePartInventoryChoices(shopId: string): Promise<ServicePartInventoryChoice[]> {
  return prisma.$queryRaw<ServicePartInventoryChoice[]>`
    SELECT
      i."id" AS "inventoryItemId",
      w."id" AS "warehouseId",
      i."name" AS "itemName",
      i."sku",
      i."barcode",
      w."name" AS "warehouseName",
      ws."quantity",
      ws."reservedQuantity",
      (ws."quantity" - ws."reservedQuantity") AS "availableQuantity",
      i."unitPrice"::double precision AS "unitPrice",
      COALESCE(ws."averageCost", i."unitCost")::double precision AS "unitCost"
    FROM "WarehouseStock" ws
    JOIN "Warehouse" w
      ON w."id" = ws."warehouseId"
     AND w."shopId" = ws."shopId"
     AND w."deletedAt" IS NULL
     AND w."isActive" = true
    JOIN "InventoryItem" i
      ON i."id" = ws."inventoryItemId"
     AND i."shopId" = ws."shopId"
     AND i."deletedAt" IS NULL
    WHERE ws."shopId" = ${shopId}::uuid
    ORDER BY w."isDefault" DESC, w."name" ASC, i."name" ASC
    LIMIT 1000
  `;
}

async function findStockForReservation(
  tx: Tx,
  shopId: string,
  inventoryItemId: string,
  quantity: number,
  preferredWarehouseId: string | null,
): Promise<StockRow | null> {
  if (preferredWarehouseId) {
    const rows = await tx.$queryRaw<StockRow[]>`
      SELECT
        ws."warehouseId",
        w."name" AS "warehouseName",
        ws."quantity",
        ws."reservedQuantity",
        ws."averageCost",
        i."unitCost" AS "itemUnitCost"
      FROM "WarehouseStock" ws
      JOIN "Warehouse" w
        ON w."id" = ws."warehouseId" AND w."shopId" = ws."shopId"
      JOIN "InventoryItem" i
        ON i."id" = ws."inventoryItemId" AND i."shopId" = ws."shopId"
      WHERE ws."shopId" = ${shopId}::uuid
        AND ws."warehouseId" = ${preferredWarehouseId}::uuid
        AND ws."inventoryItemId" = ${inventoryItemId}::uuid
        AND w."deletedAt" IS NULL
        AND w."isActive" = true
        AND i."deletedAt" IS NULL
      FOR UPDATE OF ws
    `;
    return rows[0] ?? null;
  }

  const rows = await tx.$queryRaw<StockRow[]>`
    SELECT
      ws."warehouseId",
      w."name" AS "warehouseName",
      ws."quantity",
      ws."reservedQuantity",
      ws."averageCost",
      i."unitCost" AS "itemUnitCost"
    FROM "WarehouseStock" ws
    JOIN "Warehouse" w
      ON w."id" = ws."warehouseId" AND w."shopId" = ws."shopId"
    JOIN "InventoryItem" i
      ON i."id" = ws."inventoryItemId" AND i."shopId" = ws."shopId"
    WHERE ws."shopId" = ${shopId}::uuid
      AND ws."inventoryItemId" = ${inventoryItemId}::uuid
      AND w."deletedAt" IS NULL
      AND w."isActive" = true
      AND i."deletedAt" IS NULL
      AND (ws."quantity" - ws."reservedQuantity") >= ${quantity}
    ORDER BY w."isDefault" DESC, (ws."quantity" - ws."reservedQuantity") DESC, w."name" ASC
    LIMIT 1
    FOR UPDATE OF ws
  `;
  return rows[0] ?? null;
}

export async function approvePlannedServiceLinesInTx(tx: Tx, shopId: string, serviceOrderId: string) {
  await tx.$executeRaw`
    UPDATE "ServiceLaborLine"
    SET "status" = 'APPROVED', "updatedAt" = now()
    WHERE "shopId" = ${shopId}::uuid
      AND "serviceOrderId" = ${serviceOrderId}::uuid
      AND "status" = 'PLANNED'
  `;
  await tx.$executeRaw`
    UPDATE "ServicePartLine"
    SET "status" = 'APPROVED', "updatedAt" = now()
    WHERE "shopId" = ${shopId}::uuid
      AND "serviceOrderId" = ${serviceOrderId}::uuid
      AND "status" = 'PLANNED'
  `;
}

export async function syncQuotationApprovalsToServiceLinesInTx(
  tx: Tx,
  shopId: string,
  quotationId: string,
) {
  await tx.$executeRaw`
    UPDATE "ServiceLaborLine" sl
    SET "status" = CASE ql."approvalStatus"
      WHEN 'APPROVED' THEN 'APPROVED'
      WHEN 'REJECTED' THEN 'CANCELLED'
      ELSE sl."status"
    END,
    "updatedAt" = now()
    FROM "QuotationLine" ql
    WHERE ql."shopId" = ${shopId}::uuid
      AND ql."quotationId" = ${quotationId}::uuid
      AND ql."serviceLaborLineId" = sl."id"
      AND sl."shopId" = ql."shopId"
      AND sl."status" IN ('PLANNED','APPROVED')
  `;

  await tx.$executeRaw`
    UPDATE "ServicePartLine" sp
    SET "status" = CASE ql."approvalStatus"
      WHEN 'APPROVED' THEN 'APPROVED'
      WHEN 'REJECTED' THEN 'CANCELLED'
      ELSE sp."status"
    END,
    "updatedAt" = now()
    FROM "QuotationLine" ql
    WHERE ql."shopId" = ${shopId}::uuid
      AND ql."quotationId" = ${quotationId}::uuid
      AND ql."servicePartLineId" = sp."id"
      AND sp."shopId" = ql."shopId"
      AND sp."status" IN ('PLANNED','APPROVED')
  `;
}

export async function reserveServiceOrderPartsInTx(
  tx: Tx,
  shopId: string,
  serviceOrderId: string,
): Promise<MissingServicePart[]> {
  const lines = await tx.$queryRaw<PartLineRow[]>`
    SELECT "id", "inventoryItemId", "warehouseId", "partName", "quantity", "status"
    FROM "ServicePartLine"
    WHERE "shopId" = ${shopId}::uuid
      AND "serviceOrderId" = ${serviceOrderId}::uuid
      AND "inventoryItemId" IS NOT NULL
      AND "status" IN ('APPROVED','RESERVED')
    ORDER BY "sortOrder", "createdAt"
    FOR UPDATE
  `;

  const missing: MissingServicePart[] = [];

  for (const line of lines) {
    if (line.status === "RESERVED" || !line.inventoryItemId) continue;

    const stock = await findStockForReservation(
      tx,
      shopId,
      line.inventoryItemId,
      line.quantity,
      line.warehouseId,
    );

    const available = stock ? stock.quantity - stock.reservedQuantity : 0;
    if (!stock || available < line.quantity) {
      missing.push({
        servicePartLineId: line.id,
        partName: line.partName,
        requiredQuantity: line.quantity,
        availableQuantity: Math.max(0, available),
        warehouseName: stock?.warehouseName ?? null,
      });
      continue;
    }

    const unitCost = stock.averageCost ?? stock.itemUnitCost;
    await tx.$executeRaw`
      UPDATE "WarehouseStock"
      SET "reservedQuantity" = "reservedQuantity" + ${line.quantity},
          "updatedAt" = now()
      WHERE "shopId" = ${shopId}::uuid
        AND "warehouseId" = ${stock.warehouseId}::uuid
        AND "inventoryItemId" = ${line.inventoryItemId}::uuid
    `;
    await tx.$executeRaw`
      UPDATE "ServicePartLine"
      SET "warehouseId" = ${stock.warehouseId}::uuid,
          "status" = 'RESERVED',
          "unitCost" = COALESCE("unitCost", ${unitCost}),
          "updatedAt" = now()
      WHERE "id" = ${line.id}::uuid AND "shopId" = ${shopId}::uuid
    `;
  }

  return missing;
}

export async function consumeServiceOrderPartsInTx(
  tx: Tx,
  shopId: string,
  serviceOrderId: string,
  createdByUserId: string,
) {
  const missing = await reserveServiceOrderPartsInTx(tx, shopId, serviceOrderId);
  if (missing.length) {
    const details = missing
      .map((item) => `${item.partName} (مطلوب ${item.requiredQuantity}، متاح ${item.availableQuantity})`)
      .join("، ");
    throw new Error(`لا يمكن بدء الصيانة قبل توفر القطع المحجوزة: ${details}`);
  }

  const lines = await tx.$queryRaw<Array<PartLineRow & { unitCost: Prisma.Decimal | null }>>`
    SELECT "id", "inventoryItemId", "warehouseId", "partName", "quantity", "status", "unitCost"
    FROM "ServicePartLine"
    WHERE "shopId" = ${shopId}::uuid
      AND "serviceOrderId" = ${serviceOrderId}::uuid
      AND "inventoryItemId" IS NOT NULL
      AND "status" = 'RESERVED'
    ORDER BY "sortOrder", "createdAt"
    FOR UPDATE
  `;

  for (const line of lines) {
    if (!line.inventoryItemId || !line.warehouseId) {
      throw new Error(`قطعة ${line.partName} غير مرتبطة بمستودع صالح.`);
    }

    const stockRows = await tx.$queryRaw<Array<{ quantity: number; reservedQuantity: number; averageCost: Prisma.Decimal | null; warehouseName: string }>>`
      SELECT ws."quantity", ws."reservedQuantity", ws."averageCost", w."name" AS "warehouseName"
      FROM "WarehouseStock" ws
      JOIN "Warehouse" w ON w."id" = ws."warehouseId" AND w."shopId" = ws."shopId"
      WHERE ws."shopId" = ${shopId}::uuid
        AND ws."warehouseId" = ${line.warehouseId}::uuid
        AND ws."inventoryItemId" = ${line.inventoryItemId}::uuid
        AND w."deletedAt" IS NULL
      FOR UPDATE OF ws
    `;
    const stock = stockRows[0];
    if (!stock || stock.quantity < line.quantity || stock.reservedQuantity < line.quantity) {
      throw new Error(`تعذر استهلاك ${line.partName}: الحجز أو رصيد المستودع تغير بعد الموافقة.`);
    }

    const inventory = await tx.inventoryItem.findFirst({
      where: { id: line.inventoryItemId, shopId, deletedAt: null },
      select: { id: true, name: true, quantity: true, unitCost: true },
    });
    if (!inventory) throw new Error(`قطعة المخزون ${line.partName} لم تعد موجودة.`);
    if (inventory.quantity < line.quantity) {
      throw new Error(`الرصيد الإجمالي للقطعة ${inventory.name} غير متزامن مع المستودع. نفّذ جرداً أو تصحيح مخزون قبل المتابعة.`);
    }

    const warehouseAfter = stock.quantity - line.quantity;
    const reservedAfter = stock.reservedQuantity - line.quantity;
    const legacyAfter = inventory.quantity - line.quantity;
    const unitCost = line.unitCost ?? stock.averageCost ?? inventory.unitCost;

    await tx.$executeRaw`
      UPDATE "WarehouseStock"
      SET "quantity" = ${warehouseAfter},
          "reservedQuantity" = ${reservedAfter},
          "updatedAt" = now()
      WHERE "shopId" = ${shopId}::uuid
        AND "warehouseId" = ${line.warehouseId}::uuid
        AND "inventoryItemId" = ${line.inventoryItemId}::uuid
    `;

    await tx.inventoryItem.update({
      where: { id: inventory.id },
      data: { quantity: legacyAfter, version: { increment: 1 } },
    });

    await tx.inventoryMovement.create({
      data: {
        shopId,
        inventoryItemId: inventory.id,
        createdByUserId,
        type: InventoryMovementType.REPAIR_USAGE,
        quantityChange: -line.quantity,
        quantityAfter: legacyAfter,
        unitCostSnapshot: unitCost,
        note: `استخدام في أمر صيانة سيارات: ${line.partName}`,
      },
    });

    await tx.$executeRaw`
      INSERT INTO "WarehouseMovement" (
        "shopId", "warehouseId", "inventoryItemId", "type", "quantityChange", "quantityBefore", "quantityAfter",
        "unitCostSnapshot", "serviceOrderId", "servicePartLineId", "createdByUserId", "reference", "note"
      ) VALUES (
        ${shopId}::uuid, ${line.warehouseId}::uuid, ${line.inventoryItemId}::uuid, 'SERVICE_USAGE', ${-line.quantity},
        ${stock.quantity}, ${warehouseAfter}, ${unitCost}, ${serviceOrderId}::uuid, ${line.id}::uuid,
        ${createdByUserId}::uuid, ${serviceOrderId}, ${`استهلاك ${line.partName} من ${stock.warehouseName}`}
      )
    `;

    await tx.$executeRaw`
      UPDATE "ServicePartLine"
      SET "status" = 'USED', "unitCost" = COALESCE("unitCost", ${unitCost}), "updatedAt" = now()
      WHERE "id" = ${line.id}::uuid AND "shopId" = ${shopId}::uuid
    `;
  }

  // Manual parts are not inventory-backed, but once work begins they are considered used.
  await tx.$executeRaw`
    UPDATE "ServicePartLine"
    SET "status" = 'USED', "updatedAt" = now()
    WHERE "shopId" = ${shopId}::uuid
      AND "serviceOrderId" = ${serviceOrderId}::uuid
      AND "inventoryItemId" IS NULL
      AND "status" = 'APPROVED'
  `;
}

export async function releaseServiceOrderReservationsInTx(
  tx: Tx,
  shopId: string,
  serviceOrderId: string,
) {
  const reserved = await tx.$queryRaw<PartLineRow[]>`
    SELECT "id", "inventoryItemId", "warehouseId", "partName", "quantity", "status"
    FROM "ServicePartLine"
    WHERE "shopId" = ${shopId}::uuid
      AND "serviceOrderId" = ${serviceOrderId}::uuid
      AND "status" = 'RESERVED'
    ORDER BY "id"
    FOR UPDATE
  `;

  for (const line of reserved) {
    if (line.inventoryItemId && line.warehouseId) {
      const rows = await tx.$queryRaw<Array<{ reservedQuantity: number }>>`
        SELECT "reservedQuantity"
        FROM "WarehouseStock"
        WHERE "shopId" = ${shopId}::uuid
          AND "warehouseId" = ${line.warehouseId}::uuid
          AND "inventoryItemId" = ${line.inventoryItemId}::uuid
        FOR UPDATE
      `;
      const current = rows[0];
      if (current) {
        const nextReserved = Math.max(0, current.reservedQuantity - line.quantity);
        await tx.$executeRaw`
          UPDATE "WarehouseStock"
          SET "reservedQuantity" = ${nextReserved}, "updatedAt" = now()
          WHERE "shopId" = ${shopId}::uuid
            AND "warehouseId" = ${line.warehouseId}::uuid
            AND "inventoryItemId" = ${line.inventoryItemId}::uuid
        `;
      }
    }
  }

  await tx.$executeRaw`
    UPDATE "ServicePartLine"
    SET "status" = 'CANCELLED', "updatedAt" = now()
    WHERE "shopId" = ${shopId}::uuid
      AND "serviceOrderId" = ${serviceOrderId}::uuid
      AND "status" IN ('PLANNED','APPROVED','RESERVED')
  `;
  await tx.$executeRaw`
    UPDATE "ServiceLaborLine"
    SET "status" = 'CANCELLED', "updatedAt" = now()
    WHERE "shopId" = ${shopId}::uuid
      AND "serviceOrderId" = ${serviceOrderId}::uuid
      AND "status" IN ('PLANNED','APPROVED','IN_PROGRESS')
  `;
}

export async function markServiceWorkInProgressInTx(tx: Tx, shopId: string, serviceOrderId: string) {
  await tx.$executeRaw`
    UPDATE "ServiceLaborLine"
    SET "status" = 'IN_PROGRESS', "updatedAt" = now()
    WHERE "shopId" = ${shopId}::uuid
      AND "serviceOrderId" = ${serviceOrderId}::uuid
      AND "status" = 'APPROVED'
  `;
}

export async function completeServiceWorkInTx(tx: Tx, shopId: string, serviceOrderId: string) {
  await tx.$executeRaw`
    UPDATE "ServiceLaborLine"
    SET "status" = 'DONE', "updatedAt" = now()
    WHERE "shopId" = ${shopId}::uuid
      AND "serviceOrderId" = ${serviceOrderId}::uuid
      AND "status" IN ('APPROVED','IN_PROGRESS')
  `;

  const totals = await tx.$queryRaw<Array<{ total: number }>>`
    SELECT COALESCE(SUM(value), 0)::double precision AS "total"
    FROM (
      SELECT "lineTotal" AS value
      FROM "ServiceLaborLine"
      WHERE "shopId" = ${shopId}::uuid
        AND "serviceOrderId" = ${serviceOrderId}::uuid
        AND "status" <> 'CANCELLED'
      UNION ALL
      SELECT "lineTotal" AS value
      FROM "ServicePartLine"
      WHERE "shopId" = ${shopId}::uuid
        AND "serviceOrderId" = ${serviceOrderId}::uuid
        AND "status" <> 'CANCELLED'
    ) totals
  `;
  const total = Math.round(Number(totals[0]?.total ?? 0) * 100) / 100;
  await tx.$executeRaw`
    UPDATE "ServiceOrder"
    SET "finalTotal" = ${total}, "updatedAt" = now(), "version" = "version" + 1
    WHERE "id" = ${serviceOrderId}::uuid AND "shopId" = ${shopId}::uuid
  `;
  return total;
}

export const servicePartInventoryService = {
  listServicePartInventoryChoices,
};
