import { randomBytes } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export const WARRANTY_CLAIM_TYPES = ["WARRANTY", "COMEBACK", "REWORK"] as const;
export const WARRANTY_CLAIM_STATUSES = ["OPEN", "APPROVED", "REJECTED", "IN_SERVICE", "RESOLVED", "CLOSED"] as const;
export const WARRANTY_COVERAGE_DECISIONS = ["PENDING", "COVERED", "PARTIAL", "CUSTOMER_PAY", "NOT_APPLICABLE"] as const;

export type WarrantyClaimType = (typeof WARRANTY_CLAIM_TYPES)[number];
export type WarrantyClaimStatus = (typeof WARRANTY_CLAIM_STATUSES)[number];
export type WarrantyCoverageDecision = (typeof WARRANTY_COVERAGE_DECISIONS)[number];

export type WarrantyClaimContext = {
  originalOrder: {
    id: string;
    orderNumber: string;
    status: string;
    vehicleId: string;
    customerId: string;
    vehicleLabel: string;
    customerName: string;
    deliveredAt: Date | null;
    closedAt: Date | null;
  };
  parts: Array<{ id: string; partName: string; quantity: number; status: string }>;
  laborLines: Array<{ id: string; description: string; status: string }>;
  claims: Array<{
    id: string;
    claimNumber: string;
    claimType: WarrantyClaimType;
    status: WarrantyClaimStatus;
    coverageDecision: WarrantyCoverageDecision;
    reportedIssue: string;
    assessment: string | null;
    resolution: string | null;
    notes: string | null;
    warrantyEndsAt: Date | null;
    customerCharge: number;
    followUpServiceOrderId: string | null;
    followUpOrderNumber: string | null;
    partName: string | null;
    laborDescription: string | null;
    createdByName: string | null;
    decidedByName: string | null;
    resolvedByName: string | null;
    openedAt: Date;
    decidedAt: Date | null;
    resolvedAt: Date | null;
    closedAt: Date | null;
  }>;
};

function clean(value?: string | null) {
  const text = value?.trim();
  return text ? text : null;
}

function generateClaimNumber() {
  const date = new Date().toISOString().slice(0, 10).replaceAll("-", "");
  return `WC-A-${date}-${randomBytes(3).toString("hex").toUpperCase()}`;
}

function generateOrderNumber() {
  const date = new Date().toISOString().slice(0, 10).replaceAll("-", "");
  return `WO-${date}-${randomBytes(3).toString("hex").toUpperCase()}`;
}

function parseOptionalDate(value?: Date | string | null) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error("تاريخ انتهاء الضمان غير صالح.");
  return date;
}

