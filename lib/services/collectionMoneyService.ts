import { Prisma } from "@prisma/client";

import { bankAccountService } from "@/lib/services/bankAccountService";
import { cashDrawerService } from "@/lib/services/cashDrawerService";
import {
  financialTransferService,
  type FinancialTransferSourceType,
} from "@/lib/services/financialTransferService";

export type CollectionMoneyDestination = "DRAWER" | "WALLET" | "BANK" | "OTHER";
export type CollectionMovementType = "INSTALLMENT_PAYMENT" | "INSTALLMENT_DOWN_PAYMENT" | "DEBT_PAYMENT";

function decimal(value: string | number | Prisma.Decimal) {
  return new Prisma.Decimal(String(value).replace(",", "."));
}

function sourceTypeFromMovement(
  type: CollectionMovementType,
): Extract<FinancialTransferSourceType, "INSTALLMENT" | "INSTALLMENT_DOWN_PAYMENT" | "DEBT"> {
  if (type === "INSTALLMENT_PAYMENT") return "INSTALLMENT";
  if (type === "INSTALLMENT_DOWN_PAYMENT") return "INSTALLMENT_DOWN_PAYMENT";
  return "DEBT";
}

export async function prepareCollectionMoneyAccount(
  shopId: string,
  destination: CollectionMoneyDestination,
) {
  if (destination === "DRAWER") {
    await cashDrawerService.getSnapshot(shopId, 1);
    return;
  }
  if (destination === "WALLET") {
    await financialTransferService.listWallets(shopId);
    return;
  }
  if (destination === "BANK") await bankAccountService.listAccounts(shopId);
}

export async function applyCollectionIncomingTx(
  tx: Prisma.TransactionClient,
  shopId: string,
  userId: string | null,
  input: {
    destination: CollectionMoneyDestination;
    walletId?: string;
    bankAccountId?: string;
    amount: string | number | Prisma.Decimal;
    reference?: string | null;
    description: string;
    movementType: CollectionMovementType;
    occurredAt?: Date;
    sourceType?: Extract<FinancialTransferSourceType, "INSTALLMENT" | "INSTALLMENT_DOWN_PAYMENT" | "DEBT">;
    sourceId?: string;
    sourceReference?: string | null;
    customerId?: string | null;
  },
) {
  const amount = decimal(input.amount);
  if (amount.lte(0)) throw new Error("قيمة التحصيل يجب أن تكون أكبر من صفر.");
  if (input.destination === "OTHER") return null;
  const occurredAt = input.occurredAt ?? new Date();

  const sourceType = input.sourceType ?? sourceTypeFromMovement(input.movementType);
  let sourceId = input.sourceId ?? null;
  let customerId = input.customerId ?? null;
  let sourceReference = input.sourceReference ?? input.reference ?? null;

  if (sourceType === "DEBT" && !sourceId) {
    const token = /\[DEBT-PAYMENT:([0-9a-f-]+)\]/i.exec(input.description)?.[1];
    if (token) {
      const debtRows = await tx.$queryRaw<Array<{
        id: string;
        customerId: string;
        reference: string | null;
      }>>`
        SELECT "id", "customerId", "reference"
        FROM "DebtLedgerEntry"
        WHERE "id" = ${token}::uuid AND "shopId" = ${shopId}::uuid
        LIMIT 1
      `;
      if (debtRows[0]) {
        sourceId = debtRows[0].id;
        customerId = customerId || debtRows[0].customerId;
        sourceReference = sourceReference || debtRows[0].reference || "دفتر الدين";
      }
    }
  }

  if (input.destination === "DRAWER") {
    const rows = await tx.$queryRaw<Array<{ id: string; currentBalance: Prisma.Decimal }>>`
      SELECT "id", "currentBalance"
      FROM "CashDrawer"
      WHERE "shopId" = ${shopId}::uuid
      FOR UPDATE
    `;
    const drawer = rows[0];
    if (!drawer) throw new Error("الدرج النقدي غير موجود.");
    const nextBalance = drawer.currentBalance.add(amount);
    await tx.$executeRaw`
      UPDATE "CashDrawer"
      SET "currentBalance" = ${nextBalance}, "updatedAt" = NOW()
      WHERE "id" = ${drawer.id}::uuid
    `;
    await tx.$executeRaw`
      INSERT INTO "CashDrawerMovement" (
        "shopId", "drawerId", "createdByUserId", "type", "direction", "amount", "description", "reference", "createdAt",
        "sourceType", "sourceId", "sourceReference", "customerId"
      ) VALUES (
        ${shopId}::uuid, ${drawer.id}::uuid, ${userId}::uuid, ${input.movementType}, 'IN', ${amount}, ${input.description},
        ${input.reference ?? sourceReference}, ${occurredAt}, ${sourceType}, ${sourceId}, ${sourceReference}, ${customerId}::uuid
      )
    `;
    return "الدرج النقدي";
  }

  if (input.destination === "BANK") {
    if (!input.bankAccountId) throw new Error("اختر الحساب البنكي الذي استلم التحصيل.");
    const movement = await bankAccountService.createBankMovementTx(tx, shopId, userId, {
      bankAccountId: input.bankAccountId,
      direction: "IN",
      amount,
      type: input.movementType,
      occurredAt,
      description: input.description,
      reference: input.reference ?? sourceReference,
      sourceType,
      sourceId,
      sourceReference,
      customerId,
      counterpartyType: customerId ? "CUSTOMER" : null,
      counterpartyId: customerId,
    });
    return movement.accountName;
  }

  if (!input.walletId) throw new Error("اختر المحفظة التي استلمت المبلغ.");
  const walletRows = await tx.$queryRaw<Array<{ id: string; name: string; currentBalance: Prisma.Decimal }>>`
    SELECT "id", "name", "currentBalance"
    FROM "FinancialWallet"
    WHERE "id" = ${input.walletId}::uuid
      AND "shopId" = ${shopId}::uuid
      AND "deletedAt" IS NULL
      AND "isActive" = TRUE
    FOR UPDATE
  `;
  const wallet = walletRows[0];
  if (!wallet) throw new Error("المحفظة المحددة غير موجودة.");
  const nextBalance = wallet.currentBalance.add(amount);
  await tx.$executeRaw`
    UPDATE "FinancialWallet"
    SET "currentBalance" = ${nextBalance}, "updatedAt" = NOW()
    WHERE "id" = ${wallet.id}::uuid
  `;

  await tx.$executeRaw`
    INSERT INTO "FinancialTransfer" (
      "shopId", "walletId", "customerId", "createdByUserId", "operationType", "amount", "walletAmount", "commission", "commissionMode", "isDeferred", "notes", "createdAt", "sourceType", "sourceId", "sourceReference"
    ) VALUES (
      ${shopId}::uuid, ${wallet.id}::uuid, ${customerId}::uuid, ${userId}::uuid,
      'WALLET_TOPUP', ${amount}, ${amount}, 0, 'NONE', FALSE, ${input.description}, ${occurredAt},
      ${sourceType}, ${sourceId}, ${sourceReference}
    )
  `;
  return wallet.name;
}

export const collectionMoneyService = {
  prepareCollectionMoneyAccount,
  applyCollectionIncomingTx,
};
