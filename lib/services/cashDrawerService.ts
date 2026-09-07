import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { financialTransferService } from "@/lib/services/financialTransferService";
import { dayUtcBoundsForTimeZone } from "@/lib/timezone";
import { getShopTimeZone } from "@/lib/shop-timezone";

export type CashDrawerMovementType =
  | "OPENING_BALANCE"
  | "MANUAL_IN"
  | "MANUAL_OUT"
  | "WALLET_TRANSFER_IN"
  | "WALLET_TRANSFER_OUT"
  | "SALE_CASH"
  | "INVOICE_PAYMENT"
  | "INSTALLMENT_PAYMENT"
  | "INSTALLMENT_DOWN_PAYMENT"
  | "DEBT_PAYMENT"
  | "PURCHASE_PAYMENT"
  | "SUPPLIER_REFUND"
  | "EXPENSE_PAYMENT"
  | "CHANGE_RETURN"
  | "SUPPLIER_PAYMENT";

export type CashDrawerSourceType =
  | "SALE"
  | "SALE_CHANGE"
  | "INVOICE"
  | "INSTALLMENT"
  | "INSTALLMENT_DOWN_PAYMENT"
  | "DEBT"
  | "PURCHASE"
  | "SUPPLIER_RETURN"
  | "EXPENSE"
  | "CASH_DRAWER_TRANSFER"
  | "MANUAL"
  | "SUPPLIER";

export type CashDrawerMovementRow = {
  id: string;
  type: CashDrawerMovementType;
  direction: "IN" | "OUT";
  amount: Prisma.Decimal;
  description: string | null;
  reference: string | null;
  sourceType: CashDrawerSourceType;
  sourceId: string | null;
  sourceReference: string | null;
  customerId: string | null;
  customerName: string | null;
  customerPhone: string | null;
  walletId: string | null;
  walletName: string | null;
  financialTransferId: string | null;
  createdByUserId: string | null;
  createdByName: string | null;
  status: "ACTIVE" | "VOID";
  createdAt: Date;
  voidedAt: Date | null;
};

let tablesReady: Promise<void> | null = null;
function decimal(value: string | number | Prisma.Decimal | null | undefined) { return new Prisma.Decimal(String(value ?? 0).replace(",", ".")); }
function nullableText(value?: string | null) { const text = value?.trim(); return text ? text : null; }

