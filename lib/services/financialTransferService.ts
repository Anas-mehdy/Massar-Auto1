import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export type FinancialTransferType =
  | "CUSTOMER_DEPOSIT"
  | "CUSTOMER_WITHDRAWAL"
  | "WALLET_TOPUP"
  | "WALLET_WITHDRAWAL";
export type CommissionMode = "DEDUCTED" | "ADDED" | "NONE";
export type SettlementType = "CASH_DRAWER" | "WALLET" | "DEBT";
export type FinancialTransferSourceType =
  | "CUSTOMER_TRANSFER"
  | "CUSTOMER_TRANSFER_SETTLEMENT"
  | "MANUAL"
  | "SALE"
  | "SALE_CHANGE"
  | "INVOICE"
  | "INSTALLMENT"
  | "INSTALLMENT_DOWN_PAYMENT"
  | "DEBT"
  | "CASH_DRAWER_TRANSFER";

export type WalletRow = {
  id: string;
  name: string;
  currentBalance: Prisma.Decimal;
  monthlyLimit: Prisma.Decimal | null;
  monthlyUsed: Prisma.Decimal;
  defaultDepositCommission: Prisma.Decimal;
  defaultWithdrawalCommission: Prisma.Decimal;
  isActive: boolean;
  createdAt: Date;
};

export type TransferRow = {
  id: string;
  walletId: string;
  walletName: string;
  customerId: string | null;
  customerName: string | null;
  customerPhone: string | null;
  operationType: FinancialTransferType;
  amount: Prisma.Decimal;
  walletAmount: Prisma.Decimal;
  commission: Prisma.Decimal;
  commissionMode: CommissionMode;
  isDeferred: boolean;
  debtEntryId: string | null;
  settlementType: SettlementType | null;
  settlementWalletId: string | null;
  settlementWalletName: string | null;
  settlementAmount: Prisma.Decimal | null;
  settlementTransferId: string | null;
  settlementCashMovementId: string | null;
  status: "ACTIVE" | "VOID";
  notes: string | null;
  sourceType: FinancialTransferSourceType;
  sourceId: string | null;
  sourceReference: string | null;
  createdAt: Date;
  voidedAt: Date | null;
};

export type TransferDetailsRow = TransferRow & {
  createdByName: string | null;
  voidedByName: string | null;
};

export type TransferFilters = { walletId?: string; operationType?: FinancialTransferType; q?: string; from?: Date; to?: Date };
export type CreateWalletInput = { name: string; openingBalance?: string; monthlyLimit?: string; defaultDepositCommission?: string; defaultWithdrawalCommission?: string };
export type CreateTransferInput = {
  walletId: string;
  operationType: FinancialTransferType;
  amount: string;
  commission?: string;
  commissionMode?: CommissionMode;
  isDeferred?: boolean;
  settlementType?: Exclude<SettlementType, "DEBT">;
  settlementWalletId?: string;
  customerId?: string;
  customerName?: string;
  customerPhone?: string;
  notes?: string;
};

type RawTransferRow = Omit<TransferRow, "sourceType"> & { sourceType: FinancialTransferSourceType | null };
type LockedWallet = {
  id: string;
  name: string;
  currentBalance: Prisma.Decimal;
  defaultDepositCommission: Prisma.Decimal;
  defaultWithdrawalCommission: Prisma.Decimal;
};

type LinkedSettlementTransfer = {
  id: string;
  walletId: string;
  operationType: FinancialTransferType;
  walletAmount: Prisma.Decimal;
  status: "ACTIVE" | "VOID";
};

const TRANSFER_TYPES = new Set<FinancialTransferType>(["CUSTOMER_DEPOSIT", "CUSTOMER_WITHDRAWAL", "WALLET_TOPUP", "WALLET_WITHDRAWAL"]);
const COMMISSION_MODES = new Set<CommissionMode>(["DEDUCTED", "ADDED", "NONE"]);
const SETTLEMENT_TYPES = new Set<Exclude<SettlementType, "DEBT">>(["CASH_DRAWER", "WALLET"]);
let tablesReady: Promise<void> | null = null;

function decimal(value: string | number | Prisma.Decimal | null | undefined) { return new Prisma.Decimal(String(value ?? 0).replace(",", ".")); }
function nullableText(value?: string | null) { const text = value?.trim(); return text ? text : null; }
function normalizePhone(value?: string | null) { const text = value?.trim(); return text ? text.replace(/[^\d+]/g, "") : null; }

export function inferTransferSourceType(operationType: FinancialTransferType, notes?: string | null): FinancialTransferSourceType {
  const text = notes || "";
  if (text.includes("إرجاع باقي للعميل من بيع")) return "SALE_CHANGE";
  if (text.includes("تحصيل بيع")) return "SALE";
  if (text.includes("تحصيل فاتورة")) return "INVOICE";
  if (text.includes("دفعة أولى لخطة")) return "INSTALLMENT_DOWN_PAYMENT";
  if (text.includes("دفعة أقساط")) return "INSTALLMENT";
  if (text.includes("[DEBT-PAYMENT:")) return "DEBT";
  if (text.includes("تحويل من الدرج النقدي") || text.includes("تحويل إلى الدرج النقدي")) return "CASH_DRAWER_TRANSFER";
  if (operationType === "CUSTOMER_DEPOSIT" || operationType === "CUSTOMER_WITHDRAWAL") return "CUSTOMER_TRANSFER";
  return "MANUAL";
}

function hydrateSource<T extends RawTransferRow>(row: T): Omit<T, "sourceType"> & { sourceType: FinancialTransferSourceType } {
  return { ...row, sourceType: row.sourceType || inferTransferSourceType(row.operationType, row.notes) };
}

