import { InventoryMovementType, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { money as accountingMoney, movingWeightedAverage } from "@/lib/purchase-costing";

export type SupplierInvoiceAttachmentInput = {
  fileName: string;
  mimeType: string;
  fileSize: number;
  fileData: Buffer;
};

export type ReceiveStockWithInvoiceInput = {
  quantity: number;
  supplierId?: string | null;
  unitCost?: string | null;
  note?: string | null;
  attachment?: SupplierInvoiceAttachmentInput | null;
};

export type SupplierInvoiceAttachmentSummary = {
  movementId: string;
  inventoryItemId: string;
  itemName: string;
  supplierId: string | null;
  supplierName: string | null;
  quantity: number;
  unitCostSnapshot: Prisma.Decimal | null;
  note: string | null;
  fileName: string;
  mimeType: string;
  fileSize: number;
  createdAt: Date;
};

let attachmentTableReady = false;

async function ensureAttachmentTable() {
  if (attachmentTableReady) return true;

  try {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "SupplierInvoiceAttachment" (
        "movementId" UUID PRIMARY KEY,
        "shopId" UUID NOT NULL,
        "fileName" TEXT NOT NULL,
        "mimeType" VARCHAR(100) NOT NULL,
        "fileSize" INTEGER NOT NULL,
        "fileData" BYTEA NOT NULL,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "SupplierInvoiceAttachment_movementId_fkey"
          FOREIGN KEY ("movementId") REFERENCES "InventoryMovement"("id") ON DELETE CASCADE ON UPDATE CASCADE,
        CONSTRAINT "SupplierInvoiceAttachment_shopId_fkey"
          FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE
      )
    `);
    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "SupplierInvoiceAttachment_shopId_createdAt_idx"
        ON "SupplierInvoiceAttachment"("shopId", "createdAt")
    `);
    attachmentTableReady = true;
    return true;
  } catch {
    return false;
  }
}

function decimalOrNull(value?: string | null) {
  const trimmed = value?.trim();
  return trimmed ? new Prisma.Decimal(trimmed.replace(",", ".")) : null;
}

export async function receiveStockWithInvoice(
  shopId: string,
  inventoryItemId: string,
  createdByUserId: string | null,
  input: ReceiveStockWithInvoiceInput,
) {
  if (!Number.isInteger(input.quantity) || input.quantity <= 0) {
    throw new Error("الكمية يجب أن تكون أكبر من صفر.");
  }

  if (!(await ensureAttachmentTable())) {
    throw new Error("تعذر تجهيز مساحة حفظ مرفقات الفواتير. حاول مجدداً بعد تطبيق تحديث قاعدة البيانات.");
  }

  return prisma.$transaction(async (tx) => {
    const itemRows = await tx.$queryRaw<Array<{ id: string; quantity: number; unitCost: Prisma.Decimal | null }>>`
      SELECT "id", "quantity", "unitCost" FROM "InventoryItem"
      WHERE "id"=${inventoryItemId}::uuid AND "shopId"=${shopId}::uuid AND "deletedAt" IS NULL FOR UPDATE
    `;
    const item = itemRows[0];
    if (!item) throw new Error("قطعة المخزون غير موجودة.");
    if (item.quantity < 0) throw new Error("لا يمكن إضافة مخزون فوق رصيد سالب ضمن سياسة المتوسط المرجح.");

    const supplierId = input.supplierId?.trim() || null;
    if (supplierId) {
      const supplier = await tx.supplier.findFirst({
        where: { id: supplierId, shopId, deletedAt: null },
        select: { id: true },
      });
      if (!supplier) throw new Error("المورد المحدد غير موجود أو لا ينتمي إلى هذا المتجر.");
    }

    const suppliedUnitCost = decimalOrNull(input.unitCost);
    if (!suppliedUnitCost && item.unitCost === null) {
      throw new Error("تكلفة الوحدات المستلمة غير معروفة، ومتوسط الصنف الحالي غير معروف. أدخل تكلفة الاستلام صراحةً.");
    }
    const inboundUnitCost = suppliedUnitCost ?? item.unitCost!;
    const nextAverage = suppliedUnitCost
      ? movingWeightedAverage({
          currentQuantity: item.quantity,
          currentAverageCost: item.unitCost,
          receivedQuantity: input.quantity,
          receivedCapitalizedValue: accountingMoney(suppliedUnitCost.mul(input.quantity)),
        })
      : item.unitCost!;
    const nextQuantity = item.quantity + input.quantity;
    await tx.$executeRaw`
      UPDATE "InventoryItem" SET "quantity"=${nextQuantity}, "unitCost"=${nextAverage}, "version"="version"+1, "updatedAt"=NOW()
      WHERE "id"=${inventoryItemId}::uuid AND "shopId"=${shopId}::uuid
    `;
    const updatedItem = { id: inventoryItemId, quantity: nextQuantity, unitCost: nextAverage };

    const movement = await tx.inventoryMovement.create({
      data: {
        shopId,
        inventoryItemId,
        createdByUserId,
        type: InventoryMovementType.STOCK_IN,
        quantityChange: input.quantity,
        quantityAfter: updatedItem.quantity,
        unitCostSnapshot: inboundUnitCost,
        note: input.note?.trim() || null,
      },
      select: { id: true },
    });

    if (supplierId) {
      await tx.$executeRaw`
        UPDATE "InventoryMovement"
        SET "supplierId" = ${supplierId}::uuid
        WHERE "id" = ${movement.id}::uuid AND "shopId" = ${shopId}::uuid
      `;
    }

    if (input.attachment) {
      await tx.$executeRaw`
        INSERT INTO "SupplierInvoiceAttachment"
          ("movementId", "shopId", "fileName", "mimeType", "fileSize", "fileData")
        VALUES (
          ${movement.id}::uuid,
          ${shopId}::uuid,
          ${input.attachment.fileName},
          ${input.attachment.mimeType},
          ${input.attachment.fileSize},
          ${input.attachment.fileData}
        )
      `;
    }

    return { movementId: movement.id, quantity: updatedItem.quantity };
  });
}

