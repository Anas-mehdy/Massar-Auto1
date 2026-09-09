import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { cashDrawerService } from "@/lib/services/cashDrawerService";
import { financialTransferService } from "@/lib/services/financialTransferService";

export type BankAccountRow = {
  id: string;
  name: string;
  bankName: string | null;
  openingBalance: Prisma.Decimal;
  currentBalance: Prisma.Decimal;
  openingBalanceSetAt: Date | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
};

export type BankMovementDirection = "IN" | "OUT";
export type BankMovementStatus = "ACTIVE" | "VOID";
export type BankTransferEndpointType = "BANK" | "DRAWER" | "WALLET";

export type BankAccountMovementRow = {
  id: string;
  bankAccountId: string;
  accountName: string;
  bankName: string | null;
  createdByUserId: string | null;
  createdByName: string | null;
  voidedByUserId: string | null;
  voidedByName: string | null;
  customerId: string | null;
  customerName: string | null;
  customerPhone: string | null;
  counterpartyType: string | null;
  counterpartyId: string | null;
  counterpartyName: string | null;
  transferGroupId: string | null;
  type: string;
  direction: BankMovementDirection;
  amount: Prisma.Decimal;
  balanceBefore: Prisma.Decimal;
  balanceAfter: Prisma.Decimal;
  description: string | null;
  reference: string | null;
  sourceType: string;
  sourceId: string | null;
  sourceReference: string | null;
  status: BankMovementStatus;
  occurredAt: Date;
  createdAt: Date;
  updatedAt: Date;
  voidedAt: Date | null;
};

export type BankMovementFilters = {
  accountId?: string;
  direction?: BankMovementDirection;
  status?: BankMovementStatus;
  type?: string;
  sourceType?: string;
  q?: string;
  from?: Date;
  to?: Date;
};

export type CreateBankAccountInput = {
  name: string;
  bankName?: string | null;
  openingBalance?: string | number | Prisma.Decimal | null;
};

export type CreateBankMovementTxInput = {
  bankAccountId: string;
  direction: BankMovementDirection;
  amount: string | number | Prisma.Decimal;
  type: string;
  description?: string | null;
  reference?: string | null;
  sourceType?: string | null;
  sourceId?: string | null;
  sourceReference?: string | null;
  customerId?: string | null;
  counterpartyType?: string | null;
  counterpartyId?: string | null;
  counterpartyName?: string | null;
  transferGroupId?: string | null;
  occurredAt?: Date;
  requireActiveAccount?: boolean;
};

export type UpdateBankMovementTxInput = {
  amount?: string | number | Prisma.Decimal;
  occurredAt?: Date;
  description?: string | null;
  reference?: string | null;
  sourceReference?: string | null;
};

function decimal(value: string | number | Prisma.Decimal | null | undefined) {
  const result = new Prisma.Decimal(String(value ?? 0).replace(",", ".")).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
  if (!result.isFinite()) throw new Error("القيمة المالية غير صحيحة.");
  return result;
}

function positiveAmount(value: string | number | Prisma.Decimal) {
  const amount = decimal(value);
  if (amount.lte(0)) throw new Error("المبلغ يجب أن يكون أكبر من صفر.");
  return amount;
}

function nullableText(value?: string | null) {
  const text = value?.trim();
  return text ? text : null;
}

function validDate(value: Date | undefined) {
  const date = value ?? new Date();
  if (Number.isNaN(date.getTime())) throw new Error("تاريخ الحركة غير صالح.");
  return date;
}

function accountName(value: string) {
  const name = value.trim().replace(/\s+/g, " ");
  if (!name) throw new Error("اسم الحساب البنكي مطلوب.");
  if (name.length > 120) throw new Error("اسم الحساب البنكي طويل جداً.");
  return name;
}

function movementSelect() {
  return Prisma.sql`
    SELECT m."id", m."bankAccountId", a."name" AS "accountName", a."bankName",
      m."createdByUserId", creator."name" AS "createdByName",
      m."voidedByUserId", voider."name" AS "voidedByName",
      m."customerId", c."name" AS "customerName", c."phone" AS "customerPhone",
      m."counterpartyType", m."counterpartyId", m."counterpartyName", m."transferGroupId",
      m."type", m."direction", m."amount", m."balanceBefore", m."balanceAfter",
      m."description", m."reference", m."sourceType", m."sourceId", m."sourceReference",
      m."status", m."occurredAt", m."createdAt", m."updatedAt", m."voidedAt"
    FROM "BankAccountMovement" m
    JOIN "BankAccount" a ON a."id" = m."bankAccountId" AND a."shopId" = m."shopId"
    LEFT JOIN "Customer" c ON c."id" = m."customerId" AND c."shopId" = m."shopId"
    LEFT JOIN "User" creator ON creator."id" = m."createdByUserId"
    LEFT JOIN "User" voider ON voider."id" = m."voidedByUserId"
  `;
}