async function createTables() {
  try {
    await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe("SELECT pg_advisory_xact_lock(68119725)");
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
      await tx.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "CashDrawerMovement_drawerId_createdAt_idx" ON "CashDrawerMovement"("drawerId", "createdAt")`);
      await tx.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "CashDrawerMovement_source_idx" ON "CashDrawerMovement"("shopId", "sourceType", "sourceId")`);
      await tx.$executeRawUnsafe(`UPDATE "CashDrawerMovement" SET
        "sourceType" = COALESCE("sourceType", CASE
          WHEN "type" = 'SALE_CASH' THEN 'SALE'
          WHEN "type" = 'CHANGE_RETURN' THEN 'SALE_CHANGE'
          WHEN "type" = 'INVOICE_PAYMENT' THEN 'INVOICE'
          WHEN "type" = 'INSTALLMENT_PAYMENT' THEN 'INSTALLMENT'
          WHEN "type" = 'INSTALLMENT_DOWN_PAYMENT' THEN 'INSTALLMENT_DOWN_PAYMENT'
          WHEN "type" = 'DEBT_PAYMENT' THEN 'DEBT'
          WHEN "type" IN ('WALLET_TRANSFER_IN','WALLET_TRANSFER_OUT') THEN 'CASH_DRAWER_TRANSFER'
          ELSE 'MANUAL'
        END),
        "sourceReference" = COALESCE("sourceReference", "reference")`);
      await tx.$executeRawUnsafe(`UPDATE "CashDrawerMovement" m SET
        "sourceId" = s."id"::text,
        "customerId" = COALESCE(m."customerId", s."customerId"),
        "sourceReference" = COALESCE(m."sourceReference", s."receiptNumber")
      FROM "Sale" s
      WHERE m."shopId" = s."shopId" AND m."sourceType" IN ('SALE','SALE_CHANGE')
        AND m."sourceId" IS NULL AND m."reference" IS NOT NULL AND m."reference" = s."receiptNumber"`);
      await tx.$executeRawUnsafe(`UPDATE "CashDrawerMovement" m SET
        "sourceId" = i."id"::text,
        "customerId" = COALESCE(m."customerId", i."customerId"),
        "sourceReference" = COALESCE(m."sourceReference", i."invoiceNumber")
      FROM "Invoice" i
      WHERE m."shopId" = i."shopId" AND m."sourceType" = 'INVOICE'
        AND m."sourceId" IS NULL AND m."reference" IS NOT NULL AND m."reference" = i."invoiceNumber"`);
      await tx.$executeRawUnsafe(`UPDATE "CashDrawerMovement" m SET
        "sourceId" = p."id"::text,
        "customerId" = COALESCE(m."customerId", p."customerId"),
        "sourceReference" = COALESCE(m."sourceReference", p."planNumber")
      FROM "InstallmentPlan" p
      WHERE m."shopId" = p."shopId" AND m."sourceType" IN ('INSTALLMENT','INSTALLMENT_DOWN_PAYMENT')
        AND m."sourceId" IS NULL AND m."sourceReference" IS NOT NULL AND m."sourceReference" = p."planNumber"`);
      await tx.$executeRawUnsafe(`UPDATE "CashDrawerMovement" SET "sourceId" = "financialTransferId"::text
        WHERE "sourceType" = 'CASH_DRAWER_TRANSFER' AND "sourceId" IS NULL AND "financialTransferId" IS NOT NULL`);
    }, { timeout: 10_000 });
  } catch { throw new Error("تعذر تجهيز الدرج النقدي. يرجى المحاولة مجدداً."); }
}

async function ensureTables() { if (!tablesReady) tablesReady = createTables().catch((error) => { tablesReady = null; throw error; }); await tablesReady; }
async function ensureDrawer(shopId: string) {
  await ensureTables();
  const rows = await prisma.$queryRaw<Array<{ id: string; currentBalance: Prisma.Decimal; openingBalance: Prisma.Decimal; openingBalanceSetAt: Date | null }>>`
    INSERT INTO "CashDrawer" ("shopId") VALUES (${shopId}::uuid)
    ON CONFLICT ("shopId") DO UPDATE SET "updatedAt" = "CashDrawer"."updatedAt"
    RETURNING "id", "currentBalance", "openingBalance", "openingBalanceSetAt"`;
  return rows[0];
}

async function listMovements(shopId: string, drawerId: string, limit: number, includeVoided: boolean) {
  const statusFilter = includeVoided ? Prisma.sql`` : Prisma.sql`AND m."status" = 'ACTIVE'`;
  return prisma.$queryRaw<CashDrawerMovementRow[]>(Prisma.sql`
    SELECT m."id", m."type", m."direction", m."amount", m."description", m."reference",
      COALESCE(m."sourceType", 'MANUAL') AS "sourceType", m."sourceId", m."sourceReference",
      m."customerId", c."name" AS "customerName", c."phone" AS "customerPhone",
      m."walletId", w."name" AS "walletName", m."financialTransferId",
      m."createdByUserId", u."name" AS "createdByName", m."status", m."createdAt", m."voidedAt"
    FROM "CashDrawerMovement" m
    LEFT JOIN "FinancialWallet" w ON w."id" = m."walletId"
    LEFT JOIN "Customer" c ON c."id" = m."customerId"
    LEFT JOIN "User" u ON u."id" = m."createdByUserId"
    WHERE m."shopId" = ${shopId}::uuid AND m."drawerId" = ${drawerId}::uuid ${statusFilter}
    ORDER BY m."createdAt" DESC LIMIT ${Math.max(1, Math.min(limit, 250))}`);
}

