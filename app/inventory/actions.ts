"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requirePermission } from "@/lib/auth/context";
import { inventoryService } from "@/lib/services/inventoryService";
import { inventoryCategoryService } from "@/lib/services/inventoryCategoryService";
import { inventoryDamageService } from "@/lib/services/inventoryDamageService";
import { ANALYTICS_EVENTS } from "@/lib/analytics/events";
import { captureServerEvent } from "@/lib/analytics/server";

const optionalMoneySchema = z
  .string()
  .trim()
  .optional()
  .refine((value) => !value || Number(value.replace(",", ".")) >= 0, {
    message: "القيمة يجب أن تكون صفراً أو أكثر",
  });

const requiredMoneySchema = z
  .string()
  .trim()
  .min(1, "السعر مطلوب")
  .refine((value) => Number(value.replace(",", ".")) >= 0, {
    message: "السعر يجب أن يكون صفراً أو أكثر",
  });

const nonNegativeIntegerSchema = z
  .string()
  .trim()
  .optional()
  .refine((value) => !value || Number.parseInt(value, 10) >= 0, {
    message: "الكمية يجب أن تكون صفراً أو أكثر",
  });

const positiveIntegerSchema = z
  .string()
  .trim()
  .min(1, "الكمية مطلوبة")
  .refine((value) => Number.parseInt(value, 10) > 0, {
    message: "الكمية يجب أن تكون أكبر من صفر",
  });

const postgresUuidSchema = z.string().regex(
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
  "معرّف غير صالح",
);

const optionalPostgresUuidSchema = z.string().trim().optional().refine(
  (value) => !value || postgresUuidSchema.safeParse(value).success,
  "التصنيف المحدد غير صالح",
);

const optionalSupplierUuidSchema = z.string().trim().optional().refine(
  (value) => !value || postgresUuidSchema.safeParse(value).success,
  "المورد المحدد غير صالح",
);

const categoryNameSchema = z.string().trim().max(120, "اسم التصنيف طويل جداً").optional();

const createInventoryItemSchema = z.object({
  name: z.string().trim().min(1, "اسم القطعة مطلوب"),
  categoryId: optionalPostgresUuidSchema,
  newCategoryName: categoryNameSchema,
  sku: z.string().optional(),
  description: z.string().optional(),
  unitCost: optionalMoneySchema,
  unitPrice: requiredMoneySchema,
  quantity: nonNegativeIntegerSchema,
  reorderLevel: nonNegativeIntegerSchema,
});

const updateInventoryItemDetailsSchema = z.object({
  inventoryItemId: z.string().uuid(),
  name: z.string().trim().min(1, "اسم القطعة مطلوب"),
  categoryId: optionalPostgresUuidSchema,
  newCategoryName: categoryNameSchema,
  sku: z.string().optional(),
  description: z.string().optional(),
  unitCost: optionalMoneySchema,
  unitPrice: requiredMoneySchema,
  reorderLevel: nonNegativeIntegerSchema,
});

const addStockSchema = z.object({
  inventoryItemId: z.string().uuid(),
  quantity: positiveIntegerSchema,
  supplierId: optionalSupplierUuidSchema,
  note: z.string().trim().max(1000, "ملاحظة التوريد طويلة جداً").optional(),
});

const adjustStockSchema = z.object({
  inventoryItemId: z.string().uuid(),
  newQuantity: z.string().trim().min(1, "الكمية الجديدة مطلوبة").refine(
    (value) => Number.parseInt(value, 10) >= 0,
    { message: "الكمية الجديدة يجب أن تكون صفراً أو أكثر" },
  ),
  note: z.string().optional(),
});

const damageStockSchema = z.object({
  inventoryItemId: z.string().uuid(),
  quantity: positiveIntegerSchema,
  reason: z.string().trim().min(1, "سبب التلف مطلوب").max(200, "سبب التلف طويل جداً"),
  note: z.string().trim().max(1000, "ملاحظة التلف طويلة جداً").optional(),
});

const inventoryItemIdSchema = z.object({ inventoryItemId: z.string().uuid() });
const inventoryCategoryIdSchema = z.object({ categoryId: z.string().uuid() });
const renameInventoryCategorySchema = z.object({
  categoryId: z.string().uuid(),
  name: z.string().trim().min(1, "اسم التصنيف مطلوب").max(120, "اسم التصنيف طويل جداً"),
});