async function createTables() {
  try {
    await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe("SELECT pg_advisory_xact_lock(68119724)");
      await tx.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "FinancialWallet" (
        "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(), "shopId" UUID NOT NULL REFERENCES "Shop"("id") ON DELETE CASCADE,
        "name" TEXT NOT NULL, "currentBalance" DECIMAL(14,2) NOT NULL DEFAULT 0, "monthlyLimit" DECIMAL(14,2),
        "defaultDepositCommission" DECIMAL(8,4) NOT NULL DEFAULT 0, "defaultWithdrawalCommission" DECIMAL(8,4) NOT NULL DEFAULT 0,
        "isActive" BOOLEAN NOT NULL DEFAULT TRUE, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "deletedAt" TIMESTAMP(3)
      )`);
      await tx.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "FinancialWallet_shopId_name_idx" ON "FinancialWallet"("shopId", "name")`);
      await tx.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "FinancialTransfer" (
        "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(), "shopId" UUID NOT NULL REFERENCES "Shop"("id") ON DELETE CASCADE,
        "walletId" UUID NOT NULL REFERENCES "FinancialWallet"("id") ON DELETE RESTRICT, "customerId" UUID REFERENCES "Customer"("id") ON DELETE SET NULL,
        "createdByUserId" UUID, "voidedByUserId" UUID, "operationType" TEXT NOT NULL, "amount" DECIMAL(14,2) NOT NULL,
        "walletAmount" DECIMAL(14,2), "commission" DECIMAL(14,2) NOT NULL DEFAULT 0, "commissionMode" TEXT NOT NULL DEFAULT 'ADDED',
        "isDeferred" BOOLEAN NOT NULL DEFAULT FALSE, "debtEntryId" UUID, "customerName" TEXT, "customerPhone" TEXT,
        "sourceType" TEXT, "sourceId" TEXT, "sourceReference" TEXT,
        "status" TEXT NOT NULL DEFAULT 'ACTIVE', "notes" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "voidedAt" TIMESTAMP(3), "deletedAt" TIMESTAMP(3)
      )`);
      await tx.$executeRawUnsafe(`ALTER TABLE "FinancialTransfer" ADD COLUMN IF NOT EXISTS "walletAmount" DECIMAL(14,2)`);
      await tx.$executeRawUnsafe(`ALTER TABLE "FinancialTransfer" ADD COLUMN IF NOT EXISTS "commissionMode" TEXT NOT NULL DEFAULT 'ADDED'`);
      await tx.$executeRawUnsafe(`ALTER TABLE "FinancialTransfer" ADD COLUMN IF NOT EXISTS "isDeferred" BOOLEAN NOT NULL DEFAULT FALSE`);
      await tx.$executeRawUnsafe(`ALTER TABLE "FinancialTransfer" ADD COLUMN IF NOT EXISTS "debtEntryId" UUID`);
      await tx.$executeRawUnsafe(`ALTER TABLE "FinancialTransfer" ADD COLUMN IF NOT EXISTS "sourceType" TEXT`);
      await tx.$executeRawUnsafe(`ALTER TABLE "FinancialTransfer" ADD COLUMN IF NOT EXISTS "sourceId" TEXT`);
      await tx.$executeRawUnsafe(`ALTER TABLE "FinancialTransfer" ADD COLUMN IF NOT EXISTS "sourceReference" TEXT`);
      await tx.$executeRawUnsafe(`ALTER TABLE "FinancialTransfer" ADD COLUMN IF NOT EXISTS "settlementType" TEXT`);
      await tx.$executeRawUnsafe(`ALTER TABLE "FinancialTransfer" ADD COLUMN IF NOT EXISTS "settlementWalletId" UUID`);
      await tx.$executeRawUnsafe(`ALTER TABLE "FinancialTransfer" ADD COLUMN IF NOT EXISTS "settlementAmount" DECIMAL(14,2)`);
      await tx.$executeRawUnsafe(`ALTER TABLE "FinancialTransfer" ADD COLUMN IF NOT EXISTS "settlementTransferId" UUID`);
      await tx.$executeRawUnsafe(`ALTER TABLE "FinancialTransfer" ADD COLUMN IF NOT EXISTS "settlementCashMovementId" UUID`);
      await tx.$executeRawUnsafe(`UPDATE "FinancialTransfer" SET "walletAmount" = "amount" WHERE "walletAmount" IS NULL`);
      await tx.$executeRawUnsafe(`ALTER TABLE "FinancialTransfer" ALTER COLUMN "walletAmount" SET NOT NULL`);
      await tx.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "FinancialTransfer_settlementTransferId_idx" ON "FinancialTransfer"("settlementTransferId")`);
      await tx.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "FinancialTransfer_settlementWalletId_idx" ON "FinancialTransfer"("settlementWalletId")`);

      // Cash drawer infrastructure is shared with cashDrawerService. Keeping the same shape makes customer-transfer settlement atomic even on a fresh database.
      await tx.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "CashDrawer" (
        "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "shopId" UUID NOT NULL UNIQUE REFERENCES "Shop"("id") ON DELETE CASCADE,
        "currentBalance" DECIMAL(14,2) NOT NULL DEFAULT 0,
        "openingBalance" DECIMAL(14,2) NOT NULL DEFAULT 0,
        "openingBalanceSetAt" TIMESTAMP(3),
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      )`);
      await tx.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "CashDrawerMovement" (
        "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "shopId" UUID NOT NULL REFERENCES "Shop"("id") ON DELETE CASCADE,
        "drawerId" UUID NOT NULL REFERENCES "CashDrawer"("id") ON DELETE CASCADE,
        "createdByUserId" UUID,
        "type" TEXT NOT NULL,
        "direction" TEXT NOT NULL,
        "amount" DECIMAL(14,2) NOT NULL,
        "description" TEXT,
        "reference" TEXT,
        "walletId" UUID,
        "financialTransferId" UUID,
        "status" TEXT NOT NULL DEFAULT 'ACTIVE',
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "voidedAt" TIMESTAMP(3)
      )`);
      await tx.$executeRawUnsafe(`ALTER TABLE "CashDrawerMovement" ADD COLUMN IF NOT EXISTS "sourceType" TEXT`);
      await tx.$executeRawUnsafe(`ALTER TABLE "CashDrawerMovement" ADD COLUMN IF NOT EXISTS "sourceId" TEXT`);
      await tx.$executeRawUnsafe(`ALTER TABLE "CashDrawerMovement" ADD COLUMN IF NOT EXISTS "sourceReference" TEXT`);
      await tx.$executeRawUnsafe(`ALTER TABLE "CashDrawerMovement" ADD COLUMN IF NOT EXISTS "customerId" UUID REFERENCES "Customer"("id") ON DELETE SET NULL`);
      await tx.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "CashDrawerMovement_shopId_createdAt_idx" ON "CashDrawerMovement"("shopId", "createdAt")`);

      // Backfill movements created by the first cash-drawer rollout so existing preview data becomes traceable too.
      await tx.$executeRawUnsafe(`UPDATE "FinancialTransfer" t SET "sourceType"='SALE', "sourceId"=s."id"::text, "sourceReference"=s."receiptNumber", "customerId"=COALESCE(t."customerId", s."customerId") FROM "Sale" s WHERE t."sourceType" IS NULL AND t."shopId"=s."shopId" AND t."notes" LIKE ('%تحصيل بيع ' || s."receiptNumber" || '%')`);
      await tx.$executeRawUnsafe(`UPDATE "FinancialTransfer" t SET "sourceType"='SALE_CHANGE', "sourceId"=s."id"::text, "sourceReference"=s."receiptNumber", "customerId"=COALESCE(t."customerId", s."customerId") FROM "Sale" s WHERE t."sourceType" IS NULL AND t."shopId"=s."shopId" AND t."notes" LIKE ('%إرجاع باقي للعميل مم بيع ' || s."receiptNumber" || '%')`);
      await tx.$executeRawUnsafe(`UPDATE "FinancialTransfer" t SET "sourceType"='INVOICE', "sourceId"=i."id"::text, "sourceReference"=i."invoiceNumber", "customerId"=COALESCE(t."customerId", i."customerId") FROM "Invoice" i WHERE t."sourceType" IS NULL AND t."shopId"=i."shopId" AND t."notes" LIKE ('%تحصيل فاتورة ' || i."invoiceNumber" || '%')`);
      await tx.$executeRawUnsafe(`UPDATE "FinancialTransfer" t SET "sourceType"='INSTALLMENT_DOWN_PAYMENT', "sourceId"=p."id"::text, "sourceReference"=p."planNumber", "customerId"=COALESCE(t."customerId", p."customerId") FROM "InstallmentPlan" p WHERE t."sourceType" IS NULL AND t."shopId"=p."shopId" AND t."notes" LIKE ('%دفعة أولى لخطة ' || p."planNumber" || '%')`);
      await tx.$executeRawUnsafe(`UPDATE "FinancialTransfer" t SET "sourceType"='INSTALLMENT', "sourceId"=p."id"::text, "sourceReference"=p."planNumber", "customerId"=COALESCE(t."customerId", p."customerId") FROM "InstallmentPlan" p WHERE t."sourceType" IS NULL AND t."shopId"=p."shopId" AND t."notes" LIKE ('%دفعة أقساط ' || p."planNumber" || '%')`);
      await tx.$executeRawUnsafe(`UPDATE "FinancialTransfer" t SET "sourceType"='DEBT', "sourceId"=e."id"::text, "sourceReference"=COALESCE(e."reference", 'دفتر الدين'), "customerId"=COALESCE(t."customerId", e."customerId") FROM "DebtLedgerEntry" e WHERE t."sourceType" IS NULL AND t."shopId"=e."shopId" AND t."notes" LIKE ('%[DEBT-PAYMENT:' || e."id"::text || ']%')`);
      await tx.$executeRawUnsafe(`UPDATE "FinancialTransfer" SET "sourceType"='CASH_DRAWER_TRANSFER', "sourceReference"=COALESCE("sourceReference", "notes") WHERE "sourceType" IS NULL AND ("notes" LIKE '%تحويل من الدرج النقدي%' OR "notes" LIKE '%تحويل إلى الدرج النقدي%')`);
      await tx.$executeRawUnsafe(`UPDATE "FinancialTransfer" SET "sourceType"='CUSTOMER_TRANSFER' WHERE "sourceType" IS NULL AND "operationType" IN ('CUSTOMER_DEPOSIT','CUSTOMER_WITHDRAWAL')`);
      await tx.$executeRawUnsafe(`UPDATE "FinancialTransfer" SET "sourceType"='MANUAL' WHERE "sourceType" IS NULL`);

      await tx.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "FinancialTransfer_shopId_createdAt_idx" ON "FinancialTransfer"("shopId", "createdAt")`);
      await tx.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "FinancialTransfer_walletId_createdAt_idx" ON "FinancialTransfer"("walletId", "createdAt")`);
      await tx.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "FinancialTransfer_shopId_status_idx" ON "FinancialTransfer"("shopId", "status")`);
      await tx.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "FinancialTransfer_shopId_sourceType_idx" ON "FinancialTransfer"("shopId", "sourceType")`);
    }, { timeout: 10_000 });
  } catch {
    throw new Error("تعذر تجهيز قسم التحويلات والمحافظ. يرجى المحاولة مجدداً.");
  }
}