export async function getWarrantyClaimContext(shopId: string, originalServiceOrderId: string): Promise<WarrantyClaimContext | null> {
  const orders = await prisma.$queryRaw<WarrantyClaimContext["originalOrder"][]>`
    SELECT so."id", so."orderNumber", so."status"::text AS "status", so."vehicleId", so."customerId",
           concat_ws(' ', v."make", v."model", v."year"::text) AS "vehicleLabel",
           c."name" AS "customerName", so."deliveredAt", so."closedAt"
    FROM "ServiceOrder" so
    JOIN "Vehicle" v ON v."shopId"=so."shopId" AND v."id"=so."vehicleId"
    JOIN "Customer" c ON c."id"=so."customerId" AND c."shopId"=so."shopId"
    WHERE so."shopId"=${shopId}::uuid
      AND so."id"=${originalServiceOrderId}::uuid
      AND so."deletedAt" IS NULL
      AND so."status" IN ('DELIVERED','CLOSED')
    LIMIT 1
  `;
  const originalOrder = orders[0];
  if (!originalOrder) return null;

  const [parts, laborLines, claims] = await Promise.all([
    prisma.$queryRaw<WarrantyClaimContext["parts"]>`
      SELECT "id", "partName", "quantity", "status"::text AS "status"
      FROM "ServicePartLine"
      WHERE "shopId"=${shopId}::uuid AND "serviceOrderId"=${originalServiceOrderId}::uuid
        AND "status" <> 'CANCELLED'
      ORDER BY "sortOrder", "createdAt"
    `,
    prisma.$queryRaw<WarrantyClaimContext["laborLines"]>`
      SELECT "id", "description", "status"::text AS "status"
      FROM "ServiceLaborLine"
      WHERE "shopId"=${shopId}::uuid AND "serviceOrderId"=${originalServiceOrderId}::uuid
        AND "status" <> 'CANCELLED'
      ORDER BY "sortOrder", "createdAt"
    `,
    prisma.$queryRaw<WarrantyClaimContext["claims"]>`
      SELECT wc."id", wc."claimNumber", wc."claimType", wc."status", wc."coverageDecision",
             wc."reportedIssue", wc."assessment", wc."resolution", wc."notes", wc."warrantyEndsAt",
             wc."customerCharge"::double precision AS "customerCharge",
             wc."followUpServiceOrderId", followup."orderNumber" AS "followUpOrderNumber",
             part."partName", labor."description" AS "laborDescription",
             creator."name" AS "createdByName", decider."name" AS "decidedByName", resolver."name" AS "resolvedByName",
             wc."openedAt", wc."decidedAt", wc."resolvedAt", wc."closedAt"
      FROM "ServiceWarrantyClaim" wc
      LEFT JOIN "ServiceOrder" followup ON followup."shopId"=wc."shopId" AND followup."id"=wc."followUpServiceOrderId"
      LEFT JOIN "ServicePartLine" part ON part."shopId"=wc."shopId" AND part."id"=wc."originalServicePartLineId"
      LEFT JOIN "ServiceLaborLine" labor ON labor."shopId"=wc."shopId" AND labor."id"=wc."originalServiceLaborLineId"
      LEFT JOIN "User" creator ON creator."id"=wc."createdByUserId"
      LEFT JOIN "User" decider ON decider."id"=wc."decidedByUserId"
      LEFT JOIN "User" resolver ON resolver."id"=wc."resolvedByUserId"
      WHERE wc."shopId"=${shopId}::uuid AND wc."originalServiceOrderId"=${originalServiceOrderId}::uuid
      ORDER BY wc."openedAt" DESC, wc."createdAt" DESC
    `,
  ]);

  return { originalOrder, parts, laborLines, claims };
}

export async function createWarrantyClaim(
  shopId: string,
  originalServiceOrderId: string,
  createdByUserId: string,
  input: {
    claimType: WarrantyClaimType;
    reportedIssue: string;
    notes?: string | null;
    warrantyEndsAt?: Date | string | null;
    originalServicePartLineId?: string | null;
    originalServiceLaborLineId?: string | null;
  },
) {
  if (!WARRANTY_CLAIM_TYPES.includes(input.claimType)) throw new Error("نوع المطالبة غير صالح.");
  const reportedIssue = clean(input.reportedIssue);
  if (!reportedIssue) throw new Error("وصف سبب العودة أو مشكلة الضمان مطلوب.");
  const notes = clean(input.notes);
  const warrantyEndsAt = parseOptionalDate(input.warrantyEndsAt);
  const partLineId = clean(input.originalServicePartLineId);
  const laborLineId = clean(input.originalServiceLaborLineId);
  if (partLineId && laborLineId) throw new Error("اربط المطالبة بقطعة أو بأجرة عمل، وليس بالاثنين معاً.");

  return prisma.$transaction(async (tx) => {
    const orders = await tx.$queryRaw<Array<{ id: string; status: string; vehicleId: string; customerId: string }>>`
      SELECT "id", "status"::text AS "status", "vehicleId", "customerId"
      FROM "ServiceOrder"
      WHERE "shopId"=${shopId}::uuid AND "id"=${originalServiceOrderId}::uuid AND "deletedAt" IS NULL
      FOR UPDATE
    `;
    const order = orders[0];
    if (!order) throw new Error("أمر الصيانة الأصلي غير موجود.");
    if (!["DELIVERED", "CLOSED"].includes(order.status)) throw new Error("يمكن فتح مطالبة ضمان/عودة فقط بعد تسليم المركبة.");

    if (partLineId) {
      const rows = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT "id" FROM "ServicePartLine"
        WHERE "shopId"=${shopId}::uuid AND "serviceOrderId"=${originalServiceOrderId}::uuid AND "id"=${partLineId}::uuid
          AND "status" <> 'CANCELLED'
      `;
      if (!rows[0]) throw new Error("بند القطعة المحدد لا ينتمي إلى أمر الصيانة الأصلي.");
    }
    if (laborLineId) {
      const rows = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT "id" FROM "ServiceLaborLine"
        WHERE "shopId"=${shopId}::uuid AND "serviceOrderId"=${originalServiceOrderId}::uuid AND "id"=${laborLineId}::uuid
          AND "status" <> 'CANCELLED'
      `;
      if (!rows[0]) throw new Error("بند أجرة العمل المحدد لا ينتمي إلى أمر الصيانة الأصلي.");
    }

    const claimNumber = generateClaimNumber();
    const rows = await tx.$queryRaw<Array<{ id: string; claimNumber: string; openedAt: Date }>>`
      INSERT INTO "ServiceWarrantyClaim" (
        "shopId", "originalServiceOrderId", "vehicleId", "customerId", "originalServicePartLineId", "originalServiceLaborLineId",
        "createdByUserId", "claimNumber", "claimType", "status", "coverageDecision", "reportedIssue", "notes", "warrantyEndsAt"
      ) VALUES (
        ${shopId}::uuid, ${originalServiceOrderId}::uuid, ${order.vehicleId}::uuid, ${order.customerId}::uuid,
        ${partLineId}::uuid, ${laborLineId}::uuid, ${createdByUserId}::uuid, ${claimNumber}, ${input.claimType},
        'OPEN', 'PENDING', ${reportedIssue}, ${notes}, ${warrantyEndsAt}
      )
      RETURNING "id", "claimNumber", "openedAt"
    `;
    const claim = rows[0];

    await tx.$executeRaw`
      INSERT INTO "ServiceWarrantyClaimHistory" ("shopId", "claimId", "fromStatus", "toStatus", "coverageDecision", "note", "createdByUserId")
      VALUES (${shopId}::uuid, ${claim.id}::uuid, NULL, 'OPEN', 'PENDING', ${notes}, ${createdByUserId}::uuid)
    `;
    return claim;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 10_000 });
}