async function lockBankAccountTx(
  tx: Prisma.TransactionClient,
  shopId: string,
  accountId: string,
  requireActive = true,
) {
  const activeSql = requireActive ? Prisma.sql`AND "isActive" = TRUE` : Prisma.sql``;
  const rows = await tx.$queryRaw<Array<{ id: string; name: string; currentBalance: Prisma.Decimal }>>(Prisma.sql`
    SELECT "id", "name", "currentBalance"
    FROM "BankAccount"
    WHERE "id" = ${accountId}::uuid
      AND "shopId" = ${shopId}::uuid
      AND "deletedAt" IS NULL
      ${activeSql}
    FOR UPDATE
  `);
  const account = rows[0];
  if (!account) throw new Error(requireActive ? "الحساب البنكي المحدد غير موجود أو متوقف." : "الحساب البنكي غير موجود.");
  return account;
}

/**
 * Rebuild the active bank ledger in strict chronological order.
 * Any operation that inserts/edits/voids a historical movement must call this
 * inside the same transaction. A negative intermediate balance aborts the whole
 * transaction, protecting both the current balance and historical snapshots.
 */
export async function rebuildActiveMovementBalancesTx(
  tx: Prisma.TransactionClient,
  shopId: string,
  accountId: string,
) {
  await lockBankAccountTx(tx, shopId, accountId, false);
  const movements = await tx.$queryRaw<Array<{
    id: string;
    direction: BankMovementDirection;
    amount: Prisma.Decimal;
    balanceBefore: Prisma.Decimal;
    balanceAfter: Prisma.Decimal;
  }>>`
    SELECT "id", "direction", "amount", "balanceBefore", "balanceAfter"
    FROM "BankAccountMovement"
    WHERE "shopId" = ${shopId}::uuid
      AND "bankAccountId" = ${accountId}::uuid
      AND "status" = 'ACTIVE'
    ORDER BY "occurredAt" ASC, "createdAt" ASC, "id" ASC
    FOR UPDATE
  `;

  let balance = new Prisma.Decimal(0);
  for (const movement of movements) {
    const before = balance;
    const after = movement.direction === "IN" ? before.add(movement.amount) : before.sub(movement.amount);
    if (after.lt(0)) {
      throw new Error("تسلسل حركات الحساب البنكي ينتج رصيداً سالباً؛ راجع تاريخ أو قيمة الحركة.");
    }
    if (!movement.balanceBefore.eq(before) || !movement.balanceAfter.eq(after)) {
      await tx.$executeRaw`
        UPDATE "BankAccountMovement"
        SET "balanceBefore" = ${before}, "balanceAfter" = ${after}, "updatedAt" = NOW()
        WHERE "id" = ${movement.id}::uuid AND "shopId" = ${shopId}::uuid
      `;
    }
    balance = after;
  }

  await tx.$executeRaw`
    UPDATE "BankAccount"
    SET "currentBalance" = ${balance}, "updatedAt" = NOW()
    WHERE "id" = ${accountId}::uuid AND "shopId" = ${shopId}::uuid
  `;
  return balance;
}

