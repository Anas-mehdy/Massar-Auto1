import { randomBytes } from "node:crypto";
import { prisma } from "@/lib/prisma";
import {
  reserveServiceOrderPartsInTx,
  syncQuotationApprovalsToServiceLinesInTx,
} from "@/lib/services/servicePartInventoryService";

export type ApprovalDecision = "APPROVED" | "PARTIALLY_APPROVED" | "REJECTED";
export type ApprovalChannel = "IN_PERSON" | "PHONE" | "WHATSAPP" | "WEB" | "OTHER";

function emptyToNull(value?: string | null) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function generateQuoteNumber() {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  return `Q-${date}-${randomBytes(3).toString("hex").toUpperCase()}`;
}

function parseOptionalDate(value?: Date | string | null) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error("تاريخ صلاحية عرض السعر غير صالح.");
  return date;
}

export async function createQuotationFromServiceOrder(
  shopId: string,
  serviceOrderId: string,
  createdByUserId: string,
  input: { discountTotal?: number; taxTotal?: number; validUntil?: Date | string | null; notes?: string | null } = {},
) {
  const discountTotal = input.discountTotal ?? 0;
  const taxTotal = input.taxTotal ?? 0;
  if (discountTotal < 0 || taxTotal < 0) throw new Error("الخصم أو الضريبة لا يمكن أن تكون سالبة.");
  const validUntil = parseOptionalDate(input.validUntil);

  return prisma.$transaction(async (tx) => {
    const orders = await tx.$queryRaw<Array<{ id: string; status: string }>>`
      SELECT "id", "status"
      FROM "ServiceOrder"
      WHERE "id" = ${serviceOrderId}::uuid
        AND "shopId" = ${shopId}::uuid
        AND "deletedAt" IS NULL
      FOR UPDATE
    `;
    const order = orders[0];
    if (!order) throw new Error("أمر الصيانة غير موجود.");
    if (!["RECEIVED", "INSPECTING", "WAITING_CUSTOMER_APPROVAL"].includes(order.status)) {
      throw new Error("يمكن إنشاء عرض السعر قبل بدء تنفيذ الصيانة فقط.");
    }

    const labor = await tx.$queryRaw<Array<{ id: string; description: string; quantity: number; unitPrice: number; costAmount: number | null; lineTotal: number }>>`
      SELECT "id", "description",
             "quantity"::double precision AS "quantity",
             "unitPrice"::double precision AS "unitPrice",
             "costAmount"::double precision AS "costAmount",
             "lineTotal"::double precision AS "lineTotal"
      FROM "ServiceLaborLine"
      WHERE "shopId" = ${shopId}::uuid
        AND "serviceOrderId" = ${serviceOrderId}::uuid
        AND "status" <> 'CANCELLED'
      ORDER BY "sortOrder", "createdAt"
    `;
    const parts = await tx.$queryRaw<Array<{ id: string; inventoryItemId: string | null; partName: string; quantity: number; unitCost: number | null; unitPrice: number; lineTotal: number }>>`
      SELECT "id", "inventoryItemId", "partName", "quantity",
             "unitCost"::double precision AS "unitCost",
             "unitPrice"::double precision AS "unitPrice",
             "lineTotal"::double precision AS "lineTotal"
      FROM "ServicePartLine"
      WHERE "shopId" = ${shopId}::uuid
        AND "serviceOrderId" = ${serviceOrderId}::uuid
        AND "status" <> 'CANCELLED'
      ORDER BY "sortOrder", "createdAt"
    `;
    if (!labor.length && !parts.length) throw new Error("أضف أجور العمل أو قطع الغيار قبل إنشاء عرض السعر.");

    const revisionRows = await tx.$queryRaw<Array<{ revision: number }>>`
      SELECT COALESCE(MAX("revision"), 0)::integer + 1 AS "revision"
      FROM "Quotation"
      WHERE "shopId" = ${shopId}::uuid AND "serviceOrderId" = ${serviceOrderId}::uuid
    `;
    const revision = revisionRows[0]?.revision ?? 1;
    const quoteNumber = generateQuoteNumber();
    const subtotal = Math.round([...labor, ...parts].reduce((sum, line) => sum + Number(line.lineTotal), 0) * 100) / 100;
    if (discountTotal > subtotal) throw new Error("الخصم لا يمكن أن يتجاوز المجموع الفرعي.");
    const total = Math.max(0, Math.round((subtotal - discountTotal + taxTotal) * 100) / 100);

    await tx.$executeRaw`
      UPDATE "Quotation"
      SET "status" = 'SUPERSEDED', "updatedAt" = now()
      WHERE "shopId" = ${shopId}::uuid
        AND "serviceOrderId" = ${serviceOrderId}::uuid
        AND "status" IN ('DRAFT','SENT')
    `;

    const quotes = await tx.$queryRaw<Array<{ id: string; quoteNumber: string; revision: number; subtotal: number; total: number }>>`
      INSERT INTO "Quotation" (
        "shopId", "serviceOrderId", "quoteNumber", "revision", "status", "subtotal", "discountTotal", "taxTotal", "total",
        "validUntil", "notes", "createdByUserId"
      ) VALUES (
        ${shopId}::uuid, ${serviceOrderId}::uuid, ${quoteNumber}, ${revision}, 'DRAFT', ${subtotal}, ${discountTotal}, ${taxTotal}, ${total},
        ${validUntil}, ${emptyToNull(input.notes)}, ${createdByUserId}::uuid
      )
      RETURNING "id", "quoteNumber", "revision", "subtotal"::double precision AS "subtotal", "total"::double precision AS "total"
    `;
    const quote = quotes[0];

    let sortOrder = 0;
    for (const line of labor) {
      await tx.$executeRaw`
        INSERT INTO "QuotationLine" (
          "shopId", "quotationId", "lineType", "description", "serviceLaborLineId", "quantity", "unitCost", "unitPrice", "lineTotal", "sortOrder"
        ) VALUES (
          ${shopId}::uuid, ${quote.id}::uuid, 'LABOR', ${line.description}, ${line.id}::uuid, ${line.quantity}, ${line.costAmount}, ${line.unitPrice}, ${line.lineTotal}, ${sortOrder}
        )
      `;
      sortOrder += 1;
    }
    for (const line of parts) {
      await tx.$executeRaw`
        INSERT INTO "QuotationLine" (
          "shopId", "quotationId", "lineType", "description", "inventoryItemId", "servicePartLineId", "quantity", "unitCost", "unitPrice", "lineTotal", "sortOrder"
        ) VALUES (
          ${shopId}::uuid, ${quote.id}::uuid, 'PART', ${line.partName}, ${line.inventoryItemId}::uuid, ${line.id}::uuid, ${line.quantity}, ${line.unitCost}, ${line.unitPrice}, ${line.lineTotal}, ${sortOrder}
        )
      `;
      sortOrder += 1;
    }

    await tx.$executeRaw`
      UPDATE "ServiceOrder"
      SET "estimatedTotal" = ${total}, "updatedByUserId" = ${createdByUserId}::uuid, "updatedAt" = now(), "version" = "version" + 1
      WHERE "id" = ${serviceOrderId}::uuid AND "shopId" = ${shopId}::uuid
    `;

    return quote;
  });
}

