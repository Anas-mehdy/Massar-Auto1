import { randomBytes } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { bankAccountService } from "@/lib/services/bankAccountService";
import { cashDrawerService } from "@/lib/services/cashDrawerService";
import { dailyCashCloseService } from "@/lib/services/dailyCashCloseService";
import { financialTransferService } from "@/lib/services/financialTransferService";

export type VoucherAccountType = "DRAWER" | "WALLET" | "BANK" | "OTHER";

type BaseVoucherInput = {
  amount: number;
  accountType: VoucherAccountType;
  walletId?: string | null;
  bankAccountId?: string | null;
  sourceName?: string | null;
  reason: string;
  reference?: string | null;
  notes?: string | null;
  occurredAt?: Date | null;
};

export type ReceiptVoucherInput = BaseVoucherInput & {
  customerId?: string | null;
  payerName?: string | null;
};

export type PaymentVoucherInput = BaseVoucherInput & {
  supplierId?: string | null;
  payeeName?: string | null;
};

function clean(value?: string | null) {
  const text = value?.trim();
  return text ? text : null;
}

function amount(value: number) {
  if (!Number.isFinite(value) || value <= 0) throw new Error("المبلغ يجب أن يكون أكبر من صفر.");
  return new Prisma.Decimal(value).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
}

function voucherNumber(prefix: "RV" | "PV") {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  return `${prefix}-${date}-${randomBytes(3).toString("hex").toUpperCase()}`;
}

async function prepareAccount(shopId: string, accountType: VoucherAccountType) {
  if (accountType === "DRAWER") await cashDrawerService.getSnapshot(shopId, 1);
  if (accountType === "WALLET") await financialTransferService.listWallets(shopId);
}

async function validateCounterparty(shopId: string, type: "CUSTOMER" | "SUPPLIER", id?: string | null) {
  if (!id) return;
  if (type === "CUSTOMER") {
    const row = await prisma.customer.findFirst({ where: { id, shopId, deletedAt: null }, select: { id: true } });
    if (!row) throw new Error("العميل المحدد غير موجود في هذا المركز.");
    return;
  }
  const row = await prisma.supplier.findFirst({ where: { id, shopId, deletedAt: null }, select: { id: true } });
  if (!row) throw new Error("المورد المحدد غير موجود في هذا المركز.");
}

async function applyDrawerMovement(
  tx: Prisma.TransactionClient,
  shopId: string,
  userId: string,
  voucherId: string,
  number: string,
  direction: "IN" | "OUT",
  value: Prisma.Decimal,
  reason: string,
  sourceType: "RECEIPT_VOUCHER" | "PAYMENT_VOUCHER",
  reference?: string | null,
  customerId?: string | null,
) {
  const rows = await tx.$queryRaw<Array<{ id: string; currentBalance: Prisma.Decimal }>>`
    SELECT "id", "currentBalance" FROM "CashDrawer"
    WHERE "shopId" = ${shopId}::uuid
    FOR UPDATE
  `;
  const drawer = rows[0];
  if (!drawer) throw new Error("الدرج النقدي غير موجود.");
  const next = direction === "IN" ? drawer.currentBalance.add(value) : drawer.currentBalance.sub(value);
  if (next.lt(0)) throw new Error("رصيد الدرج غير كافٍ لتنفيذ سند الصرف.");
  await tx.$executeRaw`UPDATE "CashDrawer" SET "currentBalance"=${next}, "updatedAt"=NOW() WHERE "id"=${drawer.id}::uuid`;
  const movements = await tx.$queryRaw<Array<{ id: string }>>`
    INSERT INTO "CashDrawerMovement" (
      "shopId", "drawerId", "createdByUserId", "customerId", "type", "direction", "amount", "description",
      "reference", "sourceType", "sourceId", "sourceReference"
    ) VALUES (
      ${shopId}::uuid, ${drawer.id}::uuid, ${userId}::uuid, ${customerId ?? null}::uuid,
      ${direction === "IN" ? "MANUAL_IN" : "MANUAL_OUT"}, ${direction}, ${value}, ${reason}, ${clean(reference)},
      ${sourceType}, ${voucherId}, ${number}
    ) RETURNING "id"
  `;
  return movements[0]?.id ?? null;
}