export async function createBankMovementTx(
  tx: Prisma.TransactionClient,
  shopId: string,
  userId: string | null,
  input: CreateBankMovementTxInput,
) {
  const amount = positiveAmount(input.amount);
  const occurredAt = validDate(input.occurredAt);
  const account = await lockBankAccountTx(tx, shopId, input.bankAccountId, input.requireActiveAccount !== false);

  const rows = await tx.$queryRaw<Array<{ id: string }>>`
    INSERT INTO "BankAccountMovement" (
      "shopId", "bankAccountId", "createdByUserId", "customerId", "type", "direction", "amount",
      "balanceBefore", "balanceAfter", "description", "reference", "sourceType", "sourceId", "sourceReference",
      "counterpartyType", "counterpartyId", "counterpartyName", "transferGroupId", "occurredAt"
    ) VALUES (
      ${shopId}::uuid, ${account.id}::uuid, ${userId}::uuid, ${input.customerId ?? null}::uuid,
      ${input.type}, ${input.direction}, ${amount}, 0, 0, ${nullableText(input.description)}, ${nullableText(input.reference)},
      ${nullableText(input.sourceType) ?? "MANUAL"}, ${nullableText(input.sourceId)},
      ${nullableText(input.sourceReference) ?? nullableText(input.reference)}, ${nullableText(input.counterpartyType)},
      ${nullableText(input.counterpartyId)}, ${nullableText(input.counterpartyName)}, ${input.transferGroupId ?? null}::uuid,
      ${occurredAt}
    )
    RETURNING "id"
  `;
  const movementId = rows[0]?.id;
  if (!movementId) throw new Error("تعذر تسجيل الحركة البنكية.");
  const currentBalance = await rebuildActiveMovementBalancesTx(tx, shopId, account.id);
  return { movementId, accountId: account.id, accountName: account.name, currentBalance };
}

export async function updateActiveMovementTx(
  tx: Prisma.TransactionClient,
  shopId: string,
  movementId: string,
  input: UpdateBankMovementTxInput,
) {
  // Resolve the account first without taking a movement lock, then lock the
  // account before the movement. This matches create/rebuild/reversal lock
  // order and prevents a movement->account vs account->movement deadlock.
  const lookupRows = await tx.$queryRaw<Array<{ id: string; bankAccountId: string }>>`
    SELECT "id", "bankAccountId"
    FROM "BankAccountMovement"
    WHERE "id" = ${movementId}::uuid AND "shopId" = ${shopId}::uuid AND "status" = 'ACTIVE'
    LIMIT 1
  `;
  const lookup = lookupRows[0];
  if (!lookup) throw new Error("الحركة البنكية غير موجودة أو ملغاة.");
  await lockBankAccountTx(tx, shopId, lookup.bankAccountId, false);
  const rows = await tx.$queryRaw<Array<{ id: string; bankAccountId: string }>>`
    SELECT "id", "bankAccountId"
    FROM "BankAccountMovement"
    WHERE "id" = ${movementId}::uuid AND "shopId" = ${shopId}::uuid AND "bankAccountId" = ${lookup.bankAccountId}::uuid AND "status" = 'ACTIVE'
    FOR UPDATE
  `;
  const movement = rows[0];
  if (!movement) throw new Error("الحركة البنكية غير موجودة أو ملغاة.");

  const amount = input.amount === undefined ? null : positiveAmount(input.amount);
  const occurredAt = input.occurredAt === undefined ? null : validDate(input.occurredAt);
  await tx.$executeRaw`
    UPDATE "BankAccountMovement"
    SET "amount" = COALESCE(${amount}, "amount"),
        "occurredAt" = COALESCE(${occurredAt}, "occurredAt"),
        "description" = CASE WHEN ${input.description === undefined} THEN "description" ELSE ${nullableText(input.description)} END,
        "reference" = CASE WHEN ${input.reference === undefined} THEN "reference" ELSE ${nullableText(input.reference)} END,
        "sourceReference" = CASE WHEN ${input.sourceReference === undefined} THEN "sourceReference" ELSE ${nullableText(input.sourceReference)} END,
        "updatedAt" = NOW()
    WHERE "id" = ${movement.id}::uuid AND "shopId" = ${shopId}::uuid AND "status" = 'ACTIVE'
  `;
  const currentBalance = await rebuildActiveMovementBalancesTx(tx, shopId, movement.bankAccountId);
  return { movementId: movement.id, bankAccountId: movement.bankAccountId, currentBalance };
}

