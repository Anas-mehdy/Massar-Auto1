"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requirePermission } from "@/lib/auth/context";
import { inventoryCategoryService } from "@/lib/services/inventoryCategoryService";

const schema = z.object({
  name: z.string().trim().min(1, "اسم التصنيف مطلوب.").max(120, "اسم التصنيف طويل جداً."),
});

export async function quickCreatePurchaseCategoryAction(input: { name: string }) {
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: parsed.error.issues[0]?.message ?? "تحقق من اسم التصنيف." };

  try {
    const auth = await requirePermission("inventory:manage");
    const category = await inventoryCategoryService.createInventoryCategory(auth.shop.id, parsed.data.name);
    revalidatePath("/inventory");
    revalidatePath("/inventory/purchases");
    return { ok: true as const, category: { id: category.id, name: category.name, itemCount: 0 } };
  } catch (error) {
    return { ok: false as const, error: error instanceof Error ? error.message : "تعذر إنشاء التصنيف." };
  }
}
