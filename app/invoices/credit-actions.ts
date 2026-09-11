"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requirePermission } from "@/lib/auth/context";
import {
  CREDIT_NOTE_REASON_CODES,
  invoiceCreditNoteService,
} from "@/lib/services/invoiceCreditNoteService";

function readString(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

function errorMessage(error: unknown) {
  if (error instanceof z.ZodError) return error.issues[0]?.message ?? "البيانات غير صحيحة.";
  if (error instanceof Error) return error.message;
  return "حدث خطأ غير متوقع.";
}

const creditSchema = z.object({
  invoiceId: z.string().uuid(),
  amount: z.string().trim().min(1, "قيمة الإشعار الدائن مطلوبة").refine(
    (value) => Number(value.replace(",", ".")) > 0,
    "قيمة الإشعار الدائن يجب أن تكون أكبر من صفر.",
  ),
  reasonCode: z.enum(CREDIT_NOTE_REASON_CODES),
  reason: z.string().trim().min(3, "اكتب سبب التصحيح بوضوح.").max(1000),
  issuedAt: z.string().optional(),
  notes: z.string().trim().max(2000).optional(),
});

const refundSchema = z.object({
  invoiceId: z.string().uuid(),
  amount: z.string().trim().min(1, "قيمة الاسترداد مطلوبة").refine(
    (value) => Number(value.replace(",", ".")) > 0,
    "قيمة الاسترداد يجب أن تكون أكبر من صفر.",
  ),
  accountType: z.enum(["DRAWER", "WALLET", "BANK", "OTHER"]),
  walletId: z.string().uuid().optional().or(z.literal("")),
  bankAccountId: z.string().uuid().optional().or(z.literal("")),
  sourceName: z.string().trim().max(120).optional(),
  reference: z.string().trim().max(180).optional(),
  notes: z.string().trim().max(2000).optional(),
  refundedAt: z.string().optional(),
}).superRefine((data, ctx) => {
  if (data.accountType === "WALLET" && !data.walletId) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["walletId"], message: "اختر المحفظة التي سيخرج منها مبلغ الاسترداد." });
  }
  if (data.accountType === "BANK" && !data.bankAccountId) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["bankAccountId"], message: "اختر الحساب البنكي الذي سيخرج منه مبلغ الاسترداد." });
  }
});

function revalidateFinancialPaths(invoiceId: string) {
  revalidatePath("/invoices");
  revalidatePath(`/invoices/${invoiceId}`);
  revalidatePath(`/invoices/${invoiceId}/print`);
  revalidatePath("/service-orders");
  revalidatePath("/vehicles");
  revalidatePath("/dashboard");
  revalidatePath("/reports");
  revalidatePath("/bank-accounts");
  revalidatePath("/transfers");
  revalidatePath("/customers");
}

export async function createInvoiceCreditNoteAction(formData: FormData) {
  const rawInvoiceId = readString(formData, "invoiceId");
  let invoiceId = rawInvoiceId;
  try {
    const input = creditSchema.parse({
      invoiceId: rawInvoiceId,
      amount: readString(formData, "amount"),
      reasonCode: readString(formData, "reasonCode"),
      reason: readString(formData, "reason"),
      issuedAt: readString(formData, "issuedAt"),
      notes: readString(formData, "notes"),
    });
    invoiceId = input.invoiceId;
    const auth = await requirePermission("invoices:credit");
    await invoiceCreditNoteService.createAutoInvoiceCreditNote(auth.shop.id, input.invoiceId, auth.user.id, {
      amount: input.amount,
      reasonCode: input.reasonCode,
      reason: input.reason,
      issuedAt: input.issuedAt || null,
      notes: input.notes || null,
    });
    revalidateFinancialPaths(input.invoiceId);
  } catch (error) {
    if (invoiceId && z.string().uuid().safeParse(invoiceId).success) {
      redirect(`/invoices/${invoiceId}?creditError=${encodeURIComponent(errorMessage(error))}`);
    }
    throw error;
  }
  redirect(`/invoices/${invoiceId}?creditSuccess=1`);
}

export async function refundInvoiceCreditAction(formData: FormData) {
  const rawInvoiceId = readString(formData, "invoiceId");
  let invoiceId = rawInvoiceId;
  try {
    const input = refundSchema.parse({
      invoiceId: rawInvoiceId,
      amount: readString(formData, "amount"),
      accountType: readString(formData, "refundAccountType"),
      walletId: readString(formData, "refundWalletId"),
      bankAccountId: readString(formData, "refundBankAccountId"),
      sourceName: readString(formData, "refundSourceName"),
      reference: readString(formData, "refundReference"),
      notes: readString(formData, "refundNotes"),
      refundedAt: readString(formData, "refundedAt"),
    });
    invoiceId = input.invoiceId;
    const auth = await requirePermission("invoices:credit");
    await invoiceCreditNoteService.refundAutoInvoiceCredit(auth.shop.id, input.invoiceId, auth.user.id, {
      amount: input.amount,
      accountType: input.accountType,
      walletId: input.walletId || null,
      bankAccountId: input.bankAccountId || null,
      sourceName: input.sourceName || null,
      reference: input.reference || null,
      notes: input.notes || null,
      refundedAt: input.refundedAt || null,
    });
    revalidateFinancialPaths(input.invoiceId);
  } catch (error) {
    if (invoiceId && z.string().uuid().safeParse(invoiceId).success) {
      redirect(`/invoices/${invoiceId}?creditError=${encodeURIComponent(errorMessage(error))}`);
    }
    throw error;
  }
  redirect(`/invoices/${invoiceId}?refundSuccess=1`);
}