export async function voidMovementTx(
  tx: Prisma.TransactionClient,
  shopId: string,
  movementId: string,
  voidedByUserId: string | null,
) {
  const lookupRows = await tx.$queryRaw<Array<{ id: string; bankAccountId: string; status: BankMovementStatus }>>`
    SELECT "id", "bankAccountId", "status"
    FROM "BankAccountMovement"
    WHERE "id" = ${movementId}::uuid AND "shopId" = ${shopId}::uuid
    LIMIT 1
  `;
  const lookup = lookupRows[0];
  if (!lookup) throw new Error("الحركة البنكية غير موجودة.");
  if (lookup.status === "VOID") return { alreadyVoided: true, movementId: lookup.id, bankAccountId: lookup.bankAccountId };
  await lockBankAccountTx(tx, shopId, lookup.bankAccountId, false);
  const rows = await tx.$queryRaw<Array<{ id: string; bankAccountId: string; status: BankMovementStatus }>>`
    SELECT "id", "bankAccountId", "status"
    FROM "BankAccountMovement"
    WHERE "id" = ${movementId}::uuid AND "shopId" = ${shopId}::uuid AND "bankAccountId" = ${lookup.bankAccountId}::uuid
    FOR UPDATE
  `;
  const movement = rows[0];
  if (!movement) throw new Error("الحركة البنكية غير موجودة.");
  if (movement.status === "VOID") return { alreadyVoided: true, movementId: movement.id, bankAccountId: movement.bankAccountId };
  await tx.$executeRaw`
    UPDATE "BankAccountMovement"
    SET "status" = 'VOID', "voidedAt" = NOW(), "voidedByUserId" = ${voidedByUserId}::uuid, "updatedAt" = NOW()
    WHERE "id" = ${movement.id}::uuid AND "shopId" = ${shopId}::uuid AND "status" = 'ACTIVE'
  `;
  const currentBalance = await rebuildActiveMovementBalancesTx(tx, shopId, movement.bankAccountId);
  return { alreadyVoided: false, movementId: movement.id, bankAccountId: movement.bankAccountId, currentBalance };
}

export async function reverseSourceMovementsTx(
  tx: Prisma.TransactionClient,
  shopId: string,
  sourceType: string,
  sourceId: string,
  voidedByUserId: string | null = null,
) {
  const source = nullableText(sourceType);
  const id = nullableText(sourceId);
  if (!source || !id) return { count: 0 };

  const accountRows = await tx.$queryRaw<Array<{ bankAccountId: string }>>`
    SELECT DISTINCT "bankAccountId"
    FROM "BankAccountMovement"
    WHERE "shopId" = ${shopId}::uuid AND "sourceType" = ${source} AND "sourceId" = ${id} AND "status" = 'ACTIVE'
    ORDER BY "bankAccountId"
  `;
  const accountIds = accountRows.map((row) => row.bankAccountId).sort();
  for (const accountId of accountIds) await lockBankAccountTx(tx, shopId, accountId, false);

  const movements = await tx.$queryRaw<Array<{ id: string; bankAccountId: string }>>`
    SELECT "id", "bankAccountId"
    FROM "BankAccountMovement"
    WHERE "shopId" = ${shopId}::uuid AND "sourceType" = ${source} AND "sourceId" = ${id} AND "status" = 'ACTIVE'
    ORDER BY "bankAccountId", "occurredAt", "createdAt", "id"
    FOR UPDATE
  `;
  if (!movements.length) return { count: 0 };

  await tx.$executeRaw`
    UPDATE "BankAccountMovement"
    SET "status" = 'VOID', "voidedAt" = NOW(), "voidedByUserId" = ${voidedByUserId}::uuid, "updatedAt" = NOW()
    WHERE "shopId" = ${shopId}::uuid AND "sourceType" = ${source} AND "sourceId" = ${id} AND "status" = 'ACTIVE'
  `;
  for (const accountId of accountIds) await rebuildActiveMovementBalancesTx(tx, shopId, accountId);
  return { count: movements.length };
}

export async function reverseSourceMovementTx(
  tx: Prisma.TransactionClient,
  shopId: string,
  sourceType: string,
  sourceId: string,
  voidedByUserId: string | null = null,
) {
  return reverseSourceMovementsTx(tx, shopId, sourceType, sourceId, voidedByUserId);
}

export async function listAccounts(shopId: string, options: { includeInactive?: boolean } = {}) {
  const activeFilter = options.includeInactive ? Prisma.sql`` : Prisma.sql`AND "isActive" = TRUE`;
  return prisma.$queryRaw<BankAccountRow[]>(Prisma.sql`
    SELECT "id", "name", "bankName", "openingBalance", "currentBalance", "openingBalanceSetAt",
      "isActive", "createdAt", "updatedAt"
    FROM "BankAccount"
    WHERE "shopId" = ${shopId}::uuid AND "deletedAt" IS NULL ${activeFilter}
    ORDER BY "isActive" DESC, LOWER("name") ASC, "createdAt" ASC
  `);
}

export async function getAccount(shopId: string, accountId: string) {
  const rows = await prisma.$queryRaw<BankAccountRow[]>`
    SELECT "id", "name", "bankName", "openingBalance", "currentBalance", "openingBalanceSetAt",
      "isActive", "createdAt", "updatedAt"
    FROM "BankAccount"
    WHERE "id" = ${accountId}::uuid AND "shopId" = ${shopId}::uuid AND "deletedAt" IS NULL
    LIMIT 1
  `;
  return rows[0] ?? null;
}