async function ensureTables() {
  if (!tablesReady) tablesReady = createTables().catch((error) => { tablesReady = null; throw error; });
  await tablesReady;
}

export async function listWallets(shopId: string) {
  await ensureTables();
  return prisma.$queryRaw<WalletRow[]>`
    SELECT w."id", w."name", w."currentBalance", w."monthlyLimit", w."defaultDepositCommission", w."defaultWithdrawalCommission", w."isActive", w."createdAt",
      COALESCE((SELECT SUM(t."amount") FROM "FinancialTransfer" t WHERE t."walletId" = w."id" AND t."status" = 'ACTIVE' AND t."deletedAt" IS NULL
        AND t."operationType" IN ('CUSTOMER_DEPOSIT', 'CUSTOMER_WITHDRAWAL') AND t."createdAt" >= date_trunc('month', NOW())
        AND t."createdAt" < date_trunc('month', NOW()) + interval '1 month'), 0) AS "monthlyUsed"
    FROM "FinancialWallet" w
    WHERE w."shopId" = ${shopId}::uuid AND w."deletedAt" IS NULL AND w."isActive" = TRUE ORDER BY w."createdAt" ASC
  `;
}

export async function getStats(shopId: string) {
  await ensureTables();
  const rows = await prisma.$queryRaw<Array<{ totalBalance: Prisma.Decimal; todayCommission: Prisma.Decimal; todayDeposits: Prisma.Decimal; todayWithdrawals: Prisma.Decimal; todayOperations: bigint }>>`
    SELECT
      COALESCE((SELECT SUM(w."currentBalance") FROM "FinancialWallet" w WHERE w."shopId" = ${shopId}::uuid AND w."deletedAt" IS NULL AND w."isActive" = TRUE), 0) AS "totalBalance",
      COALESCE(SUM(t."commission") FILTER (WHERE t."status" = 'ACTIVE'), 0) AS "todayCommission",
      COALESCE(SUM(t."amount") FILTER (WHERE t."status" = 'ACTIVE' AND t."operationType" = 'CUSTOMER_DEPOSIT'), 0) AS "todayDeposits",
      COALESCE(SUM(t."amount") FILTER (WHERE t."status" = 'ACTIVE' AND t."operationType" = 'CUSTOMER_WITHDRAWAL'), 0) AS "todayWithdrawals",
      COUNT(*) FILTER (WHERE t."status" = 'ACTIVE' AND t."operationType" IN ('CUSTOMER_DEPOSIT', 'CUSTOMER_WITHDRAWAL')) AS "todayOperations"
    FROM "FinancialTransfer" t
    WHERE t."shopId" = ${shopId}::uuid AND t."deletedAt" IS NULL AND t."createdAt" >= date_trunc('day', NOW()) AND t."createdAt" < date_trunc('day', NOW()) + interval '1 day'
  `;
  const row = rows[0];
  return { totalBalance: Number(row?.totalBalance ?? 0), todayCommission: Number(row?.todayCommission ?? 0), todayDeposits: Number(row?.todayDeposits ?? 0), todayWithdrawals: Number(row?.todayWithdrawals ?? 0), todayOperations: Number(row?.todayOperations ?? 0) };
}

