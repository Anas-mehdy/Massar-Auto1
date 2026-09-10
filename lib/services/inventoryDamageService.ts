import { InventoryMovementType, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export type RecordInventoryDamageInput = {
  quantity: number;
  reason: string;
  note?: string;
};

type DamageForReversalRow = {
  id: string;
  inventoryItemId: string;
  movementId: string;
  quantity: number;
  reason: string;
  note: string | null;
  unitCostSnapshot: Prisma.Decimal | number | string | null;
  reversedAt: Date | null;
};

export async function recordInventoryDamage(
  shopId: string,
  inventoryItemId: string,
  createdByUserId: string | null,
  input: RecordInventoryDamageInput,
) {
  const quantity = Math.trunc(input.quantity);
  const reason = input.reason.trim();
  const note = input.note?.trim() || null;

  if (!Number.isFinite(quantity) || quantity <= 0) {
    throw new Error("كمية التالف يجب أن تكون أكبر من صفر.");
  }
  if (!reason) throw new Error("سبب التلف مطلوب.");

  return prisma.$transaction(async (tx) => {
    const item = await tx.inventoryItem.findFirst({
      where: { id: inventoryItemId, shopId, deletedAt: null },
      select: { id: true, name: true, quantity: true, unitCost: true },
    });

    if (!item) throw new Error("قطعة المخزون غير موجودة.");
    if (item.quantity < quantity) {
      throw new Error(`لا يمكن تسجيل ${quantity} تالف. الكمية المتاحة حالياً ${item.quantity}.`);
    }

    // Atomic guard prevents concurrent write-offs from taking stock below zero.
    const decremented = await tx.inventoryItem.updateMany({
      where: {
        id: inventoryItemId,
        shopId,
        deletedAt: null,
        quantity: { gte: quantity },
      },
      data: {
        quantity: { decrement: quantity },
        version: { increment: 1 },
      },
    });

    if (decremented.count !== 1) {
      throw new Error("تغيرت كمية المخزون أثناء العملية. حدّث الصفحة وحاول مجدداً.");
    }

    const updated = await tx.inventoryItem.findUniqueOrThrow({
      where: { id: inventoryItemId },
      select: { quantity: true },
    });

    const movementNote = note ? `تالف: ${reason} — ${note}` : `تالف: ${reason}`;
    const movement = await tx.inventoryMovement.create({
      data: {
        shopId,
        inventoryItemId,
        createdByUserId,
        type: InventoryMovementType.STOCK_OUT,
        quantityChange: -quantity,
        quantityAfter: updated.quantity,
        unitCostSnapshot: item.unitCost,
        note: movementNote,
      },
    });

    await tx.$executeRaw`
      INSERT INTO "InventoryDamage" (
        "shopId", "inventoryItemId", "movementId", "createdByUserId",
        "quantity", "reason", "note", "unitCostSnapshot"
      ) VALUES (
        ${shopId}::uuid, ${inventoryItemId}::uuid, ${movement.id}::uuid,
        ${createdByUserId}::uuid, ${quantity}, ${reason}, ${note}, ${item.unitCost}
      )
    `;

    return {
      movementId: movement.id,
      quantityAfter: updated.quantity,
      damagedQuantity: quantity,
    };
  });
}

export async function reverseInventoryDamage(
  shopId: string,
  damageId: string,
  reversedByUserId: string,
) {
  return prisma.$transaction(async (tx) => {
    // Row lock makes reversal idempotent under concurrent requests.
    const rows = await tx.$queryRaw<DamageForReversalRow[]>`
      SELECT
        "id",
        "inventoryItemId",
        "movementId",
        "quantity",
        "reason",
        "note",
        "unitCostSnapshot",
        "reversedAt"
      FROM "InventoryDamage"
      WHERE "id" = ${damageId}::uuid
        AND "shopId" = ${shopId}::uuid
      FOR UPDATE
    `;

    const damage = rows[0];
    if (!damage) throw new Error("سجل التالف غير موجود.");
    if (damage.reversedAt) throw new Error("تم عكس هذا التالف مسبقاً.");

    const item = await tx.inventoryItem.findFirst({
      where: { id: damage.inventoryItemId, shopId, deletedAt: null },
      select: { id: true, name: true },
    });
    if (!item) {
      throw new Error("لا يمكن عكس التالف لأن القطعة لم تعد موجودة في المخزون.");
    }

    const restored = await tx.inventoryItem.updateMany({
      where: { id: damage.inventoryItemId, shopId, deletedAt: null },
      data: {
        quantity: { increment: damage.quantity },
        version: { increment: 1 },
      },
    });
    if (restored.count !== 1) {
      throw new Error("تعذر إعادة الكمية للمخزون. حدّث الصفحة وحاول مجدداً.");
    }

    const updated = await tx.inventoryItem.findUniqueOrThrow({
      where: { id: damage.inventoryItemId },
      select: { quantity: true },
    });

    const movement = await tx.inventoryMovement.create({
      data: {
        shopId,
        inventoryItemId: damage.inventoryItemId,
        createdByUserId: reversedByUserId,
        type: InventoryMovementType.STOCK_IN,
        quantityChange: damage.quantity,
        quantityAfter: updated.quantity,
        unitCostSnapshot: damage.unitCostSnapshot,
        note: `عكس تالف: ${damage.reason}`,
      },
    });

    const marked = await tx.$executeRaw`
      UPDATE "InventoryDamage"
      SET
        "reversedAt" = now(),
        "reversedByUserId" = ${reversedByUserId}::uuid,
        "reversalMovementId" = ${movement.id}::uuid
      WHERE "id" = ${damage.id}::uuid
        AND "shopId" = ${shopId}::uuid
        AND "reversedAt" IS NULL
    `;

    if (Number(marked) !== 1) {
      throw new Error("تم عكس هذا التالف من جلسة أخرى. حدّث الصفحة.");
    }

    return {
      damageId: damage.id,
      inventoryItemId: damage.inventoryItemId,
      reversalMovementId: movement.id,
      restoredQuantity: damage.quantity,
      quantityAfter: updated.quantity,
    };
  });
}

export async function listInventoryDamageMovementIds(
  shopId: string,
  inventoryItemId: string,
) {
  const rows = await prisma.$queryRaw<Array<{ movementId: string }>>`
    SELECT "movementId"
    FROM "InventoryDamage"
    WHERE "shopId" = ${shopId}::uuid
      AND "inventoryItemId" = ${inventoryItemId}::uuid
    UNION ALL
    SELECT "reversalMovementId" AS "movementId"
    FROM "InventoryDamage"
    WHERE "shopId" = ${shopId}::uuid
      AND "inventoryItemId" = ${inventoryItemId}::uuid
      AND "reversalMovementId" IS NOT NULL
  `;

  return rows.map((row) => row.movementId);
}

export const inventoryDamageService = {
  recordInventoryDamage,
  reverseInventoryDamage,
  listInventoryDamageMovementIds,
};
