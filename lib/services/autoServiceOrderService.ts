import { randomBytes } from "node:crypto";
import { prisma } from "@/lib/prisma";

export const SERVICE_ORDER_STATUSES = [
  "RECEIVED",
  "INSPECTING",
  "WAITING_CUSTOMER_APPROVAL",
  "APPROVED",
  "IN_SERVICE",
  "WAITING_PARTS",
  "READY_FOR_DELIVERY",
  "DELIVERED",
  "CLOSED",
  "REJECTED",
  "CANCELLED",
] as const;

export type ServiceOrderStatus = (typeof SERVICE_ORDER_STATUSES)[number];

const ALLOWED_TRANSITIONS: Record<ServiceOrderStatus, readonly ServiceOrderStatus[]> = {
  RECEIVED: ["INSPECTING", "CANCELLED"],
  INSPECTING: ["WAITING_CUSTOMER_APPROVAL", "APPROVED", "IN_SERVICE", "CANCELLED"],
  WAITING_CUSTOMER_APPROVAL: ["APPROVED", "REJECTED", "CANCELLED"],
  APPROVED: ["IN_SERVICE", "WAITING_PARTS", "CANCELLED"],
  IN_SERVICE: ["WAITING_PARTS", "READY_FOR_DELIVERY", "CANCELLED"],
  WAITING_PARTS: ["IN_SERVICE", "READY_FOR_DELIVERY", "CANCELLED"],
  READY_FOR_DELIVERY: ["DELIVERED", "IN_SERVICE"],
  DELIVERED: ["CLOSED"],
  CLOSED: [],
  REJECTED: ["CLOSED"],
  CANCELLED: [],
};

const FINAL_STATUSES = new Set<ServiceOrderStatus>(["CLOSED", "CANCELLED", "REJECTED"]);

export type CreateServiceOrderInput = {
  vehicleId: string;
  reportedIssue: string;
  receptionNotes?: string | null;
  exteriorCondition?: string | null;
  keysAndItems?: string | null;
  odometerAtIntake?: number | null;
  fuelLevelPercent?: number | null;
  estimatedTotal?: number | null;
  promisedAt?: Date | string | null;
  receptionistUserId?: string | null;
  assignedToUserId?: string | null;
};

export type ServiceOrderSummary = {
  id: string;
  shopId: string;
  vehicleId: string;
  customerId: string;
  orderNumber: string;
  status: ServiceOrderStatus;
  reportedIssue: string;
  receptionNotes: string | null;
  diagnosis: string | null;
  odometerAtIntake: number | null;
  fuelLevelPercent: string | number | null;
  estimatedTotal: string | number | null;
  finalTotal: string | number | null;
  receivedAt: Date;
  promisedAt: Date | null;
  deliveredAt: Date | null;
  closedAt: Date | null;
  assignedToUserId: string | null;
  customerName: string;
  customerPhone: string | null;
  vehicleMake: string;
  vehicleModel: string;
  vehicleYear: number | null;
  plateNumber: string | null;
  vin: string | null;
};

function emptyToNull(value?: string | null) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function parseOptionalDate(value?: Date | string | null) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error("تاريخ التسليم المتوقع غير صالح.");
  return date;
}

function generateOrderNumber() {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  return `WO-${date}-${randomBytes(3).toString("hex").toUpperCase()}`;
}

function validateCreateInput(input: CreateServiceOrderInput) {
  const reportedIssue = input.reportedIssue.trim();
  if (!input.vehicleId) throw new Error("يجب اختيار المركبة.");
  if (!reportedIssue) throw new Error("شكوى العميل أو سبب دخول المركبة مطلوب.");
  if (input.odometerAtIntake != null && (!Number.isInteger(input.odometerAtIntake) || input.odometerAtIntake < 0)) {
    throw new Error("قراءة العداد غير صالحة.");
  }
  if (input.fuelLevelPercent != null && (input.fuelLevelPercent < 0 || input.fuelLevelPercent > 100)) {
    throw new Error("نسبة الوقود يجب أن تكون بين 0 و100.");
  }
  if (input.estimatedTotal != null && input.estimatedTotal < 0) {
    throw new Error("القيمة التقديرية لا يمكن أن تكون سالبة.");
  }

  return {
    ...input,
    reportedIssue,
    receptionNotes: emptyToNull(input.receptionNotes),
    exteriorCondition: emptyToNull(input.exteriorCondition),
    keysAndItems: emptyToNull(input.keysAndItems),
    promisedAt: parseOptionalDate(input.promisedAt),
  };
}

