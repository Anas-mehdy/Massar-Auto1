"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requirePermission } from "@/lib/auth/context";
import { pointOfSaleResultPath, readPointOfSaleReturn } from "@/lib/point-of-sale";
import { softwareServiceCancellationService } from "@/lib/services/softwareServiceCancellationService";
import { softwareServiceService } from "@/lib/services/softwareServiceService";

function readString(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

function getErrorMessage(error: unknown) {
  if (error instanceof z.ZodError) return error.issues[0]?.message ?? "البيانات غير صحيحة.";
  if (error instanceof Error) return error.message;
  return "حدث خطأ غير متوقع.";
}

const createSaleSchema = z.object({
  customerMode: z.enum(["EXISTING", "NEW", "CASH"]),
  customerId: z.string().uuid().optional().or(z.literal("")),
  newCustomerName: z.string().trim().max(120).optional(),
  newCustomerPhone: z.string().trim().max(40).optional(),
  catalogId: z.string().uuid().optional().or(z.literal("")),
  serviceName: z.string().trim().min(1, "اسم الخدمة مطلوب").max(160),
  deviceBrand: z.string().trim().max(80).optional(),
  deviceModel: z.string().trim().max(120).optional(),
  deviceSerial: z.string().trim().max(120).optional(),
  salePrice: z.string().trim().min(1, "سعر البيع مطلوب"),
  serviceCost: z.string().trim().optional(),
  notes: z.string().trim().max(1000).optional(),
  deviceKept: z.boolean().optional(),
  paymentDestination: z.enum(["DRAWER", "WALLET", "BANK", "DEBT"]).default("DRAWER"),
  walletId: z.string().uuid().optional().or(z.literal("")),
  bankAccountId: z.string().uuid().optional().or(z.literal("")),
  amountReceived: z.string().trim().optional(),
  changeDestination: z.enum(["DRAWER", "WALLET", "BANK"]).default("DRAWER"),
  changeWalletId: z.string().uuid().optional().or(z.literal("")),
  changeBankAccountId: z.string().uuid().optional().or(z.literal("")),
}).superRefine((data, ctx) => {
  if (data.customerMode === "EXISTING" && !data.customerId) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "اختر عميلاً موجوداً من القائمة." });
  if (data.customerMode === "NEW" && !data.newCustomerName?.trim()) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "اسم العميل الجديد مطلوب." });
  if (data.paymentDestination === "WALLET" && !data.walletId) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "اختر محفظة استلام المبلغ." });
  if (data.paymentDestination === "BANK" && !data.bankAccountId) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "اختر الحساب البنكي الذي استلم المبلغ." });
  if (data.paymentDestination === "DEBT" && data.customerMode === "CASH") ctx.addIssue({ code: z.ZodIssueCode.custom, message: "ترحيل الخدمة إلى دفتر الديون يتطلب عميلاً مسجلاً." });
});