export async function decideWarrantyClaim(
  shopId: string,
  claimId: string,
  decidedByUserId: string,
  input: {
    decision: "APPROVED" | "REJECTED";
    coverageDecision: Exclude<WarrantyCoverageDecision, "PENDING">;
    assessment: string;
    customerCharge?: number | null;
    note?: string | null;
  },
) {
  const assessment = clean(input.assessment);
  if (!assessment) throw new Error("اكتب نتيجة تقييم المطالبة.");
  const customerCharge = input.customerCharge ?? 0;
  if (!Number.isFinite(customerCharge) || customerCharge < 0) throw new Error("مبلغ العميل غير صالح.");
  const note = clean(input.note);

  return prisma.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<Array<{ id: string; status: WarrantyClaimStatus }>>`
      SELECT "id", "status" FROM "ServiceWarrantyClaim"
      WHERE "shopId"=${shopId}::uuid AND "id"=${claimId}::uuid
      FOR UPDATE
    `;
    const claim = rows[0];
    if (!claim) throw new Error("مطالبة الضمان غير موجودة.");
    if (claim.status !== "OPEN") throw new Error("تم اتخاذ قرار على هذه المطالبة سابقاً.");

    await tx.$executeRaw`
      UPDATE "ServiceWarrantyClaim"
      SET "status"=${input.decision}, "coverageDecision"=${input.coverageDecision}, "assessment"=${assessment},
          "customerCharge"=${customerCharge}, "decidedByUserId"=${decidedByUserId}::uuid, "decidedAt"=now(), "updatedAt"=now()
      WHERE "shopId"=${shopId}::uuid AND "id"=${claimId}::uuid
    `;
    await tx.$executeRaw`
      INSERT INTO "ServiceWarrantyClaimHistory" ("shopId", "claimId", "fromStatus", "toStatus", "coverageDecision", "note", "createdByUserId")
      VALUES (${shopId}::uuid, ${claimId}::uuid, 'OPEN', ${input.decision}, ${input.coverageDecision}, ${note ?? assessment}, ${decidedByUserId}::uuid)
    `;
    return { id: claimId, status: input.decision, coverageDecision: input.coverageDecision };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 10_000 });
}

