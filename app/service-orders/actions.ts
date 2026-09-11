"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requirePermission } from "@/lib/auth/context";
import {
  SERVICE_ORDER_STATUSES,
  autoServiceOrderService,
  type ServiceOrderStatus,
} from "@/lib/services/autoServiceOrderService";
import {
  quotationService,
  type ApprovalChannel,
  type ApprovalDecision,
} from "@/lib/services/quotationService";
import { serviceOrderWorkflowService } from "@/lib/services/serviceOrderWorkflowService";
import { servicePartReturnService } from "@/lib/services/servicePartReturnService";

function readString(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

function optionalNumber(value: string) {
  if (!value.trim()) return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) throw new Error("القيمة الرقمية غير صالحة.");
  return parsed;
}

function optionalInteger(value: string) {
  if (!value.trim()) return null;
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) throw new Error("القيمة يجب أن تكون رقماً صحيحاً.");
  return parsed;
}

function parseStatus(value: string): ServiceOrderStatus {
  if (!(SERVICE_ORDER_STATUSES as readonly string[]).includes(value)) {
    throw new Error("حالة أمر الصيانة غير صالحة.");
  }
  return value as ServiceOrderStatus;
}

const createSchema = z.object({
  vehicleId: z.string().uuid(),
  reportedIssue: z.string().trim().min(1, "وصف المشكلة مطلوب").max(4000),
  receptionNotes: z.string().optional(),
  exteriorCondition: z.string().optional(),
  keysAndItems: z.string().optional(),
  promisedAt: z.string().optional(),
  receptionistUserId: z.string().uuid().optional(),
  assignedToUserId: z.string().uuid().optional(),
});

export async function createServiceOrderAction(formData: FormData) {
  const baseInput = createSchema.parse({
    vehicleId: readString(formData, "vehicleId"),
    reportedIssue: readString(formData, "reportedIssue"),
    receptionNotes: readString(formData, "receptionNotes"),
    exteriorCondition: readString(formData, "exteriorCondition"),
    keysAndItems: readString(formData, "keysAndItems"),
    promisedAt: readString(formData, "promisedAt"),
    receptionistUserId: readString(formData, "receptionistUserId") || undefined,
    assignedToUserId: readString(formData, "assignedToUserId") || undefined,
  });

  const auth = await requirePermission("service_orders:create");
  if (baseInput.assignedToUserId) await requirePermission("service_orders:assign");

  const order = await autoServiceOrderService.createServiceOrder(auth.shop.id, auth.user.id, {
    ...baseInput,
    odometerAtIntake: optionalInteger(readString(formData, "odometerAtIntake")),
    fuelLevelPercent: optionalNumber(readString(formData, "fuelLevelPercent")),
    estimatedTotal: optionalNumber(readString(formData, "estimatedTotal")),
    promisedAt: baseInput.promisedAt || null,
  });

  revalidatePath("/service-orders");
  revalidatePath("/vehicles");
  revalidatePath(`/vehicles/${order.vehicleId}`);
  redirect(`/service-orders/${order.id}`);
}

export async function updateServiceOrderStatusAction(formData: FormData) {
  const serviceOrderId = z.string().uuid().parse(readString(formData, "serviceOrderId"));
  const status = parseStatus(readString(formData, "status"));
  const note = readString(formData, "note");
  const auth = await requirePermission("service_orders:update_status");

  await autoServiceOrderService.updateServiceOrderStatus(auth.shop.id, serviceOrderId, status, auth.user.id, note);
  revalidatePath("/service-orders");
  revalidatePath(`/service-orders/${serviceOrderId}`);
  revalidatePath("/vehicles");
}

export async function updateServiceOrderDiagnosisAction(formData: FormData) {
  const serviceOrderId = z.string().uuid().parse(readString(formData, "serviceOrderId"));
  const diagnosis = z.string().max(6000, "التشخيص طويل جداً.").parse(readString(formData, "diagnosis"));
  const auth = await requirePermission("service_orders:update");

  await serviceOrderWorkflowService.updateDiagnosis(auth.shop.id, serviceOrderId, auth.user.id, diagnosis);
  revalidatePath(`/service-orders/${serviceOrderId}`);
  revalidatePath("/service-orders");
  revalidatePath("/vehicles");
}