export async function markQuotationSent(
  shopId: string,
  quotationId: string,
  changedByUserId: string,
) {
  return prisma.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<Array<{ id: string; serviceOrderId: string; status: string }>>`
      SELECT "id", "serviceOrderId", "status"
      FROM "Quotation"
      WHERE "id" = ${quotationId}::uuid AND "shopId" = ${shopId}::uuid
      FOR UPDATE
    `;
    const quote = rows[0];
    if (!quote) throw new Error("عرض السعر غير موجود.");
    if (quote.status !== "DRAFT" && quote.status !== "SENT") throw new Error("لا يمكن إرسال عرض السعر بهذه الحالة.");

    await tx.$executeRaw`
      UPDATE "Quotation" SET "status" = 'SENT', "sentAt" = COALESCE("sentAt", now()), "updatedAt" = now()
      WHERE "id" = ${quotationId}::uuid AND "shopId" = ${shopId}::uuid
    `;

    const orders = await tx.$queryRaw<Array<{ status: string }>>`
      SELECT "status" FROM "ServiceOrder"
      WHERE "id" = ${quote.serviceOrderId}::uuid AND "shopId" = ${shopId}::uuid
      FOR UPDATE
    `;
    const currentStatus = orders[0]?.status;
    if (currentStatus === "RECEIVED" || currentStatus === "INSPECTING") {
      await tx.$executeRaw`
        UPDATE "ServiceOrder"
        SET "status" = 'WAITING_CUSTOMER_APPROVAL', "updatedByUserId" = ${changedByUserId}::uuid, "updatedAt" = now(), "version" = "version" + 1
        WHERE "id" = ${quote.serviceOrderId}::uuid AND "shopId" = ${shopId}::uuid
      `;
      await tx.$executeRaw`
        INSERT INTO "ServiceOrderStatusHistory" ("shopId", "serviceOrderId", "fromStatus", "toStatus", "createdByUserId")
        VALUES (${shopId}::uuid, ${quote.serviceOrderId}::uuid, ${currentStatus}, 'WAITING_CUSTOMER_APPROVAL', ${changedByUserId}::uuid)
      `;
    }

    return { id: quote.id, status: "SENT" as const };
  });
}

