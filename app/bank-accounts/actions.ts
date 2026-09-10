"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requirePermission } from "@/lib/auth/context";
import { bankAccountService } from "@/lib/services/bankAccountService";
import { localDateString, timeZoneForCountry, zonedDateTimeToUtc } from "@/lib/timezone";

function read(formData: FormData, key: string) { const value = formData.get(key); return typeof value === "string" ? value : ""; }
function errorMessage(error: unknown) { if (error instanceof z.ZodError) return error.issues[0]?.message ?? "البيانات غير صحيحة."; return error instanceof Error ? error.message : "تعذر تنفيذ العملية."; }
function refreshFinancialViews() { for (const path of ["/bank-accounts","/cash-drawer","/transfers","/reports","/dashboard","/invoices","/installments","/debts"]) revalidatePath(path); }
function dateOrNow(value: string | undefined, timeZone: string) {
  if (!value?.trim()) return undefined;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!match) throw new Error("تاريخ الحركة غير صحيح.");
  const [year, month, day] = match.slice(1).map(Number);
  const check = new Date(Date.UTC(year, month - 1, day));
  if (check.getUTCFullYear() !== year || check.getUTCMonth() + 1 !== month || check.getUTCDate() !== day) throw new Error("تاريخ الحركة غير صحيح.");
  const normalized = `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  if (normalized === localDateString(new Date(), timeZone)) return undefined;
  return zonedDateTimeToUtc({ year, month, day, hour: 12 }, timeZone);
}
const nonNegativeMoney = z.string().trim().refine((value) => Number.isFinite(Number((value || "0").replace(",", "."))) && Number((value || "0").replace(",", ".")) >= 0, "الرصيد الافتتاحي غير صحيح.");
const positiveMoney = z.string().trim().min(1, "المبلغ مطلوب").refine((value) => Number.isFinite(Number(value.replace(",", "."))) && Number(value.replace(",", ".")) > 0, "المبلغ يجب أن يكون أكبر من صفر.");

export async function createBankAccountAction(formData: FormData) {
  const parsed = z.object({ name:z.string().trim().min(1).max(120), bankName:z.string().trim().max(120).optional(), openingBalance:nonNegativeMoney }).safeParse({ name:read(formData,"name"), bankName:read(formData,"bankName")||undefined, openingBalance:read(formData,"openingBalance")||"0" });
  if (!parsed.success) redirect(`/bank-accounts?error=${encodeURIComponent(errorMessage(parsed.error))}`);
  const auth = await requirePermission("expenses:manage");
  try { await bankAccountService.createAccount(auth.shop.id, auth.user.id, parsed.data); } catch (error) { redirect(`/bank-accounts?error=${encodeURIComponent(errorMessage(error))}`); }
  refreshFinancialViews(); redirect("/bank-accounts?created=1");
}

export async function updateBankAccountAction(formData: FormData) {
  const parsed = z.object({ accountId:z.string().uuid(), name:z.string().trim().min(1).max(120), bankName:z.string().trim().max(120).optional(), isActive:z.enum(["1","0"]) }).safeParse({ accountId:read(formData,"accountId"), name:read(formData,"name"), bankName:read(formData,"bankName")||undefined, isActive:read(formData,"isActive") });
  if (!parsed.success) redirect(`/bank-accounts?error=${encodeURIComponent(errorMessage(parsed.error))}`);
  const auth = await requirePermission("expenses:manage");
  try { await bankAccountService.updateAccount(auth.shop.id, parsed.data.accountId, { name:parsed.data.name, bankName:parsed.data.bankName, isActive:parsed.data.isActive === "1" }); } catch (error) { redirect(`/bank-accounts?error=${encodeURIComponent(errorMessage(error))}`); }
  refreshFinancialViews(); redirect("/bank-accounts?updated=1");
}

export async function adjustBankBalanceAction(formData: FormData) {
  const parsed = z.object({ accountId:z.string().uuid(), direction:z.enum(["IN","OUT"]), amount:positiveMoney, reason:z.string().trim().min(1).max(500), reference:z.string().trim().max(120).optional(), occurredAt:z.string().trim().optional() }).safeParse({ accountId:read(formData,"accountId"), direction:read(formData,"direction"), amount:read(formData,"amount"), reason:read(formData,"reason"), reference:read(formData,"reference")||undefined, occurredAt:read(formData,"occurredAt")||undefined });
  if (!parsed.success) redirect(`/bank-accounts?error=${encodeURIComponent(errorMessage(parsed.error))}`);
  const auth = await requirePermission("expenses:manage");
  const timeZone = timeZoneForCountry(auth.shop.countryCode);
  try { await bankAccountService.adjustBalance(auth.shop.id, auth.user.id, parsed.data.accountId, { ...parsed.data, occurredAt:dateOrNow(parsed.data.occurredAt, timeZone) }); } catch (error) { redirect(`/bank-accounts?error=${encodeURIComponent(errorMessage(error))}`); }
  refreshFinancialViews(); redirect("/bank-accounts?adjusted=1");
}

export async function transferBankMoneyAction(formData: FormData) {
  const parsed = z.object({ fromType:z.enum(["BANK","DRAWER","WALLET"]), fromId:z.string().uuid().optional().or(z.literal("")), toType:z.enum(["BANK","DRAWER","WALLET"]), toId:z.string().uuid().optional().or(z.literal("")), amount:positiveMoney, note:z.string().trim().max(500).optional(), reference:z.string().trim().max(120).optional(), occurredAt:z.string().trim().optional() }).safeParse({ fromType:read(formData,"fromType"), fromId:read(formData,"fromId"), toType:read(formData,"toType"), toId:read(formData,"toId"), amount:read(formData,"amount"), note:read(formData,"note")||undefined, reference:read(formData,"reference")||undefined, occurredAt:read(formData,"occurredAt")||undefined });
  if (!parsed.success) redirect(`/bank-accounts?error=${encodeURIComponent(errorMessage(parsed.error))}`);
  const auth = await requirePermission("expenses:manage");
  const timeZone = timeZoneForCountry(auth.shop.countryCode);
  let transferGroupId: string;
  try { const result = await bankAccountService.transferMoney(auth.shop.id, auth.user.id, { ...parsed.data, fromId:parsed.data.fromId||undefined, toId:parsed.data.toId||undefined, occurredAt:dateOrNow(parsed.data.occurredAt, timeZone) }); transferGroupId = result.transferGroupId; } catch (error) { redirect(`/bank-accounts?error=${encodeURIComponent(errorMessage(error))}`); }
  refreshFinancialViews();
  redirect(`/bank-accounts?transferred=1&transfer=${transferGroupId!}`);
}