export async function listTransfers(shopId: string, filters: TransferFilters = {}) {
  await ensureTables();
  const conditions: Prisma.Sql[] = [Prisma.sql`t."shopId" = ${shopId}::uuid`, Prisma.sql`t."deletedAt" IS NULL`];
  if (filters.walletId) conditions.push(Prisma.sql`t."walletId" = ${filters.walletId}::uuid`);
  if (filters.operationType && TRANSFER_TYPES.has(filters.operationType)) conditions.push(Prisma.sql`t."operationType" = ${filters.operationType}`);
  if (filters.from) conditions.push(Prisma.sql`t."createdAt" >= ${filters.from}`);
  if (filters.to) conditions.push(Prisma.sql`t."createdAt" < ${filters.to}`);
  if (filters.q?.trim()) {
    const pattern = `%${filters.q.trim()}%`;
    conditions.push(Prisma.sql`(COALESCE(t."customerName", '') ILIKE ${pattern} OR COALESCE(t."customerPhone", '') ILIKE ${pattern} OR COALESCE(t."sourceReference", '') ILIKE ${pattern} OR COALESCE(t."notes", '') ILIKE ${pattern} OR t."id"::text ILIKE ${pattern} OR w."name" ILIKE ${pattern} OR COALESCE(sw."name", '') ILIKE ${pattern})`);
  }
  const rows = await prisma.$queryRaw<RawTransferRow[]>(Prisma.sql`
    SELECT t."id", t."walletId", w."name" AS "walletName", t."customerId", COALESCE(c."name", t."customerName") AS "customerName",
      COALESCE(c."phone", t."customerPhone") AS "customerPhone", t."operationType", t."amount", t."walletAmount", t."commission", t."commissionMode",
      t."isDeferred", t."debtEntryId", t."settlementType", t."settlementWalletId", sw."name" AS "settlementWalletName", t."settlementAmount",
      t."settlementTransferId", t."settlementCashMovementId", t."status", t."notes", t."sourceType", t."sourceId", t."sourceReference", t."createdAt", t."voidedAt"
    FROM "FinancialTransfer" t JOIN "FinancialWallet" w ON w."id" = t."walletId"
    LEFT JOIN "FinancialWallet" sw ON sw."id" = t."settlementWalletId"
    LEFT JOIN "Customer" c ON c."id" = t."customerId" AND c."deletedAt" IS NULL
    WHERE ${Prisma.join(conditions, " AND ")} ORDER BY t."createdAt" DESC LIMIT 200
  `);
  return rows.map(hydrateSource);
}

export async function getTransferById(shopId: string, id: string) {
  await ensureTables();
  const rows = await prisma.$queryRaw<Array<RawTransferRow & { createdByName: string | null; voidedByName: string | null }>>`
    SELECT t."id", t."walletId", w."name" AS "walletName", t."customerId", COALESCE(c."name", t."customerName") AS "customerName",
      COALESCE(c."phone", t."customerPhone") AS "customerPhone", t."operationType", t."amount", t."walletAmount", t."commission", t."commissionMode",
      t."isDeferred", t."debtEntryId", t."settlementType", t."settlementWalletId", sw."name" AS "settlementWalletName", t."settlementAmount",
      t."settlementTransferId", t."settlementCashMovementId", t."status", t."notes", t."sourceType", t."sourceId", t."sourceReference", t."createdAt", t."voidedAt",
      creator."name" AS "createdByName", voider."name" AS "voidedByName"
    FROM "FinancialTransfer" t
    JOIN "FinancialWallet" w ON w."id" = t."walletId"
    LEFT JOIN "FinancialWallet" sw ON sw."id" = t."settlementWalletId"
    LEFT JOIN "Customer" c ON c."id" = t."customerId" AND c."deletedAt" IS NULL
    LEFT JOIN "User" creator ON creator."id" = t."createdByUserId"
    LEFT JOIN "User" voider ON voider."id" = t."voidedByUserId"
    WHERE t."id" = ${id}::uuid AND t."shopId" = ${shopId}::uuid AND t."deletedAt" IS NULL
    LIMIT 1
  `;
  return rows[0] ? hydrateSource(rows[0]) as TransferDetailsRow : null;
}

