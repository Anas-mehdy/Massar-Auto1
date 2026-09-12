"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requirePermission } from "@/lib/auth/context";
import { cashDrawerService } from "@/lib/services/cashDrawerService";

function readString(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

function errorMessage(error: unknown) {
  if (error instanceof z.ZodError) return error.issues[0]?.message ?? "البيانات غير صحيحة.";
  if (error instanceof Error) return error.message;
  return "حدث خطأ غير متوقع.";
}

function refreshFinancialPages() {
  revalidatePath("/transfers");
  revalidatePath("/reports");
  revalidatePath("/dashboard");
}

export async function setCashDrawerOpeningBalanceAction(formData: FormData) {
  let redirectTo = "/transfers";
  try {
    const input = z.object({ amount: z.string().trim().min(1, "الرصيد الافتتاحي مطلوب"), notes: z.string().trim().max(300).optional() }).parse({
      amount: readString(formData, "amount"),
      notes: readString(formData, "notes"),
    });
    const auth = await requirePermission("finance:vouchers");
    await cashDrawerService.setOpeningBalance(auth.shop.id, auth.user.id, input.amount, input.notes);
    refreshFinancialPages();
    redirectTo = "/transfers?drawerSaved=1";
  } catch (error) {
    redirectTo = `/transfers?error=${encodeURIComponent(errorMessage(error))}`;
  }
  redirect(redirectTo);
}

export async function addCashDrawerMovementAction(formData: FormData) {
  let redirectTo = "/transfers";
  try {
    const input = z.object({
      direction: z.enum(["IN", "OUT"]),
      amount: z.string().trim().min(1, "المبلغ مطلوب"),
      description: z.string().trim().min(1, "سبب الحركة مطلوب").max(200),
      reference: z.string().trim().max(100).optional(),
    }).parse({
      direction: readString(formData, "direction"),
      amount: readString(formData, "amount"),
      description: readString(formData, "description"),
      reference: readString(formData, "reference"),
    });
    const auth = await requirePermission("finance:vouchers");
    await cashDrawerService.addManualMovement(auth.shop.id, auth.user.id, input);
    refreshFinancialPages();
    redirectTo = "/transfers?drawerMovement=1";
  } catch (error) {
    redirectTo = `/transfers?error=${encodeURIComponent(errorMessage(error))}`;
  }
  redirect(redirectTo);
}

export async function transferCashDrawerWalletAction(formData: FormData) {
  let redirectTo = "/transfers";
  try {
    const input = z.object({
      walletId: z.string().uuid("اختر محفظة صحيحة"),
      direction: z.enum(["DRAWER_TO_WALLET", "WALLET_TO_DRAWER"]),
      amount: z.string().trim().min(1, "المبلغ مطلوب"),
      notes: z.string().trim().max(300).optional(),
    }).parse({
      walletId: readString(formData, "walletId"),
      direction: readString(formData, "direction"),
      amount: readString(formData, "amount"),
      notes: readString(formData, "notes"),
    });
    const auth = await requirePermission("finance:vouchers");
    await cashDrawerService.transferWithWallet(auth.shop.id, auth.user.id, input);
    refreshFinancialPages();
    redirectTo = "/transfers?drawerTransfer=1";
  } catch (error) {
    redirectTo = `/transfers?error=${encodeURIComponent(errorMessage(error))}`;
  }
  redirect(redirectTo);
}
