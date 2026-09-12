import { randomBytes } from "node:crypto";
import { InventoryMovementType, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export const POST_DELIVERY_PART_REASON_CODES = [
  "CUSTOMER_RETURN",
  "DEFECTIVE",
  "WARRANTY",
  "REWORK",
  "REPLACEMENT",
  "OTHER",
] as const;

export const POST_DELIVERY_PART_DISPOSITIONS = [
  "RETURN_TO_STOCK",
  "NO_STOCK_CHANGE",
] as const;

export type PostDeliveryPartReasonCode = (typeof POST_DELIVERY_PART_REASON_CODES)[number];
export type PostDeliveryPartDisposition = (typeof POST_DELIVERY_PART_DISPOSITIONS)[number];

export type PostDeliveryPartCorrectionInput = {
  servicePartLineId: string;
  reasonCode: PostDeliveryPartReasonCode;
  inventoryDisposition: PostDeliveryPartDisposition;
  quantity: number;
  reason: string;
  notes?: string | null;
  creditNoteId?: string | null;
};

export type PostDeliveryPartCorrectionContext = {
  serviceOrderId: string;
  orderNumber: string;
  orderStatus: string;
  invoiceId: string;
  invoiceNumber: string;
  parts: Array<{
    id: string;
    partName: string;
    quantity: number;
    unitCost: number | null;
    unitPrice: number;
    lineTotal: number;
    inventoryItemId: string | null;
    warehouseId: string | null;
    warehouseName: string | null;
    sku: string | null;
    consumedQuantity: number;
    returnedQuantity: number;
    remainingReturnableQuantity: number;
  }>;
  creditNotes: Array<{
    id: string;
    creditNoteNumber: string;
    amount: number;
    reason: string;
    issuedAt: Date;
  }>;
  corrections: Array<{
    id: string;
    correctionNumber: string;
    servicePartLineId: string;
    partName: string;
    reasonCode: PostDeliveryPartReasonCode;
    inventoryDisposition: PostDeliveryPartDisposition;
    quantity: number;
    grossAmountSnapshot: number;
    reason: string;
    notes: string | null;
    creditNoteId: string | null;
    creditNoteNumber: string | null;
    createdByName: string | null;
    createdAt: Date;
  }>;
};

function clean(value?: string | null) {
  const text = value?.trim();
  return text ? text : null;
}

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function generateCorrectionNumber() {
  const date = new Date().toISOString().slice(0, 10).replaceAll("-", "");
  return `SPC-A-${date}-${randomBytes(3).toString("hex").toUpperCase()}`;
}

export async function getPostDeliveryPartCorrectionContext(
  shopId: string,
  serviceOrderId: string,
): Promise<PostDeliveryPartCorrectionContext | null> {
  const headers = await prisma.$queryRaw<Array<{
    serviceOrderId: string;
    orderNumber: string;
    orderStatus: string;
    invoiceId: string;
    invoiceNumber: string;
  }>>`
    SELECT so."id" AS "serviceOrderId", so."orderNumber", so."status"::text AS "orderStatus",
           i."id" AS "invoiceId", i."invoiceNumber"
    FROM "ServiceOrder" so
    JOIN "Invoice" i
      ON i."shopId"=so."shopId"
     AND i."serviceOrderId"=so."id"
     AND i."deletedAt" IS NULL
     AND i."status" <> 'VOID'::"InvoiceStatus"
    WHERE so."shopId"=${shopId}::uuid
      AND so."id"=${serviceOrderId}::uuid
      AND so."deletedAt" IS NULL
      AND so."status" IN ('DELIVERED','CLOSED')
    ORDER BY i."issuedAt" DESC
    LIMIT 1
  `;
  const header = headers[0];
  if (!header) return null;

  const [parts, creditNotes, corrections] = await Promise.all([
    prisma.$queryRaw<Array<{
      id: string;
      partName: string;
      quantity: number;
      unitCost: number | null;
      unitPrice: number;
      lineTotal: number;
      inventoryItemId: string | null;
      warehouseId: string | null;
      warehouseName: string | null;
      sku: string | null;
      consumedQuantity: number;
      returnedQuantity: number;
    }>>`
      SELECT spl."id", spl."partName", spl."quantity",
             spl."unitCost"::double precision AS "unitCost",
             spl."unitPrice"::double precision AS "unitPrice",
             spl."lineTotal"::double precision AS "lineTotal",
             spl."inventoryItemId", spl."warehouseId", w."name" AS "warehouseName",
             CASE WHEN ii."shopId"=spl."shopId" THEN ii."sku" ELSE NULL END AS "sku",
             COALESCE(usage."quantity",0)::integer AS "consumedQuantity",
             COALESCE(returned."quantity",0)::integer AS "returnedQuantity"
      FROM "ServicePartLine" spl
      LEFT JOIN "Warehouse" w
        ON w."shopId"=spl."shopId" AND w."id"=spl."warehouseId"
      LEFT JOIN "InventoryItem" ii ON ii."id"=spl."inventoryItemId"
      LEFT JOIN LATERAL (
        SELECT SUM(-wm."quantityChange") AS "quantity"
        FROM "WarehouseMovement" wm
        WHERE wm."shopId"=spl."shopId"
          AND wm."serviceOrderId"=spl."serviceOrderId"
          AND wm."servicePartLineId"=spl."id"
          AND wm."type"='SERVICE_USAGE'
          AND wm."quantityChange" < 0
      ) usage ON TRUE
      LEFT JOIN LATERAL (
        SELECT SUM(wm."quantityChange") AS "quantity"
        FROM "WarehouseMovement" wm
        WHERE wm."shopId"=spl."shopId"
          AND wm."serviceOrderId"=spl."serviceOrderId"
          AND wm."servicePartLineId"=spl."id"
          AND wm."type"='SERVICE_RETURN'
          AND wm."quantityChange" > 0
      ) returned ON TRUE
      WHERE spl."shopId"=${shopId}::uuid
        AND spl."serviceOrderId"=${serviceOrderId}::uuid
        AND spl."status"='USED'
      ORDER BY spl."sortOrder", spl."createdAt"
    `,
    prisma.$queryRaw<Array<{
      id: string;
      creditNoteNumber: string;
      amount: number;
      reason: string;
      issuedAt: Date;
    }>>`
      SELECT cn."id", cn."creditNoteNumber", cn."amount"::double precision AS "amount",
             cn."reason", cn."issuedAt"
      FROM "InvoiceCreditNote" cn
      WHERE cn."shopId"=${shopId}::uuid
        AND cn."invoiceId"=${header.invoiceId}::uuid
        AND cn."serviceOrderId"=${serviceOrderId}::uuid
      ORDER BY cn."issuedAt" DESC, cn."createdAt" DESC
    `,
    prisma.$queryRaw<Array<{
      id: string;
      correctionNumber: string;
      servicePartLineId: string;
      partName: string;
      reasonCode: PostDeliveryPartReasonCode;
      inventoryDisposition: PostDeliveryPartDisposition;
      quantity: number;
      grossAmountSnapshot: number;
      reason: string;
      notes: string | null;
      creditNoteId: string | null;
      creditNoteNumber: string | null;
      createdByName: string | null;
      createdAt: Date;
    }>>`
      SELECT spc."id", spc."correctionNumber", spc."servicePartLineId", spc."partName",
             spc."reasonCode", spc."inventoryDisposition", spc."quantity",
             spc."grossAmountSnapshot"::double precision AS "grossAmountSnapshot",
             spc."reason", spc."notes", spc."creditNoteId",
             cn."creditNoteNumber", u."name" AS "createdByName", spc."createdAt"
      FROM "ServicePartCorrection" spc
      LEFT JOIN "InvoiceCreditNote" cn ON cn."id"=spc."creditNoteId" AND cn."shopId"=spc."shopId"
      LEFT JOIN "User" u ON u."id"=spc."createdByUserId"
      WHERE spc."shopId"=${shopId}::uuid
        AND spc."serviceOrderId"=${serviceOrderId}::uuid
      ORDER BY spc."createdAt" DESC
    `,
  ]);

  return {
    ...header,
    parts: parts.map((part) => ({
      ...part,
      remainingReturnableQuantity: Math.max(0, part.consumedQuantity - part.returnedQuantity),
    })),
    creditNotes,
    corrections,
  };
}

export async function createPostDeliveryPartCorrection(
  shopId: string,
  serviceOrderId: string,
  createdByUserId: string,
  input: PostDeliveryPartCorrectionInput,
) {
  if (!POST_DELIVERY_PART_REASON_CODES.includes(input.reasonCode)) {
    throw new Error("سبب تصحيح قطعة الغيار غير صالح.");
  }
  if (!POST_DELIVERY_PART_DISPOSITIONS.includes(input.inventoryDisposition)) {
    throw new Error("معالجة المخزون المحددة غير صالحة.");
  }
  if (!Number.isInteger(input.quantity) || input.quantity <= 0) {
    throw new Error("كمية التصحيح يجب أن تكون رقماً صحيحاً أكبر من صفر.");
  }
  const reason = clean(input.reason);
  if (!reason) throw new Error("سبب التصحيح مطلوب.");
  const notes = clean(input.notes);
  const creditNoteId = clean(input.creditNoteId);

  return prisma.$transaction(async (tx) => {
    const orders = await tx.$queryRaw<Array<{ id: string; status: string; orderNumber: string }>>`
      SELECT "id", "status"::text AS "status", "orderNumber"
      FROM "ServiceOrder"
      WHERE "shopId"=${shopId}::uuid
        AND "id"=${serviceOrderId}::uuid
        AND "deletedAt" IS NULL
      FOR UPDATE
    `;
    const order = orders[0];
    if (!order) throw new Error("أمر الصيانة غير موجود.");
    if (!["DELIVERED", "CLOSED"].includes(order.status)) {
      throw new Error("تصحيح القطع بعد التسليم متاح فقط بعد تسليم المركبة أو إغلاق أمر الصيانة.");
    }

    const invoices = await tx.$queryRaw<Array<{ id: string; invoiceNumber: string }>>`
      SELECT "id", "invoiceNumber"
      FROM "Invoice"
      WHERE "shopId"=${shopId}::uuid
        AND "serviceOrderId"=${serviceOrderId}::uuid
        AND "deletedAt" IS NULL
        AND "status" <> 'VOID'::"InvoiceStatus"
      ORDER BY "issuedAt" DESC
      LIMIT 1
      FOR UPDATE
    `;
    const invoice = invoices[0];
    if (!invoice) throw new Error("لا يوجد فاتورة صيانة فعالة مرتبطة بأمر الصيانة.");

    const lines = await tx.$queryRaw<Array<{
      id: string;
      status: string;
      partName: string;
      quantity: number;
      inventoryItemId: string | null;
      warehouseId: string | null;
      unitCost: Prisma.Decimal | null;
      unitPrice: Prisma.Decimal;
    }>>`
      SELECT "id", "status"::text AS "status", "partName", "quantity",
             "inventoryItemId", "warehouseId", "unitCost", "unitPrice"
      FROM "ServicePartLine"
      WHERE "shopId"=${shopId}::uuid
        AND "serviceOrderId"=${serviceOrderId}::uuid
        AND "id"=${input.servicePartLineId}::uuid
      FOR UPDATE
    `;
    const line = lines[0];
    if (!line) throw new Error("بند قطعة الغيار غير موجود في أمر الصيانة.");
    if (line.status !== "USED") {
      throw new Error("يمكن تسجيل تصحيح ما بعد التسليم فقط لقطعة تم استهلاكها فعلياً.");
    }
    if (input.quantity > line.quantity) {
      throw new Error("كمية التصحيح لا يمكن أن تتجاوز كمية بند القطعة الأصلي.");
    }

    if (creditNoteId) {
      const credits = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT "id"
        FROM "InvoiceCreditNote"
        WHERE "shopId"=${shopId}::uuid
          AND "id"=${creditNoteId}::uuid
          AND "invoiceId"=${invoice.id}::uuid
          AND "serviceOrderId"=${serviceOrderId}::uuid
        LIMIT 1
      `;
      if (!credits[0]) {
        throw new Error("الإشعار الدائن المحدد لا يخص نفس فاتورة وأمر الصيانة.");
      }
    }

    let usedQuantity = 0;
    let returnedQuantity = 0;
    if (input.inventoryDisposition === "RETURN_TO_STOCK") {
      if (!line.inventoryItemId || !line.warehouseId) {
        throw new Error("هذه القطعة غير مرتبطة بصنف ومستودع، لذلك لا يمكن إعادتها إلى المخزون.");
      }
      const movementTotals = await tx.$queryRaw<Array<{ usedQuantity: number; returnedQuantity: number }>>`
        SELECT
          COALESCE(SUM(CASE WHEN "type"='SERVICE_USAGE' AND "quantityChange" < 0 THEN -"quantityChange" ELSE 0 END),0)::integer AS "usedQuantity",
          COALESCE(SUM(CASE WHEN "type"='SERVICE_RETURN' AND "quantityChange" > 0 THEN "quantityChange" ELSE 0 END),0)::integer AS "returnedQuantity"
        FROM "WarehouseMovement"
        WHERE "shopId"=${shopId}::uuid
          AND "serviceOrderId"=${serviceOrderId}::uuid
          AND "servicePartLineId"=${line.id}::uuid
          AND "inventoryItemId"=${line.inventoryItemId}::uuid
          AND "warehouseId"=${line.warehouseId}::uuid
      `;
      usedQuantity = movementTotals[0]?.usedQuantity ?? 0;
      returnedQuantity = movementTotals[0]?.returnedQuantity ?? 0;
      if (usedQuantity <= 0) {
        throw new Error("تعذر إثبات حركة الاستهلاك الأصلية لهذه القطعة؛ لم يتم تعديل المخزون.");
      }
      if (input.quantity > usedQuantity - returnedQuantity) {
        throw new Error("كمية الإرجاع تتجاوز الكمية المستهلكة المتبقية القابلة للإرجاع.");
      }
    }

    const correctionNumber = generateCorrectionNumber();
    const unitPrice = Number(line.unitPrice);
    const grossAmountSnapshot = roundMoney(unitPrice * input.quantity);
    const correctionRows = await tx.$queryRaw<Array<{ id: string; correctionNumber: string; createdAt: Date }>>`
      INSERT INTO "ServicePartCorrection" (
        "shopId", "serviceOrderId", "servicePartLineId", "invoiceId", "creditNoteId", "createdByUserId",
        "correctionNumber", "reasonCode", "inventoryDisposition", "quantity",
        "inventoryItemId", "warehouseId", "partName", "unitCostSnapshot", "unitPriceSnapshot",
        "grossAmountSnapshot", "reason", "notes"
      ) VALUES (
        ${shopId}::uuid, ${serviceOrderId}::uuid, ${line.id}::uuid, ${invoice.id}::uuid,
        ${creditNoteId}::uuid, ${createdByUserId}::uuid,
        ${correctionNumber}, ${input.reasonCode}, ${input.inventoryDisposition}, ${input.quantity},
        ${line.inventoryItemId}::uuid, ${line.warehouseId}::uuid, ${line.partName}, ${line.unitCost}, ${line.unitPrice},
        ${grossAmountSnapshot}, ${reason}, ${notes}
      )
      RETURNING "id", "correctionNumber", "createdAt"
    `;
    const correction = correctionRows[0];

    if (input.inventoryDisposition === "RETURN_TO_STOCK") {
      const inventoryItemId = line.inventoryItemId!;
      const warehouseId = line.warehouseId!;

      const inventoryRows = await tx.$queryRaw<Array<{
        id: string;
        quantity: number;
        unitCost: Prisma.Decimal | null;
      }>>`
        SELECT "id", "quantity", "unitCost"
        FROM "InventoryItem"
        WHERE "id"=${inventoryItemId}::uuid
          AND "shopId"=${shopId}::uuid
          AND "deletedAt" IS NULL
        FOR UPDATE
      `;
      const inventory = inventoryRows[0];
      if (!inventory) throw new Error("صنف المخزون المرتبط بالقطعة لم يعد موجوداً.");

      const warehouseRows = await tx.$queryRaw<Array<{ id: string; name: string }>>`
        SELECT "id", "name"
        FROM "Warehouse"
        WHERE "id"=${warehouseId}::uuid
          AND "shopId"=${shopId}::uuid
          AND "deletedAt" IS NULL
        FOR UPDATE
      `;
      const warehouse = warehouseRows[0];
      if (!warehouse) throw new Error("المستودع الأصلي للقطعة لم يعد موجوداً.");

      const unitCost = line.unitCost ?? inventory.unitCost;
      await tx.$executeRaw`
        INSERT INTO "WarehouseStock" (
          "shopId", "warehouseId", "inventoryItemId", "quantity", "reservedQuantity", "reorderLevel", "averageCost"
        ) VALUES (
          ${shopId}::uuid, ${warehouse.id}::uuid, ${inventory.id}::uuid, 0, 0, 0, ${unitCost}
        )
        ON CONFLICT ("warehouseId", "inventoryItemId") DO NOTHING
      `;

      const stockRows = await tx.$queryRaw<Array<{
        quantity: number;
        reservedQuantity: number;
        averageCost: Prisma.Decimal | null;
      }>>`
        SELECT "quantity", "reservedQuantity", "averageCost"
        FROM "WarehouseStock"
        WHERE "shopId"=${shopId}::uuid
          AND "warehouseId"=${warehouse.id}::uuid
          AND "inventoryItemId"=${inventory.id}::uuid
        FOR UPDATE
      `;
      const stock = stockRows[0];
      if (!stock) throw new Error("تعذر تجهيز رصيد المستودع لإرجاع القطعة.");

      const warehouseAfter = stock.quantity + input.quantity;
      const inventoryAfter = inventory.quantity + input.quantity;
      const movementCost = line.unitCost ?? stock.averageCost ?? inventory.unitCost;

      await tx.$executeRaw`
        UPDATE "WarehouseStock"
        SET "quantity"=${warehouseAfter},
            "averageCost"=COALESCE("averageCost", ${movementCost}),
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
          createdByUserId,
          type: InventoryMovementType.REPAIR_RETURN,
          quantityChange: input.quantity,
          quantityAfter: inventoryAfter,
          unitCostSnapshot: movementCost,
          note: `تصحيح بعد التسليم ${correction.correctionNumber} — أمر ${order.orderNumber}: ${line.partName}`,
        },
      });

      await tx.$executeRaw`
        INSERT INTO "WarehouseMovement" (
          "shopId", "warehouseId", "inventoryItemId", "type", "quantityChange", "quantityBefore", "quantityAfter",
          "unitCostSnapshot", "serviceOrderId", "servicePartLineId", "servicePartCorrectionId",
          "createdByUserId", "reference", "note"
        ) VALUES (
          ${shopId}::uuid, ${warehouse.id}::uuid, ${inventory.id}::uuid, 'SERVICE_RETURN', ${input.quantity},
          ${stock.quantity}, ${warehouseAfter}, ${movementCost}, ${serviceOrderId}::uuid, ${line.id}::uuid, ${correction.id}::uuid,
          ${createdByUserId}::uuid, ${correction.correctionNumber},
          ${`إرجاع بعد التسليم إلى ${warehouse.name} — ${reason}${notes ? ` — ${notes}` : ""}`}
        )
      `;
    }

    return {
      id: correction.id,
      correctionNumber: correction.correctionNumber,
      createdAt: correction.createdAt,
      invoiceId: invoice.id,
      invoiceNumber: invoice.invoiceNumber,
      servicePartLineId: line.id,
      partName: line.partName,
      quantity: input.quantity,
      inventoryDisposition: input.inventoryDisposition,
      grossAmountSnapshot,
      usedQuantity,
      returnedQuantityBefore: returnedQuantity,
    };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 10_000 });
}

export const postDeliveryPartCorrectionService = {
  getPostDeliveryPartCorrectionContext,
  createPostDeliveryPartCorrection,
};