async function assertActiveShopMember(shopId: string, userId?: string | null) {
  if (!userId) return;
  const member = await prisma.membership.findFirst({
    where: { shopId, userId, status: "ACTIVE", deletedAt: null },
    select: { id: true },
  });
  if (!member) throw new Error("الموظف المحدد غير نشط في هذا المركز.");
}

export async function createServiceOrder(
  shopId: string,
  createdByUserId: string,
  input: CreateServiceOrderInput,
) {
  const data = validateCreateInput(input);
  await Promise.all([
    assertActiveShopMember(shopId, data.receptionistUserId),
    assertActiveShopMember(shopId, data.assignedToUserId),
  ]);

  const orderNumber = generateOrderNumber();

  return prisma.$transaction(async (tx) => {
    const vehicles = await tx.$queryRaw<Array<{ id: string; customerId: string; currentOdometer: number | null }>>`
      SELECT "id", "customerId", "currentOdometer"
      FROM "Vehicle"
      WHERE "id" = ${data.vehicleId}::uuid
        AND "shopId" = ${shopId}::uuid
        AND "deletedAt" IS NULL
      FOR UPDATE
    `;
    const vehicle = vehicles[0];
    if (!vehicle) throw new Error("المركبة غير موجودة في هذا المركز.");

    const rows = await tx.$queryRaw<Array<{
      id: string;
      orderNumber: string;
      status: ServiceOrderStatus;
      vehicleId: string;
      customerId: string;
      receivedAt: Date;
    }>>`
      INSERT INTO "ServiceOrder" (
        "shopId", "vehicleId", "customerId", "orderNumber", "status", "reportedIssue",
        "receptionNotes", "exteriorCondition", "keysAndItems", "odometerAtIntake", "fuelLevelPercent",
        "estimatedTotal", "promisedAt", "receptionistUserId", "assignedToUserId", "createdByUserId", "updatedByUserId"
      ) VALUES (
        ${shopId}::uuid, ${vehicle.id}::uuid, ${vehicle.customerId}::uuid, ${orderNumber}, 'RECEIVED', ${data.reportedIssue},
        ${data.receptionNotes}, ${data.exteriorCondition}, ${data.keysAndItems}, ${data.odometerAtIntake ?? null},
        ${data.fuelLevelPercent ?? null}, ${data.estimatedTotal ?? null}, ${data.promisedAt},
        ${data.receptionistUserId ?? null}::uuid, ${data.assignedToUserId ?? null}::uuid,
        ${createdByUserId}::uuid, ${createdByUserId}::uuid
      )
      RETURNING "id", "orderNumber", "status", "vehicleId", "customerId", "receivedAt"
    `;
    const order = rows[0];

    await tx.$executeRaw`
      INSERT INTO "ServiceOrderStatusHistory" ("shopId", "serviceOrderId", "fromStatus", "toStatus", "createdByUserId")
      VALUES (${shopId}::uuid, ${order.id}::uuid, NULL, 'RECEIVED', ${createdByUserId}::uuid)
    `;

    if (data.odometerAtIntake != null && (vehicle.currentOdometer == null || data.odometerAtIntake > vehicle.currentOdometer)) {
      await tx.$executeRaw`
        UPDATE "Vehicle"
        SET "currentOdometer" = ${data.odometerAtIntake}, "updatedAt" = now(), "version" = "version" + 1
        WHERE "id" = ${vehicle.id}::uuid AND "shopId" = ${shopId}::uuid
      `;
    }

    return order;
  });
}

export async function listServiceOrders(
  shopId: string,
  filters: { status?: ServiceOrderStatus; search?: string; assignedToUserId?: string } = {},
): Promise<ServiceOrderSummary[]> {
  const pattern = filters.search?.trim() ? `%${filters.search.trim()}%` : null;

  return prisma.$queryRaw<ServiceOrderSummary[]>`
    SELECT
      so."id", so."shopId", so."vehicleId", so."customerId", so."orderNumber", so."status",
      so."reportedIssue", so."receptionNotes", so."diagnosis", so."odometerAtIntake", so."fuelLevelPercent",
      so."estimatedTotal", so."finalTotal", so."receivedAt", so."promisedAt", so."deliveredAt", so."closedAt",
      so."assignedToUserId",
      c."name" AS "customerName", c."phone" AS "customerPhone",
      v."make" AS "vehicleMake", v."model" AS "vehicleModel", v."year" AS "vehicleYear",
      v."plateNumber", v."vin"
    FROM "ServiceOrder" so
    JOIN "Vehicle" v ON v."id" = so."vehicleId" AND v."shopId" = so."shopId"
    JOIN "Customer" c ON c."id" = so."customerId" AND c."shopId" = so."shopId"
    WHERE so."shopId" = ${shopId}::uuid
      AND so."deletedAt" IS NULL
      AND (${filters.status ?? null}::text IS NULL OR so."status" = ${filters.status ?? null}::text)
      AND (${filters.assignedToUserId ?? null}::uuid IS NULL OR so."assignedToUserId" = ${filters.assignedToUserId ?? null}::uuid)
      AND (
        ${pattern}::text IS NULL
        OR so."orderNumber" ILIKE ${pattern}::text
        OR so."reportedIssue" ILIKE ${pattern}::text
        OR c."name" ILIKE ${pattern}::text
        OR COALESCE(c."phone", '') ILIKE ${pattern}::text
        OR v."make" ILIKE ${pattern}::text
        OR v."model" ILIKE ${pattern}::text
        OR COALESCE(v."plateNumber", '') ILIKE ${pattern}::text
        OR COALESCE(v."vin", '') ILIKE ${pattern}::text
      )
    ORDER BY so."receivedAt" DESC
    LIMIT 250
  `;
}

