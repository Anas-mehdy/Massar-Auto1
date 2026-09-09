"use server";

import { InstallmentFrequency, PaymentMethod } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { requirePermission } from "@/lib/auth/context";
import { installmentCollectionService } from "@/lib/services/installmentCollectionService";
import { installmentPlanCollectionService } from "@/lib/services/installmentPlanCollectionService";
import { installmentService } from "@/lib/services/installmentService";
import { entitlementService } from "@/lib/services/subscriptionEntitlementService";

function read(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

function errorMessage(error: unknown) {
  if (error instanceof z.ZodError) return error.issues[0]?.message || "البيانات غير صحيحة.";
  return error instanceof Error ? error.message : "حدث خطأ غير متوقع.";
}

const destinationSchema = z.enum(["DRAWER", "WALLET", "BANK", "OTHER"]);

const createSchema = z.object({
  clientGeneratedId: z.string().min(8).optional(),
  invoiceId: z.string().uuid().optional().or(z.literal("")),
  customerId: z.string().uuid().optional().or(z.literal("")),
  customerName: z.string().trim().optional(),
  customerPhone: z.string().trim().optional(),
  title: z.string().trim().min(2, "وصف الاتفاق مطلوب").max(160),
  notes: z.string().trim().max(1000).optional(),
  totalAmount: z.string().trim().min(1, "المبلغ الإجمالي مطلوب"),
  downPayment: z.string().trim().optional(),
  downPaymentMethod: z.nativeEnum(PaymentMethod),
  downPaymentDestination: destinationSchema.default("DRAWER"),
  downPaymentWalletId: z.string().uuid().optional().or(z.literal("")),
  downPaymentBankAccountId: z.string().uuid().optional().or(z.literal("")),
  installmentCount: z.coerce.number().int().min(1).max(120),
  frequency: z.nativeEnum(InstallmentFrequency),
  firstDueAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "تاريخ أول قسط مطلوب"),
}).superRefine((data, ctx) => {
  const down = Number((data.downPayment || "0").replace(",", "."));
  if (!(down > 0)) return;
  if (data.downPaymentDestination === "WALLET" && !data.downPaymentWalletId) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["downPaymentWalletId"], message: "اختر المحفظة التي استلمت الدفعة الأولى." });
  }
  if (data.downPaymentDestination === "BANK" && !data.downPaymentBankAccountId) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["downPaymentBankAccountId"], message: "اختر الحساب البنكي الذي استلم الدفعة الأولى." });
  }
});

const paymentSchema = z.object({
  planId: z.string().uuid(),
  clientGeneratedId: z.string().min(8).optional(),
  amount: z.string().trim().min(1, "قيمة الدفعة مطلوبة"),
  method: z.nativeEnum(PaymentMethod),
  sourceOptionId: z.string().uuid().optional().or(z.literal("")),
  customSourceName: z.string().trim().max(80).optional(),
  saveCustomSource: z.boolean().optional(),
  reference: z.string().trim().optional(),
  note: z.string().trim().optional(),
  paidAt: z.string().optional(),
  moneyDestination: destinationSchema.default("DRAWER"),
  walletId: z.string().uuid().optional().or(z.literal("")),
  bankAccountId: z.string().uuid().optional().or(z.literal("")),
}).superRefine((data, ctx) => {
  if (data.moneyDestination === "WALLET" && !data.walletId) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["walletId"], message: "اختر المحفظة التي استلمت الدفعة." });
  }
  if (data.moneyDestination === "BANK" && !data.bankAccountId) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["bankAccountId"], message: "اختر الحساب البنكي الذي استلم الدفعة." });
  }
});

const updateSchema = z.object({
  planId: z.string().uuid(),
  title: z.string().trim().min(2, "وصف الاتفاق مطلوب").max(160),
  notes: z.string().trim().max(1000).optional(),
  totalAmount: z.string().trim().min(1, "المبلغ الإجمالي مطلوب"),
  installmentCount: z.coerce.number().int().min(1).max(120),
  frequency: z.nativeEnum(InstallmentFrequency),
  firstDueAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "تاريخ أول قسط مطلوب"),
});

const planIdSchema = z.object({ planId: z.string().uuid() });

