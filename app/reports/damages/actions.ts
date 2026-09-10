"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requirePermission } from "@/lib/auth/context";
import { inventoryDamageService } from "@/lib/services/inventoryDamageService";

const reverseDamageSchema = z.object({
  damageId: z.string().uuid(),
  returnTo: z.string().trim().optional(),
});

function readString(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

function safeReturnTo(value?: string) {
  if (!value || (value !== "/reports/damages" && !value.startsWith("/reports/damages?"))) {
    return "/reports/damages";
  }
  return value;
}

function withStatus(destination: string, key: "reversed" | "error", value: string) {
  const url = new URL(destination, "http://massar.local");
  url.searchParams.set(key, value);
  return `${url.pathname}${url.search}`;
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "تعذر عكس التالف. حاول مجدداً.";
}

export async function reverseInventoryDamageAction(formData: FormData) {
  const parsed = reverseDamageSchema.safeParse({
    damageId: readString(formData, "damageId"),
    returnTo: readString(formData, "returnTo"),
  });

  const destination = safeReturnTo(readString(formData, "returnTo"));
  if (!parsed.success) {
    redirect(withStatus(destination, "error", "معرّف سجل التالف غير صالح."));
  }

  const auth = await requirePermission("inventory:adjust");
  let result: Awaited<ReturnType<typeof inventoryDamageService.reverseInventoryDamage>>;

  try {
    result = await inventoryDamageService.reverseInventoryDamage(
      auth.shop.id,
      parsed.data.damageId,
      auth.user.id,
    );
  } catch (error) {
    redirect(withStatus(destination, "error", errorMessage(error)));
  }

  revalidatePath("/reports");
  revalidatePath("/reports/damages");
  revalidatePath("/inventory");
  revalidatePath(`/inventory/${result.inventoryItemId}`);

  redirect(withStatus(destination, "reversed", "1"));
}
