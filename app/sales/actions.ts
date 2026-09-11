"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requirePermission } from "@/lib/auth/context";
import { pointOfSaleResultPath, readPointOfSaleReturn } from "@/lib/point-of-sale";
import { salesService } from "@/lib/services/salesService";
import { salesInventorySearchService } from "@/lib/services/salesInventorySearchService";
import { salesCustomerSearchService } from "@/lib/services/salesCustomerSearchService";
import { entitlementService } from "@/lib/services/subscriptionEntitlementService";
import { ANALYTICS_EVENTS } from "@/lib/analytics/events";
import { captureServerEvent } from "@/lib/analytics/server";

export type SaleActionState = { error?: string };

const rawLineItemSchema = z.object({
  inventoryItemId: z.string().uuid().nullable().optional(),
  description: z.string().trim().optional(),
  quantity: z.coerce.number().int().positive("الكمية يجب أن تكون أكبر من صفر"),
  unitPrice: z.coerce.number().nonnegative("سعر الوحدة يجب أن يكون صفراً أو أكثر"),
  discountTotal: z.coerce.number().nonnegative("الخصم يجب أن يكون صفراً أو أكثر").default(0),
}).refine((item) => item.inventoryItemId || item.description, { message: "اختر قطعة مخزون أو أدخل وصف بند يدوي" });

const createSaleSchema = z.object({
  warehouseId: z.string().uuid("اختر مستودع البيع."),
  customerMode: z.enum(["EXISTING", "NEW", "CASH"]),
  customerId: z.string().uuid().optional().or(z.literal("")),
  customerName: z.string().optional(),
  customerPhone: z.string().optional(),
  items: z.array(rawLineItemSchema).min(1, "يجب إضافة بند واحد على الأقل"),
  paymentDestination: z.enum(["DRAWER", "WALLET", "BANK", "DEBT"]).default("DRAWER"),
  walletId: z.string().uuid().optional().or(z.literal("")),
  bankAccountId: z.string().uuid().optional().or(z.literal("")),
  amountReceived: z.string().trim().optional(),
  changeDestination: z.enum(["DRAWER", "WALLET", "BANK"]).default("DRAWER"),
  changeWalletId: z.string().uuid().optional().or(z.literal("")),
  changeBankAccountId: z.string().uuid().optional().or(z.literal("")),
}).superRefine((data, ctx) => {
  if (data.customerMode === "EXISTING" && !data.customerId) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "اختر عميلاً موجوداً من القائمة." });
  if (data.customerMode === "NEW" && !data.customerName?.trim()) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "اسم العميل الجديد مطلوب." });
  if (data.paymentDestination === "WALLET" && !data.walletId) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "اختر محفظة استلام المبلغ." });
  if (data.paymentDestination === "BANK" && !data.bankAccountId) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "اختر الحساب البنكي الذي استلم المبلغ." });
  if (data.paymentDestination === "DEBT" && data.customerMode === "CASH") ctx.addIssue({ code: z.ZodIssueCode.custom, message: "ترحيل المبلغ إلى دفتر الديون يتطلب عميلاً مسجلاً." });
});

const cancelSaleSchema = z.object({ saleId: z.string().uuid() });
function readString(formData: FormData, key: string) { const value = formData.get(key); return typeof value === "string" ? value : ""; }
function getErrorMessage(error: unknown) { if (error instanceof z.ZodError) return error.issues[0]?.message ?? "البيانات غير صحيحة."; if (error instanceof Error) return error.message; return "حدث خطأ غير متوقع."; }

export async function searchInventoryForSaleAction(query: string, warehouseId: string) {
  const safeQuery = z.string().max(120).parse(query).trim();
  if (!safeQuery) return [];
  const safeWarehouseId = z.string().uuid("اختر مستودع البيع أولاً.").parse(warehouseId);
  const auth = await requirePermission("sales:create");
  return salesInventorySearchService.searchInventoryForSale(auth.shop.id, safeQuery, safeWarehouseId, 20);
}

export async function searchCustomersForSaleAction(query: string) {
  const safeQuery = z.string().max(120).parse(query).trim();
  if (!safeQuery) return [];
  const auth = await requirePermission("sales:create");
  return salesCustomerSearchService.searchCustomersForSale(auth.shop.id, safeQuery, 20);
}