async function todayTotals(shopId: string, drawerId: string) {
  const timeZone = await getShopTimeZone(shopId);
  const bounds = dayUtcBoundsForTimeZone(new Date(), timeZone);
  const rows = await prisma.$queryRaw<Array<{ inflow: Prisma.Decimal; outflow: Prisma.Decimal }>>`
    SELECT COALESCE(SUM("amount") FILTER (WHERE "direction" = 'IN' AND "type" <> 'OPENING_BALANCE'), 0) AS "inflow",
      COALESCE(SUM("amount") FILTER (WHERE "direction" = 'OUT'), 0) AS "outflow"
    FROM "CashDrawerMovement"
    WHERE "shopId" = ${shopId}::uuid AND "drawerId" = ${drawerId}::uuid AND "status" = 'ACTIVE'
      AND "createdAt" >= ${bounds.start} AND "createdAt" < ${bounds.end}`;
  return rows[0];
}

export async function getSnapshot(shopId: string, limit = 30) {
  const drawer = await ensureDrawer(shopId); const movements = await listMovements(shopId, drawer.id, limit, false); const today = await todayTotals(shopId, drawer.id);
  return { id: drawer.id, currentBalance: Number(drawer.currentBalance), openingBalance: Number(drawer.openingBalance), openingBalanceSetAt: drawer.openingBalanceSetAt, todayIn: Number(today?.inflow ?? 0), todayOut: Number(today?.outflow ?? 0), movements };
}
export async function getAuditSnapshot(shopId: string, limit = 150) {
  const drawer = await ensureDrawer(shopId); const movements = await listMovements(shopId, drawer.id, limit, true); const today = await todayTotals(shopId, drawer.id);
  return { id: drawer.id, currentBalance: Number(drawer.currentBalance), openingBalance: Number(drawer.openingBalance), openingBalanceSetAt: drawer.openingBalanceSetAt, todayIn: Number(today?.inflow ?? 0), todayOut: Number(today?.outflow ?? 0), movements };
}
export async function getMovementById(shopId: string, movementId: string) {
  await ensureTables();
  const rows = await prisma.$queryRaw<CashDrawerMovementRow[]>`
    SELECT m."id", m."type", m."direction", m."amount", m."description", m."reference",
      COALESCE(m."sourceType", 'MANUAL') AS "sourceType", m."sourceId", m."sourceReference",
      m."customerId", c."name" AS "customerName", c."phone" AS "customerPhone",
      m."walletId", w."name" AS "walletName", m."financialTransferId",
      m."createdByUserId", u."name" AS "createdByName", m."status", m."createdAt", m."voidedAt"
    FROM "CashDrawerMovement" m
    LEFT JOIN "FinancialWallet" w ON w."id" = m."walletId"
    LEFT JOIN "Customer" c ON c."id" = m."customerId"
    LEFT JOIN "User" u ON u."id" = m."createdByUserId"
    WHERE m."shopId" = ${shopId}::uuid AND m."id" = ${movementId}::uuid LIMIT 1`;
  return rows[0] ?? null;
}

export async function setOpeningBalance(shopId: string, userId: string | null, value: string, notes?: string) {
  const amount = decimal(value); if (amount.lt(0)) throw new Error("الرصيد الافتتاحي لا يمكن أن يكون سالباً."); const drawer = await ensureDrawer(shopId);
  return prisma.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<Array<{ id: string; openingBalanceSetAt: Date | null }>>`SELECT "id", "openingBalanceSetAt" FROM "CashDrawer" WHERE "id" = ${drawer.id}::uuid AND "shopId" = ${shopId}::uuid FOR UPDATE`;
    if (!rows[0]) throw new Error("الدرج النقدي غير موجود."); if (rows[0].openingBalanceSetAt) throw new Error("تم تسجيل الرصيد الافتتاحي مسبقاً.");
    await tx.$executeRaw`UPDATE "CashDrawer" SET "openingBalance" = ${amount}, "currentBalance" = ${amount}, "openingBalanceSetAt" = NOW(), "updatedAt" = NOW() WHERE "id" = ${drawer.id}::uuid AND "shopId" = ${shopId}::uuid`;
    if (amount.gt(0)) await tx.$executeRaw`INSERT INTO "CashDrawerMovement" ("shopId", "drawerId", "createdByUserId", "type", "direction", "amount", "description", "sourceType", "sourceReference") VALUES (${shopId}::uuid, ${drawer.id}::uuid, ${userId}::uuid, 'OPENING_BALANCE', 'IN', ${amount}, ${nullableText(notes) || "الرصيد الافتتاحي للدرج"}, 'MANUAL', 'الرصيد الافتتاحي')`;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 10_000 });
}

