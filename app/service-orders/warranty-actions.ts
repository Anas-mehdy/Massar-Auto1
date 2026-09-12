"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requirePermission } from "@/lib/auth/context";
import {
  WARRANTY_CLAIM_TYPES,
  serviceWarrantyClaimService,
} from "@/lib/services/serviceWarrantyClaimService";

const COVERAGE_DECISIONS = ["COVERED", "PARTIAL", "CUSTOMER_PAY", "NOT_APPLICABLE"] as const;

function readString(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

function optionalNumber(value: string) {
  if (!value.trim()) return null;
  const number = Number(value);
  if (!Number.isFinite(number)) throw new Error("القيمة الرقمية غير صالحة.");
  return number;
}

function errorMessage(error: unknown) {
  if (error instanceof z.ZodError) return error.issues[0]?.message ?? "البيانات غير صحيحة.";
  if (error instanceof Error) return error.message;
  return "حدث خطأ غير متوقع.";
}

function claimUrl(serviceOrderId: string, key?: "warrantySuccess" | "warrantyError", value?: string) {
  const base = `/service-orders/${serviceOrderId}/warranty`;
  return key && value ? `${base}?${key}=${encodeURIComponent(value)}` : base;
}

function revalidateWarrantyPaths(serviceOrderId: string) {
  revalidatePath(`/service-orders/${serviceOrderId}`);
  revalidatePath(`/service-orders/${serviceOrderId}/warranty`);
  revalidatePath("/service-orders");
  revalidatePath("/vehicles");
  revalidatePath("/reports");
}

const createClaimSchema = z.object({
  serviceOrderId: z.string().uuid(),
  claimType: z.enum(WARRANTY_CLAIM_TYPES),
  reportedIssue: z.string().trim().min(3, "اكتب سبب عودة المركبة بوضوح.").max(4000),
  notes: z.string().trim().max(2000).optional(),
  warrantyEndsAt: z.string().optional(),
  scope: z.string().optional(),
});

export async function createWarrantyClaimAction(formData: FormData) {
  const rawOrderId = readString(formData, "serviceOrderId");
  let serviceOrderId = rawOrderId;
  try {
    const input = createClaimSchema.parse({
      serviceOrderId: rawOrderId,
      claimType: readString(formData, "claimType"),
      reportedIssue: readString(formData, "reportedIssue"),
      notes: readString(formData, "notes"),
      warrantyEndsAt: readString(formData, "warrantyEndsAt"),
      scope: readString(formData, "scope"),
    });
    serviceOrderId = input.serviceOrderId;
    const auth = await requirePermission("service_orders:update");

    let originalServicePartLineId: string | null = null;
    let originalServiceLaborLineId: string | null = null;
    if (input.scope?.startsWith("PART:")) originalServicePartLineId = input.scope.slice(5);
    if (input.scope?.startsWith("LABOR:")) originalServiceLaborLineId = input.scope.slice(6);
    if (originalServicePartLineId && !z.string().uuid().safeParse(originalServicePartLineId).success) throw new Error("بند القطعة المحدد غير صالح.");
    if (originalServiceLaborLineId && !z.string().uuid().safeParse(originalServiceLaborLineId).success) throw new Error("بند العمل المحدد غير صالح.");

    await serviceWarrantyClaimService.createWarrantyClaim(auth.shop.id, input.serviceOrderId, auth.user.id, {
      claimType: input.claimType,
      reportedIssue: input.reportedIssue,
      notes: input.notes || null,
      warrantyEndsAt: input.warrantyEndsAt || null,
      originalServicePartLineId,
      originalServiceLaborLineId,
    });
    revalidateWarrantyPaths(input.serviceOrderId);
  } catch (error) {
    if (z.string().uuid().safeParse(serviceOrderId).success) redirect(claimUrl(serviceOrderId, "warrantyError", errorMessage(error)));
    throw error;
  }
  redirect(claimUrl(serviceOrderId, "warrantySuccess", "تم فتح المطالبة بنجاح."));
}

const decisionSchema = z.object({
  serviceOrderId: z.string().uuid(),
  claimId: z.string().uuid(),
  decision: z.enum(["APPROVED", "REJECTED"]),
  coverageDecision: z.enum(COVERAGE_DECISIONS),
  assessment: z.string().trim().min(3, "اكتب نتيجة تقييم المطالبة.").max(4000),
  customerCharge: z.string().optional(),
});

export async function decideWarrantyClaimAction(formData: FormData) {
  const rawOrderId = readString(formData, "serviceOrderId");
  let serviceOrderId = rawOrderId;
  try {
    const input = decisionSchema.parse({
      serviceOrderId: rawOrderId,
      claimId: readString(formData, "claimId"),
      decision: readString(formData, "decision"),
      coverageDecision: readString(formData, "coverageDecision"),
      assessment: readString(formData, "assessment"),
      customerCharge: readString(formData, "customerCharge"),
    });
    serviceOrderId = input.serviceOrderId;
    const auth = await requirePermission("service_orders:update");
    await serviceWarrantyClaimService.decideWarrantyClaim(auth.shop.id, input.claimId, auth.user.id, {
      decision: input.decision,
      coverageDecision: input.coverageDecision,
      assessment: input.assessment,
      customerCharge: optionalNumber(input.customerCharge),
    });
    revalidateWarrantyPaths(input.serviceOrderId);
  } catch (error) {
    if (z.string().uuid().safeParse(serviceOrderId).success) redirect(claimUrl(serviceOrderId, "warrantyError", errorMessage(error)));
    throw error;
  }
  redirect(claimUrl(serviceOrderId, "warrantySuccess", "تم حفظ قرار المطالبة."));
}

const followUpSchema = z.object({
  serviceOrderId: z.string().uuid(),
  claimId: z.string().uuid(),
  odometerAtIntake: z.string().optional(),
  receptionNotes: z.string().trim().max(2000).optional(),
});

export async function createWarrantyFollowUpOrderAction(formData: FormData) {
  const rawOrderId = readString(formData, "serviceOrderId");
  let serviceOrderId = rawOrderId;
  let followUpServiceOrderId: string | null = null;
  try {
    const input = followUpSchema.parse({
      serviceOrderId: rawOrderId,
      claimId: readString(formData, "claimId"),
      odometerAtIntake: readString(formData, "odometerAtIntake"),
      receptionNotes: readString(formData, "receptionNotes"),
    });
    serviceOrderId = input.serviceOrderId;
    const auth = await requirePermission("service_orders:create");
    await requirePermission("service_orders:update");
    const followUp = await serviceWarrantyClaimService.createWarrantyFollowUpOrder(auth.shop.id, input.claimId, auth.user.id, {
      odometerAtIntake: optionalNumber(input.odometerAtIntake),
      receptionNotes: input.receptionNotes || null,
    });
    followUpServiceOrderId = followUp.serviceOrderId;
    revalidateWarrantyPaths(input.serviceOrderId);
    revalidatePath(`/service-orders/${followUp.serviceOrderId}`);
  } catch (error) {
    if (z.string().uuid().safeParse(serviceOrderId).success) redirect(claimUrl(serviceOrderId, "warrantyError", errorMessage(error)));
    throw error;
  }
  if (!followUpServiceOrderId) redirect(claimUrl(serviceOrderId, "warrantyError", "تعذر تحديد أمر المتابعة الجديد."));
  redirect(`/service-orders/${followUpServiceOrderId}`);
}

const resolveSchema = z.object({
  serviceOrderId: z.string().uuid(),
  claimId: z.string().uuid(),
  resolution: z.string().trim().min(3, "اكتب نتيجة معالجة المطالبة.").max(4000),
});

export async function resolveWarrantyClaimAction(formData: FormData) {
  const rawOrderId = readString(formData, "serviceOrderId");
  let serviceOrderId = rawOrderId;
  try {
    const input = resolveSchema.parse({
      serviceOrderId: rawOrderId,
      claimId: readString(formData, "claimId"),
      resolution: readString(formData, "resolution"),
    });
    serviceOrderId = input.serviceOrderId;
    const auth = await requirePermission("service_orders:update");
    await serviceWarrantyClaimService.resolveWarrantyClaim(auth.shop.id, input.claimId, auth.user.id, input.resolution);
    revalidateWarrantyPaths(input.serviceOrderId);
  } catch (error) {
    if (z.string().uuid().safeParse(serviceOrderId).success) redirect(claimUrl(serviceOrderId, "warrantyError", errorMessage(error)));
    throw error;
  }
  redirect(claimUrl(serviceOrderId, "warrantySuccess", "تم تسجيل حل المطالبة."));
}

const closeSchema = z.object({ serviceOrderId: z.string().uuid(), claimId: z.string().uuid() });

export async function closeWarrantyClaimAction(formData: FormData) {
  const rawOrderId = readString(formData, "serviceOrderId");
  let serviceOrderId = rawOrderId;
  try {
    const input = closeSchema.parse({ serviceOrderId: rawOrderId, claimId: readString(formData, "claimId") });
    serviceOrderId = input.serviceOrderId;
    const auth = await requirePermission("service_orders:update");
    await serviceWarrantyClaimService.closeWarrantyClaim(auth.shop.id, input.claimId, auth.user.id);
    revalidateWarrantyPaths(input.serviceOrderId);
  } catch (error) {
    if (z.string().uuid().safeParse(serviceOrderId).success) redirect(claimUrl(serviceOrderId, "warrantyError", errorMessage(error)));
    throw error;
  }
  redirect(claimUrl(serviceOrderId, "warrantySuccess", "تم إغلاق المطالبة نهائياً."));
}
