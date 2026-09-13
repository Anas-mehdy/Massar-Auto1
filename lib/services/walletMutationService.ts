import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { assertBusinessDateOpenTx } from "@/lib/services/businessDateLockService";
import { financialTransferService } from "@/lib/services/financialTransferService";

export type WalletCreateInput = {
  name: string;
  openingBalance?: string;
  monthlyLimit?: string;
  defaultDepositCommission?: string;
  defaultWithdrawalCommission?: string;
};

export type WalletUpdateInput = {
  walletId: string;
  name: string;
  balance: string | number | Prisma.Decimal;
  monthlyLimit: string | number | Prisma.Decimal | null;
  defaultDepositCommission: string | number | Prisma.Decimal;
  defaultWithdrawalCommission: string | number | Prisma.Decimal;
};

function money(value: string | number | Prisma.Decimal | null | undefined) {
  const result = new Prisma.Decimal(String(value ?? 0).replace(",", ".")).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
  if (!result.isFinite()) throw new Error("القيمة المالية غير صحيحة.");
  return result;
}

function rate(value: string | number | Prisma.Decimal | null | undefined) {
  const result = new Prisma.Decimal(String(value ?? 0).replace(",", ".")).toDecimalPlaces(4, Prisma.Decimal.ROUND_HALF_UP);
  if (!result.isFinite()) throw new Error("نسبة العمولة غير صحيحة.");
  return result;
}

function walletName(value: string) {
  const name = value.trim().replace(/\s+/g, " ");
  if (!name) throw new Error("اسم المحفظة مطلوب.");
  if (name.length > 120) throw new Error("اسم المحفظة طويل جداً.");
  return name;
}

async function ensureInfrastructure(shopId: string) {
  // The legacy service owns creation of the wallet/transfer infrastructure.
  // Calling the read path keeps first-use setup compatible while all mutations
  // below remain transactionally guarded and auditable.
  await financialTransferService.listWallets(shopId);
}

async function assertUniqueNameTx(
  tx: Prisma.TransactionClient,
  shopId: string,
  name: string,
  excludeWalletId?: string,
) {
  const rows = excludeWalletId
    ? await tx.$queryRaw<Array<{ id: string }>>`
        SELECT "id" FROM "FinancialWallet"
        WHERE "shopId" = ${shopId}::uuid
          AND "id" <> ${excludeWalletId}::uuid
          AND "deletedAt" IS NULL
          AND LOWER("name") = LOWER(${name})
        LIMIT 1
      `
    : await tx.$queryRaw<Array<{ id: string }>>`
        SELECT "id" FROM "FinancialWallet"
        WHERE "shopId" = ${shopId}::uuid
          AND "deletedAt" IS NULL
          AND LOWER("name") = LOWER(${name})
        LIMIT 1
      `;
  if (rows[0]) throw new Error("يوجد بالفعل محفظة بهذا الاسم.");
}

async function insertManualLedgerTx(
  tx: Prisma.TransactionClient,
  input: {
    shopId: string;
    walletId: string;
    userId: string | null;
    direction: "IN" | "OUT";
    amount: Prisma.Decimal;
    occurredAt: Date;
    note: string;
    reference: string;
  },
) {
  if (input.amount.lte(0)) return;
  await tx.$executeRaw`
    INSERT INTO "FinancialTransfer" (
      "shopId", "walletId", "createdByUserId", "operationType", "amount", "walletAmount",
      "commission", "commissionMode", "isDeferred", "notes", "sourceType", "sourceReference",
      "createdAt", "updatedAt"
    ) VALUES (
      ${input.shopId}::uuid, ${input.walletId}::uuid, ${input.userId}::uuid,
      ${input.direction === "IN" ? "WALLET_TOPUP" : "WALLET_WITHDRAWAL"},
      ${input.amount}, ${input.amount}, 0, 'NONE', FALSE, ${input.note}, 'MANUAL', ${input.reference},
      ${input.occurredAt}, ${input.occurredAt}
    )
  `;
}