export async function addManualMovement(shopId: string, userId: string | null, input: { direction: "IN" | "OUT"; amount: string; description: string; reference?: string }) {
  const amount = decimal(input.amount); if (amount.lte(0)) throw new Error("المبلغ يجب أن يكون أكبر من صفر."); const description = input.description.trim(); if (!description) throw new Error("سبب الحركة مطلوب."); const drawer = await ensureDrawer(shopId);
  return prisma.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<Array<{ id: string; currentBalance: Prisma.Decimal }>>`SELECT "id", "currentBalance" FROM "CashDrawer" WHERE "id" = ${drawer.id}::uuid AND "shopId" = ${shopId}::uuid FOR UPDATE`;
    const locked = rows[0]; if (!locked) throw new Error("الدرج النقدي غير موجود."); const next = input.direction === "IN" ? locked.currentBalance.add(amount) : locked.currentBalance.sub(amount); if (next.lt(0)) throw new Error("رصيد الدرج غير كافٍ.");
    await tx.$executeRaw`UPDATE "CashDrawer" SET "currentBalance" = ${next}, "updatedAt" = NOW() WHERE "id" = ${locked.id}::uuid`;
    await tx.$executeRaw`INSERT INTO "CashDrawerMovement" ("shopId", "drawerId", "createdByUserId", "type", "direction", "amount", "description", "reference", "sourceType", "sourceReference") VALUES (${shopId}::uuid, ${locked.id}::uuid, ${userId}::uuid, ${input.direction === "IN" ? "MANUAL_IN" : "MANUAL_OUT"}, ${input.direction}, ${amount}, ${description}, ${nullableText(input.reference)}, 'MANUAL', ${nullableText(input.reference)})`;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 10_000 });
}