export async function listAttachmentsForInventoryItem(shopId: string, inventoryItemId: string) {
  if (!(await ensureAttachmentTable())) return [];
  return prisma.$queryRaw<SupplierInvoiceAttachmentSummary[]>`
    SELECT
      a."movementId" AS "movementId",
      m."inventoryItemId" AS "inventoryItemId",
      i."name" AS "itemName",
      m."supplierId" AS "supplierId",
      s."name" AS "supplierName",
      m."quantityChange" AS "quantity",
      m."unitCostSnapshot" AS "unitCostSnapshot",
      m."note" AS "note",
      a."fileName" AS "fileName",
      a."mimeType" AS "mimeType",
      a."fileSize" AS "fileSize",
      m."createdAt" AS "createdAt"
    FROM "SupplierInvoiceAttachment" a
    INNER JOIN "InventoryMovement" m ON m."id" = a."movementId"
    INNER JOIN "InventoryItem" i ON i."id" = m."inventoryItemId" AND i."shopId" = ${shopId}::uuid
    LEFT JOIN "Supplier" s ON s."id" = m."supplierId" AND s."shopId" = ${shopId}::uuid AND s."deletedAt" IS NULL
    WHERE a."shopId" = ${shopId}::uuid
      AND m."shopId" = ${shopId}::uuid
      AND m."inventoryItemId" = ${inventoryItemId}::uuid
      AND m."deletedAt" IS NULL
    ORDER BY m."createdAt" DESC
    LIMIT 50
  `;
}

export async function listAttachmentsForSupplier(shopId: string, supplierId: string) {
  if (!(await ensureAttachmentTable())) return [];
  return prisma.$queryRaw<SupplierInvoiceAttachmentSummary[]>`
    SELECT
      a."movementId" AS "movementId",
      m."inventoryItemId" AS "inventoryItemId",
      i."name" AS "itemName",
      m."supplierId" AS "supplierId",
      s."name" AS "supplierName",
      m."quantityChange" AS "quantity",
      m."unitCostSnapshot" AS "unitCostSnapshot",
      m."note" AS "note",
      a."fileName" AS "fileName",
      a."mimeType" AS "mimeType",
      a."fileSize" AS "fileSize",
      m."createdAt" AS "createdAt"
    FROM "SupplierInvoiceAttachment" a
    INNER JOIN "InventoryMovement" m ON m."id" = a."movementId"
    INNER JOIN "InventoryItem" i ON i."id" = m."inventoryItemId" AND i."shopId" = ${shopId}::uuid
    LEFT JOIN "Supplier" s ON s."id" = m."supplierId" AND s."shopId" = ${shopId}::uuid AND s."deletedAt" IS NULL
    WHERE a."shopId" = ${shopId}::uuid
      AND m."shopId" = ${shopId}::uuid
      AND m."supplierId" = ${supplierId}::uuid
      AND m."deletedAt" IS NULL
    ORDER BY m."createdAt" DESC
    LIMIT 100
  `;
}

export async function getAttachmentFile(shopId: string, movementId: string) {
  if (!(await ensureAttachmentTable())) return null;
  const rows = await prisma.$queryRaw<Array<{
    fileName: string;
    mimeType: string;
    fileSize: number;
    fileData: Buffer;
  }>>`
    SELECT
      a."fileName" AS "fileName",
      a."mimeType" AS "mimeType",
      a."fileSize" AS "fileSize",
      a."fileData" AS "fileData"
    FROM "SupplierInvoiceAttachment" a
    INNER JOIN "InventoryMovement" m ON m."id" = a."movementId"
    WHERE a."movementId" = ${movementId}::uuid
      AND a."shopId" = ${shopId}::uuid
      AND m."shopId" = ${shopId}::uuid
      AND m."deletedAt" IS NULL
    LIMIT 1
  `;

  return rows[0] ?? null;
}

export const supplierInvoiceAttachmentService = {
  receiveStockWithInvoice,
  listAttachmentsForInventoryItem,
  listAttachmentsForSupplier,
  getAttachmentFile,
};
