"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requirePermission } from "@/lib/auth/context";
import { dailyCashCloseService } from "@/lib/services/dailyCashCloseService";

function read(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

export async function closeBusinessDayAction(formData: FormData) {
  const auth = await requirePermission("cash:close");
  const businessDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).parse(read(formData, "businessDate"));
  const actualCash = z.coerce.number().nonnegative().parse(read(formData, "actualCash"));
  await dailyCashCloseService.closeBusinessDay(
    auth.shop.id,
    businessDate,
    actualCash,
    auth.user.id,
    read(formData, "notes") || null,
  );
  revalidatePath("/cash-closing");
  revalidatePath("/cash-drawer");
}

export async function reopenBusinessDayAction(formData: FormData) {
  const auth = await requirePermission("cash:reopen");
  const businessDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).parse(read(formData, "businessDate"));
  const reason = z.string().min(3).max(500).parse(read(formData, "reason"));
  await dailyCashCloseService.reopenBusinessDay(auth.shop.id, businessDate, auth.user.id, reason);
  revalidatePath("/cash-closing");
  revalidatePath("/cash-drawer");
}