async function applyWalletMovement(
  tx: Prisma.TransactionClient,
  shopId: string,
  userId: string,
  walletId: string,
  voucherId: string,
  number: string,
  direction: "IN" | "OUT",
  value: Prisma.Decimal,
  reason: string,
  sourceType: "RECEIPT_VOUCHER" | "PAYMENT_VOUCHER",
) {
  const wallets = await tx.$queryRaw<Array<{ id: string; name: string; currentBalance: Prisma.Decimal }>>`
    SELECT "id", "name", "currentBalance" FROM "FinancialWallet"
    WHERE "id"=${walletId}::uuid AND "shopId"=${shopId}::uuid AND "deletedAt" IS NULL AND "isActive"=TRUE
    FOR UPDATE
  `;
  const wallet = wallets[0];
  if (!wallet) throw new Error("المحفظة المحددة غير موجودة أو متوقفة.");
  const next = direction === "IN" ? wallet.currentBalance.add(value) : wallet.currentBalance.sub(value);
  if (next.lt(0)) throw new Error("رصيد المحفظة غير كافٍ لتنفيذ سند الصرف.");
  await tx.$executeRaw`UPDATE "FinancialWallet" SET "currentBalance"=${next}, "updatedAt"=NOW() WHERE "id"=${wallet.id}::uuid`;
  const transfers = await tx.$queryRaw<Array<{ id: string }>>`
    INSERT INTO "FinancialTransfer" (
      "shopId", "walletId", "createdByUserId", "operationType", "amount", "walletAmount", "commission", "commissionMode",
      "isDeferred", "status", "notes", "sourceType", "sourceId", "sourceReference"
    ) VALUES (
      ${shopId}::uuid, ${wallet.id}::uuid, ${userId}::uuid,
      ${direction === "IN" ? "WALLET_TOPUP" : "WALLET_WITHDRAWAL"}, ${value}, ${value}, 0, 'NONE', FALSE, 'ACTIVE',
      ${reason}, ${sourceType}, ${voucherId}, ${number}
    ) RETURNING "id"
  `;
  return transfers[0]?.id ?? null;
}

export async function createReceiptVoucher(shopId: string, userId: string, input: ReceiptVoucherInput) {
  const value = amount(input.amount);
  const reason = clean(input.reason);
  if (!reason) throw new Error("سبب سند القبض مطلوب.");
  await dailyCashCloseService.assertBusinessDateOpen(shopId, input.occurredAt ?? new Date());
  await validateCounterparty(shopId, "CUSTOMER", input.customerId);
  await prepareAccount(shopId, input.accountType);
  const number = voucherNumber("RV");

  return prisma.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<Array<{ id: string; voucherNumber: string }>>`
      INSERT INTO "ReceiptVoucher" (
        "shopId", "voucherNumber", "customerId", "payerName", "amount", "accountType", "walletId", "bankAccountId",
        "sourceName", "reason", "reference", "notes", "receivedAt", "createdByUserId"
      ) VALUES (
        ${shopId}::uuid, ${number}, ${input.customerId ?? null}::uuid, ${clean(input.payerName)}, ${value}, ${input.accountType},
        ${input.walletId ?? null}::uuid, ${input.bankAccountId ?? null}::uuid, ${clean(input.sourceName)}, ${reason}, ${clean(input.reference)},
        ${clean(input.notes)}, COALESCE(${input.occurredAt ?? null}::timestamptz, now()), ${userId}::uuid
      ) RETURNING "id", "voucherNumber"
    `;
    const voucher = rows[0];
    let cashDrawerMovementId: string | null = null;
    let bankAccountMovementId: string | null = null;
    let financialTransferId: string | null = null;

    if (input.accountType === "DRAWER") {
      cashDrawerMovementId = await applyDrawerMovement(tx, shopId, userId, voucher.id, number, "IN", value, reason, "RECEIPT_VOUCHER", input.reference, input.customerId);
    } else if (input.accountType === "WALLET") {
      if (!input.walletId) throw new Error("اختر المحفظة لسند القبض.");
      financialTransferId = await applyWalletMovement(tx, shopId, userId, input.walletId, voucher.id, number, "IN", value, reason, "RECEIPT_VOUCHER");
    } else if (input.accountType === "BANK") {
      if (!input.bankAccountId) throw new Error("اختر الحساب البنكي لسند القبض.");
      const movement = await bankAccountService.createBankMovementTx(tx, shopId, userId, {
        bankAccountId: input.bankAccountId,
        direction: "IN",
        amount: value,
        type: "RECEIPT_VOUCHER",
        description: reason,
        reference: input.reference,
        sourceType: "RECEIPT_VOUCHER",
        sourceId: voucher.id,
        sourceReference: number,
        customerId: input.customerId,
        counterpartyType: "CUSTOMER",
        counterpartyId: input.customerId,
        counterpartyName: clean(input.payerName),
        occurredAt: input.occurredAt ?? undefined,
      });
      bankAccountMovementId = movement.movementId;
    }

    await tx.$executeRaw`
      UPDATE "ReceiptVoucher" SET
        "cashDrawerMovementId"=${cashDrawerMovementId}::uuid,
        "bankAccountMovementId"=${bankAccountMovementId}::uuid,
        "financialTransferId"=${financialTransferId}::uuid
      WHERE "id"=${voucher.id}::uuid AND "shopId"=${shopId}::uuid
    `;
    return voucher;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 10_000 });
}

