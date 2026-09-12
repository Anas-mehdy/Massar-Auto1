import { randomBytes } from "node:crypto";
import { prisma } from "@/lib/prisma";
import {
  approvePlannedServiceLinesInTx,
  completeServiceWorkInTx,
  consumeServiceOrderPartsInTx,
  markServiceWorkInProgressInTx,
  releaseServiceOrderReservationsInTx,
  reserveServiceOrderPartsInTx,
} from "@/lib/services/servicePartInventoryService";

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
  WAITING_CUSTOMER_APPROVAL: ["CANCELLED"],
  APPROVED: ["IN_SERVICE", "WAITING_PARTS", "CANCELLED"],
  IN_SERVICE: ["WAITING_PARTS", "READY_FOR_DELIVERY", "CANCELLED"],
  WAITING_PARTS: ["IN_SERVICE", "READY_FOR_DELIVERY", "CANCELLED"],
  READY_FOR_DELIVERY: ["IN_SERVICE"],
  DELIVERED: [],
  CLOSED: [],
  REJECTED: [],
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

async function assertActiveTechnician(shopId: string, userId?: string | null) {
  if (!userId) return;
  const member = await prisma.membership.findFirst({
    where: {
      shopId,
      userId,
      status: "ACTIVE",
      role: "TECHNICIAN",
      deletedAt: null,
      user: { is: { deletedAt: null } },
    },
    select: { id: true },
  });
  if (!member) throw new Error("الموظف المحدد ليس فني صيانة نشطاً في هذا المركز.");
}