export async function getServiceOrderById(shopId: string, serviceOrderId: string) {
  const orders = await prisma.$queryRaw<ServiceOrderSummary[]>`
    SELECT
      so."id", so."shopId", so."vehicleId", so."customerId", so."orderNumber", so."status",
      so."reportedIssue", so."receptionNotes", so."diagnosis", so."odometerAtIntake", so."fuelLevelPercent",
      so."estimatedTotal", so."finalTotal", so."receivedAt", so."promisedAt", so."deliveredAt", so."closedAt",
      so."assignedToUserId",
      c."name" AS "customerName", c."phone" AS "customerPhone",
      v."make" AS "vehicleMake", v."model" AS "vehicleModel", v."year" AS "vehicleYear",
      v."plateNumber", v."vin"
    FROM "ServiceOrder" so
    JOIN "Vehicle" v ON v."id" = so."vehicleId" AND v."shopId" = so."shopId"
    JOIN "Customer" c ON c."id" = so."customerId" AND c."shopId" = so."shopId"
    WHERE so."id" = ${serviceOrderId}::uuid AND so."shopId" = ${shopId}::uuid AND so."deletedAt" IS NULL
    LIMIT 1
  `;
  const order = orders[0];
  if (!order) return null;

  const [history, inspections, laborLines, partLines, quotations, approvals] = await Promise.all([
    prisma.$queryRaw<Array<{ id: string; fromStatus: string | null; toStatus: string; note: string | null; createdAt: Date }>>`
      SELECT "id", "fromStatus", "toStatus", "note", "createdAt"
      FROM "ServiceOrderStatusHistory"
      WHERE "shopId" = ${shopId}::uuid AND "serviceOrderId" = ${serviceOrderId}::uuid
      ORDER BY "createdAt" ASC
    `,
    prisma.$queryRaw<Array<{ id: string; inspectionType: string; status: string; summary: string | null; inspectedAt: Date | null; createdAt: Date }>>`
      SELECT "id", "inspectionType", "status", "summary", "inspectedAt", "createdAt"
      FROM "ServiceInspection"
      WHERE "shopId" = ${shopId}::uuid AND "serviceOrderId" = ${serviceOrderId}::uuid
      ORDER BY "createdAt" DESC
    `,
    prisma.$queryRaw<Array<Record<string, unknown>>>`
      SELECT * FROM "ServiceLaborLine"
      WHERE "shopId" = ${shopId}::uuid AND "serviceOrderId" = ${serviceOrderId}::uuid
      ORDER BY "sortOrder", "createdAt"
    `,
    prisma.$queryRaw<Array<Record<string, unknown>>>`
      SELECT * FROM "ServicePartLine"
      WHERE "shopId" = ${shopId}::uuid AND "serviceOrderId" = ${serviceOrderId}::uuid
      ORDER BY "sortOrder", "createdAt"
    `,
    prisma.$queryRaw<Array<Record<string, unknown>>>`
      SELECT * FROM "Quotation"
      WHERE "shopId" = ${shopId}::uuid AND "serviceOrderId" = ${serviceOrderId}::uuid
      ORDER BY "revision" DESC
    `,
    prisma.$queryRaw<Array<Record<string, unknown>>>`
      SELECT * FROM "CustomerApproval"
      WHERE "shopId" = ${shopId}::uuid AND "serviceOrderId" = ${serviceOrderId}::uuid
      ORDER BY "decidedAt" DESC
    `,
  ]);

  return { ...order, history, inspections, laborLines, partLines, quotations, approvals };
}

