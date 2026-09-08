import { Prisma } from "@prisma/client";
import { cashDrawerService } from "@/lib/services/cashDrawerService";
import {
  financialTransferService,
  type FinancialTransferSourceType,
} from "@/lib/services/financialTransferService";

export type MoneyAccountDestination = "DRAWER" | "WALLET" | "OTHER";
export type MoneySourceMeta = {
  sourceType: FinancialTransferSourceType;
  sourceId?: string | null;
  sourceReference?: string | null;
  customerId?: string | null;
  customerName?: string | null;
  customerPhone?: string | null;
};

function decimal(value: string | number | Prisma.Decimal) { return new Prisma.Decimal(String(value).replace(",", ".")); }

export async function prepareMoneyAccounts(shopId: string, destination: MoneyAccountDestination) {
  if (destination === "DRAWER") await cashDrawerService.getSnapshot(shopId, 1);
  else if (destination === "WALLET") await financialTransferService.listWallets(shopId);
}

export async function applyIncomingMoneyTx(
  tx: Prisma.TransactionClient,
  shopId: string,
  userId: string | null,
  input: {
    destination: MoneyAccountDestination;
    walletId?: string;
    amount: string | number | Prisma.Decimal;
    reference?: string | null;
    description: string;
    drawerType: "INVOICE_PAYMENT" | "SALE_CASH";
    source?: MoneySourceMeta;
  },
) {
  const amount = decimal(input.amount);
  if (amount.lte(0) || input.destination === "OTHER") return input.destination === "OTHER" ? null : undefined;
  if (input.destination === "DRAWER") {
    const rows = await tx.$queryRaw<Array<{ id: string; currentBalance: Prisma.Decimal }>>`SELECT "id", "currentBalance" FROM "CashDrawer" WHERE "shopId" = ${shopId}::uuid FOR UPDATE`;
    const drawer = rows[0]; if (!drawer) throw new Error("الدرج النقدي غير موجود.");
    const next = drawer.currentBalance.add(amount);
    await tx.$executeRaw`UPDATE "CashDrawer" SET "currentBalance" = ${next}, "updatedAt" = NOW() WHERE "id" = ${drawer.id}::uuid`;
    await tx.$executeRaw`
      INSERT INTO "CashDrawerMovement" (
        "shopId", "drawerId", "createdByUserId", "type", "direction", "amount", "description", "reference",
        "sourceType", "sourceId", "sourceReference", "customerId"
      ) VALUES (
        ${shopId}::uuid, ${drawer.id}::uuid, ${userId}::uuid, ${input.drawerType}, 'IN', ${amount}, ${input.description},
        ${input.reference ?? input.source?.sourceReference ?? null}, ${input.source?.sourceType ?? "MANUAL"},
        ${input.source?.sourceId ?? null}, ${input.source?.sourceReference ?? input.reference ?? null},
        ${input.source?.customerId ?? null}::uuid
      )
    `;
    return "الدرج النقدي";
  }
  if (!input.walletId) throw new Error("اختر المحفظة التي استلمت المبلغ.");
  const rows = await tx.$queryRaw<Array<{ id: string; name: string; currentBalance: Prisma.Decimal }>>`SELECT "id", "name", "currentBalance" FROM "FinancialWallet" WHERE "id" = ${input.walletId}::uuid AND "shopId" = ${shopId}::uuid AND "deletedAt" IS NULL AND "isActive" = TRUE FOR UPDATE`;
  const wallet = rows[0]; if (!wallet) throw new Error("المحفظة المحددة غير موجودة.");
  await tx.$executeRaw`UPDATE "FinancialWallet" SET "currentBalance" = ${wallet.currentBalance.add(amount)}, "updatedAt" = NOW() WHERE "id" = ${wallet.id}::uuid`;
  await tx.$executeRaw`
    INSERT INTO "FinancialTransfer" (
      "shopId", "walletId", "customerId", "createdByUserId", "operationType", "amount", "walletAmount",
      "commission", "commissionMode", "isDeferred", "customerName", "customerPhone", "notes",
      "sourceType", "sourceId", "sourceReference"
    ) VALUES (
      ${shopId}::uuid, ${wallet.id}::uuid, ${input.source?.customerId ?? null}::uuid, ${userId}::uuid,
      'WALLET_TOPUP', ${amount}, ${amount}, 0, 'NONE', FALSE,
      ${input.source?.customerName ?? null}, ${input.source?.customerPhone ?? null}, ${input.description},
      ${input.source?.sourceType ?? "MANUAL"}, ${input.source?.sourceId ?? null},
      ${input.source?.sourceReference ?? input.reference ?? null}
    )
  `;
  return wallet.name;
}

