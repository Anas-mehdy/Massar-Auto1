import { Prisma } from "@prisma/client";

import { requirePermission } from "@/lib/auth/context";
import { parseSourceDebtReference } from "@/lib/debt-source-reference";
import { prisma } from "@/lib/prisma";
import { bankAccountService } from "@/lib/services/bankAccountService";
import { cashDrawerService } from "@/lib/services/cashDrawerService";
import {
  collectionMoneyService,
  type CollectionMoneyDestination,
} from "@/lib/services/collectionMoneyService";
import { financialTransferService } from "@/lib/services/financialTransferService";
import { resolvePaymentSource } from "@/lib/services/paymentSourceService";
import { sourceDebtService } from "@/lib/services/sourceDebtService";

export type DebtEntryType =
  | "DEBT"
  | "PAYMENT"
  | "OPENING_BALANCE"
  | "ADJUSTMENT_DEBIT"
  | "ADJUSTMENT_CREDIT";

function normalizeOptional(value?: string | null) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function parsePositiveAmount(value: number) {
  if (!Number.isFinite(value) || value <= 0) throw new Error("يجب أن يكون المبلغ أكبر من صفر.");
  return Math.round(value * 100) / 100;
}

function parseOptionalDate(value?: string | null) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error("التاريخ غير صالح.");
  return date;
}

async function customerInShop(tx: Prisma.TransactionClient, shopId: string, customerId: string) {
  const rows = await tx.$queryRaw<Array<{ id: string; name: string }>>`
    SELECT "id", "name"
    FROM "Customer"
    WHERE "id" = ${customerId}::uuid
      AND "shopId" = ${shopId}::uuid
      AND "deletedAt" IS NULL
    LIMIT 1
  `;
  if (!rows[0]) throw new Error("العميل غير موجود في هذا المتجر.");
  return rows[0];
}

async function ensureAccount(tx: Prisma.TransactionClient, shopId: string, customerId: string) {
  const rows = await tx.$queryRaw<Array<{ id: string }>>`
    INSERT INTO "DebtLedgerAccount" ("shopId", "customerId", "updatedAt")
    VALUES (${shopId}::uuid, ${customerId}::uuid, NOW())
    ON CONFLICT ("shopId", "customerId")
    DO UPDATE SET "updatedAt" = NOW()
    RETURNING "id"
  `;
  return rows[0].id;
}

async function balanceInTransaction(
  tx: Prisma.TransactionClient,
  shopId: string,
  customerId: string,
  excludingEntryId?: string,
) {
  const rows = await tx.$queryRaw<Array<{ balance: Prisma.Decimal | number | string }>>`
    SELECT COALESCE(SUM(
      CASE
        WHEN "isReversed" THEN 0
        WHEN "type" IN ('DEBT','OPENING_BALANCE','ADJUSTMENT_DEBIT') THEN "amount"
        WHEN "type" IN ('PAYMENT','ADJUSTMENT_CREDIT') THEN -"amount"
        ELSE 0
      END
    ), 0) AS "balance"
    FROM "DebtLedgerEntry"
    WHERE "shopId" = ${shopId}::uuid
      AND "customerId" = ${customerId}::uuid
      AND (${excludingEntryId ?? null}::uuid IS NULL OR "id" <> ${excludingEntryId ?? null}::uuid)
  `;
  return Number(rows[0]?.balance ?? 0);
}

function trackingToken(entryId: string) {
  return `[DEBT-PAYMENT:${entryId}]`;
}

type TrackedCollection =
  | { destination: "DRAWER"; movementId: string; drawerId: string; amount: Prisma.Decimal }
  | { destination: "WALLET"; transferId: string; walletId: string; walletName: string; amount: Prisma.Decimal }
  | { destination: "BANK"; movementId: string; bankAccountId: string; bankAccountName: string; amount: Prisma.Decimal };

