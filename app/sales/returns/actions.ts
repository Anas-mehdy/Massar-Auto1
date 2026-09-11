"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requirePermission } from "@/lib/auth/context";
import { salesReturnService } from "@/lib/services/salesReturnService";
import { salesWarehouseSourceService } from "@/lib/services/salesWarehouseSourceService";

const lineSchema = z.object({
  saleItemId: z.string().uuid(),
  quantity: z.number().int().positive(),
  restock: z.boolean().default(true),
  warehouseId: z.string().uuid().nullable().optional(),
  reason: z.string().trim().max(500).nullable().optional(),
});

const inputSchema = z.object({
  saleId: z.string().uuid(),
  reason: z.string().trim().min(2, "سبب المرتجع مطلوب").max(1000),
  refundAccountType: z.enum(["DRAWER", "WALLET", "BANK", "OTHER"]),
  refundWalletId: z.string().uuid().nullable().optional(),
  refundBankAccountId: z.string().uuid().nullable().optional(),
  refundSourceName: z.string().trim().max(180).nullable().optional(),
  notes: z.string().trim().max(1500).nullable().optional(),
  lines: z.array(lineSchema).min(1, "اختر بنداً واحداً على الأقل").max(100),
}).superRefine((value, ctx) => {
  if (value.refundAccountType === "WALLET" && !value.refundWalletId) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["refundWalletId"], message: "اختر محفظة رد المبلغ." });
  }
  if (value.refundAccountType === "BANK" && !value.refundBankAccountId) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["refundBankAccountId"], message: "اختر الحساب البنكي لرد المبلغ." });
  }
});

function read(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function errorMessage(error: unknown) {
  if (error instanceof z.ZodError) return error.issues[0]?.message || "تحقق من بيانات المرتجع.";
  return error instanceof Error ? error.message : "تعذر تنفيذ المرتجع.";
}

export async function createSalesReturnAction(formData: FormData) {
  const saleId = read(formData, "saleId");
  try {
    const auth = await requirePermission("sales:return");
    let lines: unknown = [];
    try { lines = JSON.parse(read(formData, "lines") || "[]"); } catch { throw new Error("بنود المرتجع غير صالحة."); }
    const refundAccountType = read(formData, "refundAccountType");
    const parsed = inputSchema.parse({
      saleId,
      reason: read(formData, "reason"),
      refundAccountType,
      refundWalletId: refundAccountType === "WALLET" ? read(formData, "refundWalletId") || null : null,
      refundBankAccountId: refundAccountType === "BANK" ? read(formData, "refundBankAccountId") || null : null,
      refundSourceName: refundAccountType === "OTHER" ? read(formData, "refundSourceName") || null : null,
      notes: read(formData, "notes") || null,
      lines,
    });
    const resolvedLines = await salesWarehouseSourceService.resolveSalesReturnWarehouses(auth.shop.id, parsed.saleId, parsed.lines);
    const result = await salesReturnService.createSalesReturn(auth.shop.id, auth.user.id, { ...parsed, lines: resolvedLines });
    revalidatePath("/sales");
    revalidatePath(`/sales/${parsed.saleId}`);
    revalidatePath("/sales/returns");
    revalidatePath("/inventory");
    revalidatePath("/inventory/warehouses");
    revalidatePath("/cash-drawer");
    revalidatePath("/bank-accounts");
    revalidatePath("/transfers");
    redirect(`/sales/returns?created=${encodeURIComponent(result.returnNumber)}`);
  } catch (error) {
    if (error && typeof error === "object" && "digest" in error) throw error;
    redirect(`/sales/returns/new?saleId=${encodeURIComponent(saleId)}&error=${encodeURIComponent(errorMessage(error))}`);
  }
}
