import { prisma } from "@/lib/prisma";

const LOCKED_SERVICE_ORDER_STATUSES = new Set(["DELIVERED", "CLOSED", "CANCELLED", "REJECTED"]);

function normalizeText(value?: string | null) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

export type AssignableTechnician = {
  userId: string;
  name: string;
  email: string;
};

export async function listAssignableTechnicians(shopId: string): Promise<AssignableTechnician[]> {
  return prisma.$queryRaw<AssignableTechnician[]>`
    SELECT u."id" AS "userId", COALESCE(NULLIF(BTRIM(u."name"), ''), u."email") AS "name", u."email"
    FROM "Membership" m
    JOIN "User" u ON u."id" = m."userId"
    WHERE m."shopId" = ${shopId}::uuid
      AND m."deletedAt" IS NULL
      AND m."status"::text = 'ACTIVE'
      AND m."role"::text = 'TECHNICIAN'
      AND u."deletedAt" IS NULL
    ORDER BY COALESCE(NULLIF(BTRIM(u."name"), ''), u."email") ASC
  `;
}

export async function updateDiagnosis(
  shopId: string,
  serviceOrderId: string,
  changedByUserId: string,
  diagnosis?: string | null,
) {
  const normalizedDiagnosis = normalizeText(diagnosis);

  return prisma.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<Array<{ id: string; status: string }>>`
      SELECT "id", "status"
      FROM "ServiceOrder"
      WHERE "id" = ${serviceOrderId}::uuid
        AND "shopId" = ${shopId}::uuid
        AND "deletedAt" IS NULL
      FOR UPDATE
    `;
    const order = rows[0];
    if (!order) throw new Error("أمر الصيانة غير موجود.");
    if (LOCKED_SERVICE_ORDER_STATUSES.has(order.status)) {
      throw new Error("لا يمكن تعديل التشخيص بعد تسليم أو إغلاق أو إلغاء أمر الصيانة.");
    }

    await tx.$executeRaw`
      UPDATE "ServiceOrder"
      SET "diagnosis" = ${normalizedDiagnosis},
          "updatedByUserId" = ${changedByUserId}::uuid,
          "updatedAt" = now(),
          "version" = "version" + 1
      WHERE "id" = ${serviceOrderId}::uuid
        AND "shopId" = ${shopId}::uuid
    `;

    return { id: serviceOrderId, diagnosis: normalizedDiagnosis };
  });
}

export async function assignTechnician(
  shopId: string,
  serviceOrderId: string,
  changedByUserId: string,
  technicianUserId: string | null,
) {
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
    if (LOCKED_SERVICE_ORDER_STATUSES.has(order.status)) {
      throw new Error("لا يمكن تغيير الفني بعد تسليم أو إغلاق أو إلغاء أمر الصيانة.");
    }

    if (technicianUserId) {
      const technicians = await tx.$queryRaw<Array<{ userId: string }>>`
        SELECT m."userId"
        FROM "Membership" m
        JOIN "User" u ON u."id" = m."userId" AND u."deletedAt" IS NULL
        WHERE m."shopId" = ${shopId}::uuid
          AND m."userId" = ${technicianUserId}::uuid
          AND m."deletedAt" IS NULL
          AND m."status"::text = 'ACTIVE'
          AND m."role"::text = 'TECHNICIAN'
        LIMIT 1
      `;
      if (!technicians[0]) {
        throw new Error("الموظف المحدد ليس فني صيانة نشطاً في هذا المركز.");
      }
    }

    await tx.$executeRaw`
      UPDATE "ServiceOrder"
      SET "assignedToUserId" = ${technicianUserId}::uuid,
          "updatedByUserId" = ${changedByUserId}::uuid,
          "updatedAt" = now(),
          "version" = "version" + 1
      WHERE "id" = ${serviceOrderId}::uuid
        AND "shopId" = ${shopId}::uuid
    `;

    return { id: serviceOrderId, assignedToUserId: technicianUserId };
  });
}

export const serviceOrderWorkflowService = {
  listAssignableTechnicians,
  updateDiagnosis,
  assignTechnician,
};
