"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requirePermission } from "@/lib/auth/context";
import { cashDrawerService } from "@/lib/services/cashDrawerService";
import { bankAccountService } from "@/lib/services/bankAccountService";
import { openingBalanceAdjustmentService } from "@/lib/services/openingBalanceAdjustmentService";

const moneySchema = z.string().trim().min(1, "المبلغ مطلوب").refine((value) => {
  const number = Number(value.replace(",", "."));
  return Number.isFinite(number) && number >= 0;
}, "المبلغ غير صحيح");

const positiveMoneySchema = moneySchema.refine((value) => Number(value.replace(",", ".")) > 0, "المبلغ يجب أن يكون أكبر من صفر");

function readString(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

function errorMessage(error: unknown) {
  if (error instanceof z.ZodError) return error.issues[0]?.message || "تحقق من البيانات وحاول مجدداً.";
  return error instanceof Error ? error.message : "تعذر تنفيذ العملية. حاول مجدداً.";
}

function refreshCashViews() {
  revalidatePath("/cash-drawer");
  revalidatePath("/transfers");
  revalidatePath("/reports");
  revalidatePath("/dashboard");
  revalidatePath("/bank-accounts");
}

export async function setOpeningBalanceAction(formData: FormData) {
  const amount = moneySchema.safeParse(readString(formData, "amount"));
  if (!amount.success) redirect(`/cash-drawer?error=${encodeURIComponent(errorMessage(amount.error))}`);
  const auth = await requirePermission("finance:vouchers");
  try {
    await cashDrawerService.setOpeningBalance(auth.shop.id, auth.user.id, amount.data, readString(formData, "notes"));
  } catch (error) {
    redirect(`/cash-drawer?error=${encodeURIComponent(errorMessage(error))}`);
  }
  refreshCashViews();
  redirect("/cash-drawer?openingSaved=1");
}

export async function updateOpeningBalanceAction(formData: FormData) {
  const amount = moneySchema.safeParse(readString(formData, "amount"));
  if (!amount.success) redirect(`/cash-drawer?error=${encodeURIComponent(errorMessage(amount.error))}`);
  const auth = await requirePermission("finance:vouchers");
  try {
    await openingBalanceAdjustmentService.updateOpeningBalance(
      auth.shop.id,
      auth.user.id,
      amount.data,
      readString(formData, "notes"),
    );
  } catch (error) {
    redirect(`/cash-drawer?error=${encodeURIComponent(errorMessage(error))}`);
  }
  refreshCashViews();
  redirect("/cash-drawer?openingUpdated=1");
}

export async function addCashMovementAction(formData: FormData) {
  const parsed = z.object({
    direction: z.enum(["IN", "OUT"]),
    amount: positiveMoneySchema,
    description: z.string().trim().min(1, "سبب الحركة مطلوب").max(500, "سبب الحركة طويل جداً"),
    reference: z.string().trim().max(120, "المرجع طويل جداً").optional(),
  }).safeParse({
    direction: readString(formData, "direction"),
    amount: readString(formData, "amount"),
    description: readString(formData, "description"),
    reference: readString(formData, "reference") || undefined,
  });
  if (!parsed.success) redirect(`/cash-drawer?error=${encodeURIComponent(errorMessage(parsed.error))}`);
  const auth = await requirePermission("finance:vouchers");
  try {
    await cashDrawerService.addManualMovement(auth.shop.id, auth.user.id, parsed.data);
  } catch (error) {
    redirect(`/cash-drawer?error=${encodeURIComponent(errorMessage(error))}`);
  }
  refreshCashViews();
  redirect("/cash-drawer?movementSaved=1");
}

export async function transferCashWalletAction(formData: FormData) {
  const parsed = z.object({
    walletId: z.string().uuid("اختر محفظة صالحة").optional().or(z.literal("")),
    bankAccountId: z.string().uuid("اختر حساباً بنكياً صالحاً").optional().or(z.literal("")),
    direction: z.enum(["DRAWER_TO_WALLET", "WALLET_TO_DRAWER", "DRAWER_TO_BANK", "BANK_TO_DRAWER"]),
    amount: positiveMoneySchema,
    notes: z.string().trim().max(500, "الملاحظة طويلة جداً").optional(),
  }).safeParse({
    walletId: readString(formData, "walletId"),
    bankAccountId: readString(formData, "bankAccountId"),
    direction: readString(formData, "direction"),
    amount: readString(formData, "amount"),
    notes: readString(formData, "notes") || undefined,
  });
  if (!parsed.success) redirect(`/cash-drawer?error=${encodeURIComponent(errorMessage(parsed.error))}`);

  const isBankTransfer = parsed.data.direction === "DRAWER_TO_BANK" || parsed.data.direction === "BANK_TO_DRAWER";
  const auth = await requirePermission(isBankTransfer ? "expenses:manage" : "finance:vouchers");

  try {
    if (parsed.data.direction === "DRAWER_TO_BANK" || parsed.data.direction === "BANK_TO_DRAWER") {
      const bankAccountId = parsed.data.bankAccountId || undefined;
      if (!bankAccountId) throw new Error("اختر حساباً بنكياً صالحاً.");
      const drawerToBank = parsed.data.direction === "DRAWER_TO_BANK";
      await bankAccountService.transferMoney(auth.shop.id, auth.user.id, {
        fromType: drawerToBank ? "DRAWER" : "BANK",
        fromId: drawerToBank ? undefined : bankAccountId,
        toType: drawerToBank ? "BANK" : "DRAWER",
        toId: drawerToBank ? bankAccountId : undefined,
        amount: parsed.data.amount,
        note: parsed.data.notes,
      });
    } else {
      const walletId = parsed.data.walletId || undefined;
      if (!walletId) throw new Error("اختر محفظة صالحة.");
      await cashDrawerService.transferWithWallet(auth.shop.id, auth.user.id, {
        walletId,
        direction: parsed.data.direction,
        amount: parsed.data.amount,
        notes: parsed.data.notes,
      });
    }
  } catch (error) {
    redirect(`/cash-drawer?error=${encodeURIComponent(errorMessage(error))}`);
  }
  refreshCashViews();
  redirect("/cash-drawer?transferSaved=1");
}