export async function applyOutgoingMoneyTx(
  tx: Prisma.TransactionClient,
  shopId: string,
  userId: string | null,
  input: {
    destination: Exclude<MoneyAccountDestination, "OTHER">;
    walletId?: string;
    amount: string | number | Prisma.Decimal;
    reference?: string | null;
    description: string;
    drawerType?: "CHANGE_RETURN" | "SOFTWARE_SERVICE_COST";
    contextLabel?: string;
    source?: MoneySourceMeta;
  },
) {
  const amount = decimal(input.amount); if (amount.lte(0)) return;
  const drawerType = input.drawerType ?? "CHANGE_RETURN";
  const contextLabel = input.contextLabel?.trim();
  if (input.destination === "DRAWER") {
    const rows = await tx.$queryRaw<Array<{ id: string; currentBalance: Prisma.Decimal }>>`SELECT "id", "currentBalance" FROM "CashDrawer" WHERE "shopId" = ${shopId}::uuid FOR UPDATE`;
    const drawer = rows[0]; if (!drawer) throw new Error("الدرج النقدي غير موجود.");
    const next = drawer.currentBalance.sub(amount); if (next.lt(0)) throw new Error(contextLabel ? `رصيد الدرج غير كافٍ لتسديد ${contextLabel}.` : "رصيد الدرج غير كافٍ لإرجاع الباقي.");
    await tx.$executeRaw`UPDATE "CashDrawer" SET "currentBalance" = ${next}, "updatedAt" = NOW() WHERE "id" = ${drawer.id}::uuid`;
    await tx.$executeRaw`
      INSERT INTO "CashDrawerMovement" (
        "shopId", "drawerId", "createdByUserId", "type", "direction", "amount", "description", "reference",
        "sourceType", "sourceId", "sourceReference", "customerId"
      ) VALUES (
        ${shopId}::uuid, ${drawer.id}::uuid, ${userId}::uuid, ${drawerType}, 'OUT', ${amount}, ${input.description},
        ${input.reference ?? input.source?.sourceReference ?? null}, ${input.source?.sourceType ?? "SALE_CHANGE"},
        ${input.source?.sourceId ?? null}, ${input.source?.sourceReference ?? input.reference ?? null},
        ${input.source?.customerId ?? null}::uuid
      )
    `;
    return;
  }
  if (!input.walletId) throw new Error(contextLabel ? `اختر المحفظة التي ستُسدد منها ${contextLabel}.` : "اختر محفظة إرجاع الباقي.");
  const rows = await tx.$queryRaw<Array<{ id: string; name: string; currentBalance: Prisma.Decimal }>>`SELECT "id", "name", "currentBalance" FROM "FinancialWallet" WHERE "id" = ${input.walletId}::uuid AND "shopId" = ${shopId}::uuid AND "deletedAt" IS NULL AND "isActive" = TRUE FOR UPDATE`;
  const wallet = rows[0]; if (!wallet) throw new Error(contextLabel ? `المحفظة المحددة لتسديد ${contextLabel} غير موجودة أو غير فعالة.` : "محفظة إرجاع الباقي غير موجودة.");
  const next = wallet.currentBalance.sub(amount); if (next.lt(0)) throw new Error(contextLabel ? `رصيد محفظة ${wallet.name} غير كافٍ لتسديد ${contextLabel}.` : `رصيد محفظة ${wallet.name} غير كافٍ لإرجاع الباقي.`);
  await tx.$executeRaw`UPDATE "FinancialWallet" SET "currentBalance" = ${next}, "updatedAt" = NOW() WHERE "id" = ${wallet.id}::uuid`;
  await tx.$executeRaw`
    INSERT INTO "FinancialTransfer" (
      "shopId", "walletId", "customerId", "createdByUserId", "operationType", "amount", "walletAmount",
      "commission", "commissionMode", "isDeferred", "customerName", "customerPhone", "notes",
      "sourceType", "sourceId", "sourceReference"
    ) VALUES (
      ${shopId}::uuid, ${wallet.id}::uuid, ${input.source?.customerId ?? null}::uuid, ${userId}::uuid,
      'WALLET_WITHDRAWAL', ${amount}, ${amount}, 0, 'NONE', FALSE,
      ${input.source?.customerName ?? null}, ${input.source?.customerPhone ?? null}, ${input.description},
      ${input.source?.sourceType ?? "MANUAL"}, ${input.source?.sourceId ?? null},
      ${input.source?.sourceReference ?? input.reference ?? null}
    )
  `;
}

