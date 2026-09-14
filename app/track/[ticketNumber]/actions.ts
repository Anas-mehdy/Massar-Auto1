"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { publicQuotationApprovalService } from "@/lib/services/publicQuotationApprovalService";

export type PublicQuotationApprovalState = {
  error: string | null;
};

const baseSchema = z.object({
  quotationId: z.string().uuid(),
  serviceOrderId: z.string().uuid(),
  approvalToken: z.string().regex(/^[0-9a-f]{64}$/i),
  customerPhone: z.string().trim().min(8).max(40),
  intent: z.enum(["APPROVE_SELECTED", "REJECT_ALL"]),
  note: z.string().trim().max(1000).optional(),
  confirmed: z.literal("yes"),
});

export async function submitPublicQuotationDecision(
  _previousState: PublicQuotationApprovalState,
  formData: FormData,
): Promise<PublicQuotationApprovalState> {
  const parsed = baseSchema.safeParse({
    quotationId: formData.get("quotationId"),
    serviceOrderId: formData.get("serviceOrderId"),
    approvalToken: formData.get("approvalToken"),
    customerPhone: formData.get("customerPhone"),
    intent: formData.get("intent"),
    note: formData.get("note") || undefined,
    confirmed: formData.get("confirmed"),
  });

  if (!parsed.success) {
    return { error: "تأكد من رقم الجوال، وحدد قرارك، ثم فعّل مربع تأكيد الاعتماد." };
  }

  const approvedLineIds = formData
    .getAll("approvedLineIds")
    .filter((value): value is string => typeof value === "string")
    .map((value) => value.trim())
    .filter(Boolean);

  if (approvedLineIds.length > 100) {
    return { error: "عدد البنود المحددة غير صالح." };
  }

  for (const id of approvedLineIds) {
    if (!z.string().uuid().safeParse(id).success) {
      return { error: "أحد بنود عرض السعر غير صالح." };
    }
  }

  let result: Awaited<ReturnType<typeof publicQuotationApprovalService.recordPublicQuotationDecision>>;
  try {
    result = await publicQuotationApprovalService.recordPublicQuotationDecision({
      quotationId: parsed.data.quotationId,
      serviceOrderId: parsed.data.serviceOrderId,
      approvalToken: parsed.data.approvalToken,
      customerPhone: parsed.data.customerPhone,
      intent: parsed.data.intent,
      approvedLineIds: Array.from(new Set(approvedLineIds)),
      note: parsed.data.note || null,
    });
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "تعذر تسجيل قرارك الآن. حاول مرة أخرى أو تواصل مع المركز.",
    };
  }

  revalidatePath(`/track/${parsed.data.serviceOrderId}`);
  revalidatePath(`/service-orders/${parsed.data.serviceOrderId}`);
  revalidatePath("/service-orders");
  redirect(`/track/${parsed.data.serviceOrderId}?approval=${encodeURIComponent(result.decision)}`);
}