export async function updateServiceOrderStatus(
  shopId: string,
  serviceOrderId: string,
  toStatus: ServiceOrderStatus,
  changedByUserId: string,
  note?: string | null,
) {
  if (!SERVICE_ORDER_STATUSES.includes(toStatus)) throw new Error("حالة أمر الصيانة غير معروفة.");

  return prisma.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<Array<{ id: string; status: ServiceOrderStatus }>>`
      SELECT "id", "status"
      FROM "ServiceOrder"
      WHERE "id" = ${serviceOrderId}::uuid
        AND "shopId" = ${shopId}::uuid
        AND "deletedAt" IS NULL
      FOR UPDATE
    `;
    const current = rows[0];
    if (!current) throw new Error("أمر الصيانة غير موجود.");
    if (current.status === toStatus) return current;

    if (!ALLOWED_TRANSITIONS[current.status]?.includes(toStatus)) {
      throw new Error(`لا يمكن نقل أمر الصيانة من ${current.status} إلى ${toStatus}.`);
    }

    const updated = await tx.$queryRaw<Array<{ id: string; status: ServiceOrderStatus }>>`
      UPDATE "ServiceOrder"
      SET "status" = ${toStatus},
          "approvedAt" = CASE WHEN ${toStatus} = 'APPROVED' THEN COALESCE("approvedAt", now()) ELSE "approvedAt" END,
          "startedAt" = CASE WHEN ${toStatus} = 'IN_SERVICE' THEN COALESCE("startedAt", now()) ELSE "startedAt" END,
          "readyAt" = CASE WHEN ${toStatus} = 'READY_FOR_DELIVERY' THEN COALESCE("readyAt", now()) ELSE "readyAt" END,
          "deliveredAt" = CASE WHEN ${toStatus} = 'DELIVERED' THEN COALESCE("deliveredAt", now()) ELSE "deliveredAt" END,
          "closedAt" = CASE WHEN ${toStatus} = 'CLOSED' THEN COALESCE("closedAt", now()) ELSE "closedAt" END,
          "updatedByUserId" = ${changedByUserId}::uuid,
          "updatedAt" = now(),
          "version" = "version" + 1
      WHERE "id" = ${serviceOrderId}::uuid AND "shopId" = ${shopId}::uuid
      RETURNING "id", "status"
    `;

    await tx.$executeRaw`
      INSERT INTO "ServiceOrderStatusHistory" ("shopId", "serviceOrderId", "fromStatus", "toStatus", "note", "createdByUserId")
      VALUES (${shopId}::uuid, ${serviceOrderId}::uuid, ${current.status}, ${toStatus}, ${emptyToNull(note)}, ${changedByUserId}::uuid)
    `;

    return updated[0];
  });
}

async function assertOrderEditable(shopId: string, serviceOrderId: string) {
  const rows = await prisma.$queryRaw<Array<{ status: ServiceOrderStatus }>>`
    SELECT "status" FROM "ServiceOrder"
    WHERE "id" = ${serviceOrderId}::uuid AND "shopId" = ${shopId}::uuid AND "deletedAt" IS NULL
    LIMIT 1
  `;
  if (!rows[0]) throw new Error("أمر الصيانة غير موجود.");
  if (FINAL_STATUSES.has(rows[0].status) || rows[0].status === "DELIVERED") {
    throw new Error("لا يمكن تعديل بنود أمر صيانة منتهي أو ملغى.");
  }
}

export async function addLaborLine(
  shopId: string,
  serviceOrderId: string,
  input: { description: string; technicianUserId?: string | null; hours?: number | null; quantity?: number; unitPrice: number; costAmount?: number | null; notes?: string | null },
) {
  await assertOrderEditable(shopId, serviceOrderId);
  await assertActiveShopMember(shopId, input.technicianUserId);
  const description = input.description.trim();
  const quantity = input.quantity ?? 1;
  if (!description) throw new Error("وصف أجرة العمل مطلوب.");
  if (!(quantity > 0) || !(input.unitPrice >= 0)) throw new Error("الكمية أو سعر العمل غير صالح.");
  if (input.hours != null && input.hours < 0) throw new Error("عدد ساعات العمل غير صالح.");
  if (input.costAmount != null && input.costAmount < 0) throw new Error("تكلفة العمل غير صالحة.");
  const lineTotal = Math.round(quantity * input.unitPrice * 100) / 100;

  const rows = await prisma.$queryRaw<Array<Record<string, unknown>>>`
    INSERT INTO "ServiceLaborLine" (
      "shopId", "serviceOrderId", "description", "technicianUserId", "hours", "quantity", "unitPrice", "costAmount", "lineTotal", "notes"
    ) VALUES (
      ${shopId}::uuid, ${serviceOrderId}::uuid, ${description}, ${input.technicianUserId ?? null}::uuid,
      ${input.hours ?? null}, ${quantity}, ${input.unitPrice}, ${input.costAmount ?? null}, ${lineTotal}, ${emptyToNull(input.notes)}
    )
    RETURNING *
  `;
  return rows[0];
}

