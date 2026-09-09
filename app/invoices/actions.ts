"use server";

import { PaymentMethod } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requirePermission } from "@/lib/auth/context";
import { invoiceService } from "@/lib/services/invoiceService";
import { paymentService } from "@/lib/services/paymentService";
import { entitlementService } from "@/lib/services/subscriptionEntitlementService";

const createFromRepairSchema = z.object({ repairOrderId: z.string().uuid() });
const createFromSaleSchema = z.object({ saleId: z.string().uuid() });

const addPaymentSchema = z.object({
  invoiceId: z.string().uuid(),
  amount: z.string().trim().min(1, "قيمة الدفعة مطلوبة").refine((value) => Number(value.replace(",", ".")) > 0, { message: "قيمة الدفعة يجب أن تكون أكبر من صفر" }),
  method: z.nativeEnum(PaymentMethod),
  sourceOptionId: z.string().uuid().optional().or(z.literal("")),
  customSourceName: z.string().trim().max(80).optional(),
  saveCustomSource: z.boolean().optional(),
  reference: z.string().optional(),
  note: z.string().optional(),
  paidAt: z.string().optional(),
  moneyDestination: z.enum(["DRAWER", "WALLET", "BANK", "OTHER"]).default("OTHER"),
  walletId: z.string().uuid().optional().or(z.literal("")),
  bankAccountId: z.string().uuid().optional().or(z.literal("")),
}).superRefine((data, ctx) => {
  if (data.moneyDestination === "WALLET" && !data.walletId) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["walletId"], message: "اختر المحفظة التي وصل إليها المبلغ." });
  }
  if (data.moneyDestination === "BANK" && !data.bankAccountId) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["bankAccountId"], message: "اختر الحساب البنكي الذي وصل إليه المبلغ." });
  }
});

const voidInvoiceSchema = z.object({ invoiceId: z.string().uuid() });

function readString(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

function getErrorMessage(error: unknown) {
  if (error instanceof z.ZodError) return error.issues[0]?.message ?? "البيانات غير صحيحة.";
  if (error instanceof Error) return error.message;
  return "حدث خطأ غير متوقع.";
}

async function assertCanCreateNewInvoice(shopId: string) {
  const entitlement = await entitlementService.getEntitlementContext(shopId);
  if (!entitlement.isOperationallyActive) throw new Error("انتهت فترة استخدامك. بياناتك محفوظة بالكامل، اختر خطة لمتابعة إنشاء عمليات جديدة.");
}

export async function createInvoiceFromRepairOrderAction(formData: FormData) {
  const input = createFromRepairSchema.parse({ repairOrderId: readString(formData, "repairOrderId") });
  let redirectTo = `/repair-orders/${input.repairOrderId}`;
  try {
    const auth = await requirePermission("repairs:update");
    await assertCanCreateNewInvoice(auth.shop.id);
    const invoice = await invoiceService.createInvoiceFromRepairOrder(auth.shop.id, input.repairOrderId, auth.user.id);
    redirectTo = `/invoices/${invoice.id}`;
    revalidatePath("/invoices");
    revalidatePath(`/repair-orders/${input.repairOrderId}`);
  } catch (error) {
    redirectTo = `/repair-orders/${input.repairOrderId}?invoiceError=${encodeURIComponent(getErrorMessage(error))}`;
  }
  redirect(redirectTo);
}

export async function createInvoiceFromSaleAction(formData: FormData) {
  const input = createFromSaleSchema.parse({ saleId: readString(formData, "saleId") });
  let redirectTo = `/sales/${input.saleId}`;
  try {
    const auth = await requirePermission("sales:create");
    await assertCanCreateNewInvoice(auth.shop.id);
    const invoice = await invoiceService.createInvoiceFromSale(auth.shop.id, input.saleId, auth.user.id);
    redirectTo = `/invoices/${invoice.id}`;
    revalidatePath("/invoices");
    revalidatePath(`/sales/${input.saleId}`);
  } catch (error) {
    redirectTo = `/sales/${input.saleId}?invoiceError=${encodeURIComponent(getErrorMessage(error))}`;
  }
  redirect(redirectTo);
}

export async function addPaymentAction(formData: FormData) {
  const input = addPaymentSchema.parse({
    invoiceId: readString(formData, "invoiceId"),
    amount: readString(formData, "amount"),
    method: readString(formData, "method"),
    sourceOptionId: readString(formData, "sourceOptionId") === "__CUSTOM__" ? "" : readString(formData, "sourceOptionId"),
    customSourceName: readString(formData, "customSourceName"),
    saveCustomSource: readString(formData, "saveCustomSource") === "on",
    reference: readString(formData, "reference"),
    note: readString(formData, "note"),
    paidAt: readString(formData, "paidAt"),
    moneyDestination: readString(formData, "moneyDestination") || "OTHER",
    walletId: readString(formData, "walletId"),
    bankAccountId: readString(formData, "bankAccountId"),
  });

  try {
    const auth = await requirePermission("invoices:pay");
    await paymentService.addPayment(auth.shop.id, input.invoiceId, auth.user.id, {
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
    revalidatePath("/invoices");
    revalidatePath(`/invoices/${input.invoiceId}`);
    revalidatePath("/dashboard");
    revalidatePath("/customers");
    revalidatePath("/transfers");
    revalidatePath("/bank-accounts");
    revalidatePath("/reports");
  } catch (error) {
    redirect(`/invoices/${input.invoiceId}?paymentError=${encodeURIComponent(getErrorMessage(error))}`);
  }
}

export async function voidInvoiceAction(formData: FormData) {
  const input = voidInvoiceSchema.parse({ invoiceId: readString(formData, "invoiceId") });
  try {
    const auth = await requirePermission("invoices:void");
    await invoiceService.voidInvoice(auth.shop.id, input.invoiceId, auth.user.id);
    revalidatePath("/invoices");
    revalidatePath(`/invoices/${input.invoiceId}`);
    revalidatePath("/dashboard");
    revalidatePath("/bank-accounts");
  } catch (error) {
    redirect(`/invoices/${input.invoiceId}?invoiceError=${encodeURIComponent(getErrorMessage(error))}`);
  }
}