async function reverseTrackedMoneyTx(tx: Prisma.TransactionClient, shopId: string, match: { drawerTypes: string[]; descriptionLike: string }) {
  const drawerMovements = await tx.$queryRaw<Array<{ id: string; drawerId: string; direction: "IN" | "OUT"; amount: Prisma.Decimal }>>(Prisma.sql`
    SELECT "id", "drawerId", "direction", "amount" FROM "CashDrawerMovement"
    WHERE "shopId" = ${shopId}::uuid AND "status" = 'ACTIVE' AND "type" IN (${Prisma.join(match.drawerTypes)}) AND "description" LIKE ${match.descriptionLike}
    ORDER BY CASE WHEN "direction" = 'OUT' THEN 0 ELSE 1 END, "createdAt" DESC, "id" DESC FOR UPDATE
  `);
  for (const movement of drawerMovements) {
    const drawers = await tx.$queryRaw<Array<{ id: string; currentBalance: Prisma.Decimal }>>`SELECT "id", "currentBalance" FROM "CashDrawer" WHERE "id" = ${movement.drawerId}::uuid AND "shopId" = ${shopId}::uuid FOR UPDATE`;
    const drawer = drawers[0]; if (!drawer) throw new Error("الدرج النقدي المرتبط بالحركة غير موجود.");
    const next = movement.direction === "IN" ? drawer.currentBalance.sub(movement.amount) : drawer.currentBalance.add(movement.amount);
    if (next.lt(0)) throw new Error("لا يمكن عكس العملية لأن رصيد الدرج الحالي غير كافٍ.");
    await tx.$executeRaw`UPDATE "CashDrawer" SET "currentBalance" = ${next}, "updatedAt" = NOW() WHERE "id" = ${drawer.id}::uuid`;
    await tx.$executeRaw`UPDATE "CashDrawerMovement" SET "status" = 'VOID', "voidedAt" = NOW() WHERE "id" = ${movement.id}::uuid`;
  }

  const walletMovements = await tx.$queryRaw<Array<{ id: string; walletId: string; operationType: string; walletAmount: Prisma.Decimal }>>`
    SELECT "id", "walletId", "operationType", "walletAmount" FROM "FinancialTransfer"
    WHERE "shopId" = ${shopId}::uuid AND "status" = 'ACTIVE' AND "deletedAt" IS NULL
      AND "operationType" IN ('WALLET_TOPUP','WALLET_WITHDRAWAL') AND "notes" LIKE ${match.descriptionLike}
    ORDER BY CASE WHEN "operationType" = 'WALLET_WITHDRAWAL' THEN 0 ELSE 1 END, "createdAt" DESC, "id" DESC FOR UPDATE
  `;
  for (const movement of walletMovements) {
    const wallets = await tx.$queryRaw<Array<{ id: string; currentBalance: Prisma.Decimal }>>`SELECT "id", "currentBalance" FROM "FinancialWallet" WHERE "id" = ${movement.walletId}::uuid AND "shopId" = ${shopId}::uuid AND "deletedAt" IS NULL FOR UPDATE`;
    const wallet = wallets[0]; if (!wallet) throw new Error("المحفظة المرتبطة بالحركة غير موجودة.");
    const next = movement.operationType === "WALLET_TOPUP" ? wallet.currentBalance.sub(movement.walletAmount) : wallet.currentBalance.add(movement.walletAmount);
    if (next.lt(0)) throw new Error("لا يمكن عكس العملية لأن رصيد المحفظة الحالي غير كافٍ.");
    await tx.$executeRaw`UPDATE "FinancialWallet" SET "currentBalance" = ${next}, "updatedAt" = NOW() WHERE "id" = ${wallet.id}::uuid`;
    await tx.$executeRaw`UPDATE "FinancialTransfer" SET "status" = 'VOID', "voidedAt" = NOW(), "updatedAt" = NOW() WHERE "id" = ${movement.id}::uuid`;
  }
}

export async function reverseSaleMoneyTx(tx: Prisma.TransactionClient, shopId: string, receiptNumber: string) {
  await reverseTrackedMoneyTx(tx, shopId, { drawerTypes: ["SALE_CASH", "CHANGE_RETURN"], descriptionLike: `%${receiptNumber}%` });
}

export async function reverseInvoiceMoneyTx(tx: Prisma.TransactionClient, shopId: string, invoiceNumber: string) {
  await reverseTrackedMoneyTx(tx, shopId, { drawerTypes: ["INVOICE_PAYMENT", "CHANGE_RETURN", "SOFTWARE_SERVICE_COST"], descriptionLike: `%${invoiceNumber}%` });
}

export const moneyAccountService = { prepareMoneyAccounts, applyIncomingMoneyTx, applyOutgoingMoneyTx, reverseSaleMoneyTx, reverseInvoiceMoneyTx };
