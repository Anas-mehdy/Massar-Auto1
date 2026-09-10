import { ExpenseCategory, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { moneyAccountService, type MoneyAccountDestination } from "@/lib/services/moneyAccountService";

export type ExpenseFundingSource = Exclude<MoneyAccountDestination, "OTHER">;

export type CreateExpenseMoneyInput = {
  title: string;
  category: ExpenseCategory;
  amount: string;
  spentAt: Date;
  movementOccurredAt?: Date;
  notes?: string;
  fundingSource: ExpenseFundingSource;
  fundingWalletId?: string;
  fundingBankAccountId?: string;
};

const expenseCategoryLabels: Record<ExpenseCategory, string> = {
  RENT: "إيجار",
  SALARIES: "رواتب وأجور",
  UTILITIES: "كهرباء وإنترنت وخدمات",
  MARKETING: "تسويق وإعلانات",
  TRANSPORT: "نقل وتوصيل",
  MAINTENANCE: "صيانة وتجهيزات",
  OTHER: "مصروف آخر",
};

function money(value: string | number | Prisma.Decimal) {
  const result = new Prisma.Decimal(String(value).replace(",", ".")).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
  if (!result.isFinite() || result.lte(0)) throw new Error("قيمة المصروف يجب أن تكون أكبر من صفر.");
  return result;
}

function clean(value?: string | null) {
  const text = value?.trim();
  return text || null;
}

export async function createExpense(
  shopId: string,
  createdByUserId: string,
  input: CreateExpenseMoneyInput,
) {
  const amount = money(input.amount);
  const title = input.title.trim();
  if (!title) throw new Error("اسم المصروف مطلوب.");
  if (input.fundingSource === "WALLET" && !input.fundingWalletId) {
    throw new Error("اختر المحفظة التي سُحب منها المصروف.");
  }
  if (input.fundingSource === "BANK" && !input.fundingBankAccountId) {
    throw new Error("اختر الحساب البنكي الذي سُحب منه المصروف.");
  }

  await moneyAccountService.prepareMoneyAccounts(shopId, input.fundingSource);
  const notes = clean(input.notes);
  const categoryLabel = expenseCategoryLabels[input.category];
  const description = notes
    ? `مصروف — ${categoryLabel}: ${title} — ${notes}`
    : `مصروف — ${categoryLabel}: ${title}`;

  return prisma.$transaction(async (tx) => {
    const expense = await tx.expense.create({
      data: {
        shopId,
        createdByUserId,
        category: input.category,
        title,
        amount,
        spentAt: input.spentAt,
        notes,
        fundingSource: input.fundingSource,
        fundingWalletId: input.fundingSource === "WALLET" ? input.fundingWalletId : null,
        fundingBankAccountId: input.fundingSource === "BANK" ? input.fundingBankAccountId : null,
      },
      select: { id: true },
    });

    await moneyAccountService.applyOutgoingMoneyTx(tx, shopId, createdByUserId, {
      destination: input.fundingSource,
      walletId: input.fundingWalletId,
      bankAccountId: input.fundingBankAccountId,
      amount,
      reference: title,
      description,
      movementType: "EXPENSE_PAYMENT",
      contextLabel: `المصروف «${title}»`,
      occurredAt: input.movementOccurredAt,
      source: {
        sourceType: "EXPENSE",
        sourceId: expense.id,
        sourceReference: title,
      },
    });

    return expense;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 10_000 });
}

export async function deleteExpense(shopId: string, expenseId: string, voidedByUserId?: string | null) {
  return prisma.$transaction(async (tx) => {
    const expense = await tx.expense.findFirst({
      where: { id: expenseId, shopId, deletedAt: null },
      select: { id: true },
    });
    if (!expense) throw new Error("المصروف غير موجود.");

    await moneyAccountService.reverseSourceMoneyTx(tx, shopId, "EXPENSE", expense.id, voidedByUserId ?? null);

    return tx.expense.update({
      where: { id: expense.id },
      data: { deletedAt: new Date(), version: { increment: 1 } },
    });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 10_000 });
}

export const expenseMoneyService = { createExpense, deleteExpense };