export async function assignServiceOrderTechnicianAction(formData: FormData) {
  const serviceOrderId = z.string().uuid().parse(readString(formData, "serviceOrderId"));
  const technicianRaw = readString(formData, "technicianUserId");
  const technicianUserId = technicianRaw ? z.string().uuid().parse(technicianRaw) : null;
  const auth = await requirePermission("service_orders:assign");

  await serviceOrderWorkflowService.assignTechnician(
    auth.shop.id,
    serviceOrderId,
    auth.user.id,
    technicianUserId,
  );
  revalidatePath(`/service-orders/${serviceOrderId}`);
  revalidatePath("/service-orders");
}

export async function addServiceLaborLineAction(formData: FormData) {
  const serviceOrderId = z.string().uuid().parse(readString(formData, "serviceOrderId"));
  const description = z.string().trim().min(1).max(1000).parse(readString(formData, "description"));
  const technicianUserId = readString(formData, "technicianUserId") || null;
  if (technicianUserId) z.string().uuid().parse(technicianUserId);
  const auth = await requirePermission("service_orders:update");

  await autoServiceOrderService.addLaborLine(auth.shop.id, serviceOrderId, {
    description,
    technicianUserId,
    hours: optionalNumber(readString(formData, "hours")),
    quantity: optionalNumber(readString(formData, "quantity")) ?? 1,
    unitPrice: optionalNumber(readString(formData, "unitPrice")) ?? 0,
    costAmount: optionalNumber(readString(formData, "costAmount")),
    notes: readString(formData, "notes"),
  });

  revalidatePath(`/service-orders/${serviceOrderId}`);
}

export async function addServicePartLineAction(formData: FormData) {
  const serviceOrderId = z.string().uuid().parse(readString(formData, "serviceOrderId"));
  const inventorySelection = readString(formData, "inventorySelection");
  let inventoryItemId = readString(formData, "inventoryItemId") || null;
  let warehouseId = readString(formData, "warehouseId") || null;

  if (inventorySelection) {
    const [itemId, selectedWarehouseId, ...extra] = inventorySelection.split("|");
    if (!itemId || !selectedWarehouseId || extra.length) throw new Error("اختيار قطعة المخزون غير صالح.");
    inventoryItemId = z.string().uuid().parse(itemId);
    warehouseId = z.string().uuid().parse(selectedWarehouseId);
  } else {
    if (inventoryItemId) inventoryItemId = z.string().uuid().parse(inventoryItemId);
    if (warehouseId) warehouseId = z.string().uuid().parse(warehouseId);
  }

  if (inventoryItemId && !warehouseId) {
    throw new Error("اختر المستودع الذي ستُحجز منه قطعة الغيار قبل إضافتها لأمر الصيانة.");
  }

  const auth = await requirePermission("service_orders:update");
  if (inventoryItemId) await requirePermission("inventory:use_parts");

  await autoServiceOrderService.addPartLine(auth.shop.id, serviceOrderId, {
    inventoryItemId,
    warehouseId,
    partName: readString(formData, "partName"),
    quantity: optionalInteger(readString(formData, "quantity")) ?? 1,
    unitCost: optionalNumber(readString(formData, "unitCost")),
    unitPrice: optionalNumber(readString(formData, "unitPrice")),
    notes: readString(formData, "notes"),
  });

  revalidatePath(`/service-orders/${serviceOrderId}`);
}

export async function returnUsedServicePartAction(formData: FormData) {
  const serviceOrderId = z.string().uuid().parse(readString(formData, "serviceOrderId"));
  const servicePartLineId = z.string().uuid().parse(readString(formData, "servicePartLineId"));
  const note = z.string().trim().max(500, "ملاحظة الإرجاع طويلة جداً.").parse(readString(formData, "note"));
  const auth = await requirePermission("service_orders:update");
  await requirePermission("inventory:use_parts");

  await servicePartReturnService.returnUsedServicePartToInventory(
    auth.shop.id,
    serviceOrderId,
    servicePartLineId,
    auth.user.id,
    note || null,
  );

  revalidatePath(`/service-orders/${serviceOrderId}`);
  revalidatePath("/service-orders");
  revalidatePath("/inventory");
  revalidatePath("/warehouses");
  revalidatePath("/reports");
}