async function findTrackedCollectionTx(
  tx: Prisma.TransactionClient,
  shopId: string,
  entryId: string,
): Promise<TrackedCollection | null> {
  const token = `%${trackingToken(entryId)}%`;
  const drawerRows = await tx.$queryRaw<Array<{ id: string; drawerId: string; amount: Prisma.Decimal }>>`
    SELECT "id", "drawerId", "amount"
    FROM "CashDrawerMovement"
    WHERE "shopId" = ${shopId}::uuid
      AND "status" = 'ACTIVE'
      AND "type" = 'DEBT_PAYMENT'
      AND "description" LIKE ${token}
    LIMIT 1
    FOR UPDATE
  `;
  if (drawerRows[0]) {
    return {
      destination: "DRAWER",
      movementId: drawerRows[0].id,
      drawerId: drawerRows[0].drawerId,
      amount: drawerRows[0].amount,
    };
  }

  const walletRows = await tx.$queryRaw<Array<{
    id: string;
    walletId: string;
    walletName: string;
    walletAmount: Prisma.Decimal;
  }>>`
    SELECT t."id", t."walletId", w."name" AS "walletName", t."walletAmount"
    FROM "FinancialTransfer" t
    JOIN "FinancialWallet" w ON w."id" = t."walletId"
    WHERE t."shopId" = ${shopId}::uuid
      AND t."status" = 'ACTIVE'
      AND t."deletedAt" IS NULL
      AND t."operationType" = 'WALLET_TOPUP'
      AND t."notes" LIKE ${token}
    LIMIT 1
    FOR UPDATE OF t
  `;
  if (walletRows[0]) {
    return {
      destination: "WALLET",
      transferId: walletRows[0].id,
      walletId: walletRows[0].walletId,
      walletName: walletRows[0].walletName,
      amount: walletRows[0].walletAmount,
    };
  }

  const bankRows = await tx.$queryRaw<Array<{
    id: string;
    bankAccountId: string;
    bankAccountName: string;
    amount: Prisma.Decimal;
  }>>`
    SELECT m."id", m."bankAccountId", a."name" AS "bankAccountName", m."amount"
    FROM "BankAccountMovement" m
    JOIN "BankAccount" a ON a."id" = m."bankAccountId" AND a."shopId" = m."shopId"
    WHERE m."shopId" = ${shopId}::uuid
      AND m."status" = 'ACTIVE'
      AND m."type" = 'DEBT_PAYMENT'
      AND m."sourceType" = 'DEBT'
      AND m."sourceId" = ${entryId}
    LIMIT 1
  `;
  if (bankRows[0]) {
    return {
      destination: "BANK",
      movementId: bankRows[0].id,
      bankAccountId: bankRows[0].bankAccountId,
      bankAccountName: bankRows[0].bankAccountName,
      amount: bankRows[0].amount,
    };
  }
  return null;
}

async function syncTrackedCollectionTx(
  tx: Prisma.TransactionClient,
  shopId: string,
  tracked: TrackedCollection,
  input: { amount: number; description: string; reference?: string | null; occurredAt: Date },
) {
  const nextAmount = new Prisma.Decimal(input.amount);
  const delta = nextAmount.sub(tracked.amount);

  if (tracked.destination === "DRAWER") {
    const drawerRows = await tx.$queryRaw<Array<{ currentBalance: Prisma.Decimal }>>`
      SELECT "currentBalance"
      FROM "CashDrawer"
      WHERE "id" = ${tracked.drawerId}::uuid AND "shopId" = ${shopId}::uuid
      FOR UPDATE
    `;
    const drawer = drawerRows[0];
    if (!drawer) throw new Error("الدرج النقدي المرتبط بالتحصيل غير موجود.");
    const nextBalance = drawer.currentBalance.add(delta);
    if (nextBalance.lt(0)) throw new Error("لا يمكن تقليل التحصيل لأن رصيد الدرج الحالي غير كافٍ.");

    await tx.$executeRaw`
      UPDATE "CashDrawer"
      SET "currentBalance" = ${nextBalance}, "updatedAt" = NOW()
      WHERE "id" = ${tracked.drawerId}::uuid
    `;
    await tx.$executeRaw`
      UPDATE "CashDrawerMovement"
      SET "amount" = ${nextAmount},
          "description" = ${input.description},
          "reference" = ${input.reference ?? null},
          "createdAt" = ${input.occurredAt}
      WHERE "id" = ${tracked.movementId}::uuid
    `;
    return "الدرج النقدي";
  }

  if (tracked.destination === "BANK") {
    await bankAccountService.updateActiveMovementTx(tx, shopId, tracked.movementId, {
      amount: nextAmount,
      description: input.description,
      reference: input.reference ?? null,
      occurredAt: input.occurredAt,
    });
    return tracked.bankAccountName;
  }

  const walletRows = await tx.$queryRaw<Array<{ currentBalance: Prisma.Decimal }>>`
    SELECT "currentBalance"
    FROM "FinancialWallet"
    WHERE "id" = ${tracked.walletId}::uuid
      AND "shopId" = ${shopId}::uuid
      AND "deletedAt" IS NULL
    FOR UPDATE
  `;
  const wallet = walletRows[0];
  if (!wallet) throw new Error("المحفظة المرتبطة بالتحصيل غير موجودة.");
  const nextBalance = wallet.currentBalance.add(delta);
  if (nextBalance.lt(0)) throw new Error(`لا يمكن تقليل التحصيل لأن رصيد محفظة ${tracked.walletName} غير كافٍ.`);

  await tx.$executeRaw`
    UPDATE "FinancialWallet"
    SET "currentBalance" = ${nextBalance}, "updatedAt" = NOW()
    WHERE "id" = ${tracked.walletId}::uuid
  `;
  await tx.$executeRaw`
    UPDATE "FinancialTransfer"
    SET "amount" = ${nextAmount},
        "walletAmount" = ${nextAmount},
        "notes" = ${input.description},
        "createdAt" = ${input.occurredAt},
        "updatedAt" = NOW()
    WHERE "id" = ${tracked.transferId}::uuid
  `;
  return tracked.walletName;
}