export async function createWallet(
  shopId: string,
  userId: string | null,
  input: WalletCreateInput,
) {
  await ensureInfrastructure(shopId);
  const name = walletName(input.name);
  const openingBalance = money(input.openingBalance);
  const monthlyLimit = input.monthlyLimit?.trim() ? money(input.monthlyLimit) : null;
  const depositCommission = rate(input.defaultDepositCommission);
  const withdrawalCommission = rate(input.defaultWithdrawalCommission);

  if (openingBalance.lt(0)) throw new Error("الرصيد الافتتاحي لا يمكن أن يكون سالباً.");
  if (monthlyLimit?.lte(0)) throw new Error("الحد الشهري يجب أن يكون أكبر من صفر.");
  if (depositCommission.lt(0) || withdrawalCommission.lt(0)) throw new Error("نسبة العمولة لا يمكن أن تكون سالبة.");

  return prisma.$transaction(async (tx) => {
    const clock = await tx.$queryRaw<Array<{ occurredAt: Date }>>`SELECT NOW()::timestamp AS "occurredAt"`;
    const occurredAt = clock[0]?.occurredAt;
    if (!occurredAt) throw new Error("تعذر تحديد وقت العملية.");
    await assertBusinessDateOpenTx(tx, shopId, occurredAt);
    await assertUniqueNameTx(tx, shopId, name);

    const rows = await tx.$queryRaw<Array<{ id: string }>>`
      INSERT INTO "FinancialWallet" (
        "shopId", "name", "currentBalance", "monthlyLimit",
        "defaultDepositCommission", "defaultWithdrawalCommission"
      ) VALUES (
        ${shopId}::uuid, ${name}, 0, ${monthlyLimit}, ${depositCommission}, ${withdrawalCommission}
      )
      RETURNING "id"
    `;
    const wallet = rows[0];
    if (!wallet) throw new Error("تعذر إنشاء المحفظة.");

    if (openingBalance.gt(0)) {
      await insertManualLedgerTx(tx, {
        shopId,
        walletId: wallet.id,
        userId,
        direction: "IN",
        amount: openingBalance,
        occurredAt,
        note: "الرصيد الافتتاحي للمحفظة",
        reference: "الرصيد الافتتاحي",
      });
      await tx.$executeRaw`
        UPDATE "FinancialWallet"
        SET "currentBalance" = ${openingBalance}, "updatedAt" = ${occurredAt}
        WHERE "id" = ${wallet.id}::uuid AND "shopId" = ${shopId}::uuid
      `;
    }
    return wallet;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 10_000 });
}

export async function updateWallet(
  shopId: string,
  userId: string | null,
  input: WalletUpdateInput,
) {
  await ensureInfrastructure(shopId);
  const name = walletName(input.name);
  const targetBalance = money(input.balance);
  const monthlyLimit = input.monthlyLimit === null ? null : money(input.monthlyLimit);
  const depositCommission = rate(input.defaultDepositCommission);
  const withdrawalCommission = rate(input.defaultWithdrawalCommission);

  if (targetBalance.lt(0)) throw new Error("الرصيد لا يمكن أن يكون سالباً.");
  if (monthlyLimit?.lte(0)) throw new Error("الحد الشهري يجب أن يكون أكبر من صفر.");
  if (depositCommission.lt(0) || withdrawalCommission.lt(0)) throw new Error("نسبة العمولة لا يمكن أن تكون سالبة.");

  return prisma.$transaction(async (tx) => {
    const clock = await tx.$queryRaw<Array<{ occurredAt: Date }>>`SELECT NOW()::timestamp AS "occurredAt"`;
    const occurredAt = clock[0]?.occurredAt;
    if (!occurredAt) throw new Error("تعذر تحديد وقت العملية.");
    await assertBusinessDateOpenTx(tx, shopId, occurredAt);
    await assertUniqueNameTx(tx, shopId, name, input.walletId);

    const rows = await tx.$queryRaw<Array<{ id: string; currentBalance: Prisma.Decimal }>>`
      SELECT "id", "currentBalance"
      FROM "FinancialWallet"
      WHERE "id" = ${input.walletId}::uuid
        AND "shopId" = ${shopId}::uuid
        AND "deletedAt" IS NULL
        AND "isActive" = TRUE
      FOR UPDATE
    `;
    const wallet = rows[0];
    if (!wallet) throw new Error("المحفظة غير موجودة.");

    const delta = targetBalance.sub(wallet.currentBalance);
    if (!delta.isZero()) {
      await insertManualLedgerTx(tx, {
        shopId,
        walletId: wallet.id,
        userId,
        direction: delta.gt(0) ? "IN" : "OUT",
        amount: delta.abs(),
        occurredAt,
        note: "تسوية رصيد المحفظة من شاشة الإدارة",
        reference: "تسوية رصيد المحفظة",
      });
    }

    await tx.$executeRaw`
      UPDATE "FinancialWallet"
      SET "name" = ${name},
          "currentBalance" = ${targetBalance},
          "monthlyLimit" = ${monthlyLimit},
          "defaultDepositCommission" = ${depositCommission},
          "defaultWithdrawalCommission" = ${withdrawalCommission},
          "updatedAt" = ${occurredAt}
      WHERE "id" = ${wallet.id}::uuid AND "shopId" = ${shopId}::uuid
    `;
    return { id: wallet.id };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 10_000 });
}

export const walletMutationService = { createWallet, updateWallet };
