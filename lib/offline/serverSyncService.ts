import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { normalizePhone } from "@/lib/services/customerService";

const customerPayloadSchema = z.object({
  clientGeneratedId: z.string().nullable().optional(),
  name: z.string().trim().min(1).optional(),
  phone: z.string().nullable().optional(),
  phoneNormalized: z.string().nullable().optional(),
  email: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  deletedAt: z.string().datetime().nullable().optional(),
});

export const syncMutationSchema = z.object({
  operationId: z.string().uuid(),
  deviceId: z.string().trim().min(1).max(200),
  shopId: z.string().uuid(),
  userId: z.string().uuid(),
  entityType: z.literal("customer"),
  entityId: z.string().uuid(),
  mutationType: z.enum(["customer.create", "customer.update", "customer.delete"]),
  baseVersion: z.number().int().nonnegative().nullable(),
  payload: customerPayloadSchema,
  createdAt: z.string().datetime(),
});

export type ServerSyncMutation = z.infer<typeof syncMutationSchema>;

type CustomerRow = {
  id: string;
  shopId: string;
  clientGeneratedId: string | null;
  name: string;
  phone: string | null;
  phoneNormalized: string | null;
  email: string | null;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
  version: number;
};

type StoredMutationRow = {
  operationId: string;
  status: string;
  result: Prisma.JsonValue | null;
  errorCode: string | null;
  errorMessage: string | null;
};

export type SyncMutationResult = {
  operationId: string;
  status: "applied" | "conflict" | "failed";
  customer?: ReturnType<typeof serializeCustomer>;
  errorCode?: string;
  errorMessage?: string;
};

function serializeCustomer(row: CustomerRow) {
  return {
    id: row.id,
    shopId: row.shopId,
    clientGeneratedId: row.clientGeneratedId,
    name: row.name,
    phone: row.phone,
    phoneNormalized: row.phoneNormalized,
    email: row.email,
    notes: row.notes,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    deletedAt: row.deletedAt?.toISOString() ?? null,
    version: row.version,
  };
}