export async function createAccount(shopId: string, userId: string | null, input: CreateBankAccountInput) {
  const name = accountName(input.name);
  const bankName = nullableText(input.bankName);
  const openingBalance = decimal(input.openingBalance);
  if (openingBalance.lt(0)) throw new Error("الرصيد الافتتاحي لا يمكن أن يكون سالباً.");

  return prisma.$transaction(async (tx) => {
    const duplicate = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT "id" FROM "BankAccount"
      WHERE "shopId" = ${shopId}::uuid AND "deletedAt" IS NULL AND LOWER("name") = LOWER(${name})
      LIMIT 1
    `;
    if (duplicate[0]) throw new Error("يوجد حساب بنكي آخر بهذا الاسم.");

    const rows = await tx.$queryRaw<BankAccountRow[]>`
      INSERT INTO "BankAccount" ("shopId", "name", "bankName", "openingBalance", "currentBalance", "openingBalanceSetAt")
      VALUES (${shopId}::uuid, ${name}, ${bankName}, 0, 0, NOW())
      RETURNING "id", "name", "bankName", "openingBalance", "currentBalance", "openingBalanceSetAt", "isActive", "createdAt", "updatedAt"
    `;
    const account = rows[0];
    if (!account) throw new Error("تعذر إنشاء الحساب البنكي.");
    if (openingBalance.gt(0)) {
      await createBankMovementTx(tx, shopId, userId, {
        bankAccountId: account.id,
        direction: "IN",
        amount: openingBalance,
        type: "OPENING_BALANCE",
        description: "الرصيد الافتتاحي للحساب البنكي",
        sourceType: "MANUAL",
        sourceReference: "الرصيد الافتتاحي",
      });
      await tx.$executeRaw`
        UPDATE "BankAccount"
        SET "openingBalance" = ${openingBalance}, "updatedAt" = NOW()
        WHERE "id" = ${account.id}::uuid AND "shopId" = ${shopId}::uuid
      `;
    }
    const refreshed = await tx.$queryRaw<BankAccountRow[]>`
      SELECT "id", "name", "bankName", "openingBalance", "currentBalance", "openingBalanceSetAt", "isActive", "createdAt", "updatedAt"
      FROM "BankAccount" WHERE "id" = ${account.id}::uuid
    `;
    return refreshed[0];
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 10_000 });
}

export async function updateAccount(shopId: string, accountId: string, input: { name: string; bankName?: string | null; isActive?: boolean }) {
  const name = accountName(input.name);
  const bankName = nullableText(input.bankName);
  return prisma.$transaction(async (tx) => {
    const duplicate = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT "id" FROM "BankAccount"
      WHERE "shopId" = ${shopId}::uuid AND "id" <> ${accountId}::uuid AND "deletedAt" IS NULL AND LOWER("name") = LOWER(${name})
      LIMIT 1
    `;
    if (duplicate[0]) throw new Error("يوجد حساب بنكي آخر بهذا الاسم.");
    const rows = await tx.$queryRaw<BankAccountRow[]>`
      UPDATE "BankAccount"
      SET "name"=${name}, "bankName"=${bankName}, "isActive"=COALESCE(${input.isActive ?? null}::boolean,"isActive"), "updatedAt"=NOW()
      WHERE "id"=${accountId}::uuid AND "shopId"=${shopId}::uuid AND "deletedAt" IS NULL
      RETURNING "id", "name", "bankName", "openingBalance", "currentBalance", "openingBalanceSetAt", "isActive", "createdAt", "updatedAt"
    `;
    if (!rows[0]) throw new Error("الحساب البنكي غير موجود.");
    return rows[0];
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 10_000 });
}

export async function adjustBalance(
  shopId: string,
  userId: string | null,
  accountId: string,
  input: { direction: BankMovementDirection; amount: string | number | Prisma.Decimal; reason: string; reference?: string | null; occurredAt?: Date },
) {
  const reason = nullableText(input.reason);
  if (!reason) throw new Error("سبب تسوية الرصيد مطلوب.");
  return prisma.$transaction(async (tx) => createBankMovementTx(tx, shopId, userId, {
    bankAccountId: accountId,
    direction: input.direction,
    amount: input.amount,
    type: input.direction === "IN" ? "ADJUSTMENT_IN" : "ADJUSTMENT_OUT",
    description: reason,
    reference: input.reference,
    sourceType: "MANUAL",
    sourceReference: input.reference ?? reason,
    occurredAt: input.occurredAt,
  }), { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 10_000 });
}