export async function transferWithWallet(shopId: string, userId: string | null, input: { walletId: string; direction: "DRAWER_TO_WALLET" | "WALLET_TO_DRAWER"; amount: string; notes?: string }) {
  const amount = decimal(input.amount); if (amount.lte(0)) throw new Error("المبلغ يجب أن يكون أكبر من صفر."); await financialTransferService.listWallets(shopId); const drawer = await ensureDrawer(shopId);
  return prisma.$transaction(async (tx) => {
    const drawerRows = await tx.$queryRaw<Array<{ id: string; currentBalance: Prisma.Decimal }>>`SELECT "id", "currentBalance" FROM "CashDrawer" WHERE "id" = ${drawer.id}::uuid AND "shopId" = ${shopId}::uuid FOR UPDATE`;
    const walletRows = await tx.$queryRaw<Array<{ id: string; name: string; currentBalance: Prisma.Decimal }>>`SELECT "id", "name", "currentBalance" FROM "FinancialWallet" WHERE "id" = ${input.walletId}::uuid AND "shopId" = ${shopId}::uuid AND "deletedAt" IS NULL AND "isActive" = TRUE FOR UPDATE`;
    const lockedDrawer = drawerRows[0]; const wallet = walletRows[0]; if (!lockedDrawer || !wallet) throw new Error("الدرج أو المحفظة غير موجودة."); const drawerToWallet = input.direction === "DRAWER_TO_WALLET";
    const nextDrawer = drawerToWallet ? lockedDrawer.currentBalance.sub(amount) : lockedDrawer.currentBalance.add(amount); const nextWallet = drawerToWallet ? wallet.currentBalance.add(amount) : wallet.currentBalance.sub(amount); if (nextDrawer.lt(0)) throw new Error("رصيد الدرج غير كافٍ."); if (nextWallet.lt(0)) throw new Error("رصيد المحفظة غير كافٍ.");
    await tx.$executeRaw`UPDATE "CashDrawer" SET "currentBalance" = ${nextDrawer}, "updatedAt" = NOW() WHERE "id" = ${lockedDrawer.id}::uuid`; await tx.$executeRaw`UPDATE "FinancialWallet" SET "currentBalance" = ${nextWallet}, "updatedAt" = NOW() WHERE "id" = ${wallet.id}::uuid`;
    const transferRows = await tx.$queryRaw<Array<{ id: string }>>`INSERT INTO "FinancialTransfer" ("shopId", "walletId", "createdByUserId", "operationType", "amount", "walletAmount", "commission", "commissionMode", "isDeferred", "notes", "sourceType", "sourceReference") VALUES (${shopId}::uuid, ${wallet.id}::uuid, ${userId}::uuid, ${drawerToWallet ? "WALLET_TOPUP" : "WALLET_WITHDRAWAL"}, ${amount}, ${amount}, 0, 'NONE', FALSE, ${nullableText(input.notes) || (drawerToWallet ? "تحويل من الدرج النقدي" : "تحويل إلى الدرج النقدي")}, 'CASH_DRAWER_TRANSFER', 'الدرج النقدي') RETURNING "id"`;
    const financialTransferId = transferRows[0]?.id ?? null;
    await tx.$executeRaw`INSERT INTO "CashDrawerMovement" ("shopId", "drawerId", "createdByUserId", "type", "direction", "amount", "description", "walletId", "financialTransferId", "sourceType", "sourceId", "sourceReference") VALUES (${shopId}::uuid, ${lockedDrawer.id}::uuid, ${userId}::uuid, ${drawerToWallet ? "WALLET_TRANSFER_OUT" : "WALLET_TRANSFER_IN"}, ${drawerToWallet ? "OUT" : "IN"}, ${amount}, ${drawerToWallet ? `تحويل إلى ${wallet.name}` : `تحويل من ${wallet.name}`}, ${wallet.id}::uuid, ${financialTransferId}::uuid, 'CASH_DRAWER_TRANSFER', ${financialTransferId}, ${wallet.name})`;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 10_000 });
}

export async function getReportSnapshot(shopId: string, start: Date, end: Date) {
  const drawer = await ensureDrawer(shopId); const rows = await prisma.$queryRaw<Array<{ inflow: Prisma.Decimal; outflow: Prisma.Decimal; opening: Prisma.Decimal }>>`SELECT COALESCE(SUM("amount") FILTER (WHERE "direction" = 'IN' AND "type" <> 'OPENING_BALANCE'), 0) AS "inflow", COALESCE(SUM("amount") FILTER (WHERE "direction" = 'OUT'), 0) AS "outflow", COALESCE(SUM("amount") FILTER (WHERE "type" = 'OPENING_BALANCE'), 0) AS "opening" FROM "CashDrawerMovement" WHERE "shopId" = ${shopId}::uuid AND "drawerId" = ${drawer.id}::uuid AND "status" = 'ACTIVE' AND "createdAt" >= ${start} AND "createdAt" < ${end}`;
  return { currentBalance: Number(drawer.currentBalance), openingBalance: Number(drawer.openingBalance), inflow: Number(rows[0]?.inflow ?? 0), outflow: Number(rows[0]?.outflow ?? 0), netMovement: Number(rows[0]?.inflow ?? 0) - Number(rows[0]?.outflow ?? 0) };
}

export const cashDrawerService = { getSnapshot, getAuditSnapshot, getMovementById, setOpeningBalance, addManualMovement, transferWithWallet, getReportSnapshot };