function clean(value: string | null | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function storedResult(row: StoredMutationRow): SyncMutationResult {
  if (row.result && typeof row.result === "object") {
    return row.result as unknown as SyncMutationResult;
  }
  return {
    operationId: row.operationId,
    status: row.status === "CONFLICT" ? "conflict" : "failed",
    ...(row.errorCode ? { errorCode: row.errorCode } : {}),
    ...(row.errorMessage ? { errorMessage: row.errorMessage } : {}),
  };
}

async function ensurePhoneUnique(
  tx: Prisma.TransactionClient,
  shopId: string,
  phoneNormalized: string | null,
  exceptCustomerId?: string,
) {
  if (!phoneNormalized) return;
  const rows = await tx.$queryRaw<Array<{ id: string; name: string }>>(Prisma.sql`
    SELECT "id", "name"
    FROM "Customer"
    WHERE "shopId" = ${shopId}::uuid
      AND "deletedAt" IS NULL
      AND "phoneNormalized" = ${phoneNormalized}
      ${exceptCustomerId ? Prisma.sql`AND "id" <> ${exceptCustomerId}::uuid` : Prisma.empty}
    LIMIT 1
  `);
  if (rows[0]) {
    throw new Error(`يوجد عميل مسجل بهذا الرقم بالفعل: ${rows[0].name}.`);
  }
}

async function applyCustomerMutation(
  tx: Prisma.TransactionClient,
  mutation: ServerSyncMutation,
): Promise<SyncMutationResult> {
  const payload = mutation.payload;

  if (mutation.mutationType === "customer.create") {
    if (!payload.name) throw new Error("اسم العميل مطلوب.");
    const clientGeneratedId = payload.clientGeneratedId ?? mutation.entityId;

    // Resolve a client-generated replay before uniqueness validation. This makes
    // customer creation idempotent even if a client has to reconstruct its outbox
    // and therefore sends the same entity with a fresh operationId.
    const existing = await tx.$queryRaw<CustomerRow[]>(Prisma.sql`
      SELECT * FROM "Customer"
      WHERE "shopId" = ${mutation.shopId}::uuid
        AND ("id" = ${mutation.entityId}::uuid OR "clientGeneratedId" = ${clientGeneratedId})
      LIMIT 1
      FOR UPDATE
    `);

    const existingRow = existing[0];
    if (existingRow) {
      if (existingRow.id !== mutation.entityId) {
        return {
          operationId: mutation.operationId,
          status: "conflict",
          customer: serializeCustomer(existingRow),
          errorCode: "CLIENT_IDENTITY_CONFLICT",
          errorMessage: "معرّف العميل المحلي مرتبط بسجل مختلف على السيرفر.",
        };
      }
      return {
        operationId: mutation.operationId,
        status: "applied",
        customer: serializeCustomer(existingRow),
      };
    }

    const phone = clean(payload.phone);
    const phoneNormalized = normalizePhone(phone);
    await ensurePhoneUnique(tx, mutation.shopId, phoneNormalized);

    const created = await tx.$queryRaw<CustomerRow[]>(Prisma.sql`
      INSERT INTO "Customer" (
        "id", "shopId", "clientGeneratedId", "name", "phone", "phoneNormalized",
        "email", "notes", "createdAt", "updatedAt", "deletedAt", "version"
      ) VALUES (
        ${mutation.entityId}::uuid,
        ${mutation.shopId}::uuid,
        ${clientGeneratedId},
        ${payload.name.trim()},
        ${phone},
        ${phoneNormalized},
        ${clean(payload.email)},
        ${clean(payload.notes)},
        CURRENT_TIMESTAMP,
        CURRENT_TIMESTAMP,
        NULL,
        1
      )
      RETURNING *
    `);
    const row = created[0];
    if (!row) throw new Error("تعذر إنشاء العميل.");
    return { operationId: mutation.operationId, status: "applied", customer: serializeCustomer(row) };
  }

  const rows = await tx.$queryRaw<CustomerRow[]>(Prisma.sql`
    SELECT * FROM "Customer"
    WHERE "id" = ${mutation.entityId}::uuid
      AND "shopId" = ${mutation.shopId}::uuid
    LIMIT 1
    FOR UPDATE
  `);
  const existing = rows[0];
  if (!existing) {
    return {
      operationId: mutation.operationId,
      status: "conflict",
      errorCode: "CUSTOMER_NOT_FOUND",
      errorMessage: "العميل غير موجود على السيرفر.",
    };
  }

  if (mutation.baseVersion === null || mutation.baseVersion !== existing.version) {
    return {
      operationId: mutation.operationId,
      status: "conflict",
      customer: serializeCustomer(existing),
      errorCode: "VERSION_CONFLICT",
      errorMessage: "تم تعديل العميل من جهاز آخر قبل مزامنة هذا التعديل.",
    };
  }

  if (mutation.mutationType === "customer.update") {
    if (!payload.name) throw new Error("اسم العميل مطلوب.");
    if (existing.deletedAt) {
      return {
        operationId: mutation.operationId,
        status: "conflict",
        customer: serializeCustomer(existing),
        errorCode: "CUSTOMER_DELETED",
        errorMessage: "تم حذف العميل من جهاز آخر.",
      };
    }

    const phone = clean(payload.phone);
    const phoneNormalized = normalizePhone(phone);
    await ensurePhoneUnique(tx, mutation.shopId, phoneNormalized, existing.id);

    const updated = await tx.$queryRaw<CustomerRow[]>(Prisma.sql`
      UPDATE "Customer"
      SET "name" = ${payload.name.trim()},
          "phone" = ${phone},
          "phoneNormalized" = ${phoneNormalized},
          "email" = ${clean(payload.email)},
          "notes" = ${clean(payload.notes)},
          "updatedAt" = CURRENT_TIMESTAMP,
          "version" = "version" + 1
      WHERE "id" = ${existing.id}::uuid
      RETURNING *
    `);
    return { operationId: mutation.operationId, status: "applied", customer: serializeCustomer(updated[0]) };
  }

  const [repairRows, saleRows, invoiceRows, installmentRows, debtRows] = await Promise.all([
    tx.$queryRaw<Array<{ count: bigint }>>(Prisma.sql`SELECT COUNT(*)::bigint AS count FROM "RepairOrder" WHERE "shopId" = ${mutation.shopId}::uuid AND "customerId" = ${existing.id}::uuid AND "deletedAt" IS NULL`),
    tx.$queryRaw<Array<{ count: bigint }>>(Prisma.sql`SELECT COUNT(*)::bigint AS count FROM "Sale" WHERE "shopId" = ${mutation.shopId}::uuid AND "customerId" = ${existing.id}::uuid AND "deletedAt" IS NULL`),
    tx.$queryRaw<Array<{ count: bigint }>>(Prisma.sql`SELECT COUNT(*)::bigint AS count FROM "Invoice" WHERE "shopId" = ${mutation.shopId}::uuid AND "customerId" = ${existing.id}::uuid AND "deletedAt" IS NULL`),
    tx.$queryRaw<Array<{ count: bigint }>>(Prisma.sql`SELECT COUNT(*)::bigint AS count FROM "InstallmentPlan" WHERE "shopId" = ${mutation.shopId}::uuid AND "customerId" = ${existing.id}::uuid AND "deletedAt" IS NULL`),
    tx.$queryRaw<Array<{ count: bigint }>>(Prisma.sql`SELECT COUNT(*)::bigint AS count FROM "DebtLedgerAccount" WHERE "shopId" = ${mutation.shopId}::uuid AND "customerId" = ${existing.id}::uuid`),
  ]);
  const linked = [repairRows, saleRows, invoiceRows, installmentRows, debtRows]
    .reduce((total, result) => total + Number(result[0]?.count ?? 0), 0);
  if (linked > 0) {
    return {
      operationId: mutation.operationId,
      status: "conflict",
      customer: serializeCustomer(existing),
      errorCode: "CUSTOMER_HAS_LINKED_RECORDS",
      errorMessage: "لا يمكن حذف عميل لديه سجلات مرتبطة.",
    };
  }

  const deleted = await tx.$queryRaw<CustomerRow[]>(Prisma.sql`
    UPDATE "Customer"
    SET "deletedAt" = CURRENT_TIMESTAMP,
        "updatedAt" = CURRENT_TIMESTAMP,
        "version" = "version" + 1
    WHERE "id" = ${existing.id}::uuid
    RETURNING *
  `);
  return { operationId: mutation.operationId, status: "applied", customer: serializeCustomer(deleted[0]) };
}

export async function applySyncMutation(input: unknown, auth: { shopId: string; userId: string }) {
  const mutation = syncMutationSchema.parse(input);
  if (mutation.shopId !== auth.shopId || mutation.userId !== auth.userId) {
    throw new Error("بيانات المزامنة لا تطابق جلسة المستخدم الحالية.");
  }

  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw(Prisma.sql`
      INSERT INTO "SyncDevice" ("shopId", "userId", "deviceId", "lastSeenAt", "updatedAt")
      VALUES (${auth.shopId}::uuid, ${auth.userId}::uuid, ${mutation.deviceId}, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      ON CONFLICT ("shopId", "deviceId")
      DO UPDATE SET "userId" = EXCLUDED."userId", "lastSeenAt" = CURRENT_TIMESTAMP, "updatedAt" = CURRENT_TIMESTAMP
    `);

    const inserted = await tx.$executeRaw(Prisma.sql`
      INSERT INTO "SyncMutation" (
        "operationId", "shopId", "userId", "deviceId", "entityType", "entityId",
        "mutationType", "baseVersion", "payload", "status", "clientCreatedAt"
      ) VALUES (
        ${mutation.operationId}::uuid,
        ${auth.shopId}::uuid,
        ${auth.userId}::uuid,
        ${mutation.deviceId},
        ${mutation.entityType},
        ${mutation.entityId}::uuid,
        ${mutation.mutationType},
        ${mutation.baseVersion},
        ${JSON.stringify(mutation.payload)}::jsonb,
        'PROCESSING',
        ${new Date(mutation.createdAt)}
      )
      ON CONFLICT ("operationId") DO NOTHING
    `);

    if (inserted === 0) {
      // operationId is globally unique. Never return a stored result unless it
      // belongs to this exact authenticated tenant/user, otherwise a reused or
      // leaked UUID could expose another shop's mutation result.
      const prior = await tx.$queryRaw<StoredMutationRow[]>(Prisma.sql`
        SELECT "operationId", "status", "result", "errorCode", "errorMessage"
        FROM "SyncMutation"
        WHERE "operationId" = ${mutation.operationId}::uuid
          AND "shopId" = ${auth.shopId}::uuid
          AND "userId" = ${auth.userId}::uuid
        LIMIT 1
      `);
      if (!prior[0]) {
        throw new Error("معرّف عملية المزامنة مستخدم من سياق مختلف.");
      }
      return storedResult(prior[0]);
    }

    let result: SyncMutationResult;
    try {
      result = await applyCustomerMutation(tx, mutation);
    } catch (error) {
      result = {
        operationId: mutation.operationId,
        status: "failed",
        errorCode: "VALIDATION_ERROR",
        errorMessage: error instanceof Error ? error.message : "تعذر تطبيق عملية المزامنة.",
      };
    }

    await tx.$executeRaw(Prisma.sql`
      UPDATE "SyncMutation"
      SET "status" = ${result.status === "applied" ? "APPLIED" : result.status === "conflict" ? "CONFLICT" : "FAILED"},
          "result" = ${JSON.stringify(result)}::jsonb,
          "errorCode" = ${result.errorCode ?? null},
          "errorMessage" = ${result.errorMessage ?? null},
          "appliedAt" = CASE WHEN ${result.status} = 'applied' THEN CURRENT_TIMESTAMP ELSE NULL END
      WHERE "operationId" = ${mutation.operationId}::uuid
    `);

    return result;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 10_000 });
}