type LockedEndpoint = { type: BankTransferEndpointType; id: string; name: string; balance: Prisma.Decimal };

async function prepareTransferEndpoint(shopId: string, type: BankTransferEndpointType) {
  if (type === "DRAWER") await cashDrawerService.getSnapshot(shopId, 1);
  if (type === "WALLET") await financialTransferService.listWallets(shopId);
}

async function lockEndpoint(tx: Prisma.TransactionClient, shopId: string, type: BankTransferEndpointType, id?: string | null): Promise<LockedEndpoint> {
  if (type === "BANK") {
    if (!id) throw new Error("اختر الحساب البنكي.");
    const account = await lockBankAccountTx(tx, shopId, id, true);
    return { type, id: account.id, name: account.name, balance: account.currentBalance };
  }
  if (type === "DRAWER") {
    const rows = await tx.$queryRaw<Array<{ id: string; currentBalance: Prisma.Decimal }>>`
      SELECT "id", "currentBalance" FROM "CashDrawer" WHERE "shopId"=${shopId}::uuid FOR UPDATE
    `;
    if (!rows[0]) throw new Error("الدرج النقدي غير موجود.");
    return { type, id: rows[0].id, name: "الدرج النقدي", balance: rows[0].currentBalance };
  }
  if (!id) throw new Error("اختر المحفظة.");
  const rows = await tx.$queryRaw<Array<{ id: string; name: string; currentBalance: Prisma.Decimal }>>`
    SELECT "id", "name", "currentBalance" FROM "FinancialWallet"
    WHERE "id"=${id}::uuid AND "shopId"=${shopId}::uuid AND "deletedAt" IS NULL AND "isActive"=TRUE FOR UPDATE
  `;
  if (!rows[0]) throw new Error("المحفظة المحددة غير موجودة أو متوقفة.");
  return { type, id: rows[0].id, name: rows[0].name, balance: rows[0].currentBalance };
}

async function writeNonBankEndpointBalance(tx: Prisma.TransactionClient, endpoint: LockedEndpoint, next: Prisma.Decimal) {
  if (endpoint.type === "DRAWER") {
    await tx.$executeRaw`UPDATE "CashDrawer" SET "currentBalance"=${next}, "updatedAt"=NOW() WHERE "id"=${endpoint.id}::uuid`;
  } else if (endpoint.type === "WALLET") {
    await tx.$executeRaw`UPDATE "FinancialWallet" SET "currentBalance"=${next}, "updatedAt"=NOW() WHERE "id"=${endpoint.id}::uuid`;
  }
}

async function insertTransferLedgerMovement(
  tx: Prisma.TransactionClient,
  shopId: string,
  userId: string | null,
  endpoint: LockedEndpoint,
  counterparty: LockedEndpoint,
  direction: BankMovementDirection,
  amount: Prisma.Decimal,
  groupId: string,
  note: string | null,
  reference: string | null,
  occurredAt: Date,
) {
  const description = note || `تحويل ${direction === "OUT" ? "إلى" : "من"} ${counterparty.name}`;
  if (endpoint.type === "BANK") {
    await createBankMovementTx(tx, shopId, userId, {
      bankAccountId: endpoint.id,
      direction,
      amount,
      type: direction === "OUT" ? "TRANSFER_OUT" : "TRANSFER_IN",
      description,
      reference,
      sourceType: "BANK_TRANSFER",
      sourceId: groupId,
      sourceReference: counterparty.name,
      counterpartyType: counterparty.type,
      counterpartyId: counterparty.id,
      counterpartyName: counterparty.name,
      transferGroupId: groupId,
      occurredAt,
    });
    return;
  }
  if (endpoint.type === "DRAWER") {
    await tx.$executeRaw`
      INSERT INTO "CashDrawerMovement" (
        "shopId", "drawerId", "createdByUserId", "type", "direction", "amount", "description", "reference",
        "sourceType", "sourceId", "sourceReference", "createdAt"
      ) VALUES (
        ${shopId}::uuid, ${endpoint.id}::uuid, ${userId}::uuid, ${direction === "OUT" ? "BANK_TRANSFER_OUT" : "BANK_TRANSFER_IN"},
        ${direction}, ${amount}, ${description}, ${reference}, 'BANK_TRANSFER', ${groupId}, ${counterparty.name}, ${occurredAt}
      )
    `;
    return;
  }
  await tx.$executeRaw`
    INSERT INTO "FinancialTransfer" (
      "shopId", "walletId", "createdByUserId", "operationType", "amount", "walletAmount", "commission", "commissionMode",
      "isDeferred", "notes", "sourceType", "sourceId", "sourceReference", "createdAt", "updatedAt"
    ) VALUES (
      ${shopId}::uuid, ${endpoint.id}::uuid, ${userId}::uuid, ${direction === "IN" ? "WALLET_TOPUP" : "WALLET_WITHDRAWAL"},
      ${amount}, ${amount}, 0, 'NONE', FALSE, ${description}, 'BANK_TRANSFER', ${groupId}, ${counterparty.name}, ${occurredAt}, NOW()
    )
  `;
}