export async function recordCustomerApproval(
  shopId: string,
  quotationId: string,
  recordedByUserId: string,
  input: {
    decision: ApprovalDecision;
    channel?: ApprovalChannel;
    approvedLineIds?: string[];
    rejectedLineIds?: string[];
    note?: string | null;
  },
) {
  return prisma.$transaction(async (tx) => {
    const quotes = await tx.$queryRaw<Array<{ id: string; serviceOrderId: string; status: string }>>`
      SELECT "id", "serviceOrderId", "status"
      FROM "Quotation"
      WHERE "id" = ${quotationId}::uuid AND "shopId" = ${shopId}::uuid
      FOR UPDATE
    `;
    const quote = quotes[0];
    if (!quote) throw new Error("عرض السعر غير موجود.");
    if (!["DRAFT", "SENT"].includes(quote.status)) throw new Error("تم حسم هذا العرض مسبقاً أو أنه لم يعد فعالاً.");

    const lines = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT "id" FROM "QuotationLine"
      WHERE "shopId" = ${shopId}::uuid AND "quotationId" = ${quotationId}::uuid
      ORDER BY "sortOrder"
    `;
    if (!lines.length) throw new Error("عرض السعر لا يحتوي على بنود.");
    const validIds = new Set(lines.map((line) => line.id));

    const approvedIds = new Set(input.approvedLineIds ?? []);
    const rejectedIds = new Set(input.rejectedLineIds ?? []);
    for (const id of [...approvedIds, ...rejectedIds]) {
      if (!validIds.has(id)) throw new Error("أحد بنود الموافقة لا ينتمي إلى عرض السعر.");
    }

    if (input.decision === "APPROVED") {
      await tx.$executeRaw`
        UPDATE "QuotationLine" SET "approvalStatus" = 'APPROVED', "updatedAt" = now()
        WHERE "shopId" = ${shopId}::uuid AND "quotationId" = ${quotationId}::uuid
      `;
    } else if (input.decision === "REJECTED") {
      await tx.$executeRaw`
        UPDATE "QuotationLine" SET "approvalStatus" = 'REJECTED', "updatedAt" = now()
        WHERE "shopId" = ${shopId}::uuid AND "quotationId" = ${quotationId}::uuid
      `;
    } else {
      if (!approvedIds.size || approvedIds.size === lines.length) {
        throw new Error("الموافقة الجزئية يجب أن تتضمن بعض البنود المقبولة وليس كلها.");
      }
      const undecided = lines.filter((line) => !approvedIds.has(line.id) && !rejectedIds.has(line.id));
      for (const line of lines) {
        const status = approvedIds.has(line.id) ? "APPROVED" : "REJECTED";
        await tx.$executeRaw`
          UPDATE "QuotationLine" SET "approvalStatus" = ${status}, "updatedAt" = now()
          WHERE "id" = ${line.id}::uuid AND "shopId" = ${shopId}::uuid AND "quotationId" = ${quotationId}::uuid
        `;
      }
      if (undecided.length) {
        // Any omitted line in a partial decision is treated as rejected to avoid ambiguous work authorization.
      }
    }

    await syncQuotationApprovalsToServiceLinesInTx(tx, shopId, quotationId);

    const customerRows = await tx.$queryRaw<Array<{ customerName: string; customerPhone: string | null; orderStatus: string }>>`
      SELECT c."name" AS "customerName", c."phone" AS "customerPhone", so."status" AS "orderStatus"
      FROM "ServiceOrder" so
      JOIN "Customer" c ON c."id" = so."customerId" AND c."shopId" = so."shopId"
      WHERE so."id" = ${quote.serviceOrderId}::uuid AND so."shopId" = ${shopId}::uuid
      FOR UPDATE OF so
    `;
    const context = customerRows[0];
    if (!context) throw new Error("تعذر ربط عرض السعر بأمر الصيانة.");

    const quoteStatus = input.decision;
    await tx.$executeRaw`
      UPDATE "Quotation" SET "status" = ${quoteStatus}, "updatedAt" = now()
      WHERE "id" = ${quotationId}::uuid AND "shopId" = ${shopId}::uuid
    `;

    const approvals = await tx.$queryRaw<Array<{ id: string; decidedAt: Date }>>`
      INSERT INTO "CustomerApproval" (
        "shopId", "serviceOrderId", "quotationId", "decision", "channel", "customerNameSnapshot", "customerPhoneSnapshot", "note", "recordedByUserId"
      ) VALUES (
        ${shopId}::uuid, ${quote.serviceOrderId}::uuid, ${quotationId}::uuid, ${input.decision}, ${input.channel ?? "IN_PERSON"},
        ${context.customerName}, ${context.customerPhone}, ${emptyToNull(input.note)}, ${recordedByUserId}::uuid
      )
      RETURNING "id", "decidedAt"
    `;

    let targetOrderStatus = input.decision === "REJECTED" ? "REJECTED" : "APPROVED";
    let missingParts: Awaited<ReturnType<typeof reserveServiceOrderPartsInTx>> = [];
    if (input.decision !== "REJECTED") {
      missingParts = await reserveServiceOrderPartsInTx(tx, shopId, quote.serviceOrderId);
      if (missingParts.length) targetOrderStatus = "WAITING_PARTS";
    }

    const shortageNote = missingParts.length
      ? `بانتظار قطع — ${missingParts.map((part) => `${part.partName}: مطلوب ${part.requiredQuantity}، متاح ${part.availableQuantity}`).join("؛ ")}`
      : null;
    const historyNote = [emptyToNull(input.note), shortageNote].filter(Boolean).join(" • ") || null;

    if (["RECEIVED", "INSPECTING", "WAITING_CUSTOMER_APPROVAL"].includes(context.orderStatus)) {
      await tx.$executeRaw`
        UPDATE "ServiceOrder"
        SET "status" = ${targetOrderStatus},
            "approvedAt" = CASE WHEN ${input.decision} <> 'REJECTED' THEN COALESCE("approvedAt", now()) ELSE "approvedAt" END,
            "updatedByUserId" = ${recordedByUserId}::uuid,
            "updatedAt" = now(),
            "version" = "version" + 1
        WHERE "id" = ${quote.serviceOrderId}::uuid AND "shopId" = ${shopId}::uuid
      `;
      await tx.$executeRaw`
        INSERT INTO "ServiceOrderStatusHistory" ("shopId", "serviceOrderId", "fromStatus", "toStatus", "note", "createdByUserId")
        VALUES (${shopId}::uuid, ${quote.serviceOrderId}::uuid, ${context.orderStatus}, ${targetOrderStatus}, ${historyNote}, ${recordedByUserId}::uuid)
      `;
    }

    return { id: approvals[0].id, decidedAt: approvals[0].decidedAt, decision: input.decision };
  });
}

export async function getQuotation(shopId: string, quotationId: string) {
  const quotes = await prisma.$queryRaw<Array<Record<string, unknown>> & { serviceOrderId?: never }>`
    SELECT q.*, so."orderNumber", c."name" AS "customerName", c."phone" AS "customerPhone",
           v."make" AS "vehicleMake", v."model" AS "vehicleModel", v."year" AS "vehicleYear", v."plateNumber", v."vin"
    FROM "Quotation" q
    JOIN "ServiceOrder" so ON so."id" = q."serviceOrderId" AND so."shopId" = q."shopId"
    JOIN "Vehicle" v ON v."id" = so."vehicleId" AND v."shopId" = so."shopId"
    JOIN "Customer" c ON c."id" = so."customerId" AND c."shopId" = so."shopId"
    WHERE q."id" = ${quotationId}::uuid AND q."shopId" = ${shopId}::uuid
    LIMIT 1
  `;
  const quote = quotes[0];
  if (!quote) return null;

  const lines = await prisma.$queryRaw<Array<Record<string, unknown>>>`
    SELECT * FROM "QuotationLine"
    WHERE "shopId" = ${shopId}::uuid AND "quotationId" = ${quotationId}::uuid
    ORDER BY "sortOrder", "createdAt"
  `;
  return { ...quote, lines };
}

export const quotationService = {
  createQuotationFromServiceOrder,
  markQuotationSent,
  recordCustomerApproval,
  getQuotation,
};