export async function addPartLine(
  shopId: string,
  serviceOrderId: string,
  input: { inventoryItemId?: string | null; partName: string; quantity?: number; unitCost?: number | null; unitPrice: number; notes?: string | null },
) {
  await assertOrderEditable(shopId, serviceOrderId);
  const partName = input.partName.trim();
  const quantity = input.quantity ?? 1;
  if (!partName) throw new Error("اسم قطعة الغيار مطلوب.");
  if (!Number.isInteger(quantity) || quantity <= 0) throw new Error("كمية قطعة الغيار غير صالحة.");
  if (input.unitPrice < 0 || (input.unitCost != null && input.unitCost < 0)) throw new Error("سعر أو تكلفة قطعة الغيار غير صالح.");

  if (input.inventoryItemId) {
    const item = await prisma.inventoryItem.findFirst({
      where: { id: input.inventoryItemId, shopId, deletedAt: null },
      select: { id: true },
    });
    if (!item) throw new Error("قطعة المخزون غير موجودة في هذا المركز.");
  }

  const lineTotal = Math.round(quantity * input.unitPrice * 100) / 100;
  const rows = await prisma.$queryRaw<Array<Record<string, unknown>>>`
    INSERT INTO "ServicePartLine" (
      "shopId", "serviceOrderId", "inventoryItemId", "partName", "quantity", "unitCost", "unitPrice", "lineTotal", "notes"
    ) VALUES (
      ${shopId}::uuid, ${serviceOrderId}::uuid, ${input.inventoryItemId ?? null}::uuid, ${partName}, ${quantity},
      ${input.unitCost ?? null}, ${input.unitPrice}, ${lineTotal}, ${emptyToNull(input.notes)}
    )
    RETURNING *
  `;
  return rows[0];
}

export async function createInspection(
  shopId: string,
  serviceOrderId: string,
  inspectorUserId: string,
  input: {
    inspectionType?: "INITIAL" | "FINAL" | "OTHER";
    summary?: string | null;
    items: Array<{ component: string; result: "OK" | "WARNING" | "FAIL" | "NOT_CHECKED"; notes?: string | null; recommendedAction?: string | null; estimatedCost?: number | null }>;
  },
) {
  await assertOrderEditable(shopId, serviceOrderId);
  await assertActiveShopMember(shopId, inspectorUserId);
  if (!input.items.length) throw new Error("أضف بند فحص واحداً على الأقل.");

  return prisma.$transaction(async (tx) => {
    const inspections = await tx.$queryRaw<Array<{ id: string }>>`
      INSERT INTO "ServiceInspection" ("shopId", "serviceOrderId", "inspectionType", "status", "summary", "inspectorUserId", "inspectedAt")
      VALUES (${shopId}::uuid, ${serviceOrderId}::uuid, ${input.inspectionType ?? "INITIAL"}, 'COMPLETED', ${emptyToNull(input.summary)}, ${inspectorUserId}::uuid, now())
      RETURNING "id"
    `;
    const inspectionId = inspections[0].id;

    for (let index = 0; index < input.items.length; index += 1) {
      const item = input.items[index];
      const component = item.component.trim();
      if (!component) throw new Error(`اسم بند الفحص رقم ${index + 1} مطلوب.`);
      if (item.estimatedCost != null && item.estimatedCost < 0) throw new Error(`تكلفة بند الفحص رقم ${index + 1} غير صالحة.`);

      await tx.$executeRaw`
        INSERT INTO "ServiceInspectionItem" (
          "shopId", "inspectionId", "component", "result", "notes", "recommendedAction", "estimatedCost", "sortOrder"
        ) VALUES (
          ${shopId}::uuid, ${inspectionId}::uuid, ${component}, ${item.result}, ${emptyToNull(item.notes)},
          ${emptyToNull(item.recommendedAction)}, ${item.estimatedCost ?? null}, ${index}
        )
      `;
    }

    return { id: inspectionId };
  });
}

export const autoServiceOrderService = {
  createServiceOrder,
  listServiceOrders,
  getServiceOrderById,
  updateServiceOrderStatus,
  addLaborLine,
  addPartLine,
  createInspection,
};