export async function transferMoney(
  shopId: string,
  userId: string | null,
  input: {
    fromType: BankTransferEndpointType;
    fromId?: string | null;
    toType: BankTransferEndpointType;
    toId?: string | null;
    amount: string | number | Prisma.Decimal;
    note?: string | null;
    reference?: string | null;
    occurredAt?: Date;
  },
) {
  const amount = positiveAmount(input.amount);
  if (input.fromType !== "BANK" && input.toType !== "BANK") throw new Error("يجب أن يكون أحد طرفي التحويل حساباً بنكياً.");
  if (input.fromType === input.toType && input.fromId && input.fromId === input.toId) throw new Error("لا يمكن التحويل إلى نفس الحساب.");
  await Promise.all([prepareTransferEndpoint(shopId, input.fromType), prepareTransferEndpoint(shopId, input.toType)]);
  const occurredAt = validDate(input.occurredAt);
  const note = nullableText(input.note);
  const reference = nullableText(input.reference);

  return prisma.$transaction(async (tx) => {
    const groupRows = await tx.$queryRaw<Array<{ id: string }>>`SELECT gen_random_uuid()::text AS "id"`;
    const groupId = groupRows[0]?.id;
    if (!groupId) throw new Error("تعذر إنشاء مرجع التحويل.");

    // Stable lock order protects opposite concurrent transfers (A→B / B→A) from deadlocks.
    const descriptors = [
      { role: "from" as const, type: input.fromType, id: input.fromId ?? null, key: `${input.fromType}:${input.fromId ?? ""}` },
      { role: "to" as const, type: input.toType, id: input.toId ?? null, key: `${input.toType}:${input.toId ?? ""}` },
    ].sort((a, b) => a.key.localeCompare(b.key));
    const locked = new Map<"from" | "to", LockedEndpoint>();
    for (const descriptor of descriptors) locked.set(descriptor.role, await lockEndpoint(tx, shopId, descriptor.type, descriptor.id));

    const from = locked.get("from")!;
    const to = locked.get("to")!;
    if (from.type === to.type && from.id === to.id) throw new Error("لا يمكن التحويل إلى نفس الحساب.");
    const fromAfter = from.balance.sub(amount);
    if (fromAfter.lt(0)) throw new Error(`رصيد ${from.name} غير كافٍ للتحويل.`);
    const toAfter = to.balance.add(amount);

    if (from.type !== "BANK") await writeNonBankEndpointBalance(tx, from, fromAfter);
    if (to.type !== "BANK") await writeNonBankEndpointBalance(tx, to, toAfter);
    await insertTransferLedgerMovement(tx, shopId, userId, from, to, "OUT", amount, groupId, note, reference, occurredAt);
    await insertTransferLedgerMovement(tx, shopId, userId, to, from, "IN", amount, groupId, note, reference, occurredAt);

    const finalFrom = from.type === "BANK" ? (await getBankBalanceTx(tx, shopId, from.id)) : fromAfter;
    const finalTo = to.type === "BANK" ? (await getBankBalanceTx(tx, shopId, to.id)) : toAfter;
    return { transferGroupId: groupId, fromBalance: finalFrom, toBalance: finalTo };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 15_000 });
}

async function getBankBalanceTx(tx: Prisma.TransactionClient, shopId: string, accountId: string) {
  const rows = await tx.$queryRaw<Array<{ currentBalance: Prisma.Decimal }>>`
    SELECT "currentBalance" FROM "BankAccount" WHERE "id"=${accountId}::uuid AND "shopId"=${shopId}::uuid LIMIT 1
  `;
  if (!rows[0]) throw new Error("الحساب البنكي غير موجود.");
  return rows[0].currentBalance;
}