function readString(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

function errorMessage(error: unknown) {
  if (error instanceof z.ZodError) {
    return error.issues[0]?.message || "تحقق من البيانات وحاول مجدداً.";
  }
  return error instanceof Error ? error.message : "تعذر تنفيذ العملية. حاول مجدداً.";
}

export async function createInventoryItemAction(formData: FormData) {
  const onboardingMode = readString(formData, "onboarding") === "1";
  const parsed = createInventoryItemSchema.safeParse({
    name: readString(formData, "name"),
    categoryId: readString(formData, "categoryId"),
    newCategoryName: readString(formData, "newCategoryName"),
    sku: readString(formData, "sku"),
    description: readString(formData, "description"),
    unitCost: readString(formData, "unitCost"),
    unitPrice: readString(formData, "unitPrice"),
    quantity: readString(formData, "quantity"),
    reorderLevel: readString(formData, "reorderLevel"),
  });

  if (!parsed.success) {
    redirect(`${onboardingMode ? "/inventory/new?onboarding=1&" : "/inventory/new?"}error=${encodeURIComponent(errorMessage(parsed.error))}`);
  }
  if (onboardingMode && Number.parseInt(parsed.data.quantity || "0", 10) <= 0) {
    redirect(`/inventory/new?onboarding=1&error=${encodeURIComponent("أدخل كمية فعلية أكبر من صفر حتى نسجل أول حركة مخزون.")}`);
  }

  const auth = await requirePermission("inventory:manage");
  let item: Awaited<ReturnType<typeof inventoryService.createInventoryItem>>;
  try {
    item = await inventoryService.createInventoryItem(auth.shop.id, auth.user.id, parsed.data);
  } catch (error) {
    redirect(`${onboardingMode ? "/inventory/new?onboarding=1&" : "/inventory/new?"}error=${encodeURIComponent(errorMessage(error))}`);
  }

  await captureServerEvent({
    event: ANALYTICS_EVENTS.INVENTORY_ITEM_CREATED,
    distinctId: auth.user.id,
    shopId: auth.shop.id,
    countryCode: auth.shop.countryCode,
    properties: {
      has_category: Boolean(parsed.data.categoryId || parsed.data.newCategoryName),
      has_opening_quantity: Number.parseInt(parsed.data.quantity || "0", 10) > 0,
      source: onboardingMode ? "inventory_onboarding" : "inventory",
      onboarding_mode: onboardingMode,
    },
  });

  if (onboardingMode) {
    await captureServerEvent({
      event: ANALYTICS_EVENTS.INVENTORY_STOCK_ADDED,
      distinctId: auth.user.id,
      shopId: auth.shop.id,
      countryCode: auth.shop.countryCode,
      properties: {
        quantity: Number.parseInt(parsed.data.quantity || "0", 10),
        has_supplier: false,
        source: "opening_balance",
        onboarding_mode: true,
      },
    });
  }

  revalidatePath("/inventory");
  redirect(onboardingMode ? `/inventory/${item.id}?onboarding=1` : `/inventory/${item.id}`);
}

export async function updateInventoryItemDetailsAction(formData: FormData) {
  const parsed = updateInventoryItemDetailsSchema.safeParse({
    inventoryItemId: readString(formData, "inventoryItemId"),
    name: readString(formData, "name"),
    categoryId: readString(formData, "categoryId"),
    newCategoryName: readString(formData, "newCategoryName"),
    sku: readString(formData, "sku"),
    description: readString(formData, "description"),
    unitCost: readString(formData, "unitCost"),
    unitPrice: readString(formData, "unitPrice"),
    reorderLevel: readString(formData, "reorderLevel"),
  });

  if (!parsed.success) {
    const itemId = readString(formData, "inventoryItemId");
    const destination = z.string().uuid().safeParse(itemId).success ? `/inventory/${itemId}` : "/inventory";
    redirect(`${destination}?error=${encodeURIComponent(errorMessage(parsed.error))}`);
  }

  const auth = await requirePermission("inventory:manage");
  try {
    await inventoryService.updateInventoryItemDetails(auth.shop.id, parsed.data.inventoryItemId, parsed.data);
  } catch (error) {
    redirect(`/inventory/${parsed.data.inventoryItemId}?error=${encodeURIComponent(errorMessage(error))}`);
  }

  revalidatePath("/inventory");
  revalidatePath(`/inventory/${parsed.data.inventoryItemId}`);
  redirect(`/inventory/${parsed.data.inventoryItemId}`);
}

export async function addStockAction(formData: FormData) {
  const parsed = addStockSchema.safeParse({
    inventoryItemId: readString(formData, "inventoryItemId"),
    quantity: readString(formData, "quantity"),
    supplierId: readString(formData, "supplierId"),
    note: readString(formData, "note"),
  });

  const itemId = readString(formData, "inventoryItemId");
  const destination = z.string().uuid().safeParse(itemId).success ? `/inventory/${itemId}` : "/inventory";
  if (!parsed.success) redirect(`${destination}?error=${encodeURIComponent(errorMessage(parsed.error))}`);

  const auth = await requirePermission("inventory:manage");
  try {
    await inventoryService.addStock(auth.shop.id, parsed.data.inventoryItemId, auth.user.id, {
      quantity: parsed.data.quantity,
      supplierId: parsed.data.supplierId || null,
      note: parsed.data.note,
    });
  } catch (error) {
    redirect(`${destination}?error=${encodeURIComponent(errorMessage(error))}`);
  }

  await captureServerEvent({
    event: ANALYTICS_EVENTS.INVENTORY_STOCK_ADDED,
    distinctId: auth.user.id,
    shopId: auth.shop.id,
    countryCode: auth.shop.countryCode,
    properties: {
      quantity: Number.parseInt(parsed.data.quantity, 10),
      has_supplier: Boolean(parsed.data.supplierId),
    },
  });

  revalidatePath("/inventory");
  revalidatePath(`/inventory/${parsed.data.inventoryItemId}`);
  revalidatePath("/suppliers");
  if (parsed.data.supplierId) revalidatePath(`/suppliers/${parsed.data.supplierId}`);
  redirect(`/inventory/${parsed.data.inventoryItemId}?stockAdded=1`);
}

export async function adjustStockAction(formData: FormData) {
  const input = adjustStockSchema.parse({
    inventoryItemId: readString(formData, "inventoryItemId"),
    newQuantity: readString(formData, "newQuantity"),
    note: readString(formData, "note"),
  });
  const auth = await requirePermission("inventory:adjust");
  await inventoryService.adjustStock(auth.shop.id, input.inventoryItemId, auth.user.id, input);
  revalidatePath("/inventory");
  revalidatePath(`/inventory/${input.inventoryItemId}`);
  redirect(`/inventory/${input.inventoryItemId}`);
}

export async function recordDamagedStockAction(formData: FormData) {
  const parsed = damageStockSchema.safeParse({
    inventoryItemId: readString(formData, "inventoryItemId"),
    quantity: readString(formData, "quantity"),
    reason: readString(formData, "reason"),
    note: readString(formData, "note"),
  });

  const itemId = readString(formData, "inventoryItemId");
  const destination = z.string().uuid().safeParse(itemId).success ? `/inventory/${itemId}` : "/inventory";
  if (!parsed.success) redirect(`${destination}?error=${encodeURIComponent(errorMessage(parsed.error))}`);

  const auth = await requirePermission("inventory:adjust");
  try {
    await inventoryDamageService.recordInventoryDamage(
      auth.shop.id,
      parsed.data.inventoryItemId,
      auth.user.id,
      {
        quantity: Number.parseInt(parsed.data.quantity, 10),
        reason: parsed.data.reason,
        note: parsed.data.note,
      },
    );
  } catch (error) {
    redirect(`${destination}?error=${encodeURIComponent(errorMessage(error))}`);
  }

  revalidatePath("/inventory");
  revalidatePath(`/inventory/${parsed.data.inventoryItemId}`);
  redirect(`/inventory/${parsed.data.inventoryItemId}?damaged=1`);
}

export async function deleteInventoryItemAction(formData: FormData) {
  try {
    const input = inventoryItemIdSchema.parse({ inventoryItemId: readString(formData, "inventoryItemId") });
    const auth = await requirePermission("inventory:manage");
    await inventoryService.softDeleteInventoryItem(auth.shop.id, input.inventoryItemId);
    revalidatePath("/inventory");
    redirect("/inventory?deleted=1");
  } catch (error) {
    if (error && typeof error === "object" && "digest" in error) throw error;
    redirect(`/inventory?error=${encodeURIComponent(errorMessage(error))}`);
  }
}

export async function renameInventoryCategoryAction(formData: FormData) {
  try {
    const input = renameInventoryCategorySchema.parse({
      categoryId: readString(formData, "categoryId"),
      name: readString(formData, "name"),
    });
    const auth = await requirePermission("inventory:manage");
    await inventoryCategoryService.renameInventoryCategory(auth.shop.id, input.categoryId, input.name);
    revalidatePath("/inventory");
    redirect(`/inventory?categoryId=${input.categoryId}&categoryUpdated=1`);
  } catch (error) {
    if (error && typeof error === "object" && "digest" in error) throw error;
    redirect(`/inventory?error=${encodeURIComponent(errorMessage(error))}`);
  }
}

export async function deleteInventoryCategoryAction(formData: FormData) {
  try {
    const input = inventoryCategoryIdSchema.parse({ categoryId: readString(formData, "categoryId") });
    const auth = await requirePermission("inventory:manage");
    await inventoryCategoryService.deleteInventoryCategory(auth.shop.id, input.categoryId);
    revalidatePath("/inventory");
    redirect("/inventory?categoryDeleted=1");
  } catch (error) {
    if (error && typeof error === "object" && "digest" in error) throw error;
    redirect(`/inventory?error=${encodeURIComponent(errorMessage(error))}`);
  }
}