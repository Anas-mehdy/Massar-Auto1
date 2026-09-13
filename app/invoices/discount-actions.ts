"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requirePermission } from "@/lib/auth/context";
import { invoiceDiscountService } from "@/lib/services/invoiceDiscountService";

const updateInvoiceDiscountSchema = z.object({
  invoiceId: z.string().uuid(),
  discountTotal: z
    .string()
    .trim()
    .min(1, "قيمة الخصم مطلوبة")
    .refine((value) => Number(value.replace(",", ".")) >= 0, {
      message: "قيمة الخصم يجب أن تكون صفراً أو أكثر",
    }),
});

function readString(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

function getErrorMessage(error: unknown) {
  if (error instanceof z.ZodError) {
    return error.issues[0]?.message ?? "البيانات غير صحيحة.";
  }
  return error instanceof Error ? error.message : "حدث خطأ غير متوقع.";
}

export async function updateInvoiceDiscountAction(formData: FormData) {
  const invoiceId = readString(formData, "invoiceId");

  try {
    const input = updateInvoiceDiscountSchema.parse({
      invoiceId,
      discountTotal: readString(formData, "discountTotal"),
    });

    const auth = await requirePermission("invoices:credit");
    await invoiceDiscountService.updateInvoiceDiscount(
      auth.shop.id,
      input.invoiceId,
      input.discountTotal,
    );

    revalidatePath("/invoices");
    revalidatePath(`/invoices/${input.invoiceId}`);
    revalidatePath(`/invoices/${input.invoiceId}/print`);
    revalidatePath("/dashboard");
    redirect(`/invoices/${input.invoiceId}?discountUpdated=1`);
  } catch (error) {
    if (error && typeof error === "object" && "digest" in error) throw error;
    const destination = z.string().uuid().safeParse(invoiceId).success
      ? `/invoices/${invoiceId}`
      : "/invoices";
    redirect(`${destination}?invoiceError=${encodeURIComponent(getErrorMessage(error))}`);
  }
}
