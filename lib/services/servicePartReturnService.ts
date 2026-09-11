import { InventoryMovementType, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export async function returnUsedServicePartToInventory(
  shopId: string,
  serviceOrderId: string,
  servicePartLineId: string,
  userId: string,
  note?: string | null,
) {
  return prisma.$transaction(async (tx) => {
    const orders = await tx.$queryRaw<Array<{ id: string; status: string; orderNumber: string }>>`
      SELECT "id", "status", "orderNumber"
      FROM "ServiceOrder"
      WHERE "id"=${serviceOrderId}::uuid
        AND "shopId"=${shopId}::uuid
        AND "deletedAt" IS NULL
      FOR UPDATE
    `;
    const order = orders[0];
    if (!order) throw new Error("أمر الصيانة غير موجود.");
    if (["DELIVERED", "CLOSED", "CANCELLED", "REJECTED"].includes(order.status)) {
      throw new Error("لا يمكن إرجاع قطعة من أمر صيانة منتهي أو ملغى.");
    }

    const invoices = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT "id"
      FROM "Invoice"
      WHERE "shopId"=${shopId}::uuid
        AND "serviceOrderId"=${serviceOrderId}::uuid
        AND "deletedAt" IS NULL
        AND "status" <> 'VOID'::"InvoiceStatus"
      LIMIT 1
      FOR UPDATE
    `;
    if (invoices[0]) {
      throw new Error("لا يمكن إرجاع قطعة مستخدمة بعد إصدار فاتورة الصيانة. يلزم مسار إشعار دائن/تعديل فاتورة أولاً.");
    }

    const lines = await tx.$queryRaw<Array<{
      id: string;
      inventoryItemId: string | null;
      warehouseId: string | null;
      partName: string;
      quantity: number;
      status: string;
      unitCost: Prisma.Decimal | null;
    }>>`
      SELECT "id", "inventoryItemId", "warehouseId", "partName", "quantity", "status", "unitCost"
      FROM "ServicePartLine"
      WHERE "id"=${servicePartLineId}::uuid
        AND "shopId"=${shopId}::uuid
        AND "serviceOrderId"=${serviceOrderId}::uuid
      FOR UPDATE
    `;
    const line = lines[0];
    if (!line) throw new Error("بند قطعة الغيار غير موجود في أمر الصيانة.");
    if (line.status !== "USED") throw new Error("يمكن إرجاع القطعة للمخزون فقط إذا كانت حالتها «مستخدمة».");
    if (!line.inventoryItemId || !line.warehouseId) {
      throw new Error("بند القطعة المستخدمة غير مرتبط بصنف ومستودع صالحين.");
    }

    const usage = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT "id"
      FROM "WarehouseMovement"
      WHERE "shopId"=${shopId}::uuid
        AND "serviceOrderId"=${serviceOrderId}::uuid
        AND "servicePartLineId"=${servicePartLineId}::uuid
        AND "inventoryItemId"=${line.inventoryItemId}::uuid
        AND "warehouseId"=${line.warehouseId}::uuid
        AND "type"='SERVICE_USAGE'
        AND "quantityChange" < 0
      ORDER BY "createdAt" DESC
      LIMIT 1
    `;
    if (!usage[0]) {
      throw new Error("تعذر إثبات حركة الاستهلاك الأصلية لهذه القطعة؛ لم يتم تنفيذ الإرجاع حفاظاً على سلامة المخزون.");
    }

    const priorReturn = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT "id"
      FROM "WarehouseMovement"
      WHERE "shopId"=${shopId}::uuid
        AND "serviceOrderId"=${serviceOrderId}::uuid
        AND "servicePartLineId"=${servicePartLineId}::uuid
        AND "type"='SERVICE_RETURN'
      LIMIT 1
    `;
    if (priorReturn[0]) throw new Error("تم إرجاع هذه القطعة للمخزون مسبقاً.");

    const inventoryRows = await tx.$queryRaw<Array<{ id: string; quantity: number; unitCost: Prisma.Decimal | null }>>`
      SELECT "id", "quantity", "unitCost"
      FROM "InventoryItem"
      WHERE "id"=${line.inventoryItemId}::uuid
        AND "shopId"=${shopId}::uuid
        AND "deletedAt" IS NULL
      FOR UPDATE
    `;
    const inventory = inventoryRows[0];
    if (!inventory) throw new Error("صنف المخزون المرتبط بالقطعة لم يعد موجوداً.");

    const warehouseRows = await tx.$queryRaw<Array<{ id: string; name: string }>>`
      SELECT "id", "name"
      FROM "Warehouse"
      WHERE "id"=${line.warehouseId}::uuid
        AND "shopId"=${shopId}::uuid
        AND "deletedAt" IS NULL
      LIMIT 1
      FOR UPDATE
    `;
    const warehouse = warehouseRows[0];
    if (!warehouse) throw new Error("المستودع الأصلي للقطعة لم يعد موجوداً.");

    await tx.$executeRaw`
      INSERT INTO "WarehouseStock" (
        "shopId", "warehouseId", "inventoryItemId", "quantity", "reservedQuantity", "reorderLevel", "averageCost"
      ) VALUES (
        ${shopId}::uuid, ${warehouse.id}::uuid, ${inventory.id}::uuid, 0, 0, 0, ${line.unitCost ?? inventory.unitCost}
      )
      ON CONFLICT ("warehouseId", "inventoryItemId") DO NOTHING
    `;

    const stockRows = await tx.$queryRaw<Array<{ quantity: number; reservedQuantity: number; averageCost: Prisma.Decimal | null }>>`
      SELECT "quantity", "reservedQuantity", "averageCost"
      FROM "WarehouseStock"
      WHERE "shopId"=${shopId}::uuid
        AND "warehouseId"=${warehouse.id}::uuid
        AND "inventoryItemId"=${inventory.id}::uuid
      FOR UPDATE
    `;
    const stock = stockRows[0];
    if (!stock) throw new Error("تعذر تجهيز رصيد المستودع لإرجاع القطعة.");

    const warehouseAfter = stock.quantity + line.quantity;
    const inventoryAfter = inventory.quantity + line.quantity;
    const unitCost = line.unitCost ?? stock.averageCost ?? inventory.unitCost;

    await tx.$executeRaw`
      UPDATE "WarehouseStock"
      SET "quantity"=${warehouseAfter},
          "averageCost"=COALESCE("averageCost", ${unitCost}),
          "updatedAt"=now()
      WHERE "shopId"=${shopId}::uuid
        AND "warehouseId"=${warehouse.id}::uuid
        AND "inventoryItemId"=${inventory.id}::uuid
    `;

    await tx.inventoryItem.update({
      where: { id: inventory.id },
      data: { quantity: inventoryAfter, version: { increment: 1 } },
    });

    await tx.inventoryMovement.create({
      data: {
        shopId,
        inventoryItemId: inventory.id,
        createdByUserId: userId,
        type: InventoryMovementType.REPAIR_RETURN,
        quantityChange: line.quantity,
        quantityAfter: inventoryAfter,
        unitCostSnapshot: unitCost,
        note: `إرجاع من أمر صيانة سيارات ${order.orderNumber}: ${line.partName}${note?.trim() ? ` — ${note.trim()}` : ""}`,
      },
    });

    await tx.$executeRaw`
      INSERT INTO "WarehouseMovement" (
        "shopId", "warehouseId", "inventoryItemId", "type", "quantityChange", "quantityBefore", "quantityAfter",
        "unitCostSnapshot", "serviceOrderId", "servicePartLineId", "createdByUserId", "reference", "note"
      ) VALUES (
        ${shopId}::uuid, ${warehouse.id}::uuid, ${inventory.id}::uuid, 'SERVICE_RETURN', ${line.quantity},
        ${stock.quantity}, ${warehouseAfter}, ${unitCost}, ${serviceOrderId}::uuid, ${servicePartLineId}::uuid,
        ${userId}::uuid, ${order.orderNumber}, ${`إرجاع ${line.partName} إلى ${warehouse.name}${note?.trim() ? ` — ${note.trim()}` : ""}`}
      )
    `;

    await tx.$executeRaw`
      UPDATE "ServicePartLine"
      SET "status"='RETURNED', "updatedAt"=now()
      WHERE "id"=${servicePartLineId}::uuid AND "shopId"=${shopId}::uuid
    `;

    return {
      servicePartLineId,
      inventoryItemId: inventory.id,
      warehouseId: warehouse.id,
      warehouseName: warehouse.name,
      quantity: line.quantity,
      inventoryQuantityAfter: inventoryAfter,
      warehouseQuantityAfter: warehouseAfter,
    };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 10_000 });
}

export const servicePartReturnService = { returnUsedServicePartToInventory };