export async function pullCustomerChanges(shopId: string, afterSequence: bigint, limit = 500) {
  const rows = await prisma.$queryRaw<Array<{
    sequence: bigint;
    action: string;
    customer: CustomerRow | null;
  }>>(Prisma.sql`
    SELECT sc."sequence",
           sc."action",
           CASE WHEN c."id" IS NULL THEN NULL ELSE jsonb_build_object(
             'id', c."id",
             'shopId', c."shopId",
             'clientGeneratedId', c."clientGeneratedId",
             'name', c."name",
             'phone', c."phone",
             'phoneNormalized', c."phoneNormalized",
             'email', c."email",
             'notes', c."notes",
             'createdAt', c."createdAt",
             'updatedAt', c."updatedAt",
             'deletedAt', c."deletedAt",
             'version', c."version"
           ) END AS customer
    FROM "SyncChange" sc
    LEFT JOIN "Customer" c ON c."id" = sc."entityId" AND c."shopId" = sc."shopId"
    WHERE sc."shopId" = ${shopId}::uuid
      AND sc."entityType" = 'customer'
      AND sc."sequence" > ${afterSequence}
    ORDER BY sc."sequence" ASC
    LIMIT ${Math.min(Math.max(limit, 1), 500)}
  `);

  const changes = rows.map((row) => ({
    sequence: row.sequence.toString(),
    action: row.action,
    customer: row.customer,
  }));
  return {
    changes,
    nextCursor: changes.at(-1)?.sequence ?? afterSequence.toString(),
    hasMore: rows.length >= Math.min(Math.max(limit, 1), 500),
  };
}
