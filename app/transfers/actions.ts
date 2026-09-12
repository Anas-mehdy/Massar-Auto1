"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requirePermission } from "@/lib/auth/context";
import { pointOfSaleResultPath, readPointOfSaleReturn } from "@/lib/point-of-sale";
import { prisma } from "@/lib/prisma";
import { financialTransferService } from "@/lib/services/financialTransferService";
import { ANALYTICS_EVENTS } from "@/lib/analytics/events";
import { captureServerEvent } from "@/lib/analytics/server";

function readString(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

function errorMessage(error: unknown) {
  if (error instanceof z.ZodError) return error.issues[0]?.message ?? "البيانات غير صحيحة.";
  if (error instanceof Error) return error.message;
  return "حدث خطأ غير متوقع.";
}

const walletSchema = z.object({
  name: z.string().trim().min(1, "اسم المحفظة مطلوب").max(120),
  openingBalance: z.string().trim().optional(),
  monthlyLimit: z.string().trim().optional(),
  defaultDepositCommission: z.string().trim().optional(),
  defaultWithdrawalCommission: z.string().trim().optional(),
});

export async function createWalletAction(formData: FormData) {
  const onboardingMode = readString(formData, "onboarding") === "1";
  let redirectTo = "/transfers";
  try {
    const input = walletSchema.parse({
      name: readString(formData, "name"),
      openingBalance: readString(formData, "openingBalance"),
      monthlyLimit: readString(formData, "monthlyLimit"),
      defaultDepositCommission: readString(formData, "defaultDepositCommission"),
      defaultWithdrawalCommission: readString(formData, "defaultWithdrawalCommission"),
    });
    const auth = await requirePermission("finance:vouchers");
    await financialTransferService.createWallet(auth.shop.id, input);
    await captureServerEvent({
      event: ANALYTICS_EVENTS.WALLET_CREATED,
      distinctId: auth.user.id,
      shopId: auth.shop.id,
      countryCode: auth.shop.countryCode,
      properties: {
        has_opening_balance: Number((input.openingBalance || "0").replace(",", ".")) !== 0,
        has_monthly_limit: Boolean(input.monthlyLimit?.trim()),
        onboarding_mode: onboardingMode,
      },
    });
    revalidatePath("/transfers");
    redirectTo = onboardingMode ? "/transfers?onboarding=1&walletSaved=1" : "/transfers?walletSaved=1";
  } catch (error) {
    redirectTo = onboardingMode
      ? `/transfers?onboarding=1&error=${encodeURIComponent(errorMessage(error))}`
      : `/transfers?error=${encodeURIComponent(errorMessage(error))}`;
  }
  redirect(redirectTo);
}

const updateWalletSchema = z.object({
  walletId: z.string().uuid("المحفظة غير صحيحة"),
  name: z.string().trim().min(1, "اسم المحفظة مطلوب").max(120),
  balance: z.string().trim().min(1, "الرصيد مطلوب"),
  monthlyLimit: z.string().trim().optional(),
  defaultDepositCommission: z.string().trim().optional(),
  defaultWithdrawalCommission: z.string().trim().optional(),
});

export async function updateWalletAction(formData: FormData) {
  let redirectTo = "/transfers";
  try {
    const input = updateWalletSchema.parse({
      walletId: readString(formData, "walletId"),
      name: readString(formData, "name"),
      balance: readString(formData, "balance"),
      monthlyLimit: readString(formData, "monthlyLimit"),
      defaultDepositCommission: readString(formData, "defaultDepositCommission"),
      defaultWithdrawalCommission: readString(formData, "defaultWithdrawalCommission"),
    });
    const parseNumber = (value: string, label: string, allowEmpty = false) => {
      if (allowEmpty && !value.trim()) return null;
      const parsed = Number(value.replace(",", "."));
      if (!Number.isFinite(parsed) || parsed < 0) throw new Error(`${label} يجب أن يكون صفراً أو أكبر.`);
      return parsed;
    };
    const balance = parseNumber(input.balance, "الرصيد")!;
    const monthlyLimit = parseNumber(input.monthlyLimit ?? "", "الحد الشهري", true);
    if (monthlyLimit !== null && monthlyLimit <= 0) throw new Error("الحد الشهري يجب أن يكون أكبر من صفر أو يُترك فارغاً.");
    const depositCommission = parseNumber(input.defaultDepositCommission ?? "", "عمولة الإيداع") ?? 0;
    const withdrawalCommission = parseNumber(input.defaultWithdrawalCommission ?? "", "عمولة السحب") ?? 0;

    const auth = await requirePermission("finance:vouchers");
    const duplicate = await prisma.$queryRaw<Array<{ id: string }>>`
      SELECT "id" FROM "FinancialWallet"
      WHERE "shopId" = ${auth.shop.id}::uuid
        AND "id" <> ${input.walletId}::uuid
        AND "deletedAt" IS NULL
        AND LOWER("name") = LOWER(${input.name})
      LIMIT 1
    `;
    if (duplicate[0]) throw new Error("يوجد بالفعل محفظة أخرى بهذا الاسم.");

    const updated = await prisma.$executeRaw`
      UPDATE "FinancialWallet"
      SET "name" = ${input.name},
          "currentBalance" = ${balance},
          "monthlyLimit" = ${monthlyLimit},
          "defaultDepositCommission" = ${depositCommission},
          "defaultWithdrawalCommission" = ${withdrawalCommission},
          "updatedAt" = NOW()
      WHERE "id" = ${input.walletId}::uuid
        AND "shopId" = ${auth.shop.id}::uuid
        AND "deletedAt" IS NULL
        AND "isActive" = TRUE
    `;
    if (!updated) throw new Error("المحفظة غير موجودة.");
    revalidatePath("/transfers");
    redirectTo = "/transfers?walletUpdated=1";
  } catch (error) {
    redirectTo = `/transfers?error=${encodeURIComponent(errorMessage(error))}`;
  }
  redirect(redirectTo);
}

const transferSchema = z.object({
  walletId: z.string().uuid("اختر محفظة صحيحة"),
  operationType: z.enum(["CUSTOMER_DEPOSIT", "CUSTOMER_WITHDRAWAL", "WALLET_TOPUP", "WALLET_WITHDRAWAL"]),
  amount: z.string().trim().min(1, "المبلغ مطلوب"),
  commission: z.string().trim().optional(),
  commissionMode: z.enum(["DEDUCTED", "ADDED", "NONE"]).optional(),
  isDeferred: z.boolean().optional(),
  settlementType: z.enum(["CASH_DRAWER", "WALLET"]).optional(),
  settlementWalletId: z.string().uuid("اختر محفظة تسوية صحيحة").optional().or(z.literal("")),
  customerId: z.string().uuid().optional().or(z.literal("")),
  customerName: z.string().trim().max(120).optional(),
  customerPhone: z.string().trim().max(40).optional(),
  notes: z.string().trim().max(1000).optional(),
});

export async function createTransferAction(formData: FormData) {
  const pointOfSaleReturn = readPointOfSaleReturn(readString(formData, "returnTo"), "wallet");
  const onboardingMode = !pointOfSaleReturn && readString(formData, "onboarding") === "1";
  let redirectTo = "/transfers";
  try {
    const input = transferSchema.parse({
      walletId: readString(formData, "walletId"),
      operationType: readString(formData, "operationType"),
      amount: readString(formData, "amount"),
      commission: readString(formData, "commission"),
      commissionMode: readString(formData, "commissionMode") || undefined,
      isDeferred: readString(formData, "isDeferred") === "on",
      settlementType: readString(formData, "settlementType") || undefined,
      settlementWalletId: readString(formData, "settlementWalletId"),
      customerId: readString(formData, "customerId"),
      customerName: readString(formData, "customerName"),
      customerPhone: readString(formData, "customerPhone"),
      notes: readString(formData, "notes"),
    });
    const isCustomerOperation = input.operationType === "CUSTOMER_DEPOSIT" || input.operationType === "CUSTOMER_WITHDRAWAL";
    const auth = await requirePermission(isCustomerOperation ? "sales:create" : "finance:vouchers");
    const transfer = await financialTransferService.createTransfer(auth.shop.id, auth.user.id, {
      ...input,
      settlementWalletId: input.settlementWalletId || undefined,
      customerId: input.customerId || undefined,
    });
    await captureServerEvent({
      event: ANALYTICS_EVENTS.TRANSFER_CREATED,
      distinctId: auth.user.id,
      shopId: auth.shop.id,
      countryCode: auth.shop.countryCode,
      properties: {
        operation_type: input.operationType,
        is_deferred: Boolean(input.isDeferred),
        settlement_type: input.isDeferred ? "DEBT" : (input.settlementType || "CASH_DRAWER"),
        has_customer: Boolean(input.customerId || input.customerName || input.customerPhone),
        source: onboardingMode ? "transfers_onboarding" : pointOfSaleReturn ? "point_of_sale" : "transfers",
        onboarding_mode: onboardingMode,
      },
    });
    revalidatePath("/transfers");
    revalidatePath("/cash-drawer");
    revalidatePath("/reports");
    revalidatePath("/debts");
    revalidatePath("/point-of-sale");
    if (input.customerId) revalidatePath(`/debts/${input.customerId}`);
    redirectTo = pointOfSaleReturn
      ? pointOfSaleResultPath("wallet", { saved: "1", transaction: transfer.id })
      : onboardingMode
        ? `/transfers/${transfer.id}?onboarding=1`
        : "/transfers?saved=1";
  } catch (error) {
    redirectTo = pointOfSaleReturn
      ? pointOfSaleResultPath("wallet", { error: errorMessage(error) })
      : onboardingMode
        ? `/transfers?onboarding=1&error=${encodeURIComponent(errorMessage(error))}`
        : `/transfers?error=${encodeURIComponent(errorMessage(error))}`;
  }
  redirect(redirectTo);
}

export async function voidTransferAction(formData: FormData) {
  const id = readString(formData, "id");
  let redirectTo = "/transfers";
  try {
    const auth = await requirePermission("finance:vouchers");
    await financialTransferService.voidTransfer(auth.shop.id, id, auth.user.id);
    revalidatePath("/transfers");
    revalidatePath("/cash-drawer");
    revalidatePath("/reports");
    revalidatePath("/debts");
    redirectTo = "/transfers?voided=1";
  } catch (error) {
    redirectTo = `/transfers?error=${encodeURIComponent(errorMessage(error))}`;
  }
  redirect(redirectTo);
}