export async function createInstallmentPlanAction(formData: FormData) {
  try {
    const input = createSchema.parse({
      clientGeneratedId: read(formData, "clientGeneratedId") || undefined,
      invoiceId: read(formData, "invoiceId"),
      customerId: read(formData, "customerId") === "NEW" ? "" : read(formData, "customerId"),
      customerName: read(formData, "customerName"),
      customerPhone: read(formData, "customerPhone"),
      title: read(formData, "title"),
      notes: read(formData, "notes"),
      totalAmount: read(formData, "totalAmount"),
      downPayment: read(formData, "downPayment"),
      downPaymentMethod: read(formData, "downPaymentMethod") || PaymentMethod.CASH,
      downPaymentDestination: read(formData, "downPaymentDestination") || "DRAWER",
      downPaymentWalletId: read(formData, "downPaymentWalletId"),
      downPaymentBankAccountId: read(formData, "downPaymentBankAccountId"),
      installmentCount: read(formData, "installmentCount"),
      frequency: read(formData, "frequency"),
      firstDueAt: read(formData, "firstDueAt"),
    });
    const auth = await requirePermission("invoices:pay");
    const entitlement = await entitlementService.getEntitlementContext(auth.shop.id);
    if (!entitlement.isOperationallyActive) {
      throw new Error("انتهت فترة استخدامك. بياناتك محفوظة بالكامل، اختر خطة لمتابعة إنشاء عمليات جديدة.");
    }
    const plan = await installmentPlanCollectionService.createPlan(auth.shop.id, auth.user.id, {
      ...input,
      downPaymentWalletId: input.downPaymentWalletId || undefined,
      downPaymentBankAccountId: input.downPaymentBankAccountId || undefined,
    });
    if (!plan) throw new Error("تعذر إنشاء خطة الأقساط.");
    revalidatePath("/installments");
    revalidatePath("/invoices");
    revalidatePath("/transfers");
    revalidatePath("/bank-accounts");
    revalidatePath("/reports");
    redirect(`/installments/${plan.id}?created=1`);
  } catch (error) {
    if (error && typeof error === "object" && "digest" in error) throw error;
    redirect(`/installments/new?error=${encodeURIComponent(errorMessage(error))}`);
  }
}

export async function addInstallmentPaymentAction(formData: FormData) {
  const planId = read(formData, "planId");
  try {
    const input = paymentSchema.parse({
      planId,
      clientGeneratedId: read(formData, "clientGeneratedId") || undefined,
      amount: read(formData, "amount"),
      method: read(formData, "method"),
      sourceOptionId: read(formData, "sourceOptionId") === "__CUSTOM__" ? "" : read(formData, "sourceOptionId"),
      customSourceName: read(formData, "customSourceName"),
      saveCustomSource: read(formData, "saveCustomSource") === "on",
      reference: read(formData, "reference"),
      note: read(formData, "note"),
      paidAt: read(formData, "paidAt"),
      moneyDestination: read(formData, "moneyDestination") || "DRAWER",
      walletId: read(formData, "walletId"),
      bankAccountId: read(formData, "bankAccountId"),
    });
    const auth = await requirePermission("invoices:pay");
    await installmentCollectionService.addPayment(auth.shop.id, input.planId, auth.user.id, {
      clientGeneratedId: input.clientGeneratedId,
      amount: input.amount,
      method: input.method,
      sourceOptionId: input.sourceOptionId || undefined,
      customSourceName: input.customSourceName,
      saveCustomSource: input.saveCustomSource,
      reference: input.reference,
      note: input.note,
      paidAt: input.paidAt,
      moneyDestination: input.moneyDestination,
      walletId: input.walletId || undefined,
      bankAccountId: input.bankAccountId || undefined,
    });
    revalidatePath("/installments");
    revalidatePath(`/installments/${input.planId}`);
    revalidatePath("/invoices");
    revalidatePath("/transfers");
    revalidatePath("/bank-accounts");
    revalidatePath("/reports");
    redirect(`/installments/${input.planId}?paid=1`);
  } catch (error) {
    if (error && typeof error === "object" && "digest" in error) throw error;
    redirect(`/installments/${planId}?error=${encodeURIComponent(errorMessage(error))}`);
  }
}

export async function rotateInstallmentLinkAction(formData: FormData) {
  const planId = z.string().uuid().parse(read(formData, "planId"));
  const auth = await requirePermission("invoices:pay");
  await installmentService.rotatePublicLink(auth.shop.id, planId);
  revalidatePath(`/installments/${planId}`);
  redirect(`/installments/${planId}?linkReset=1`);
}

export async function updateInstallmentPlanAction(formData: FormData) {
  const rawPlanId = read(formData, "planId");
  try {
    const input = updateSchema.parse({
      planId: rawPlanId,
      title: read(formData, "title"),
      notes: read(formData, "notes"),
      totalAmount: read(formData, "totalAmount"),
      installmentCount: read(formData, "installmentCount"),
      frequency: read(formData, "frequency"),
      firstDueAt: read(formData, "firstDueAt"),
    });
    const auth = await requirePermission("invoices:pay");
    await installmentService.updatePlan(auth.shop.id, input.planId, input);
    revalidatePath("/installments");
    revalidatePath(`/installments/${input.planId}`);
    redirect(`/installments/${input.planId}?updated=1`);
  } catch (error) {
    if (error && typeof error === "object" && "digest" in error) throw error;
    const destination = z.string().uuid().safeParse(rawPlanId).success
      ? `/installments/${rawPlanId}/edit`
      : "/installments";
    redirect(`${destination}?error=${encodeURIComponent(errorMessage(error))}`);
  }
}

export async function deleteInstallmentPlanAction(formData: FormData) {
  try {
    const input = planIdSchema.parse({ planId: read(formData, "planId") });
    const auth = await requirePermission("invoices:void");
    await installmentService.softDeletePlan(auth.shop.id, input.planId);
    revalidatePath("/installments");
    revalidatePath("/invoices");
    redirect("/installments?deleted=1");
  } catch (error) {
    if (error && typeof error === "object" && "digest" in error) throw error;
    redirect(`/installments?error=${encodeURIComponent(errorMessage(error))}`);
  }
}
