"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requirePermission } from "@/lib/auth/context";
import {
  POST_DELIVERY_PART_DISPOSITIONS,
  POST_DELIVERY_PART_REASON_CODES,
  postDeliveryPartCorrectionService,
} from "@/lib/services/postDeliveryPartCorrectionService";

function readString(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

function errorMessage(error: unknown) {
  if (error instanceof z.ZodError) return error.issues[0]?.message ?? "البيانات غير صحيحة.";
  if (error instanceof Error) return error.message;
  return "حدث خطأ غير متوقع.";
}

const correctionSchema = z.object({
  serviceOrderId: z.string().uuid(),
  servicePartLineId: z.string().uuid(),
  reasonCode: z.enum(POST_DELIVERY_PART_REASON_CODES),
  inventoryDisposition: z.enum(POST_DELIVERY_PART_DISPOSITIONS),
  quantity: z.coerce.number().int().positive("كمية التصحيح يجب أن تكون أكبر من صفر."),
  reason: z.string().trim().min(3, "اكتب سبب التصحيح بوضوح.").max(1000),
  notes: z.string().trim().max(2000).optional(),
  creditNoteId: z.string().uuid().optional().or(z.literal("")),
});

export async function createPostDeliveryPartCorrectionAction(formData: FormData) {
  const rawOrderId = readString(formData, "serviceOrderId");
  let serviceOrderId = rawOrderId;

  try {
    const input = correctionSchema.parse({
      serviceOrderId: rawOrderId,
      servicePartLineId: readString(formData, "servicePartLineId"),
      reasonCode: readString(formData, "reasonCode"),
      inventoryDisposition: readString(formData, "inventoryDisposition"),
      quantity: readString(formData, "quantity"),
      reason: readString(formData, "reason"),
      notes: readString(formData, "notes"),
      creditNoteId: readString(formData, "creditNoteId"),
    });
    serviceOrderId = input.serviceOrderId;

    const auth = await requirePermission("service_orders:update");
    if (input.inventoryDisposition === "RETURN_TO_STOCK") {
      await requirePermission("inventory:use_parts");
    }
    if (input.creditNoteId) {
      await requirePermission("invoices:credit");
    }

    await postDeliveryPartCorrectionService.createPostDeliveryPartCorrection(
      auth.shop.id,
      input.serviceOrderId,
      auth.user.id,
      {
        servicePartLineId: input.servicePartLineId,
        reasonCode: input.reasonCode,
        inventoryDisposition: input.inventoryDisposition,
        quantity: input.quantity,
        reason: input.reason,
        notes: input.notes || null,
        creditNoteId: input.creditNoteId || null,
      },
    );

    revalidatePath(`/service-orders/${input.serviceOrderId}`);
    revalidatePath("/service-orders");
    revalidatePath("/vehicles");
    revalidatePath("/inventory");
    revalidatePath("/warehouses");
    revalidatePath("/reports");
    revalidatePath("/invoices");
  } catch (error) {
    if (serviceOrderId && z.string().uuid().safeParse(serviceOrderId).success) {
      redirect(`/service-orders/${serviceOrderId}?partCorrectionError=${encodeURIComponent(errorMessage(error))}`);
    }
    throw error;
  }

  redirect(`/service-orders/${serviceOrderId}?partCorrectionSuccess=1`);
}
