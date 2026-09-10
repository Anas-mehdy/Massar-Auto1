"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requirePermission } from "@/lib/auth/context";
import { warehouseService } from "@/lib/services/warehouseService";

function text(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function optionalText(formData: FormData, key: string) {
  return text(formData, key) || null;
}

const uuid = z.string().uuid();

export async function createWarehouseAction(formData: FormData) {
  const auth = await requirePermission("warehouse:manage");
  await warehouseService.createWarehouse(auth.shop.id, {
    name: z.string().min(1).max(120).parse(text(formData, "name")),
    code: optionalText(formData, "code"),
    location: optionalText(formData, "location"),
    isDefault: text(formData, "isDefault") === "on",
  });
  revalidatePath("/warehouses");
}

export async function createStockTransferAction(formData: FormData) {
  const auth = await requirePermission("warehouse:transfer");
  const fromWarehouseId = uuid.parse(text(formData, "fromWarehouseId"));
  const toWarehouseId = uuid.parse(text(formData, "toWarehouseId"));
  const rawItems = text(formData, "items");
  let items: Array<{ inventoryItemId: string; quantity: number }> = [];
  try {
    const parsed = JSON.parse(rawItems || "[]");
    if (Array.isArray(parsed)) {
      items = parsed.map((item) => ({
        inventoryItemId: uuid.parse(String(item.inventoryItemId ?? "")),
        quantity: z.coerce.number().int().positive().parse(item.quantity),
      }));
    }
  } catch {
    throw new Error("بنود التحويل غير صالحة.");
  }
  const result = await warehouseService.postStockTransfer(auth.shop.id, auth.user.id, {
    fromWarehouseId,
    toWarehouseId,
    notes: optionalText(formData, "notes"),
    items,
  });
  revalidatePath("/warehouses");
  redirect(`/warehouses?transfer=${encodeURIComponent(result.transferNumber)}`);
}

export async function createStockTakeAction(formData: FormData) {
  const auth = await requirePermission("warehouse:stocktake");
  const warehouseId = uuid.parse(text(formData, "warehouseId"));
  const result = await warehouseService.createStockTake(auth.shop.id, warehouseId, auth.user.id, optionalText(formData, "notes"));
  revalidatePath("/warehouses");
  redirect(`/warehouses/stocktakes/${result.id}`);
}

export async function updateStockTakeLineAction(formData: FormData) {
  const auth = await requirePermission("warehouse:stocktake");
  const stockTakeId = uuid.parse(text(formData, "stockTakeId"));
  const inventoryItemId = uuid.parse(text(formData, "inventoryItemId"));
  const actualQuantity = z.coerce.number().int().nonnegative().parse(text(formData, "actualQuantity"));
  await warehouseService.updateStockTakeLine(auth.shop.id, stockTakeId, inventoryItemId, actualQuantity);
  revalidatePath(`/warehouses/stocktakes/${stockTakeId}`);
}

export async function postStockTakeAction(formData: FormData) {
  const auth = await requirePermission("warehouse:stocktake");
  const stockTakeId = uuid.parse(text(formData, "stockTakeId"));
  await warehouseService.postStockTake(auth.shop.id, stockTakeId, auth.user.id);
  revalidatePath(`/warehouses/stocktakes/${stockTakeId}`);
  revalidatePath("/warehouses");
}
