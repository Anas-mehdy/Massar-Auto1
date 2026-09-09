"use server";

import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/auth/context";
import { prisma } from "@/lib/prisma";
import { customerService } from "@/lib/services/customerService";
import { debtCollectionService } from "@/lib/services/debtCollectionService";
import { createDebtEntry } from "@/lib/services/debtLedgerService";
import { ANALYTICS_EVENTS } from "@/lib/analytics/events";
import { captureServerEvent } from "@/lib/analytics/server";

export type DebtActionResult = { success: true } | { success: false; error: string };
export type CreateDebtCustomerResult =
  | { success: true; customer: { id: string; name: string; phone: string | null } }
  | { success: false; error: string };

function messageFromError(error: unknown) {
  return error instanceof Error ? error.message : "حدث خطأ غير متوقع. حاول مرة أخرى.";
}

export async function createDebtCustomerAction(input: {
  name: string;
  phone?: string | null;
  email?: string | null;
}): Promise<CreateDebtCustomerResult> {
  try {
    const auth = await requirePermission("debts:manage");
    const customer = await customerService.createCustomer(auth.shop.id, {
      name: input.name,
      phone: input.phone,
      email: input.email,
      notes: "تمت إضافة العميل من دفتر الديون",
    });

    revalidatePath("/customers");
    revalidatePath("/debts");
    return {
      success: true,
      customer: { id: customer.id, name: customer.name, phone: customer.phone },
    };
  } catch (error) {
    return { success: false, error: messageFromError(error) };
  }
}

export async function createDebtAction(input: {
  customerId: string;
  amount: number;
  type?: "DEBT" | "OPENING_BALANCE";
  occurredAt?: string | null;
  dueAt?: string | null;
  description?: string | null;
  reference?: string | null;
  onboarding?: boolean;
}): Promise<DebtActionResult> {
  try {
    const auth = await requirePermission("debts:manage");
    await createDebtEntry(input);
    await captureServerEvent({
      event: ANALYTICS_EVENTS.DEBT_CREATED,
      distinctId: auth.user.id,
      shopId: auth.shop.id,
      countryCode: auth.shop.countryCode,
      properties: {
        debt_type: input.type === "OPENING_BALANCE" ? "opening_balance" : "debt",
        has_due_date: Boolean(input.dueAt),
        source: input.onboarding ? "debts_onboarding" : "debts",
        onboarding_mode: Boolean(input.onboarding),
      },
    });
    revalidatePath("/debts");
    revalidatePath(`/debts/${input.customerId}`);
    return { success: true };
  } catch (error) {
    return { success: false, error: messageFromError(error) };
  }
}

export async function recordDebtPaymentAction(input: {
  customerId: string;
  amount: number;
  occurredAt?: string | null;
  sourceOptionId?: string;
  customSourceName?: string | null;
  saveCustomSource?: boolean;
  description?: string | null;
  reference?: string | null;
  moneyDestination: "DRAWER" | "WALLET" | "BANK" | "OTHER";
  walletId?: string;
  bankAccountId?: string;
  onboarding?: boolean;
}): Promise<DebtActionResult> {
  try {
    const auth = await requirePermission("debts:manage");
    await debtCollectionService.recordPayment(input);
    await captureServerEvent({
      event: ANALYTICS_EVENTS.DEBT_PAYMENT_CREATED,
      distinctId: auth.user.id,
      shopId: auth.shop.id,
      countryCode: auth.shop.countryCode,
      properties: {
        money_destination: input.moneyDestination,
        has_custom_source: Boolean(input.customSourceName?.trim()),
        source: input.onboarding ? "debts_onboarding" : "debts",
        onboarding_mode: Boolean(input.onboarding),
      },
    });
    revalidatePath("/debts");
    revalidatePath(`/debts/${input.customerId}`);
    revalidatePath(`/debts/${input.customerId}/print`);
    revalidatePath("/transfers");
    revalidatePath("/cash-drawer");
    revalidatePath("/bank-accounts");
    revalidatePath("/reports");
    revalidatePath("/invoices");
    revalidatePath("/software-services");
    return { success: true };
  } catch (error) {
    return { success: false, error: messageFromError(error) };
  }
}

export async function updateDebtLedgerEntryAction(input: {
  customerId: string;
  entryId: string;
  amount: number;
  occurredAt?: string | null;
  dueAt?: string | null;
  sourceOptionId?: string;
  customSourceName?: string | null;
  saveCustomSource?: boolean;
  description?: string | null;
  reference?: string | null;
}): Promise<DebtActionResult> {
  try {
    await debtCollectionService.updateEntry(input);
    revalidatePath("/debts");
    revalidatePath(`/debts/${input.customerId}`);
    revalidatePath(`/debts/${input.customerId}/print`);
    revalidatePath("/transfers");
    revalidatePath("/cash-drawer");
    revalidatePath("/bank-accounts");
    revalidatePath("/reports");
    revalidatePath("/invoices");
    revalidatePath("/software-services");
    return { success: true };
  } catch (error) {
    return { success: false, error: messageFromError(error) };
  }
}

export async function deleteDebtLedgerAction(customerId: string): Promise<DebtActionResult> {
  try {
    const auth = await requirePermission("debts:manage");

    const linkedEntries = await prisma.$queryRaw<Array<{ id: string }>>`
      SELECT "id"
      FROM "DebtLedgerEntry"
      WHERE "shopId" = ${auth.shop.id}::uuid
        AND "customerId" = ${customerId}::uuid
        AND "type" = 'DEBT'
        AND "isReversed" = FALSE
        AND "reference" LIKE '[SOURCE-DEBT:%'
      LIMIT 1
    `;
    if (linkedEntries[0]) {
      return {
        success: false,
        error: "لا يمكن حذف دفتر الدين لأنه يحتوي على مبيعة أو خدمة مرتبطة. ألغِ أو عالج العمليات الأصلية أولاً.",
      };
    }

    const deleted = await prisma.$queryRaw<Array<{ id: string }>>`
      DELETE FROM "DebtLedgerAccount"
      WHERE "shopId" = ${auth.shop.id}::uuid
        AND "customerId" = ${customerId}::uuid
      RETURNING "id"
    `;

    if (deleted.length === 0) {
      return { success: false, error: "دفتر الدين غير موجود أو تم حذفه مسبقاً." };
    }

    revalidatePath("/debts");
    revalidatePath(`/debts/${customerId}`);
    return { success: true };
  } catch (error) {
    return { success: false, error: messageFromError(error) };
  }
}