export async function createWarrantyFollowUpOrder(
  shopId: string,
  claimId: string,
  createdByUserId: string,
  input?: { odometerAtIntake?: number | null; receptionNotes?: string | null },
) {
  const odometerAtIntake = input?.odometerAtIntake ?? null;
  if (odometerAtIntake != null && (!Number.isInteger(odometerAtIntake) || odometerAtIntake < 0)) throw new Error("قراءة العداد غير صالحة.");
  const extraNotes = clean(input?.receptionNotes);

  return prisma.$transaction(async (tx) => {
    const claims = await tx.$queryRaw<Array<{
      id: string; claimNumber: string; status: WarrantyClaimStatus; reportedIssue: string;
      vehicleId: string; customerId: string; originalServiceOrderId: string; followUpServiceOrderId: string | null;
      originalOrderNumber: string; currentOdometer: number | null;
    }>>`
      SELECT wc."id", wc."claimNumber", wc."status", wc."reportedIssue", wc."vehicleId", wc."customerId",
             wc."originalServiceOrderId", wc."followUpServiceOrderId", original."orderNumber" AS "originalOrderNumber",
             v."currentOdometer"
      FROM "ServiceWarrantyClaim" wc
      JOIN "ServiceOrder" original ON original."shopId"=wc."shopId" AND original."id"=wc."originalServiceOrderId"
      JOIN "Vehicle" v ON v."shopId"=wc."shopId" AND v."id"=wc."vehicleId"
      WHERE wc."shopId"=${shopId}::uuid AND wc."id"=${claimId}::uuid
      FOR UPDATE OF wc, v
    `;
    const claim = claims[0];
    if (!claim) throw new Error("مطالبة الضمان غير موجودة.");
    if (claim.status !== "APPROVED") throw new Error("يجب اعتماد المطالبة قبل إنشاء أمر متابعة.");
    if (claim.followUpServiceOrderId) throw new Error("تم إنشاء أمر متابعة لهذه المطالبة مسبقاً.");

    const orderNumber = generateOrderNumber();
    const receptionNotes = `متابعة ${claim.claimNumber} للأمر الأصلي ${claim.originalOrderNumber}${extraNotes ? ` — ${extraNotes}` : ""}`;
    const orders = await tx.$queryRaw<Array<{ id: string; orderNumber: string; receivedAt: Date }>>`
      INSERT INTO "ServiceOrder" (
        "shopId", "vehicleId", "customerId", "orderNumber", "status", "reportedIssue", "receptionNotes",
        "odometerAtIntake", "createdByUserId", "updatedByUserId"
      ) VALUES (
        ${shopId}::uuid, ${claim.vehicleId}::uuid, ${claim.customerId}::uuid, ${orderNumber}, 'RECEIVED',
        ${`متابعة ${claim.claimNumber}: ${claim.reportedIssue}`}, ${receptionNotes}, ${odometerAtIntake},
        ${createdByUserId}::uuid, ${createdByUserId}::uuid
      )
      RETURNING "id", "orderNumber", "receivedAt"
    `;
    const order = orders[0];

    await tx.$executeRaw`
      INSERT INTO "ServiceOrderStatusHistory" ("shopId", "serviceOrderId", "fromStatus", "toStatus", "note", "createdByUserId")
      VALUES (${shopId}::uuid, ${order.id}::uuid, NULL, 'RECEIVED', ${`أمر متابعة للمطالبة ${claim.claimNumber}`}, ${createdByUserId}::uuid)
    `;

    if (odometerAtIntake != null && (claim.currentOdometer == null || odometerAtIntake > claim.currentOdometer)) {
      await tx.$executeRaw`
        UPDATE "Vehicle" SET "currentOdometer"=${odometerAtIntake}, "updatedAt"=now(), "version"="version"+1
        WHERE "shopId"=${shopId}::uuid AND "id"=${claim.vehicleId}::uuid
      `;
    }

    await tx.$executeRaw`
      UPDATE "ServiceWarrantyClaim"
      SET "followUpServiceOrderId"=${order.id}::uuid, "status"='IN_SERVICE', "updatedAt"=now()
      WHERE "shopId"=${shopId}::uuid AND "id"=${claimId}::uuid
    `;
    await tx.$executeRaw`
      INSERT INTO "ServiceWarrantyClaimHistory" ("shopId", "claimId", "fromStatus", "toStatus", "coverageDecision", "note", "createdByUserId")
      SELECT "shopId", "id", 'APPROVED', 'IN_SERVICE', "coverageDecision", ${`تم إنشاء أمر المتابعة ${order.orderNumber}`}, ${createdByUserId}::uuid
      FROM "ServiceWarrantyClaim" WHERE "shopId"=${shopId}::uuid AND "id"=${claimId}::uuid
    `;
    return { claimId, serviceOrderId: order.id, orderNumber: order.orderNumber };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 10_000 });
}