export async function listMovements(shopId: string, filters: BankMovementFilters = {}, limit = 150) {
  const take = Math.max(1, Math.min(Math.trunc(limit), 500));
  const conditions: Array<ReturnType<typeof Prisma.sql>> = [Prisma.sql`m."shopId" = ${shopId}::uuid`];
  if (filters.accountId) conditions.push(Prisma.sql`m."bankAccountId" = ${filters.accountId}::uuid`);
  if (filters.direction) conditions.push(Prisma.sql`m."direction" = ${filters.direction}`);
  if (filters.status) conditions.push(Prisma.sql`m."status" = ${filters.status}`);
  if (filters.type) conditions.push(Prisma.sql`m."type" = ${filters.type}`);
  if (filters.sourceType) conditions.push(Prisma.sql`m."sourceType" = ${filters.sourceType}`);
  if (filters.from) conditions.push(Prisma.sql`m."occurredAt" >= ${filters.from}`);
  if (filters.to) conditions.push(Prisma.sql`m."occurredAt" < ${filters.to}`);
  if (filters.q?.trim()) {
    const q = `%${filters.q.trim()}%`;
    conditions.push(Prisma.sql`(
      a."name" ILIKE ${q} OR COALESCE(a."bankName",'') ILIKE ${q} OR COALESCE(m."description",'') ILIKE ${q}
      OR COALESCE(m."reference",'') ILIKE ${q} OR COALESCE(m."sourceReference",'') ILIKE ${q}
      OR COALESCE(m."counterpartyName",'') ILIKE ${q} OR COALESCE(c."name",'') ILIKE ${q} OR COALESCE(creator."name",'') ILIKE ${q}
    )`);
  }
  return prisma.$queryRaw<BankAccountMovementRow[]>(Prisma.sql`
    ${movementSelect()}
    WHERE ${Prisma.join(conditions, " AND ")}
    ORDER BY m."occurredAt" DESC, m."createdAt" DESC, m."id" DESC
    LIMIT ${take}
  `);
}

export async function getMovementById(shopId: string, movementId: string) {
  const rows = await prisma.$queryRaw<BankAccountMovementRow[]>(Prisma.sql`
    ${movementSelect()}
    WHERE m."shopId"=${shopId}::uuid AND m."id"=${movementId}::uuid
    LIMIT 1
  `);
  return rows[0] ?? null;
}

export async function getReportSnapshot(shopId: string, start: Date, end: Date) {
  const accounts = await listAccounts(shopId, { includeInactive: true });
  const rows = await prisma.$queryRaw<Array<{ inflow: Prisma.Decimal; outflow: Prisma.Decimal; opening: Prisma.Decimal }>>`
    SELECT
      COALESCE(SUM("amount") FILTER (WHERE "direction"='IN' AND "type" <> 'OPENING_BALANCE'), 0) AS "inflow",
      COALESCE(SUM("amount") FILTER (WHERE "direction"='OUT'), 0) AS "outflow",
      COALESCE(SUM("amount") FILTER (WHERE "type"='OPENING_BALANCE'), 0) AS "opening"
    FROM "BankAccountMovement"
    WHERE "shopId"=${shopId}::uuid AND "status"='ACTIVE' AND "occurredAt" >= ${start} AND "occurredAt" < ${end}
  `;
  return {
    currentBalance: accounts.reduce((sum, account) => sum + Number(account.currentBalance), 0),
    openingBalance: Number(rows[0]?.opening ?? 0),
    inflow: Number(rows[0]?.inflow ?? 0),
    outflow: Number(rows[0]?.outflow ?? 0),
    netMovement: Number(rows[0]?.inflow ?? 0) - Number(rows[0]?.outflow ?? 0),
  };
}

export async function prepareBankAccounts(shopId: string) {
  return listAccounts(shopId);
}

export const bankAccountService = {
  prepareBankAccounts,
  listAccounts,
  getAccount,
  createAccount,
  updateAccount,
  adjustBalance,
  createBankMovementTx,
  updateActiveMovementTx,
  voidMovementTx,
  reverseSourceMovementTx,
  reverseSourceMovementsTx,
  rebuildActiveMovementBalancesTx,
  transferMoney,
  listMovements,
  getMovementById,
  getReportSnapshot,
};