export async function createServiceOrder(
  shopId: string,
  createdByUserId: string,
  input: CreateServiceOrderInput,
) {
  const data = validateCreateInput(input);
  await Promise.all([
    assertActiveShopMember(shopId, data.receptionistUserId),
    assertActiveTechnician(shopId, data.assignedToUserId),
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

function mapServiceOrderSummary(row: {
  id: string;
  shopId: string;
  vehicleId: string;
  customerId: string;
  orderNumber: string;
  status: string;
  reportedIssue: string;
  receptionNotes: string | null;
  diagnosis: string | null;
  odometerAtIntake: number | null;
  fuelLevelPercent: unknown;
  estimatedTotal: unknown;
  finalTotal: unknown;
  receivedAt: Date;
  promisedAt: Date | null;
  deliveredAt: Date | null;
  closedAt: Date | null;
  assignedToUserId: string | null;
  customer: { name: string; phone: string | null };
  vehicle: { make: string; model: string; year: number | null; plateNumber: string | null; vin: string | null };
}): ServiceOrderSummary {
  return {
    id: row.id,
    shopId: row.shopId,
    vehicleId: row.vehicleId,
    customerId: row.customerId,
    orderNumber: row.orderNumber,
    status: row.status as ServiceOrderStatus,
    reportedIssue: row.reportedIssue,
    receptionNotes: row.receptionNotes,
    diagnosis: row.diagnosis,
    odometerAtIntake: row.odometerAtIntake,
    fuelLevelPercent: row.fuelLevelPercent == null ? null : Number(row.fuelLevelPercent),
    estimatedTotal: row.estimatedTotal == null ? null : Number(row.estimatedTotal),
    finalTotal: row.finalTotal == null ? null : Number(row.finalTotal),
    receivedAt: row.receivedAt,
    promisedAt: row.promisedAt,
    deliveredAt: row.deliveredAt,
    closedAt: row.closedAt,
    assignedToUserId: row.assignedToUserId,
    customerName: row.customer.name,
    customerPhone: row.customer.phone,
    vehicleMake: row.vehicle.make,
    vehicleModel: row.vehicle.model,
    vehicleYear: row.vehicle.year,
    plateNumber: row.vehicle.plateNumber,
    vin: row.vehicle.vin,
  };
}

const serviceOrderSummarySelect = {
  id: true,
  shopId: true,
  vehicleId: true,
  customerId: true,
  orderNumber: true,
  status: true,
  reportedIssue: true,
  receptionNotes: true,
  diagnosis: true,
  odometerAtIntake: true,
  fuelLevelPercent: true,
  estimatedTotal: true,
  finalTotal: true,
  receivedAt: true,
  promisedAt: true,
  deliveredAt: true,
  closedAt: true,
  assignedToUserId: true,
  customer: { select: { name: true, phone: true } },
  vehicle: { select: { make: true, model: true, year: true, plateNumber: true, vin: true } },
} as const;

export async function listServiceOrders(
  shopId: string,
  filters: { status?: ServiceOrderStatus; search?: string; assignedToUserId?: string } = {},
): Promise<ServiceOrderSummary[]> {
  const search = filters.search?.trim();
  const orders = await prisma.serviceOrder.findMany({
    where: {
      shopId,
      deletedAt: null,
      customer: { shopId },
      ...(filters.status ? { status: filters.status } : {}),
      ...(filters.assignedToUserId ? { assignedToUserId: filters.assignedToUserId } : {}),
      ...(search
        ? {
            OR: [
              { orderNumber: { contains: search, mode: "insensitive" } },
              { reportedIssue: { contains: search, mode: "insensitive" } },
              { customer: { name: { contains: search, mode: "insensitive" } } },
              { customer: { phone: { contains: search, mode: "insensitive" } } },
              { vehicle: { make: { contains: search, mode: "insensitive" } } },
              { vehicle: { model: { contains: search, mode: "insensitive" } } },
              { vehicle: { plateNumber: { contains: search, mode: "insensitive" } } },
              { vehicle: { vin: { contains: search, mode: "insensitive" } } },
            ],
          }
        : {}),
    },
    select: serviceOrderSummarySelect,
    orderBy: { receivedAt: "desc" },
    take: 250,
  });

  return orders.map(mapServiceOrderSummary);
}

export async function getServiceOrderById(shopId: string, serviceOrderId: string) {
  const row = await prisma.serviceOrder.findFirst({
    where: {
      id: serviceOrderId,
      shopId,
      deletedAt: null,
      customer: { shopId },
    },
    select: serviceOrderSummarySelect,
  });
  if (!row) return null;
  const order = mapServiceOrderSummary(row);

  const [history, inspections, laborLines, partLines, quotations, approvals] = await Promise.all([
    prisma.serviceOrderStatusHistory.findMany({
      where: { shopId, serviceOrderId },
      select: { id: true, fromStatus: true, toStatus: true, note: true, createdAt: true },
      orderBy: { createdAt: "asc" },
    }),
    prisma.serviceInspection.findMany({
      where: { shopId, serviceOrderId },
      select: { id: true, inspectionType: true, status: true, summary: true, inspectedAt: true, createdAt: true },
      orderBy: { createdAt: "desc" },
    }),
    prisma.serviceLaborLine.findMany({
      where: { shopId, serviceOrderId },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    }).then((rows) => rows.map((row) => ({
      ...row,
      hours: row.hours == null ? null : Number(row.hours),
      quantity: Number(row.quantity),
      unitPrice: Number(row.unitPrice),
      costAmount: row.costAmount == null ? null : Number(row.costAmount),
      lineTotal: Number(row.lineTotal),
    }))),
    prisma.servicePartLine.findMany({
      where: { shopId, serviceOrderId },
      select: {
        id: true,
        shopId: true,
        serviceOrderId: true,
        inventoryItemId: true,
        partName: true,
        quantity: true,
        unitCost: true,
        unitPrice: true,
        lineTotal: true,
        status: true,
        notes: true,
        sortOrder: true,
        createdAt: true,
        updatedAt: true,
        warehouseId: true,
        warehouse: { select: { name: true } },
        inventoryItem: { select: { shopId: true, sku: true, barcode: true } },
      },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    }).then((rows) => rows.map(({ warehouse, inventoryItem, ...line }) => {
      const sameShopInventory = inventoryItem?.shopId === line.shopId ? inventoryItem : null;
      return {
        ...line,
        unitCost: line.unitCost == null ? null : Number(line.unitCost),
        unitPrice: Number(line.unitPrice),
        lineTotal: Number(line.lineTotal),
        warehouseName: warehouse?.name ?? null,
        sku: sameShopInventory?.sku ?? null,
        barcode: sameShopInventory?.barcode ?? null,
      };
    })),
    prisma.quotation.findMany({
      where: { shopId, serviceOrderId },
      orderBy: { revision: "desc" },
    }).then((rows) => rows.map((row) => ({
      ...row,
      subtotal: Number(row.subtotal),
      discountTotal: Number(row.discountTotal),
      taxTotal: Number(row.taxTotal),
      total: Number(row.total),
    }))),
    prisma.customerApproval.findMany({
      where: { shopId, serviceOrderId },
      orderBy: { decidedAt: "desc" },
    }),
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

    if (toStatus === "DELIVERED" || toStatus === "CLOSED") {
      throw new Error("استخدم إجراء تسليم المركبة أو إغلاق أمر الصيانة المخصص لضمان الفاتورة وسجل التدقيق.");
    }

    if (!ALLOWED_TRANSITIONS[current.status]?.includes(toStatus)) {
      throw new Error(`لا يمكن نقل أمر الصيانة من ${current.status} إلى ${toStatus}.`);
    }

    if (!["READY_FOR_DELIVERY", "DELIVERED", "CLOSED"].includes(toStatus)) {
      const activeInvoice = await tx.invoice.findFirst({
        where: {
          shopId,
          serviceOrderId,
          deletedAt: null,
          status: { not: "VOID" },
        },
        select: { id: true },
      });
      if (activeInvoice) {
        throw new Error("لا يمكن إعادة أمر الصيانة إلى مرحلة تنفيذية أو إلغائه مع وجود فاتورة فعالة. ألغِ الفاتورة أولاً ثم أعد فتح العمل.");
      }
    }

    let effectiveStatus: ServiceOrderStatus = toStatus;
    let lifecycleNote = emptyToNull(note);

    if (toStatus === "APPROVED") {
      await approvePlannedServiceLinesInTx(tx, shopId, serviceOrderId);
      const missing = await reserveServiceOrderPartsInTx(tx, shopId, serviceOrderId);
      if (missing.length) {
        effectiveStatus = "WAITING_PARTS";
        const shortage = missing
          .map((part) => `${part.partName}: مطلوب ${part.requiredQuantity}، متاح ${part.availableQuantity}`)
          .join("؛ ");
        lifecycleNote = [lifecycleNote, `بانتظار قطع — ${shortage}`].filter(Boolean).join(" • ");
      }
    }

    if (toStatus === "IN_SERVICE") {
      await approvePlannedServiceLinesInTx(tx, shopId, serviceOrderId);
      await consumeServiceOrderPartsInTx(tx, shopId, serviceOrderId, changedByUserId);
      await markServiceWorkInProgressInTx(tx, shopId, serviceOrderId);
    }

    if (toStatus === "READY_FOR_DELIVERY") {
      await approvePlannedServiceLinesInTx(tx, shopId, serviceOrderId);
      await consumeServiceOrderPartsInTx(tx, shopId, serviceOrderId, changedByUserId);
      await completeServiceWorkInTx(tx, shopId, serviceOrderId);
    }

    if (toStatus === "CANCELLED" || toStatus === "REJECTED") {
      await releaseServiceOrderReservationsInTx(tx, shopId, serviceOrderId);
    }

    if (toStatus === "CANCELLED") {
      await tx.quotation.updateMany({
        where: {
          shopId,
          serviceOrderId,
          status: { in: ["DRAFT", "SENT"] },
        },
        data: { status: "EXPIRED", updatedAt: new Date() },
      });
    }

    const updated = await tx.$queryRaw<Array<{ id: string; status: ServiceOrderStatus }>>`
      UPDATE "ServiceOrder"
      SET "status" = ${effectiveStatus},
          "approvedAt" = CASE WHEN ${toStatus} = 'APPROVED' THEN COALESCE("approvedAt", now()) ELSE "approvedAt" END,
          "startedAt" = CASE WHEN ${effectiveStatus} = 'IN_SERVICE' THEN COALESCE("startedAt", now()) ELSE "startedAt" END,
          "readyAt" = CASE WHEN ${effectiveStatus} = 'READY_FOR_DELIVERY' THEN COALESCE("readyAt", now()) ELSE "readyAt" END,
          "deliveredAt" = CASE WHEN ${effectiveStatus} = 'DELIVERED' THEN COALESCE("deliveredAt", now()) ELSE "deliveredAt" END,
          "closedAt" = CASE WHEN ${effectiveStatus} = 'CLOSED' THEN COALESCE("closedAt", now()) ELSE "closedAt" END,
          "updatedByUserId" = ${changedByUserId}::uuid,
          "updatedAt" = now(),
          "version" = "version" + 1
      WHERE "id" = ${serviceOrderId}::uuid AND "shopId" = ${shopId}::uuid
      RETURNING "id", "status"
    `;

    await tx.$executeRaw`
      INSERT INTO "ServiceOrderStatusHistory" ("shopId", "serviceOrderId", "fromStatus", "toStatus", "note", "createdByUserId")
      VALUES (${shopId}::uuid, ${serviceOrderId}::uuid, ${current.status}, ${effectiveStatus}, ${lifecycleNote}, ${changedByUserId}::uuid)
    `;

    return updated[0];
  });
}

async function assertOrderEditable(shopId: string, serviceOrderId: string) {
  const order = await prisma.serviceOrder.findFirst({
    where: { id: serviceOrderId, shopId, deletedAt: null },
    select: { status: true },
  });
  if (!order) throw new Error("أمر الصيانة غير موجود.");
  const status = order.status as ServiceOrderStatus;
  if (FINAL_STATUSES.has(status) || status === "DELIVERED") {
    throw new Error("لا يمكن تعديل بنود أمر صيانة منتهي أو ملغى.");
  }
}

export async function addLaborLine(
  shopId: string,
  serviceOrderId: string,
  input: { description: string; technicianUserId?: string | null; hours?: number | null; quantity?: number; unitPrice: number; costAmount?: number | null; notes?: string | null },
) {
  await assertOrderEditable(shopId, serviceOrderId);
  await assertActiveTechnician(shopId, input.technicianUserId);
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
  input: {
    inventoryItemId?: string | null;
    warehouseId?: string | null;
    partName?: string | null;
    quantity?: number;
    unitCost?: number | null;
    unitPrice?: number | null;
    notes?: string | null;
  },
) {
  await assertOrderEditable(shopId, serviceOrderId);
  const quantity = input.quantity ?? 1;
  if (!Number.isInteger(quantity) || quantity <= 0) throw new Error("كمية قطعة الغيار غير صالحة.");
  if (input.unitPrice != null && input.unitPrice < 0) throw new Error("سعر قطعة الغيار غير صالح.");
  if (input.unitCost != null && input.unitCost < 0) throw new Error("تكلفة قطعة الغيار غير صالحة.");

  let partName = input.partName?.trim() ?? "";
  let unitPrice = input.unitPrice ?? null;
  let unitCost = input.unitCost ?? null;
  let warehouseId = input.warehouseId ?? null;

  if (input.inventoryItemId) {
    const items = await prisma.$queryRaw<Array<{
      id: string;
      name: string;
      unitPrice: number;
      unitCost: number | null;
    }>>`
      SELECT "id", "name", "unitPrice"::double precision AS "unitPrice",
             "unitCost"::double precision AS "unitCost"
      FROM "InventoryItem"
      WHERE "id" = ${input.inventoryItemId}::uuid
        AND "shopId" = ${shopId}::uuid
        AND "deletedAt" IS NULL
      LIMIT 1
    `;
    const item = items[0];
    if (!item) throw new Error("قطعة المخزون غير موجودة في هذا المركز.");

    if (warehouseId) {
      const warehouses = await prisma.$queryRaw<Array<{ id: string; averageCost: number | null }>>`
        SELECT w."id", COALESCE(ws."averageCost", i."unitCost")::double precision AS "averageCost"
        FROM "Warehouse" w
        JOIN "InventoryItem" i ON i."id" = ${input.inventoryItemId}::uuid AND i."shopId" = w."shopId"
        LEFT JOIN "WarehouseStock" ws
          ON ws."shopId" = w."shopId"
         AND ws."warehouseId" = w."id"
         AND ws."inventoryItemId" = i."id"
        WHERE w."id" = ${warehouseId}::uuid
          AND w."shopId" = ${shopId}::uuid
          AND w."deletedAt" IS NULL
          AND w."isActive" = true
        LIMIT 1
      `;
      if (!warehouses[0]) throw new Error("المستودع المحدد غير موجود أو غير نشط.");
      unitCost = unitCost ?? warehouses[0].averageCost;
    } else {
      const defaults = await prisma.$queryRaw<Array<{ id: string; averageCost: number | null }>>`
        SELECT w."id", COALESCE(ws."averageCost", i."unitCost")::double precision AS "averageCost"
        FROM "Warehouse" w
        JOIN "InventoryItem" i ON i."id" = ${input.inventoryItemId}::uuid AND i."shopId" = w."shopId"
        LEFT JOIN "WarehouseStock" ws
          ON ws."shopId" = w."shopId"
         AND ws."warehouseId" = w."id"
         AND ws."inventoryItemId" = i."id"
        WHERE w."shopId" = ${shopId}::uuid
          AND w."deletedAt" IS NULL
          AND w."isActive" = true
        ORDER BY w."isDefault" DESC, COALESCE(ws."quantity" - ws."reservedQuantity", 0) DESC, w."name" ASC
        LIMIT 1
      `;
      if (defaults[0]) {
        warehouseId = defaults[0].id;
        unitCost = unitCost ?? defaults[0].averageCost;
      }
    }

    partName = partName || item.name;
    unitPrice = unitPrice ?? item.unitPrice;
    unitCost = unitCost ?? item.unitCost;
  }

  if (!partName) throw new Error("اسم قطعة الغيار مطلوب.");
  if (unitPrice == null || unitPrice < 0) throw new Error("سعر بيع قطعة الغيار مطلوب وغير صالح.");

  const lineTotal = Math.round(quantity * unitPrice * 100) / 100;
  const rows = await prisma.$queryRaw<Array<Record<string, unknown>>>`
    INSERT INTO "ServicePartLine" (
      "shopId", "serviceOrderId", "inventoryItemId", "warehouseId", "partName", "quantity", "unitCost", "unitPrice", "lineTotal", "notes"
    ) VALUES (
      ${shopId}::uuid, ${serviceOrderId}::uuid, ${input.inventoryItemId ?? null}::uuid, ${warehouseId}::uuid, ${partName}, ${quantity},
      ${unitCost}, ${unitPrice}, ${lineTotal}, ${emptyToNull(input.notes)}
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