export async function createServiceInspectionAction(formData: FormData) {
  const serviceOrderId = z.string().uuid().parse(readString(formData, "serviceOrderId"));
  const inspectionTypeRaw = readString(formData, "inspectionType") || "INITIAL";
  const inspectionType = z.enum(["INITIAL", "FINAL", "OTHER"]).parse(inspectionTypeRaw);
  const itemsRaw = readString(formData, "items");
  const parsedItems = z.array(z.object({
    component: z.string().trim().min(1).max(500),
    result: z.enum(["OK", "WARNING", "FAIL", "NOT_CHECKED"]),
    notes: z.string().optional().nullable(),
    recommendedAction: z.string().optional().nullable(),
    estimatedCost: z.number().min(0).optional().nullable(),
  })).min(1).parse(JSON.parse(itemsRaw));

  const auth = await requirePermission("service_orders:update");
  await autoServiceOrderService.createInspection(auth.shop.id, serviceOrderId, auth.user.id, {
    inspectionType,
    summary: readString(formData, "summary"),
    items: parsedItems,
  });

  revalidatePath(`/service-orders/${serviceOrderId}`);
}

export async function createQuotationAction(formData: FormData) {
  const serviceOrderId = z.string().uuid().parse(readString(formData, "serviceOrderId"));
  const auth = await requirePermission("quotes:manage");

  const quote = await quotationService.createQuotationFromServiceOrder(auth.shop.id, serviceOrderId, auth.user.id, {
    discountTotal: optionalNumber(readString(formData, "discountTotal")) ?? 0,
    taxTotal: optionalNumber(readString(formData, "taxTotal")) ?? 0,
    validUntil: readString(formData, "validUntil") || null,
    notes: readString(formData, "notes"),
  });

  revalidatePath(`/service-orders/${serviceOrderId}`);
  redirect(`/quotations/${quote.id}`);
}

export async function markQuotationSentAction(formData: FormData) {
  const quotationId = z.string().uuid().parse(readString(formData, "quotationId"));
  const serviceOrderId = z.string().uuid().parse(readString(formData, "serviceOrderId"));
  const auth = await requirePermission("quotes:manage");
  await quotationService.markQuotationSent(auth.shop.id, quotationId, auth.user.id);
  revalidatePath(`/quotations/${quotationId}`);
  revalidatePath(`/service-orders/${serviceOrderId}`);
}

export async function recordCustomerApprovalAction(formData: FormData) {
  const quotationId = z.string().uuid().parse(readString(formData, "quotationId"));
  const serviceOrderId = z.string().uuid().parse(readString(formData, "serviceOrderId"));
  const decision = z.enum(["APPROVED", "PARTIALLY_APPROVED", "REJECTED"]).parse(readString(formData, "decision")) as ApprovalDecision;
  const channel = z.enum(["IN_PERSON", "PHONE", "WHATSAPP", "WEB", "OTHER"]).parse(readString(formData, "channel") || "IN_PERSON") as ApprovalChannel;
  const approvedLineIds = readString(formData, "approvedLineIds").split(",").map((v) => v.trim()).filter(Boolean);
  const rejectedLineIds = readString(formData, "rejectedLineIds").split(",").map((v) => v.trim()).filter(Boolean);
  approvedLineIds.forEach((id) => z.string().uuid().parse(id));
  rejectedLineIds.forEach((id) => z.string().uuid().parse(id));

  const auth = await requirePermission("quotes:manage");
  await quotationService.recordCustomerApproval(auth.shop.id, quotationId, auth.user.id, {
    decision,
    channel,
    approvedLineIds,
    rejectedLineIds,
    note: readString(formData, "note"),
  });

  revalidatePath(`/quotations/${quotationId}`);
  revalidatePath(`/service-orders/${serviceOrderId}`);
  revalidatePath("/service-orders");
}
