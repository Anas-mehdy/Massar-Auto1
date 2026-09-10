"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requirePermission } from "@/lib/auth/context";
import { voucherService, type VoucherAccountType } from "@/lib/services/voucherService";

function read(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function nullable(formData: FormData, key: string) {
  return read(formData, key) || null;
}

const accountTypeSchema = z.enum(["DRAWER", "WALLET", "BANK", "OTHER"]);

export async function createReceiptVoucherAction(formData: FormData) {
  const auth = await requirePermission("finance:vouchers");
  const accountType = accountTypeSchema.parse(read(formData, "accountType")) as VoucherAccountType;
  await voucherService.createReceiptVoucher(auth.shop.id, auth.user.id, {
    amount: z.coerce.number().positive().parse(read(formData, "amount")),
    accountType,
    customerId: nullable(formData, "customerId"),
    payerName: nullable(formData, "payerName"),
    walletId: accountType === "WALLET" ? nullable(formData, "walletId") : null,
    bankAccountId: accountType === "BANK" ? nullable(formData, "bankAccountId") : null,
    sourceName: accountType === "OTHER" ? nullable(formData, "sourceName") : null,
    reason: z.string().min(1).max(300).parse(read(formData, "reason")),
    reference: nullable(formData, "reference"),
    notes: nullable(formData, "notes"),
  });
  revalidatePath("/vouchers");
  revalidatePath("/cash-drawer");
  revalidatePath("/bank-accounts");
  revalidatePath("/transfers");
}

export async function createPaymentVoucherAction(formData: FormData) {
  const auth = await requirePermission("finance:vouchers");
  const accountType = accountTypeSchema.parse(read(formData, "accountType")) as VoucherAccountType;
  await voucherService.createPaymentVoucher(auth.shop.id, auth.user.id, {
    amount: z.coerce.number().positive().parse(read(formData, "amount")),
    accountType,
    supplierId: nullable(formData, "supplierId"),
    payeeName: nullable(formData, "payeeName"),
    walletId: accountType === "WALLET" ? nullable(formData, "walletId") : null,
    bankAccountId: accountType === "BANK" ? nullable(formData, "bankAccountId") : null,
    sourceName: accountType === "OTHER" ? nullable(formData, "sourceName") : null,
    reason: z.string().min(1).max(300).parse(read(formData, "reason")),
    reference: nullable(formData, "reference"),
    notes: nullable(formData, "notes"),
  });
  revalidatePath("/vouchers");
  revalidatePath("/cash-drawer");
  revalidatePath("/bank-accounts");
  revalidatePath("/transfers");
}