export async function createSoftwareServiceSaleAction(formData: FormData) {
  const pointOfSaleReturn = readPointOfSaleReturn(readString(formData, "returnTo"), "software");
  let redirectTo = "/software-services/new";
  try {
    const input = createSaleSchema.parse({
      customerMode: readString(formData, "customerMode") || "CASH",
      customerId: readString(formData, "customerId"),
      newCustomerName: readString(formData, "newCustomerName"),
      newCustomerPhone: readString(formData, "newCustomerPhone"),
      catalogId: readString(formData, "catalogId"),
      serviceName: readString(formData, "serviceName"),
      deviceBrand: readString(formData, "deviceBrand"),
      deviceModel: readString(formData, "deviceModel"),
      deviceSerial: readString(formData, "deviceSerial"),
      salePrice: readString(formData, "salePrice"),
      serviceCost: readString(formData, "serviceCost"),
      notes: readString(formData, "notes"),
      deviceKept: readString(formData, "deviceKept") === "on",
      paymentDestination: readString(formData, "paymentDestination") || "DRAWER",
      walletId: readString(formData, "walletId"),
      bankAccountId: readString(formData, "bankAccountId"),
      amountReceived: readString(formData, "amountReceived"),
      changeDestination: readString(formData, "changeDestination") || "DRAWER",
      changeWalletId: readString(formData, "changeWalletId"),
      changeBankAccountId: readString(formData, "changeBankAccountId"),
    });

    const auth = await requirePermission("sales:create");
    const sale = await softwareServiceService.createSale(auth.shop.id, auth.user.id, {
      customerId: input.customerMode === "EXISTING" ? input.customerId || undefined : undefined,
      newCustomerName: input.customerMode === "NEW" ? input.newCustomerName : undefined,
      newCustomerPhone: input.customerMode === "NEW" ? input.newCustomerPhone : undefined,
      catalogId: input.catalogId || undefined,
      serviceName: input.serviceName,
      deviceBrand: input.deviceBrand,
      deviceModel: input.deviceModel,
      deviceSerial: input.deviceSerial,
      salePrice: input.salePrice,
      serviceCost: input.serviceCost,
      notes: input.notes,
      deviceKept: input.deviceKept,
      paymentDestination: input.paymentDestination,
      walletId: input.walletId || undefined,
      bankAccountId: input.bankAccountId || undefined,
      amountReceived: input.amountReceived || undefined,
      changeDestination: input.changeDestination,
      changeWalletId: input.changeWalletId || undefined,
      changeBankAccountId: input.changeBankAccountId || undefined,
    });
    revalidatePath("/software-services");
    revalidatePath("/customers");
    revalidatePath("/dashboard");
    revalidatePath("/invoices");
    revalidatePath("/reports");
    revalidatePath("/debts");
    revalidatePath("/cash-drawer");
    revalidatePath("/bank-accounts");
    revalidatePath("/transfers");
    revalidatePath("/point-of-sale");
    redirectTo = pointOfSaleReturn ? pointOfSaleResultPath("software", { saved: "1", transaction: sale.id }) : `/software-services/${sale.id}?created=1`;
  } catch (error) {
    redirectTo = pointOfSaleReturn ? pointOfSaleResultPath("software", { error: getErrorMessage(error) }) : `/software-services/new?error=${encodeURIComponent(getErrorMessage(error))}`;
  }
  redirect(redirectTo);
}

const catalogSchema = z.object({
  name: z.string().trim().min(1, "اسم الخدمة مطلوب").max(160),
  defaultPrice: z.string().trim().optional(),
  defaultCost: z.string().trim().optional(),
});

export async function createSoftwareServiceCatalogAction(formData: FormData) {
  let redirectTo = "/software-services";
  try {
    const input = catalogSchema.parse({ name: readString(formData, "name"), defaultPrice: readString(formData, "defaultPrice"), defaultCost: readString(formData, "defaultCost") });
    const auth = await requirePermission("sales:create");
    await softwareServiceService.createCatalogItem(auth.shop.id, input);
    revalidatePath("/software-services");
    redirectTo = "/software-services?catalogSaved=1";
  } catch (error) {
    redirectTo = `/software-services?catalogError=${encodeURIComponent(getErrorMessage(error))}`;
  }
  redirect(redirectTo);
}

export async function markSoftwareDeviceDeliveredAction(formData: FormData) {
  const id = readString(formData, "id");
  let redirectTo = `/software-services/${id}`;
  try {
    const auth = await requirePermission("sales:create");
    await softwareServiceService.markDeviceDelivered(auth.shop.id, id);
    revalidatePath("/software-services");
    revalidatePath(`/software-services/${id}`);
    redirectTo = `/software-services/${id}?delivered=1`;
  } catch (error) {
    redirectTo = `/software-services/${id}?error=${encodeURIComponent(getErrorMessage(error))}`;
  }
  redirect(redirectTo);
}

export async function cancelSoftwareServiceSaleAction(formData: FormData) {
  const id = readString(formData, "id");
  if (!id) redirect("/software-services?cancelError=" + encodeURIComponent("معرّف الخدمة غير موجود."));
  let redirectTo = `/software-services/${id}`;
  try {
    const auth = await requirePermission("sales:create");
    await softwareServiceCancellationService.cancelSoftwareServiceSale(auth.shop.id, id, auth.user.id);
    revalidatePath("/software-services");
    revalidatePath(`/software-services/${id}`);
    revalidatePath("/dashboard");
    revalidatePath("/invoices");
    revalidatePath("/reports");
    revalidatePath("/cash-drawer");
    revalidatePath("/bank-accounts");
    revalidatePath("/transfers");
    revalidatePath("/debts");
    redirectTo = "/software-services?cancelled=1";
  } catch (error) {
    redirectTo = `/software-services/${id}?error=${encodeURIComponent(getErrorMessage(error))}`;
  }
  redirect(redirectTo);
}