export async function createSaleAction(_state: SaleActionState, formData: FormData): Promise<SaleActionState> {
  let saleId = "";
  const pointOfSaleReturn = readPointOfSaleReturn(readString(formData, "returnTo"), "sale");
  const onboardingMode = !pointOfSaleReturn && readString(formData, "onboarding") === "1";
  try {
    const rawItems = JSON.parse(readString(formData, "items"));
    const parsed = createSaleSchema.parse({
      warehouseId: readString(formData, "warehouseId"),
      customerMode: readString(formData, "customerMode") || "CASH",
      customerId: readString(formData, "customerId"),
      customerName: readString(formData, "customerName"),
      customerPhone: readString(formData, "customerPhone"),
      items: rawItems,
      paymentDestination: readString(formData, "paymentDestination") || "DRAWER",
      walletId: readString(formData, "walletId"),
      bankAccountId: readString(formData, "bankAccountId"),
      amountReceived: readString(formData, "amountReceived"),
      changeDestination: readString(formData, "changeDestination") || "DRAWER",
      changeWalletId: readString(formData, "changeWalletId"),
      changeBankAccountId: readString(formData, "changeBankAccountId"),
    });

    if (onboardingMode) {
      const onboardingTotal = parsed.items.reduce((sum, item) => sum + (Number(item.unitPrice) * item.quantity) - Number(item.discountTotal || 0), 0);
      if (!Number.isFinite(onboardingTotal) || onboardingTotal <= 0) return { error: "أدخل سعراً أكبر من صفر حتى تكون أول عملية بيع حقيقية." };
    }

    const auth = await requirePermission("sales:create");
    const entitlement = await entitlementService.checkCanCreateNewOperation(auth.shop.id);
    if (!entitlement.allowed) return { error: entitlement.message };

    const sale = await salesService.createSale(auth.shop.id, auth.user.id, {
      warehouseId: parsed.warehouseId,
      customerId: parsed.customerMode === "EXISTING" ? parsed.customerId || undefined : undefined,
      customerName: parsed.customerMode === "NEW" ? parsed.customerName : undefined,
      customerPhone: parsed.customerMode === "NEW" ? parsed.customerPhone : undefined,
      items: parsed.items.map((item) => ({ inventoryItemId: item.inventoryItemId, description: item.description ?? "", quantity: item.quantity, unitPrice: String(item.unitPrice), discountTotal: String(item.discountTotal) })),
      paymentDestination: parsed.paymentDestination,
      walletId: parsed.walletId || undefined,
      bankAccountId: parsed.bankAccountId || undefined,
      amountReceived: parsed.amountReceived || undefined,
      changeDestination: parsed.changeDestination,
      changeWalletId: parsed.changeWalletId || undefined,
      changeBankAccountId: parsed.changeBankAccountId || undefined,
    });
    saleId = sale.id;
    await captureServerEvent({ event: ANALYTICS_EVENTS.SALE_COMPLETED, distinctId: auth.user.id, shopId: auth.shop.id, countryCode: auth.shop.countryCode, properties: { source: onboardingMode ? "point_of_sale_onboarding" : pointOfSaleReturn ? "point_of_sale" : "sales", onboarding_mode: onboardingMode, payment_destination: parsed.paymentDestination, customer_mode: parsed.customerMode, item_count: parsed.items.length, warehouse_id: parsed.warehouseId } });
  } catch (error) {
    return { error: getErrorMessage(error) };
  }

  revalidatePath("/sales");
  revalidatePath("/customers");
  revalidatePath("/inventory");
  revalidatePath("/inventory/warehouses");
  revalidatePath("/transfers");
  revalidatePath("/bank-accounts");
  revalidatePath("/cash-drawer");
  revalidatePath("/debts");
  revalidatePath("/reports");
  revalidatePath("/point-of-sale");
  redirect(pointOfSaleReturn ? pointOfSaleResultPath("sale", { saved: "1", transaction: saleId }) : `/sales/${saleId}${onboardingMode ? "?onboarding=1" : ""}`);
}

export async function cancelSaleAction(formData: FormData) {
  const input = cancelSaleSchema.parse({ saleId: readString(formData, "saleId") });
  const auth = await requirePermission("sales:cancel");
  await salesService.cancelSale(auth.shop.id, input.saleId, auth.user.id);
  revalidatePath("/sales");
  revalidatePath(`/sales/${input.saleId}`);
  revalidatePath("/inventory");
  revalidatePath("/inventory/warehouses");
  revalidatePath("/bank-accounts");
  revalidatePath("/cash-drawer");
  revalidatePath("/debts");
  revalidatePath("/reports");
  redirect(`/sales/${input.saleId}`);
}