export async function recordPayment(input: {
  customerId: string;
  amount: number;
  occurredAt?: string | null;
  sourceOptionId?: string;
  customSourceName?: string | null;
  saveCustomSource?: boolean;
  description?: string | null;
  reference?: string | null;
  moneyDestination: CollectionMoneyDestination;
  walletId?: string;
  bankAccountId?: string;
}) {
  const auth = await requirePermission("debts:manage");
  const amount = parsePositiveAmount(input.amount);
  const occurredAt = parseOptionalDate(input.occurredAt) ?? new Date();
  if (input.moneyDestination === "WALLET" && !input.walletId) {
    throw new Error("اختر المحفظة التي استلمت التحصيل.");
  }
  if (input.moneyDestination === "BANK" && !input.bankAccountId) {
    throw new Error("اختر الحساب البنكي الذي استلم التحصيل.");
  }

  await collectionMoneyService.prepareCollectionMoneyAccount(auth.shop.id, input.moneyDestination);

  await prisma.$transaction(async (tx) => {
    const customer = await customerInShop(tx, auth.shop.id, input.customerId);
    const accountId = await ensureAccount(tx, auth.shop.id, input.customerId);
    const currentBalance = await balanceInTransaction(tx, auth.shop.id, input.customerId);
    if (currentBalance <= 0) throw new Error("لا يوجد رصيد مستحق على هذا العميل.");
    if (amount - currentBalance > 0.005) {
      throw new Error(`المبلغ المدفوع أكبر من الرصيد المستحق (${currentBalance.toFixed(2)}).`);
    }

    const paymentSourceName = await resolvePaymentSource(tx, auth.shop.id, {
      sourceOptionId: input.sourceOptionId,
      customSourceName: input.customSourceName ?? undefined,
      saveCustomSource: input.saveCustomSource,
    });

    const entries = await tx.$queryRaw<Array<{ id: string }>>`
      INSERT INTO "DebtLedgerEntry" (
        "shopId", "accountId", "customerId", "type", "amount",
        "occurredAt", "description", "reference", "sourceName", "createdByUserId"
      ) VALUES (
        ${auth.shop.id}::uuid,
        ${accountId}::uuid,
        ${input.customerId}::uuid,
        'PAYMENT',
        ${amount},
        ${occurredAt},
        ${normalizeOptional(input.description)},
        ${normalizeOptional(input.reference)},
        ${paymentSourceName},
        ${auth.user.id}::uuid
      )
      RETURNING "id"
    `;
    const entryId = entries[0]?.id;
    if (!entryId) throw new Error("تعذر إنشاء حركة التحصيل.");

    const trackedSourceName = await collectionMoneyService.applyCollectionIncomingTx(
      tx,
      auth.shop.id,
      auth.user.id,
      {
        destination: input.moneyDestination,
        walletId: input.walletId,
        bankAccountId: input.bankAccountId,
        amount,
        reference: input.reference,
        description: `تحصيل دين ${customer.name} ${trackingToken(entryId)}`,
        movementType: "DEBT_PAYMENT",
        occurredAt,
      },
    );
    if (trackedSourceName && trackedSourceName !== paymentSourceName) {
      await tx.$executeRaw`
        UPDATE "DebtLedgerEntry"
        SET "sourceName" = ${trackedSourceName}, "updatedAt" = NOW()
        WHERE "id" = ${entryId}::uuid
      `;
    }

    await sourceDebtService.syncSoftwareDebtInvoicesTx(tx, auth.shop.id, input.customerId);
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 15_000 });
}

