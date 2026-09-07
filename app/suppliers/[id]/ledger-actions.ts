"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requirePermission } from "@/lib/auth/context";
import { supplierLedgerService } from "@/lib/services/supplierLedgerService";
import { timeZoneForCountry, zonedDateTimeToUtc } from "@/lib/timezone";

const uuid = z.string().uuid();
const requestKey = z.string().trim().min(12).max(120);

function localNoonUtc(dateInput: string, countryCode: string) {
  const [year, month, day] = dateInput.split("-").map(Number);
  if (!year || !month || !day) throw new Error("التاريخ غير صالح.");
  return zonedDateTimeToUtc({ year, month, day, hour: 12 }, timeZoneForCountry(countryCode));
}

function failure(error: unknown) {
  if (error instanceof z.ZodError) return { ok: false as const, error: error.issues[0]?.message || "تحقق من البيانات." };
  return { ok: false as const, error: error instanceof Error ? error.message : "تعذر تنفيذ العملية." };
}

function revalidateSupplierMoney(supplierId: string) {
  revalidatePath(`/suppliers/${supplierId}`);
  revalidatePath("/suppliers");
  revalidatePath("/inventory/purchases");
  revalidatePath("/inventory/purchases/[id]", "page");
  revalidatePath("/cash-drawer");
  revalidatePath("/transfers");
  revalidatePath("/financial-transfers");
  revalidatePath("/reports");
}

export async function addSupplierOpeningDebtAction(input: {
  supplierId: string; requestKey: string; amount: string; occurredAt: string; dueAt?: string; description?: string; reference?: string;
}) {
  try {
    const auth = await requirePermission("inventory:manage");
    const parsed = z.object({
      supplierId: uuid, requestKey, amount: z.coerce.number().positive().transform(String),
      occurredAt: z.string().date(), dueAt: z.string().date().optional().or(z.literal("")),
      description: z.string().trim().max(500).optional(), reference: z.string().trim().max(180).optional(),
    }).parse(input);
    const result = await supplierLedgerService.createOpeningBalance(auth.shop.id, auth.user.id, parsed.supplierId, {
      requestKey: parsed.requestKey, amount: parsed.amount,
      occurredAt: localNoonUtc(parsed.occurredAt, auth.shop.countryCode),
      dueAt: parsed.dueAt ? localNoonUtc(parsed.dueAt, auth.shop.countryCode) : null,
      description: parsed.description, reference: parsed.reference,
    });
    revalidateSupplierMoney(parsed.supplierId);
    return { ok: true as const, ...result };
  } catch (error) { return failure(error); }
}

export async function paySupplierAccountAction(input: {
  supplierId: string; requestKey: string; amount: string; occurredAt: string; accountType: "DRAWER" | "WALLET"; walletId?: string; description?: string; reference?: string;
}) {
  try {
    const auth = await requirePermission("inventory:manage");
    const parsed = z.object({
      supplierId: uuid, requestKey, amount: z.coerce.number().positive().transform(String), occurredAt: z.string().date(),
      accountType: z.enum(["DRAWER","WALLET"]), walletId: z.string().uuid().optional().or(z.literal("")),
      description: z.string().trim().max(500).optional(), reference: z.string().trim().max(180).optional(),
    }).parse(input);
    const result = await supplierLedgerService.recordSupplierPayment(auth.shop.id, auth.user.id, parsed.supplierId, {
      requestKey: parsed.requestKey, amount: parsed.amount,
      occurredAt: localNoonUtc(parsed.occurredAt, auth.shop.countryCode), accountType: parsed.accountType,
      walletId: parsed.accountType === "WALLET" ? parsed.walletId || null : null,
      description: parsed.description, reference: parsed.reference,
    });
    revalidateSupplierMoney(parsed.supplierId);
    return { ok: true as const, ...result };
  } catch (error) { return failure(error); }
}