export async function createWallet(shopId: string, input: CreateWalletInput) {
  await ensureTables();
  const name = input.name.trim();
  if (!name) throw new Error("اسم المحفظة مطلوب.");
  const openingBalance = decimal(input.openingBalance);
  const monthlyLimit = input.monthlyLimit?.trim() ? decimal(input.monthlyLimit) : null;
  const depositCommission = decimal(input.defaultDepositCommission);
  const withdrawalCommission = decimal(input.defaultWithdrawalCommission);
  if (openingBalance.lt(0)) throw new Error("الرصيد الافتتاحي لا يمكن أن يكون سالباً.");
  if (monthlyLimit?.lte(0)) throw new Error("الحد الشهري يجب أن يكون أكبر من صفر.");
  if (depositCommission.lt(0) || withdrawalCommission.lt(0)) throw new Error("نسبة العمولة لا يمكن أن تكون سالبة.");
  const existing = await prisma.$queryRaw<Array<{ id: string }>>`SELECT "id" FROM "FinancialWallet" WHERE "shopId" = ${shopId}::uuid AND "deletedAt" IS NULL AND LOWER("name") = LOWER(${name}) LIMIT 1`;
  if (existing[0]) throw new Error("يوجد بالفعل محفظة بهذا الاسم.");
  const rows = await prisma.$queryRaw<Array<{ id: string }>>`
    INSERT INTO "FinancialWallet" ("shopId", "name", "currentBalance", "monthlyLimit", "defaultDepositCommission", "defaultWithdrawalCommission")
    VALUES (${shopId}::uuid, ${name}, ${openingBalance}, ${monthlyLimit}, ${depositCommission}, ${withdrawalCommission}) RETURNING "id"
  `;
  return rows[0];
}

function walletMovementAmount(type: FinancialTransferType, amount: Prisma.Decimal, commission: Prisma.Decimal, mode: CommissionMode) {
  if (type === "CUSTOMER_DEPOSIT" && mode === "DEDUCTED") return amount.minus(commission);
  if (type === "CUSTOMER_WITHDRAWAL" && mode === "ADDED") return amount.plus(commission);
  return amount;
}
function balanceDelta(type: FinancialTransferType, walletAmount: Prisma.Decimal) { return type === "CUSTOMER_DEPOSIT" || type === "WALLET_WITHDRAWAL" ? walletAmount.negated() : walletAmount; }
function customerCharge(amount: Prisma.Decimal, commission: Prisma.Decimal, mode: CommissionMode) { return mode === "ADDED" ? amount.plus(commission) : amount; }
function customerSettlementAmount(type: FinancialTransferType, amount: Prisma.Decimal, commission: Prisma.Decimal, mode: CommissionMode) {
  if (type === "CUSTOMER_DEPOSIT") return customerCharge(amount, commission, mode);
  if (type === "CUSTOMER_WITHDRAWAL" && mode === "DEDUCTED") return amount.minus(commission);
  return amount;
}
function addWalletDelta(deltas: Map<string, Prisma.Decimal>, walletId: string, delta: Prisma.Decimal) {
  deltas.set(walletId, (deltas.get(walletId) ?? new Prisma.Decimal(0)).plus(delta));
}

async function lockWallets(tx: Prisma.TransactionClient, shopId: string, walletIds: string[]) {
  const uniqueIds = [...new Set(walletIds)].sort();
  if (!uniqueIds.length) return [] as LockedWallet[];
  const idsSql = Prisma.join(uniqueIds.map((id) => Prisma.sql`${id}::uuid`));
  return tx.$queryRaw<LockedWallet[]>(Prisma.sql`
    SELECT "id", "name", "currentBalance", "defaultDepositCommission", "defaultWithdrawalCommission"
    FROM "FinancialWallet"
    WHERE "shopId" = ${shopId}::uuid AND "deletedAt" IS NULL AND "isActive" = TRUE AND "id" IN (${idsSql})
    ORDER BY "id" FOR UPDATE
  `);
}

async function lockCashDrawer(tx: Prisma.TransactionClient, shopId: string) {
  const rows = await tx.$queryRaw<Array<{ id: string; currentBalance: Prisma.Decimal }>>`
    INSERT INTO "CashDrawer" ("shopId") VALUES (${shopId}::uuid)
    ON CONFLICT ("shopId") DO UPDATE SET "updatedAt" = "CashDrawer"."updatedAt"
    RETURNING "id", "currentBalance"
  `;
  if (!rows[0]) throw new Error("تعذر تجهيز الدرج النقدي.");
  return rows[0];
}

async function applyWalletDeltas(
  tx: Prisma.TransactionClient,
  shopId: string,
  wallets: LockedWallet[],
  deltas: Map<string, Prisma.Decimal>,
  insufficientMessage = "رصيد المحفظة غير كافٍ لتنفيذ العملية.",
) {
  for (const wallet of wallets) {
    const delta = deltas.get(wallet.id) ?? new Prisma.Decimal(0);
    const nextBalance = decimal(wallet.currentBalance).plus(delta);
    if (nextBalance.lt(0)) throw new Error(insufficientMessage);
    if (!delta.isZero()) {
      await tx.$executeRaw`UPDATE "FinancialWallet" SET "currentBalance" = ${nextBalance}, "updatedAt" = NOW() WHERE "id" = ${wallet.id}::uuid AND "shopId" = ${shopId}::uuid`;
    }
  }
}

async function createLinkedDebt(tx: Prisma.TransactionClient, shopId: string, customerId: string, userId: string | null, amount: Prisma.Decimal, transferId: string) {
  const accounts = await tx.$queryRaw<Array<{ id: string }>>`
    INSERT INTO "DebtLedgerAccount" ("shopId", "customerId", "updatedAt") VALUES (${shopId}::uuid, ${customerId}::uuid, NOW())
    ON CONFLICT ("shopId", "customerId") DO UPDATE SET "updatedAt" = NOW() RETURNING "id"
  `;
  const accountId = accounts[0]?.id;
  if (!accountId) throw new Error("تعذر فتح حساب الدين للعميل.");
  const entries = await tx.$queryRaw<Array<{ id: string }>>`
    INSERT INTO "DebtLedgerEntry" ("shopId", "accountId", "customerId", "type", "amount", "occurredAt", "description", "reference", "createdByUserId")
    VALUES (${shopId}::uuid, ${accountId}::uuid, ${customerId}::uuid, 'DEBT', ${amount}, NOW(), 'تحويل مالي آجل', ${`TRANSFER:${transferId}`}, ${userId}::uuid) RETURNING "id"
  `;
  if (!entries[0]) throw new Error("تعذر تسجيل الدين المرتبط بالتحويل.");
  return entries[0].id;
}

