"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requirePermission } from "@/lib/auth/context";
import { serviceDeliveryService } from "@/lib/services/serviceDeliveryService";

function readString(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

function optionalInteger(value: string) {
  if (!value.trim()) return null;
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) throw new Error("قراءة العداد يجب أن تكون رقماً صحيحاً.");
  return parsed;
}

export async function deliverServiceOrderAction(formData: FormData) {
  const serviceOrderId = z.string().uuid().parse(readString(formData, "serviceOrderId"));
  const deliveryNotes = z.string().trim().max(2000, "ملاحظات التسليم طويلة جداً.").parse(readString(formData, "deliveryNotes"));
  const odometerAtDelivery = optionalInteger(readString(formData, "odometerAtDelivery"));
  const auth = await requirePermission("service_orders:update_status");

  await serviceDeliveryService.deliverServiceOrder(
    auth.shop.id,
    serviceOrderId,
    auth.user.id,
    { odometerAtDelivery, deliveryNotes: deliveryNotes || null },
  );

  revalidatePath("/service-orders");
  revalidatePath(`/service-orders/${serviceOrderId}`);
  revalidatePath("/vehicles");
  revalidatePath("/invoices");
}

export async function closeServiceOrderAction(formData: FormData) {
  const serviceOrderId = z.string().uuid().parse(readString(formData, "serviceOrderId"));
  const resolutionNotes = z.string().trim().max(3000, "ملاحظة الإغلاق طويلة جداً.").parse(readString(formData, "resolutionNotes"));
  const auth = await requirePermission("service_orders:update_status");

  await serviceDeliveryService.closeServiceOrder(
    auth.shop.id,
    serviceOrderId,
    auth.user.id,
    resolutionNotes || null,
  );

  revalidatePath("/service-orders");
  revalidatePath(`/service-orders/${serviceOrderId}`);
  revalidatePath("/vehicles");
  revalidatePath("/invoices");
}