export async function updateEntry(input: {
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
}) {
  const auth = await requirePermission("debts:manage");
  const amount = parsePositiveAmount(input.amount);
  const occurredAt = parseOptionalDate(input.occurredAt) ?? new Date();
  const dueAt = parseOptionalDate(input.dueAt);

  await Promise.all([
    cashDrawerService.getSnapshot(auth.shop.id, 1),
    financialTransferService.listWallets(auth.shop.id),
    bankAccountService.listAccounts(auth.shop.id),
  ]);

  await prisma.$transaction(async (tx) => {
    await customerInShop(tx, auth.shop.id, input.customerId);
    const rows = await tx.$queryRaw<Array<{
      id: string;
      type: DebtEntryType;
      isReversed: boolean;
      sourceName: string | null;
      paymentMethod: string | null;
      reference: string | null;
    }>>`
      SELECT "id", "type", "isReversed", "sourceName", "paymentMethod", "reference"
      FROM "DebtLedgerEntry"
      WHERE "id" = ${input.entryId}::uuid
        AND "shopId" = ${auth.shop.id}::uuid
        AND "customerId" = ${input.customerId}::uuid
      FOR UPDATE
    `;
    const entry = rows[0];
    if (!entry) throw new Error("حركة الدين غير موجودة.");
    if (entry.isReversed) throw new Error("لا يمكن تعديل حركة ملغاة.");
    if (entry.type === "DEBT" && parseSourceDebtReference(entry.reference)) {
      throw new Error("هذا الدين مرتبط بمبيعة أو خدمة سوفتوير، لذلك يُدار من العملية الأصلية ولا يمكن تعديله يدوياً.");
    }

    const isCredit = entry.type === "PAYMENT" || entry.type === "ADJUSTMENT_CREDIT";
    if (isCredit) {
      const balanceWithoutThisEntry = await balanceInTransaction(tx, auth.shop.id, input.customerId, input.entryId);
      if (amount - balanceWithoutThisEntry > 0.005) {
        throw new Error(`قيمة التحصيل الجديدة أكبر من الرصيد المتاح (${balanceWithoutThisEntry.toFixed(2)}).`);
      }
    }

    let sourceName = entry.sourceName ?? entry.paymentMethod;
    if (entry.type === "PAYMENT") {
      const hasSourceUpdate = Boolean(input.sourceOptionId || normalizeOptional(input.customSourceName));
      if (hasSourceUpdate) {
        sourceName = await resolvePaymentSource(tx, auth.shop.id, {
          sourceOptionId: input.sourceOptionId,
          customSourceName: input.customSourceName ?? undefined,
          saveCustomSource: input.saveCustomSource,
        });
      } else if (input.customSourceName === "") {
        sourceName = null;
      }

      const tracked = await findTrackedCollectionTx(tx, auth.shop.id, input.entryId);
      if (tracked) {
        sourceName = await syncTrackedCollectionTx(tx, auth.shop.id, tracked, {
          amount,
          description: `تحصيل دين ${trackingToken(input.entryId)}`,
          reference: normalizeOptional(input.reference),
          occurredAt,
        });
      }
    }

    const debitType = entry.type === "DEBT" || entry.type === "OPENING_BALANCE" || entry.type === "ADJUSTMENT_DEBIT";
    await tx.$executeRaw`
      UPDATE "DebtLedgerEntry"
      SET "amount" = ${amount},
          "occurredAt" = ${occurredAt},
          "dueAt" = ${debitType ? dueAt : null},
          "description" = ${normalizeOptional(input.description)},
          "reference" = ${normalizeOptional(input.reference)},
          "sourceName" = ${entry.type === "PAYMENT" ? sourceName : null},
          "updatedAt" = NOW()
      WHERE "id" = ${input.entryId}::uuid
        AND "shopId" = ${auth.shop.id}::uuid
        AND "customerId" = ${input.customerId}::uuid
    `;

    await sourceDebtService.syncSoftwareDebtInvoicesTx(tx, auth.shop.id, input.customerId);
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 15_000 });
}

export const debtCollectionService = { recordPayment, updateEntry };