export async function createTransfer(shopId: string, userId: string | null, input: CreateTransferInput) {
  await ensureTables();
  if (!TRANSFER_TYPES.has(input.operationType)) throw new Error("نوع العملية غير صحيح.");
  const amount = decimal(input.amount);
  if (amount.lte(0)) throw new Error("المبلغ يجب أن يكون أكبر من صفر.");
  const isCustomerOperation = input.operationType === "CUSTOMER_DEPOSIT" || input.operationType === "CUSTOMER_WITHDRAWAL";
  const commissionMode: CommissionMode = isCustomerOperation && input.commissionMode && COMMISSION_MODES.has(input.commissionMode) ? input.commissionMode : isCustomerOperation ? "ADDED" : "NONE";
  if (input.isDeferred && input.operationType !== "CUSTOMER_DEPOSIT") throw new Error("الآجل متاح لعمليات الإيداع للعميل فقط.");

  const requestedSettlementType = input.settlementType && SETTLEMENT_TYPES.has(input.settlementType) ? input.settlementType : "CASH_DRAWER";
  const settlementType: SettlementType | null = !isCustomerOperation ? null : input.isDeferred ? "DEBT" : requestedSettlementType;
  const settlementWalletId = settlementType === "WALLET" ? input.settlementWalletId?.trim() || null : null;
  if (settlementType === "WALLET" && settlementWalletId === input.walletId) throw new Error("محفظة التسوية يجب أن تختلف عم المحفظة الرئيسية.");
  if (settlementType === "WALLET" && !settlementWalletId) throw new Error("اختر المحفظة التي تم استلام أو تسليم المقابل مم خلالها.");

  return prisma.$transaction(async (tx) => {
    // Cash-drawer operations elsewhere lock the drawer before the wallet. Keep the same ordering to avoid deadlocks.
    const drawer = settlementType === "CASH_DRAWER" ? await lockCashDrawer(tx, shopId) : null;
    const walletIds = [input.walletId, ...(settlementWalletId ? [settlementWalletId] : [])];
    const wallets = await lockWallets(tx, shopId, walletIds);
    const wallet = wallets.find((item) => item.id === input.walletId);
    if (!wallet) throw new Error("المحفظة غير موجودة.");
    const settlementWallet = settlementWalletId ? wallets.find((item) => item.id === settlementWalletId) : null;
    if (settlementWalletId && !settlementWallet) throw new Error("محفظة التسوية غير موجودة أو غير نشطة.");

    let customerId = input.customerId?.trim() || null;
    let customerName = nullableText(input.customerName);
    let customerPhone = normalizePhone(input.customerPhone);
    if (customerId) {
      const customer = await tx.customer.findFirst({ where: { id: customerId, shopId, deletedAt: null }, select: { id: true, name: true, phone: true } });
      if (!customer) throw new Error("العميل المحدد غير موجود.");
      customerId = customer.id; customerName = customerName || customer.name; customerPhone = customerPhone || normalizePhone(customer.phone);
    }
    if (input.isDeferred && !customerId) throw new Error("العملية الآجلة تتطلب اختيار عميل مسجل.");

    let commission = new Prisma.Decimal(0);
    if (isCustomerOperation && commissionMode !== "NONE") {
      if (input.commission?.trim()) commission = decimal(input.commission);
      else {
        const rate = input.operationType === "CUSTOMER_DEPOSIT" ? wallet.defaultDepositCommission : wallet.defaultWithdrawalCommission;
        commission = amount.mul(rate).div(100);
      }
    }
    if (commission.lt(0)) throw new Error("العمولة لا يمكن أن تكون سالبة.");
    const walletAmount = walletMovementAmount(input.operationType, amount, commission, commissionMode);
    if (walletAmount.lte(0)) throw new Error("العمولة المخصومة لا يمكن أن تساوي أو تتجاوز مبلغ العملية.");
    const settlementAmount = isCustomerOperation ? customerSettlementAmount(input.operationType, amount, commission, commissionMode) : null;
    if (settlementAmount && settlementAmount.lte(0)) throw new Error("صافي التسوية يجب أن يكون أكبر من صفر.");

    const walletDeltas = new Map<string, Prisma.Decimal>();
    addWalletDelta(walletDeltas, wallet.id, balanceDelta(input.operationType, walletAmount));
    if (settlementType === "WALLET" && settlementWallet && settlementAmount) {
      const settlementOperation: FinancialTransferType = input.operationType === "CUSTOMER_DEPOSIT" ? "WALLET_TOPUP" : "WALLET_WITHDRAWAL";
      addWalletDelta(walletDeltas, settlementWallet.id, balanceDelta(settlementOperation, settlementAmount));
    }
    await applyWalletDeltas(tx, shopId, wallets, walletDeltas);

    if (drawer && settlementAmount) {
      const drawerDelta = input.operationType === "CUSTOMER_DEPOSIT" ? settlementAmount : settlementAmount.negated();
      const nextDrawerBalance = decimal(drawer.currentBalance).plus(drawerDelta);
      if (nextDrawerBalance.lt(0)) throw new Error("رصيد الدرج النقدي غير كافٍ لتسليم المبلغ للعميل.");
      await tx.$executeRaw`UPDATE "CashDrawer" SET "currentBalance" = ${nextDrawerBalance}, "updatedAt" = NOW() WHERE "id" = ${drawer.id}::uuid AND "shopId" = ${shopId}::uuid`;
    }

    const sourceType: FinancialTransferSourceType = isCustomerOperation ? "CUSTOMER_TRANSFER" : "MANUAL";
    const rows = await tx.$queryRaw<Array<{ id: string }>>`
      INSERT INTO "FinancialTransfer" (
        "shopId", "walletId", "customerId", "createdByUserId", "operationType", "amount", "walletAmount", "commission", "commissionMode",
        "isDeferred", "customerName", "customerPhone", "notes", "sourceType", "settlementType", "settlementWalletId", "settlementAmount"
      ) VALUES (
        ${shopId}::uuid, ${wallet.id}::uuid, ${customerId}::uuid, ${userId}::uuid, ${input.operationType}, ${amount}, ${walletAmount}, ${commission}, ${commissionMode},
        ${Boolean(input.isDeferred)}, ${customerName}, ${customerPhone}, ${nullableText(input.notes)}, ${sourceType}, ${settlementType}, ${settlementWalletId}::uuid, ${settlementAmount}
      ) RETURNING "id"
    `;
    const transfer = rows[0];
    if (!transfer) throw new Error("تعذر تسجيل العملية.");

    if (input.isDeferred && customerId && settlementAmount) {
      const debtEntryId = await createLinkedDebt(tx, shopId, customerId, userId, settlementAmount, transfer.id);
      await tx.$executeRaw`UPDATE "FinancialTransfer" SET "debtEntryId" = ${debtEntryId}::uuid, "updatedAt" = NOW() WHERE "id" = ${transfer.id}::uuid AND "shopId" = ${shopId}::uuid`;
    }

    if (settlementType === "CASH_DRAWER" && drawer && settlementAmount) {
      const isDeposit = input.operationType === "CUSTOMER_DEPOSIT";
      const movementRows = await tx.$queryRaw<Array<{ id: string }>>`
        INSERT INTO "CashDrawerMovement" (
          "shopId", "drawerId", "createdByUserId", "type", "direction", "amount", "description", "reference",
          "walletId", "financialTransferId", "sourceType", "sourceId", "sourceReference", "customerId"
        ) VALUES (
          ${shopId}::uuid, ${drawer.id}::uuid, ${userId}::uuid, ${isDeposit ? "WALLET_TRANSFER_IN" : "WALLET_TRANSFER_OUT"}, ${isDeposit ? "IN" : "OUT"}, ${settlementAmount},
          ${isDeposit ? `تحصيل مقابل إيداع للعميل من ${wallet.name}` : `تسليم مقابل سحب للعميل عبر ${wallet.name}`}, ${transfer.id},
          ${wallet.id}::uuid, ${transfer.id}::uuid, 'CASH_DRAWER_TRANSFER', ${transfer.id}, ${isDeposit ? "تسوية إيداع للعميل" : "تسوية سحب للعميل"}, ${customerId}::uuid
        ) RETURNING "id"
      `;
      const movementId = movementRows[0]?.id;
      if (!movementId) throw new Error("تعذر ربط حركة الدرج بالعملية.");
      await tx.$executeRaw`UPDATE "FinancialTransfer" SET "settlementCashMovementId" = ${movementId}::uuid, "updatedAt" = NOW() WHERE "id" = ${transfer.id}::uuid AND "shopId" = ${shopId}::uuid`;
    }

    if (settlementType === "WALLET" && settlementWallet && settlementAmount) {
      const isDeposit = input.operationType === "CUSTOMER_DEPOSIT";
      const settlementOperation: FinancialTransferType = isDeposit ? "WALLET_TOPUP" : "WALLET_WITHDRAWAL";
      const settlementRows = await tx.$queryRaw<Array<{ id: string }>>`
        INSERT INTO "FinancialTransfer" (
          "shopId", "walletId", "customerId", "createdByUserId", "operationType", "amount", "walletAmount", "commission", "commissionMode", "isDeferred",
          "customerName", "customerPhone", "notes", "sourceType", "sourceId", "sourceReference"
        ) VALUES (
          ${shopId}::uuid, ${settlementWallet.id}::uuid, ${customerId}::uuid, ${userId}::uuid, ${settlementOperation}, ${settlementAmount}, ${settlementAmount}, 0, 'NONE', FALSE,
          ${customerName}, ${customerPhone}, ${isDeposit ? `تحصيل مقابل إيداع للعميل من خلال ${settlementWallet.name}` : `تسليم مقابل سحب للعميل من خلال ${settlementWallet.name}`},
          'CUSTOMER_TRANSFER_SETTLEMENT', ${transfer.id}, ${isDeposit ? "تسوية إيداع للعميل" : "تسوية سحب للعميل"}
        ) RETURNING "id"
      `;
      const settlementTransferId = settlementRows[0]?.id;
      if (!settlementTransferId) throw new Error("تعذر ربط حركة المحفظة المقابلة بالعملية.");
      await tx.$executeRaw`UPDATE "FinancialTransfer" SET "settlementTransferId" = ${settlementTransferId}::uuid, "updatedAt" = NOW() WHERE "id" = ${transfer.id}::uuid AND "shopId" = ${shopId}::uuid`;
    }

    return transfer;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 10_000 });
}