export async function resolveWarrantyClaim(shopId: string, claimId: string, resolvedByUserId: string, resolutionInput: string) {
  const resolution = clean(resolutionInput);
  if (!resolution) throw new Error("اكتب نتيجة معالجة المطالبة.");

  return prisma.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<Array<{ id: string; status: WarrantyClaimStatus; coverageDecision: WarrantyCoverageDecision; followUpServiceOrderId: string | null; followUpStatus: string | null }>>`
      SELECT wc."id", wc."status", wc."coverageDecision", wc."followUpServiceOrderId", followup."status"::text AS "followUpStatus"
      FROM "ServiceWarrantyClaim" wc
      LEFT JOIN "ServiceOrder" followup ON followup."shopId"=wc."shopId" AND followup."id"=wc."followUpServiceOrderId"
      WHERE wc."shopId"=${shopId}::uuid AND wc."id"=${claimId}::uuid
      FOR UPDATE OF wc
    `;
    const claim = rows[0];
    if (!claim) throw new Error("مطالبة الضمان غير موجودة.");
    if (!["APPROVED", "IN_SERVICE"].includes(claim.status)) throw new Error("حالة المطالبة الحالية لا تسمح بتسجيل الحل.");
    if (claim.followUpServiceOrderId && !["READY_FOR_DELIVERY", "DELIVERED", "CLOSED"].includes(claim.followUpStatus ?? "")) {
      throw new Error("أمر المتابعة ما زال قيد التنفيذ؛ أكمل الصيانة قبل اعتبار المطالبة محلولة.");
    }

    await tx.$executeRaw`
      UPDATE "ServiceWarrantyClaim"
      SET "status"='RESOLVED', "resolution"=${resolution}, "resolvedByUserId"=${resolvedByUserId}::uuid,
          "resolvedAt"=now(), "updatedAt"=now()
      WHERE "shopId"=${shopId}::uuid AND "id"=${claimId}::uuid
    `;
    await tx.$executeRaw`
      INSERT INTO "ServiceWarrantyClaimHistory" ("shopId", "claimId", "fromStatus", "toStatus", "coverageDecision", "note", "createdByUserId")
      VALUES (${shopId}::uuid, ${claimId}::uuid, ${claim.status}, 'RESOLVED', ${claim.coverageDecision}, ${resolution}, ${resolvedByUserId}::uuid)
    `;
    return { id: claimId, status: "RESOLVED" as const };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 10_000 });
}

export async function closeWarrantyClaim(shopId: string, claimId: string, userId: string) {
  return prisma.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<Array<{ id: string; status: WarrantyClaimStatus; coverageDecision: WarrantyCoverageDecision; followUpServiceOrderId: string | null; followUpStatus: string | null }>>`
      SELECT wc."id", wc."status", wc."coverageDecision", wc."followUpServiceOrderId", followup."status"::text AS "followUpStatus"
      FROM "ServiceWarrantyClaim" wc
      LEFT JOIN "ServiceOrder" followup ON followup."shopId"=wc."shopId" AND followup."id"=wc."followUpServiceOrderId"
      WHERE wc."shopId"=${shopId}::uuid AND wc."id"=${claimId}::uuid
      FOR UPDATE OF wc
    `;
    const claim = rows[0];
    if (!claim) throw new Error("مطالبة الضمان غير موجودة.");
    if (!["REJECTED", "RESOLVED"].includes(claim.status)) throw new Error("يجب رفض المطالبة أو حلها قبل الإغلاق النهائي.");
    if (claim.followUpServiceOrderId && claim.followUpStatus !== "CLOSED") throw new Error("أغلق أمر المتابعة أولاً قبل إغلاق مطالبة الضمان.");

    await tx.$executeRaw`
      UPDATE "ServiceWarrantyClaim" SET "status"='CLOSED', "closedAt"=now(), "updatedAt"=now()
      WHERE "shopId"=${shopId}::uuid AND "id"=${claimId}::uuid
    `;
    await tx.$executeRaw`
      INSERT INTO "ServiceWarrantyClaimHistory" ("shopId", "claimId", "fromStatus", "toStatus", "coverageDecision", "note", "createdByUserId")
      VALUES (${shopId}::uuid, ${claimId}::uuid, ${claim.status}, 'CLOSED', ${claim.coverageDecision}, 'إغلاق نهائي للمطالبة', ${userId}::uuid)
    `;
    return { id: claimId, status: "CLOSED" as const };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 10_000 });
}

export const serviceWarrantyClaimService = {
  getWarrantyClaimContext,
  createWarrantyClaim,
  decideWarrantyClaim,
  createWarrantyFollowUpOrder,
  resolveWarrantyClaim,
  closeWarrantyClaim,
};
