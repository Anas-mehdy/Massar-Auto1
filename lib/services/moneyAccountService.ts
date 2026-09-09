import { Prisma } from "@prisma/client";
import { bankAccountService } from "@/lib/services/bankAccountService";
import { cashDrawerService } from "@/lib/services/cashDrawerService";
import {
  financialTransferService,
  type FinancialTransferSourceType,
} from "@/lib/services/financialTransferService";

export type MoneyAccountDestination = "DRAWER" | "WALLET" | "BANK" | "OTHER";
export type MoneySourceMeta = {
  sourceType: FinancialTransferSourceType;
  sourceId?: string | null;
  sourceReference?: string | null;
  customerId?: string | null;
  customerName?: string | null;
  customerPhone?: string | null;
};

function decimal(value: string | number | Prisma.Decimal) {
  return new Prisma.Decimal(String(value).replace(",", "."));
}

export async function prepareMoneyAccounts(shopId: string, destination: MoneyAccountDestination) {
  if (destination === "DRAWER") await cashDrawerService.getSnapshot(shopId, 1);
  else if (destination === "WALLET") await financialTransferService.listWallets(shopId);
  else if (destination === "BANK") await bankAccountService.listAccounts(shopId);
}

export type MoneyAccountEndpoint = {
  destination: Exclude<MoneyAccountDestination, "OTHER">;
  walletId?: string | null;
  bankAccountId?: string | null;
};