export async function voidTransfer(shopId: string, id: string, userId: string | null) {
  await ensureTables();
  return prisma.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<Array<{
      id: string;
      walletId: string;
      customerId: string | null;
      operationType: FinancialTransferType;
      walletAmount: Prisma.Decimal;
      status: "ACTIVE" | "VOID";
      debtEntryId: string | null;
      sourceType: FinancialTransferSourceType | null;
      notes: string | null;
      settlementType: SettlementType | null;
      settlementTransferId: string | null;
      settlementCashMovementId: string | null;
    }>>`
      SELECT "id", "walletId", "customerId", "operationType", "walletAmount", "status", "debtEntryId", "sourceType", "notes",
        "settlementType", "settlementTransferId", "settlementCashMovementId"
      FROM "FinancialTransfer"
      WHERE "id" = ${id}::uuid AND "shopId" = ${shopId}::uuid AND "deletedAt" IS NULL FOR UPDATE
    `;
    const transfer = rows[0];
    if (!transfer) throw new Error("العملية غير موجودة.");
    if (transfer.status === "VOID") throw new Error("العملية ملغاة بالفعل.");
    const sourceType = transfer.sourceType || inferTransferSourceType(transfer.operationType, transfer.notes);
    if (sourceType !== "CUSTOMER_TRANSFER" && sourceType !== "MANUAL") {
      throw new Error("هذه الحركة مرتبطة بعملية أصلية. افتح تفاصيل الحركة ثم اعكسها من المبيعة أو الفاتورة أو القسط أو العملية الأصلية المرتبطة.");
    }

    if (transfer.debtEntryId && transfer.customerId) {
      const debtRows = await tx.$queryRaw<Array<{ id: string; amount: Prisma.Decimal; isReversed: boolean }>>`
        SELECT "id", "amount", "isReversed" FROM "DebtLedgerEntry" WHERE "id" = ${transfer.debtEntryId}::uuid AND "shopId" = ${shopId}::uuid AND "customerId" = ${transfer.customerId}::uuid FOR UPDATE
      `;
      const debt = debtRows[0];
      if (debt && !debt.isReversed) {
        const balances = await tx.$queryRaw<Array<{ balance: Prisma.Decimal }>>`
          SELECT COALESCE(SUM(CASE WHEN "isReversed" THEN 0 WHEN "type" IN ('DEBT','OPENING_BALANCE','ADJUSTMENT_DEBIT') THEN "amount" WHEN "type" IN ('PAYMENT','ADJUSTMENT_CREDIT') THEN -"amount" ELSE 0 END), 0) AS "balance"
          FROM "DebtLedgerEntry" WHERE "shopId" = ${shopId}::uuid AND "customerId" = ${transfer.customerId}::uuid
        `;
        if (decimal(balances[0]?.balance ?? 0).plus(new Prisma.Decimal("0.005")).lt(debt.amount)) throw new Error("لا يمكن إلغاء العملية لأن الدين المرتبط بها تم تسديده جزئياً أو كلياً.");
        await tx.$executeRaw`UPDATE "DebtLedgerEntry" SET "isReversed" = TRUE, "updatedAt" = NOW() WHERE "id" = ${debt.id}::uuid AND "shopId" = ${shopId}::uuid`;
      }
    }

    let cashMovement: { id: string; drawerId: string; direction: "IN" | "OUT"; amount: Prisma.Decimal; status: "ACTIVE" | "VOID" } | null = null;
    let drawer: { id: string; currentBalance: Prisma.Decimal } | null = null;
    if (transfer.settlementType === "CASH_DRAWER") {
      if (!transfer.settlementCashMovementId) throw new Error("بيانات تسوية الدرج ناقصة؛ لا يمكن إلغاء العملية بأمان.");
      const movementRows = await tx.$queryRaw<Array<{ id: string; drawerId: string; direction: "IN" | "OUT"; amount: Prisma.Decimal; status: "ACTIVE" | "VOID" }>>`
        SELECT "id", "drawerId", "direction", "amount", "status" FROM "CashDrawerMovement"
        WHERE "id" = ${transfer.settlementCashMovementId}::uuid AND "shopId" = ${shopId}::uuid FOR UPDATE
      `;
      cashMovement = movementRows[0] ?? null;
      if (!cashMovement || cashMovement.status !== "ACTIVE") throw new Error("حركة الدرج المرتبطة غير متاحة للعكس.");
      const drawerRows = await tx.$queryRaw<Array<{ id: string; currentBalance: Prisma.Decimal }>>`
        SELECT "id", "currentBalance" FROM "CashDrawer" WHERE "id" = ${cashMovement.drawerId}::uuid AND "shopId" = ${shopId}::uuid FOR UPDATE
      `;
      drawer = drawerRows[0] ?? null;
      if (!drawer) throw new Error("الدرج النقدي المرتبط غير موجود.");
    }

    let settlementTransfer: LinkedSettlementTransfer | null = null;
    if (transfer.settlementType === "WALLET") {
      if (!transfer.settlementTransferId) throw new Error("بيانات تسوية المحفظة ناقصة؛ لا يمكن إلغاء العملية بأمان.");
      const settlementRows = await tx.$queryRaw<LinkedSettlementTransfer[]>`
        SELECT "id", "walletId", "operationType", "walletAmount", "status" FROM "FinancialTransfer"
        WHERE "id" = ${transfer.settlementTransferId}::uuid AND "shopId" = ${shopId}::uuid AND "deletedAt" IS NULL FOR UPDATE
      `;
      settlementTransfer = settlementRows[0] ?? null;
      if (!settlementTransfer || settlementTransfer.status !== "ACTIVE") throw new Error("حركة المحفظة المقابلة غير متاحة للعكس.");
    }

    const walletIds = [transfer.walletId, ...(settlementTransfer ? [settlementTransfer.walletId] : [])];
    const wallets = await lockWallets(tx, shopId, walletIds);
    if (!wallets.find((wallet) => wallet.id === transfer.walletId)) throw new Error("المحفظة المرتبطة غير موجودة.");
    if (settlementTransfer && !wallets.find((wallet) => wallet.id === settlementTransfer!.walletId)) throw new Error("محفظة التسوية المرتبطة غير موجودة.");

    const reverseDeltas = new Map<string, Prisma.Decimal>();
    addWalletDelta(reverseDeltas, transfer.walletId, balanceDelta(transfer.operationType, transfer.walletAmount).negated());
    if (settlementTransfer) {
      addWalletDelta(reverseDeltas, settlementTransfer.walletId, balanceDelta(settlementTransfer.operationType, settlementTransfer.walletAmount).negated());
    }
    await applyWalletDeltas(tx, shopId, wallets, reverseDeltas, "لا يمكن إلغاء العملية لأن رصيد إحدى المحافظ لم يعد يكفي للعكس التسوية.");

    if (cashMovement && drawer) {
      const reverseDrawerDelta = cashMovement.direction === "IN" ? cashMovement.amount.negated() : cashMovement.amount;
      const nextDrawerBalance = decimal(drawer.currentBalance).plus(reverseDrawerDelta);
      if (nextDrawerBalance.lt(0)) throw new Error("لا يمكن إلغياء العملية لأن رصيد الدرج الحالي لا يكفي لعكس التخصيل المرتبط.");
      await tx.$executeRaw`UPDATE "CashDrawer" SET "currentBalance" = ${nextDrawerBalance}, "updatedAt" = NOW() WHERE "id" = ${drawer.id}::uuid AND "shopId" = ${shopId}::uuid`;
      await tx.$executeRaw`UPDATE "CashDrawerMovement" SET "status" = 'VOID', "voidedAt" = NOW() WHERE "id" = ${cashMovement.id}::uuid AND "shopId" = ${shopId}::uuid`;
    }

    if (settlementTransfer) {
      await tx.$executeRaw`UPDATE "FinancialTransfer" SET "status" = 'VOID', "voidedAt" = NOW(), "voidedByUserId" = ${userId}::uuid, "updatedAt" = NOW() WHERE "id" = ${settlementTransfer.id}::uuid AND "shopId" = ${shopId}::uuid`;
    }

    await tx.$executeRaw`UPDATE "FinancialTransfer" SET "status" = 'VOID', "voidedAt" = NOW(), "voidedByUserId" = ${userId}::uuid, "updatedAt" = NOW() WHERE "id" = ${transfer.id}::uuid AND "shopId" = ${shopId}::uuid`;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 10_000 });
}

export const financialTransferService = { listWallets, getStats, listTransfers, getTransferById, createWallet, createTransfer, voidTransfer };
