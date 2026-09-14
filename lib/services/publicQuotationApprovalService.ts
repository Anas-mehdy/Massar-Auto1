import { prisma } from "@/lib/prisma";
import {
  publicPhoneProof,
  verifyPublicQuotationApprovalToken,
} from "@/lib/public-quotation-approval";
import {
  reserveServiceOrderPartsInTx,
  syncQuotationApprovalsToServiceLinesInTx,
} from "@/lib/services/servicePartInventoryService";

export type PublicQuotationDecision = "APPROVED" | "PARTIALLY_APPROVED" | "REJECTED";

function emptyToNull(value?: string | null) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

export async function recordPublicQuotationDecision(input: {
  quotationId: string;
  serviceOrderId: string;
  approvalToken: string;
  customerPhone: string;
  intent: "APPROVE_SELECTED" | "REJECT_ALL";
  approvedLineIds?: string[];
  note?: string | null;
}) {
  if (!verifyPublicQuotationApprovalToken(input.approvalToken, input.quotationId, input.serviceOrderId)) {
    throw new Error("رابط اعتماد عرض السعر غير صالح أو تم تغييره.");
  }

  const submittedPhoneProof = publicPhoneProof(input.customerPhone);
  if (!submittedPhoneProof) {
    throw new Error("أدخل رقم الجوال المسجل مع أمر الصيانة للتأكيد.");
  }

  return prisma.$transaction(async (tx) => {
    const quotes = await tx.$queryRaw<Array<{
      id: string;
      shopId: string;
      serviceOrderId: string;
      status: string;
      validUntil: Date | null;
    }>>`
      SELECT "id", "shopId", "serviceOrderId", "status", "validUntil"
      FROM "Quotation"
      WHERE "id" = ${input.quotationId}::uuid
        AND "serviceOrderId" = ${input.serviceOrderId}::uuid
      FOR UPDATE
    `;
    const quote = quotes[0];
    if (!quote) throw new Error("تعذر التحقق من عرض السعر.");
    if (quote.status !== "SENT") {
      throw new Error("هذا العرض تم حسمه مسبقاً أو لم يعد متاحاً للاعتماد.");
    }
    if (quote.validUntil && quote.validUntil.getTime() < Date.now()) {
      throw new Error("انتهت صلاحية عرض السعر. تواصل مع المركز للحصول على عرض محدث.");
    }

    const contextRows = await tx.$queryRaw<Array<{
      customerName: string;
      customerPhone: string | null;
      customerPhoneNormalized: string | null;
      orderStatus: string;
    }>>`
      SELECT c."name" AS "customerName",
             c."phone" AS "customerPhone",
             c."phoneNormalized" AS "customerPhoneNormalized",
             so."status" AS "orderStatus"
      FROM "ServiceOrder" so
      JOIN "Customer" c ON c."id" = so."customerId" AND c."shopId" = so."shopId"
      WHERE so."id" = ${input.serviceOrderId}::uuid
        AND so."shopId" = ${quote.shopId}::uuid
        AND so."deletedAt" IS NULL
      FOR UPDATE OF so
    `;
    const context = contextRows[0];
    if (!context) throw new Error("تعذر التحقق من أمر الصيانة المرتبط بالعرض.");
    if (context.orderStatus !== "WAITING_CUSTOMER_APPROVAL") {
      throw new Error("أمر الصيانة لم يعد بانتظار قرار العميل.");
    }

    const storedPhoneProof = publicPhoneProof(context.customerPhoneNormalized || context.customerPhone);
    if (!storedPhoneProof || storedPhoneProof !== submittedPhoneProof) {
      throw new Error("رقم الجوال لا يطابق الرقم المسجل مع أمر الصيانة.");
    }

    const lines = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT "id"
      FROM "QuotationLine"
      WHERE "shopId" = ${quote.shopId}::uuid
        AND "quotationId" = ${quote.id}::uuid
      ORDER BY "sortOrder", "createdAt"
      FOR UPDATE
    `;
    if (!lines.length) throw new Error("عرض السعر لا يحتوي على بنود قابلة للاعتماد.");

    const validLineIds = new Set(lines.map((line) => line.id));
    const approvedIds = new Set(input.approvedLineIds ?? []);
    for (const id of approvedIds) {
      if (!validLineIds.has(id)) throw new Error("أحد البنود المحددة لا ينتمي إلى عرض السعر الحالي.");
    }

    let decision: PublicQuotationDecision;
    if (input.intent === "REJECT_ALL") {
      decision = "REJECTED";
      await tx.$executeRaw`
        UPDATE "QuotationLine"
        SET "approvalStatus" = 'REJECTED', "updatedAt" = now()
        WHERE "shopId" = ${quote.shopId}::uuid AND "quotationId" = ${quote.id}::uuid
      `;
    } else {
      if (!approvedIds.size) {
        throw new Error("حدد بنداً واحداً على الأقل للموافقة، أو اختر رفض العرض بالكامل.");
      }
      decision = approvedIds.size === lines.length ? "APPROVED" : "PARTIALLY_APPROVED";
      for (const line of lines) {
        const lineDecision = approvedIds.has(line.id) ? "APPROVED" : "REJECTED";
        await tx.$executeRaw`
          UPDATE "QuotationLine"
          SET "approvalStatus" = ${lineDecision}, "updatedAt" = now()
          WHERE "id" = ${line.id}::uuid
            AND "shopId" = ${quote.shopId}::uuid
            AND "quotationId" = ${quote.id}::uuid
        `;
      }
    }

    await syncQuotationApprovalsToServiceLinesInTx(tx, quote.shopId, quote.id);

    await tx.$executeRaw`
      UPDATE "Quotation"
      SET "status" = ${decision}, "updatedAt" = now()
      WHERE "id" = ${quote.id}::uuid AND "shopId" = ${quote.shopId}::uuid
    `;

    const approvals = await tx.$queryRaw<Array<{ id: string; decidedAt: Date }>>`
      INSERT INTO "CustomerApproval" (
        "shopId", "serviceOrderId", "quotationId", "decision", "channel",
        "customerNameSnapshot", "customerPhoneSnapshot", "note", "recordedByUserId"
      ) VALUES (
        ${quote.shopId}::uuid, ${quote.serviceOrderId}::uuid, ${quote.id}::uuid, ${decision}, 'WEB',
        ${context.customerName}, ${context.customerPhone}, ${emptyToNull(input.note)}, NULL
      )
      RETURNING "id", "decidedAt"
    `;

    let targetOrderStatus = decision === "REJECTED" ? "REJECTED" : "APPROVED";
    let missingParts: Awaited<ReturnType<typeof reserveServiceOrderPartsInTx>> = [];
    if (decision !== "REJECTED") {
      missingParts = await reserveServiceOrderPartsInTx(tx, quote.shopId, quote.serviceOrderId);
      if (missingParts.length) targetOrderStatus = "WAITING_PARTS";
    }

    const shortageNote = missingParts.length
      ? `بانتظار قطع — ${missingParts.map((part) => `${part.partName}: مطلوب ${part.requiredQuantity}، متاح ${part.availableQuantity}`).join("؛ ")}`
      : null;
    const customerDecisionNote = decision === "REJECTED"
      ? "رفض العميل عرض السعر عبر رابط التتبع"
      : decision === "PARTIALLY_APPROVED"
        ? "موافقة جزئية من العميل عبر رابط التتبع"
        : "موافقة العميل على عرض السعر عبر رابط التتبع";
    const historyNote = [customerDecisionNote, emptyToNull(input.note), shortageNote].filter(Boolean).join(" • ");

    await tx.$executeRaw`
      UPDATE "ServiceOrder"
      SET "status" = ${targetOrderStatus},
          "approvedAt" = CASE WHEN ${decision} <> 'REJECTED' THEN COALESCE("approvedAt", now()) ELSE "approvedAt" END,
          "updatedByUserId" = NULL,
          "updatedAt" = now(),
          "version" = "version" + 1
      WHERE "id" = ${quote.serviceOrderId}::uuid
        AND "shopId" = ${quote.shopId}::uuid
        AND "status" = 'WAITING_CUSTOMER_APPROVAL'
    `;

    await tx.$executeRaw`
      INSERT INTO "ServiceOrderStatusHistory" (
        "shopId", "serviceOrderId", "fromStatus", "toStatus", "note", "createdByUserId"
      ) VALUES (
        ${quote.shopId}::uuid, ${quote.serviceOrderId}::uuid,
        'WAITING_CUSTOMER_APPROVAL', ${targetOrderStatus}, ${historyNote}, NULL
      )
    `;

    return {
      id: approvals[0].id,
      decidedAt: approvals[0].decidedAt,
      decision,
      serviceOrderStatus: targetOrderStatus,
    };
  });
}

export const publicQuotationApprovalService = {
  recordPublicQuotationDecision,
};