export async function lockMoneyAccountEndpointsTx(
  tx: Prisma.TransactionClient,
  shopId: string,
  endpoints: MoneyAccountEndpoint[],
) {
  const descriptors = new Map<string, MoneyAccountEndpoint>();
  for (const endpoint of endpoints) {
    if (endpoint.destination === "BANK") {
      if (!endpoint.bankAccountId) throw new Error("اختر الحساب البنكي.");
      descriptors.set(`BANK:${endpoint.bankAccountId}`, endpoint);
    } else if (endpoint.destination === "WALLET") {
      if (!endpoint.walletId) throw new Error("اختر المحفظة.");
      descriptors.set(`WALLET:${endpoint.walletId}`, endpoint);
    } else {
      descriptors.set("DRAWER:", endpoint);
    }
  }

  for (const [key, endpoint] of [...descriptors.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    if (endpoint.destination === "BANK") {
      const rows = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT "id" FROM "BankAccount"
        WHERE "id"=${endpoint.bankAccountId}::uuid AND "shopId"=${shopId}::uuid
          AND "deletedAt" IS NULL AND "isActive"=TRUE
        FOR UPDATE
      `;
      if (!rows[0]) throw new Error("الحساب البنكي المحدد غير موجود أو متوقف.");
      continue;
    }
    if (endpoint.destination === "DRAWER") {
      const rows = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT "id" FROM "CashDrawer" WHERE "shopId"=${shopId}::uuid FOR UPDATE
      `;
      if (!rows[0]) throw new Error("الدرج النقدي غير موجود.");
      continue;
    }
    const rows = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT "id" FROM "FinancialWallet"
      WHERE "id"=${endpoint.walletId}::uuid AND "shopId"=${shopId}::uuid
        AND "deletedAt" IS NULL AND "isActive"=TRUE
      FOR UPDATE
    `;
    if (!rows[0]) throw new Error("المحفظة المحددة غير موجودة أو متوقفة.");
    void key;
  }
}

export async function applyIncomingMoneyTx(
  tx: Prisma.TransactionClient,
  shopId: string,
  userId: string | null,
  input: {
    destination: MoneyAccountDestination;
    walletId?: string;
    bankAccountId?: string;
    amount: string | number | Prisma.Decimal;
    reference?: string | null;
    description: string;
    drawerType: "INVOICE_PAYMENT" | "SALE_CASH";
    movementType?: string;
    occurredAt?: Date;
    source?: MoneySourceMeta;
  },
) {
  const amount = decimal(input.amount);
  const movementType = input.movementType ?? input.drawerType;
  const occurredAt = input.occurredAt ?? new Date();
  if (amount.lte(0) || input.destination === "OTHER") {
    return input.destination === "OTHER" ? null : undefined;
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
    const next = drawer.currentBalance.add(amount);
    await tx.$executeRaw`
      UPDATE "CashDrawer"
      SET "currentBalance" = ${next}, "updatedAt" = NOW()
      WHERE "id" = ${drawer.id}::uuid
    `;
    await tx.$executeRaw`
      INSERT INTO "CashDrawerMovement" (
        "shopId", "drawerId", "createdByUserId", "type", "direction", "amount", "description", "reference",
        "sourceType", "sourceId", "sourceReference", "customerId", "createdAt"
      ) VALUES (
        ${shopId}::uuid, ${drawer.id}::uuid, ${userId}::uuid, ${movementType}, 'IN', ${amount}, ${input.description},
        ${input.reference ?? input.source?.sourceReference ?? null}, ${input.source?.sourceType ?? "MANUAL"},
        ${input.source?.sourceId ?? null}, ${input.source?.sourceReference ?? input.reference ?? null},
        ${input.source?.customerId ?? null}::uuid, ${occurredAt}
      )
    `;
    return "الدرج النقدي";
  }

  if (input.destination === "BANK") {
    if (!input.bankAccountId) throw new Error("اختر الحساب البنكي الذي استلم المبلغ.");
    const movement = await bankAccountService.createBankMovementTx(tx, shopId, userId, {
      bankAccountId: input.bankAccountId,
      direction: "IN",
      amount,
      type: movementType,
      occurredAt,
      description: input.description,
      reference: input.reference ?? input.source?.sourceReference ?? null,
      sourceType: input.source?.sourceType ?? "MANUAL",
      sourceId: input.source?.sourceId ?? null,
      sourceReference: input.source?.sourceReference ?? input.reference ?? null,
      customerId: input.source?.customerId ?? null,
      counterpartyType: input.source?.customerId ? "CUSTOMER" : null,
      counterpartyId: input.source?.customerId ?? null,
      counterpartyName: input.source?.customerName ?? null,
    });
    return movement.accountName;
  }

  if (!input.walletId) throw new Error("اختر المحفظة التي استلمت المبلغ.");
  const rows = await tx.$queryRaw<Array<{ id: string; name: string; currentBalance: Prisma.Decimal }>>`
    SELECT "id", "name", "currentBalance"
    FROM "FinancialWallet"
    WHERE "id" = ${input.walletId}::uuid
      AND "shopId" = ${shopId}::uuid
      AND "deletedAt" IS NULL
      AND "isActive" = TRUE
    FOR UPDATE
  `;
  const wallet = rows[0];
  if (!wallet) throw new Error("المحفظة المحددة غير موجودة.");
  await tx.$executeRaw`
    UPDATE "FinancialWallet"
    SET "currentBalance" = ${wallet.currentBalance.add(amount)}, "updatedAt" = NOW()
    WHERE "id" = ${wallet.id}::uuid
  `;
  await tx.$executeRaw`
    INSERT INTO "FinancialTransfer" (
      "shopId", "walletId", "customerId", "createdByUserId", "operationType", "amount", "walletAmount",
      "commission", "commissionMode", "isDeferred", "customerName", "customerPhone", "notes",
      "sourceType", "sourceId", "sourceReference", "createdAt", "updatedAt"
    ) VALUES (
      ${shopId}::uuid, ${wallet.id}::uuid, ${input.source?.customerId ?? null}::uuid, ${userId}::uuid,
      'WALLET_TOPUP', ${amount}, ${amount}, 0, 'NONE', FALSE,
      ${input.source?.customerName ?? null}, ${input.source?.customerPhone ?? null}, ${input.description},
      ${input.source?.sourceType ?? "MANUAL"}, ${input.source?.sourceId ?? null},
      ${input.source?.sourceReference ?? input.reference ?? null}, ${occurredAt}, NOW()
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
    bankAccountId?: string;
    amount: string | number | Prisma.Decimal;
    reference?: string | null;
    description: string;
    movementType?: string;
    contextLabel?: string;
    occurredAt?: Date;
    source?: MoneySourceMeta;
  },
) {
  const amount = decimal(input.amount);
  if (amount.lte(0)) return;
  const movementType = input.movementType ?? "CHANGE_RETURN";
  const contextLabel = input.contextLabel?.trim();
  const occurredAt = input.occurredAt ?? new Date();

  if (input.destination === "DRAWER") {
    const rows = await tx.$queryRaw<Array<{ id: string; currentBalance: Prisma.Decimal }>>`
      SELECT "id", "currentBalance"
      FROM "CashDrawer"
      WHERE "shopId" = ${shopId}::uuid
      FOR UPDATE
    `;
    const drawer = rows[0];
    if (!drawer) throw new Error("الدرج النقدي غير موجود.");
    const next = drawer.currentBalance.sub(amount);
    if (next.lt(0)) throw new Error(contextLabel ? `رصيد الدرج غير كافٍ لتسديد ${contextLabel}.` : "رصيد الدرج غير كافٍ لإرجاع الباقي.");
    await tx.$executeRaw`
      UPDATE "CashDrawer"
      SET "currentBalance" = ${next}, "updatedAt" = NOW()
      WHERE "id" = ${drawer.id}::uuid
    `;
    await tx.$executeRaw`
      INSERT INTO "CashDrawerMovement" (
        "shopId", "drawerId", "createdByUserId", "type", "direction", "amount", "description", "reference",
        "sourceType", "sourceId", "sourceReference", "customerId", "createdAt"
      ) VALUES (
        ${shopId}::uuid, ${drawer.id}::uuid, ${userId}::uuid, ${movementType}, 'OUT', ${amount}, ${input.description},
        ${input.reference ?? input.source?.sourceReference ?? null}, ${input.source?.sourceType ?? "SALE_CHANGE"},
        ${input.source?.sourceId ?? null}, ${input.source?.sourceReference ?? input.reference ?? null},
        ${input.source?.customerId ?? null}::uuid, ${occurredAt}
      )
    `;
    return;
  }

  if (input.destination === "BANK") {
    if (!input.bankAccountId) throw new Error(contextLabel ? `اختر الحساب البنكي الذي ستُسدد منه ${contextLabel}.` : "اختر الحساب البنكي الذي سيخرج منه المبلغ.");
    try {
      await bankAccountService.createBankMovementTx(tx, shopId, userId, {
        bankAccountId: input.bankAccountId,
        direction: "OUT",
        amount,
        type: movementType,
        occurredAt,
        description: input.description,
        reference: input.reference ?? input.source?.sourceReference ?? null,
        sourceType: input.source?.sourceType ?? "SALE_CHANGE",
        sourceId: input.source?.sourceId ?? null,
        sourceReference: input.source?.sourceReference ?? input.reference ?? null,
        customerId: input.source?.customerId ?? null,
        counterpartyType: input.source?.customerId ? "CUSTOMER" : null,
        counterpartyId: input.source?.customerId ?? null,
        counterpartyName: input.source?.customerName ?? null,
      });
    } catch (error) {
      if (contextLabel && error instanceof Error && error.message.includes("رصيداً سالباً")) {
        throw new Error(`رصيد الحساب البنكي غير كافٍ لتسديد ${contextLabel}.`);
      }
      throw error;
    }
    return;
  }

  if (!input.walletId) throw new Error(contextLabel ? `اختر المحفظة التي ستُسدد منها ${contextLabel}.` : "اختر محفظة إرجاع الباقي.");
  const rows = await tx.$queryRaw<Array<{ id: string; name: string; currentBalance: Prisma.Decimal }>>`
    SELECT "id", "name", "currentBalance"
    FROM "FinancialWallet"
    WHERE "id" = ${input.walletId}::uuid
      AND "shopId" = ${shopId}::uuid
      AND "deletedAt" IS NULL
      AND "isActive" = TRUE
    FOR UPDATE
  `;
  const wallet = rows[0];
  if (!wallet) throw new Error(contextLabel ? `المحفظة المحددة لتسديد ${contextLabel} غير موجودة أو غير فعالة.` : "محفظة إرجاع الباقي غير موجودة.");
  const next = wallet.currentBalance.sub(amount);
  if (next.lt(0)) throw new Error(contextLabel ? `رصيد محفظة ${wallet.name} غير كافٍ لتسديد ${contextLabel}.` : `رصيد محفظة ${wallet.name} غير كافٍ لإرجاع الباقي.`);
  await tx.$executeRaw`
    UPDATE "FinancialWallet"
    SET "currentBalance" = ${next}, "updatedAt" = NOW()
    WHERE "id" = ${wallet.id}::uuid
  `;
  await tx.$executeRaw`
    INSERT INTO "FinancialTransfer" (
      "shopId", "walletId", "customerId", "createdByUserId", "operationType", "amount", "walletAmount",
      "commission", "commissionMode", "isDeferred", "customerName", "customerPhone", "notes",
      "sourceType", "sourceId", "sourceReference", "createdAt", "updatedAt"
    ) VALUES (
      ${shopId}::uuid, ${wallet.id}::uuid, ${input.source?.customerId ?? null}::uuid, ${userId}::uuid,
      'WALLET_WITHDRAWAL', ${amount}, ${amount}, 0, 'NONE', FALSE,
      ${input.source?.customerName ?? null}, ${input.source?.customerPhone ?? null}, ${input.description},
      ${input.source?.sourceType ?? "MANUAL"}, ${input.source?.sourceId ?? null},
      ${input.source?.sourceReference ?? input.reference ?? null}, ${occurredAt}, NOW()
    )
  `;
}

async function reverseTrackedMoneyTx(
  tx: Prisma.TransactionClient,
  shopId: string,
  match: { drawerTypes: string[]; descriptionLike: string },
  voidedByUserId?: string | null,
) {
  const drawerMovements = await tx.$queryRaw<Array<{
    id: string;
    drawerId: string;
    direction: "IN" | "OUT";
    amount: Prisma.Decimal;
  }>>(Prisma.sql`
    SELECT "id", "drawerId", "direction", "amount"
    FROM "CashDrawerMovement"
    WHERE "shopId" = ${shopId}::uuid
      AND "status" = 'ACTIVE'
      AND "type" IN (${Prisma.join(match.drawerTypes)})
      AND "description" LIKE ${match.descriptionLike}
    ORDER BY CASE WHEN "direction" = 'OUT' THEN 0 ELSE 1 END, "createdAt" DESC, "id" DESC
    FOR UPDATE
  `);
  for (const movement of drawerMovements) {
    const drawers = await tx.$queryRaw<Array<{ id: string; currentBalance: Prisma.Decimal }>>`
      SELECT "id", "currentBalance"
      FROM "CashDrawer"
      WHERE "id" = ${movement.drawerId}::uuid AND "shopId" = ${shopId}::uuid
      FOR UPDATE
    `;
    const drawer = drawers[0];
    if (!drawer) throw new Error("الدرج النقدي المرتبط بالحركة غير موجود.");
    const next = movement.direction === "IN"
      ? drawer.currentBalance.sub(movement.amount)
      : drawer.currentBalance.add(movement.amount);
    if (next.lt(0)) throw new Error("لا يمكن عكس العملية لأن رصيد الدرج الحالي غير كافٍ.");
    await tx.$executeRaw`
      UPDATE "CashDrawer" SET "currentBalance" = ${next}, "updatedAt" = NOW()
      WHERE "id" = ${drawer.id}::uuid
    `;
    await tx.$executeRaw`
      UPDATE "CashDrawerMovement" SET "status" = 'VOID', "voidedAt" = NOW()
      WHERE "id" = ${movement.id}::uuid
    `;
  }

  const walletMovements = await tx.$queryRaw<Array<{
    id: string;
    walletId: string;
    operationType: string;
    walletAmount: Prisma.Decimal;
  }>>`
    SELECT "id", "walletId", "operationType", "walletAmount"
    FROM "FinancialTransfer"
    WHERE "shopId" = ${shopId}::uuid
      AND "status" = 'ACTIVE'
      AND "deletedAt" IS NULL
      AND "operationType" IN ('WALLET_TOPUP','WALLET_WITHDRAWAL')
      AND "notes" LIKE ${match.descriptionLike}
    ORDER BY CASE WHEN "operationType" = 'WALLET_WITHDRAWAL' THEN 0 ELSE 1 END, "createdAt" DESC, "id" DESC
    FOR UPDATE
  `;
  for (const movement of walletMovements) {
    const wallets = await tx.$queryRaw<Array<{ id: string; currentBalance: Prisma.Decimal }>>`
      SELECT "id", "currentBalance"
      FROM "FinancialWallet"
      WHERE "id" = ${movement.walletId}::uuid
        AND "shopId" = ${shopId}::uuid
        AND "deletedAt" IS NULL
      FOR UPDATE
    `;
    const wallet = wallets[0];
    if (!wallet) throw new Error("المحفظة المرتبطة بالحركة غير موجودة.");
    const next = movement.operationType === "WALLET_TOPUP"
      ? wallet.currentBalance.sub(movement.walletAmount)
      : wallet.currentBalance.add(movement.walletAmount);
    if (next.lt(0)) throw new Error("لا يمكن عكس العملية لأن رصيد المحفظة الحالي غير كافٍ.");
    await tx.$executeRaw`
      UPDATE "FinancialWallet" SET "currentBalance" = ${next}, "updatedAt" = NOW()
      WHERE "id" = ${wallet.id}::uuid
    `;
    await tx.$executeRaw`
      UPDATE "FinancialTransfer"
      SET "status" = 'VOID', "voidedByUserId"=${voidedByUserId ?? null}::uuid, "voidedAt" = NOW(), "updatedAt" = NOW()
      WHERE "id" = ${movement.id}::uuid
    `;
  }
}

type SourceMoneyEndpoint = { type: "BANK" | "DRAWER" | "WALLET"; id: string };

async function lockSourceMoneyEndpointsTx(
  tx: Prisma.TransactionClient,
  shopId: string,
  sourceType: string,
  sourceId: string,
) {
  // Discover first, then lock every touched money account in the same stable
  // order used by bank liquidity transfers. This prevents cancellation/void
  // flows (for example BANK receipt + DRAWER change) from taking locks in the
  // opposite order to the original operation.
  const [drawerRows, bankRows, walletRows] = await Promise.all([
    tx.$queryRaw<Array<{ id: string }>>`
      SELECT DISTINCT "drawerId" AS "id"
      FROM "CashDrawerMovement"
      WHERE "shopId" = ${shopId}::uuid
        AND "status" = 'ACTIVE'
        AND "sourceType" = ${sourceType}
        AND "sourceId" = ${sourceId}
    `,
    tx.$queryRaw<Array<{ id: string }>>`
      SELECT DISTINCT "bankAccountId" AS "id"
      FROM "BankAccountMovement"
      WHERE "shopId" = ${shopId}::uuid
        AND "status" = 'ACTIVE'
        AND "sourceType" = ${sourceType}
        AND "sourceId" = ${sourceId}
    `,
    tx.$queryRaw<Array<{ id: string }>>`
      SELECT DISTINCT "walletId" AS "id"
      FROM "FinancialTransfer"
      WHERE "shopId" = ${shopId}::uuid
        AND "status" = 'ACTIVE'
        AND "deletedAt" IS NULL
        AND "sourceType" = ${sourceType}
        AND "sourceId" = ${sourceId}
        AND "operationType" IN ('WALLET_TOPUP','WALLET_WITHDRAWAL')
    `,
  ]);

  const endpoints: SourceMoneyEndpoint[] = [
    ...bankRows.map((row) => ({ type: "BANK" as const, id: row.id })),
    ...drawerRows.map((row) => ({ type: "DRAWER" as const, id: row.id })),
    ...walletRows.map((row) => ({ type: "WALLET" as const, id: row.id })),
  ].sort((a, b) => `${a.type}:${a.id}`.localeCompare(`${b.type}:${b.id}`));

  for (const endpoint of endpoints) {
    if (endpoint.type === "BANK") {
      const rows = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT "id" FROM "BankAccount"
        WHERE "id" = ${endpoint.id}::uuid AND "shopId" = ${shopId}::uuid AND "deletedAt" IS NULL
        FOR UPDATE
      `;
      if (!rows[0]) throw new Error("الحساب البنكي المرتبط بالحركة غير موجود.");
      continue;
    }
    if (endpoint.type === "DRAWER") {
      const rows = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT "id" FROM "CashDrawer"
        WHERE "id" = ${endpoint.id}::uuid AND "shopId" = ${shopId}::uuid
        FOR UPDATE
      `;
      if (!rows[0]) throw new Error("الدرج النقدي المرتبط بالحركة غير موجود.");
      continue;
    }
    const rows = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT "id" FROM "FinancialWallet"
      WHERE "id" = ${endpoint.id}::uuid AND "shopId" = ${shopId}::uuid AND "deletedAt" IS NULL
      FOR UPDATE
    `;
    if (!rows[0]) throw new Error("المحفظة المرتبطة بالحركة غير موجودة.");
  }
}

export async function reverseSourceMoneyTx(
  tx: Prisma.TransactionClient,
  shopId: string,
  sourceType: string,
  sourceId: string,
  voidedByUserId?: string | null,
) {
  await lockSourceMoneyEndpointsTx(tx, shopId, sourceType, sourceId);
  const drawerMovements = await tx.$queryRaw<Array<{ id: string; drawerId: string; direction: "IN" | "OUT"; amount: Prisma.Decimal }>>`
    SELECT "id", "drawerId", "direction", "amount"
    FROM "CashDrawerMovement"
    WHERE "shopId" = ${shopId}::uuid
      AND "status" = 'ACTIVE'
      AND "sourceType" = ${sourceType}
      AND "sourceId" = ${sourceId}
    ORDER BY CASE WHEN "direction" = 'OUT' THEN 0 ELSE 1 END, "createdAt" DESC, "id" DESC
    FOR UPDATE
  `;
  for (const movement of drawerMovements) {
    const rows = await tx.$queryRaw<Array<{ currentBalance: Prisma.Decimal }>>`
      SELECT "currentBalance" FROM "CashDrawer"
      WHERE "id" = ${movement.drawerId}::uuid AND "shopId" = ${shopId}::uuid
      FOR UPDATE
    `;
    const drawer = rows[0];
    if (!drawer) throw new Error("الدرج النقدي المرتبط بالحركة غير موجود.");
    const next = movement.direction === "IN" ? drawer.currentBalance.sub(movement.amount) : drawer.currentBalance.add(movement.amount);
    if (next.lt(0)) throw new Error("لا يمكن عكس العملية لأن رصيد الدرج الحالي غير كافٍ.");
    await tx.$executeRaw`UPDATE "CashDrawer" SET "currentBalance" = ${next}, "updatedAt" = NOW() WHERE "id" = ${movement.drawerId}::uuid`;
    await tx.$executeRaw`UPDATE "CashDrawerMovement" SET "status"='VOID', "voidedAt"=NOW() WHERE "id"=${movement.id}::uuid`;
  }

  await bankAccountService.reverseSourceMovementsTx(
    tx,
    shopId,
    sourceType,
    sourceId,
    voidedByUserId ?? null,
  );

  const walletMovements = await tx.$queryRaw<Array<{ id: string; walletId: string; operationType: string; walletAmount: Prisma.Decimal }>>`
    SELECT "id", "walletId", "operationType", "walletAmount"
    FROM "FinancialTransfer"
    WHERE "shopId" = ${shopId}::uuid
      AND "status" = 'ACTIVE'
      AND "deletedAt" IS NULL
      AND "sourceType" = ${sourceType}
      AND "sourceId" = ${sourceId}
      AND "operationType" IN ('WALLET_TOPUP','WALLET_WITHDRAWAL')
    ORDER BY CASE WHEN "operationType" = 'WALLET_WITHDRAWAL' THEN 0 ELSE 1 END, "createdAt" DESC, "id" DESC
    FOR UPDATE
  `;
  for (const movement of walletMovements) {
    const rows = await tx.$queryRaw<Array<{ currentBalance: Prisma.Decimal }>>`
      SELECT "currentBalance" FROM "FinancialWallet"
      WHERE "id" = ${movement.walletId}::uuid AND "shopId" = ${shopId}::uuid AND "deletedAt" IS NULL
      FOR UPDATE
    `;
    const wallet = rows[0];
    if (!wallet) throw new Error("المحفظة المرتبطة بالحركة غير موجودة.");
    const next = movement.operationType === "WALLET_TOPUP" ? wallet.currentBalance.sub(movement.walletAmount) : wallet.currentBalance.add(movement.walletAmount);
    if (next.lt(0)) throw new Error("لا يمكن عكس العملية لأن رصيد المحفظة الحالي غير كافٍ.");
    await tx.$executeRaw`UPDATE "FinancialWallet" SET "currentBalance"=${next}, "updatedAt"=NOW() WHERE "id"=${movement.walletId}::uuid`;
    await tx.$executeRaw`UPDATE "FinancialTransfer" SET "status"='VOID', "voidedByUserId"=${voidedByUserId ?? null}::uuid, "voidedAt"=NOW(), "updatedAt"=NOW() WHERE "id"=${movement.id}::uuid`;
  }
}

export async function reverseSaleMoneyTx(
  tx: Prisma.TransactionClient,
  shopId: string,
  receiptNumber: string,
  voidedByUserId?: string | null,
) {
  await reverseTrackedMoneyTx(tx, shopId, {
    drawerTypes: ["SALE_CASH", "CHANGE_RETURN"],
    descriptionLike: `%${receiptNumber}%`,
  }, voidedByUserId);
}

export async function reverseInvoiceMoneyTx(
  tx: Prisma.TransactionClient,
  shopId: string,
  invoiceNumber: string,
  voidedByUserId?: string | null,
) {
  await reverseTrackedMoneyTx(tx, shopId, {
    drawerTypes: ["INVOICE_PAYMENT", "CHANGE_RETURN", "SOFTWARE_SERVICE_COST"],
    descriptionLike: `%${invoiceNumber}%`,
  }, voidedByUserId);
}

export const moneyAccountService = {
  prepareMoneyAccounts,
  lockMoneyAccountEndpointsTx,
  applyIncomingMoneyTx,
  applyOutgoingMoneyTx,
  reverseSaleMoneyTx,
  reverseInvoiceMoneyTx,
  reverseSourceMoneyTx,
};