export async function createPaymentVoucher(shopId: string, userId: string, input: PaymentVoucherInput) {
  const value = amount(input.amount);
  const reason = clean(input.reason);
  if (!reason) throw new Error("سبب سند الصرف مطلوب.");
  await dailyCashCloseService.assertBusinessDateOpen(shopId, input.occurredAt ?? new Date());
  await validateCounterparty(shopId, "SUPPLIER", input.supplierId);
  await prepareAccount(shopId, input.accountType);
  const number = voucherNumber("PV");

  return prisma.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<Array<{ id: string; voucherNumber: string }>>`
      INSERT INTO "PaymentVoucher" (
        "shopId", "voucherNumber", "supplierId", "payeeName", "amount", "accountType", "walletId", "bankAccountId",
        "sourceName", "reason", "reference", "notes", "paidAt", "createdByUserId"
      ) VALUES (
        ${shopId}::uuid, ${number}, ${input.supplierId ?? null}::uuid, ${clean(input.payeeName)}, ${value}, ${input.accountType},
        ${input.walletId ?? null}::uuid, ${input.bankAccountId ?? null}::uuid, ${clean(input.sourceName)}, ${reason}, ${clean(input.reference)},
        ${clean(input.notes)}, COALESCE(${input.occurredAt ?? null}::timestamptz, now()), ${userId}::uuid
      ) RETURNING "id", "voucherNumber"
    `;
    const voucher = rows[0];
    let cashDrawerMovementId: string | null = null;
    let bankAccountMovementId: string | null = null;
    let financialTransferId: string | null = null;

    if (input.accountType === "DRAWER") {
      cashDrawerMovementId = await applyDrawerMovement(tx, shopId, userId, voucher.id, number, "OUT", value, reason, "PAYMENT_VOUCHER", input.reference);
    } else if (input.accountType === "WALLET") {
      if (!input.walletId) throw new Error("اختر المحفظة لسند الصرف.");
      financialTransferId = await applyWalletMovement(tx, shopId, userId, input.walletId, voucher.id, number, "OUT", value, reason, "PAYMENT_VOUCHER");
    } else if (input.accountType === "BANK") {
      if (!input.bankAccountId) throw new Error("اختر الحساب البنكي لسند الصرف.");
      const movement = await bankAccountService.createBankMovementTx(tx, shopId, userId, {
        bankAccountId: input.bankAccountId,
        direction: "OUT",
        amount: value,
        type: "PAYMENT_VOUCHER",
        description: reason,
        reference: input.reference,
        sourceType: "PAYMENT_VOUCHER",
        sourceId: voucher.id,
        sourceReference: number,
        counterpartyType: input.supplierId ? "SUPPLIER" : "OTHER",
        counterpartyId: input.supplierId,
        counterpartyName: clean(input.payeeName),
        occurredAt: input.occurredAt ?? undefined,
      });
      bankAccountMovementId = movement.movementId;
    }

    await tx.$executeRaw`
      UPDATE "PaymentVoucher" SET
        "cashDrawerMovementId"=${cashDrawerMovementId}::uuid,
        "bankAccountMovementId"=${bankAccountMovementId}::uuid,
        "financialTransferId"=${financialTransferId}::uuid
      WHERE "id"=${voucher.id}::uuid AND "shopId"=${shopId}::uuid
    `;
    return voucher;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 10_000 });
}

export async function listReceiptVouchers(shopId: string, limit = 100) {
  return prisma.$queryRaw<Array<Record<string, unknown>>>`
    SELECT rv.*, c."name" AS "customerName", u."name" AS "createdByName"
    FROM "ReceiptVoucher" rv
    LEFT JOIN "Customer" c ON c."id"=rv."customerId" AND c."shopId"=rv."shopId"
    LEFT JOIN "User" u ON u."id"=rv."createdByUserId"
    WHERE rv."shopId"=${shopId}::uuid
    ORDER BY rv."receivedAt" DESC, rv."createdAt" DESC
    LIMIT ${Math.max(1, Math.min(limit, 250))}
  `;
}

export async function listPaymentVouchers(shopId: string, limit = 100) {
  return prisma.$queryRaw<Array<Record<string, unknown>>>`
    SELECT pv.*, s."name" AS "supplierName", u."name" AS "createdByName"
    FROM "PaymentVoucher" pv
    LEFT JOIN "Supplier" s ON s."id"=pv."supplierId" AND s."shopId"=pv."shopId"
    LEFT JOIN "User" u ON u."id"=pv."createdByUserId"
    WHERE pv."shopId"=${shopId}::uuid
    ORDER BY pv."paidAt" DESC, pv."createdAt" DESC
    LIMIT ${Math.max(1, Math.min(limit, 250))}
  `;
}

export const voucherService = {
  createReceiptVoucher,
  createPaymentVoucher,
  listReceiptVouchers,
  listPaymentVouchers,
};
