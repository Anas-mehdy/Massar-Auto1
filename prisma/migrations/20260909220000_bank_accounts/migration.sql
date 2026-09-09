-- Bank accounts are real money accounts, independent from wallets and the cash drawer.
-- The migration is additive and does not rewrite existing financial data.

CREATE TABLE IF NOT EXISTS "BankAccount" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "shopId" UUID NOT NULL REFERENCES "Shop"("id") ON DELETE CASCADE,
  "name" TEXT NOT NULL,
  "bankName" TEXT,
  "openingBalance" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "currentBalance" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "openingBalanceSetAt" TIMESTAMP(3),
  "isActive" BOOLEAN NOT NULL DEFAULT TRUE,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "deletedAt" TIMESTAMP(3),
  CONSTRAINT "BankAccount_openingBalance_nonnegative" CHECK ("openingBalance" >= 0),
  CONSTRAINT "BankAccount_currentBalance_nonnegative" CHECK ("currentBalance" >= 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS "BankAccount_shopId_name_active_key"
  ON "BankAccount"("shopId", LOWER("name")) WHERE "deletedAt" IS NULL;
CREATE INDEX IF NOT EXISTS "BankAccount_shopId_isActive_createdAt_idx"
  ON "BankAccount"("shopId", "isActive", "createdAt");
CREATE INDEX IF NOT EXISTS "BankAccount_shopId_deletedAt_idx"
  ON "BankAccount"("shopId", "deletedAt");

CREATE TABLE IF NOT EXISTS "BankAccountMovement" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "shopId" UUID NOT NULL REFERENCES "Shop"("id") ON DELETE CASCADE,
  "bankAccountId" UUID NOT NULL REFERENCES "BankAccount"("id") ON DELETE RESTRICT,
  "createdByUserId" UUID REFERENCES "User"("id") ON DELETE SET NULL,
  "voidedByUserId" UUID REFERENCES "User"("id") ON DELETE SET NULL,
  "customerId" UUID REFERENCES "Customer"("id") ON DELETE SET NULL,
  "type" TEXT NOT NULL,
  "direction" VARCHAR(3) NOT NULL,
  "amount" DECIMAL(14,2) NOT NULL,
  "balanceBefore" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "balanceAfter" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "description" TEXT,
  "reference" TEXT,
  "sourceType" TEXT NOT NULL DEFAULT 'MANUAL',
  "sourceId" TEXT,
  "sourceReference" TEXT,
  "counterpartyType" TEXT,
  "counterpartyId" TEXT,
  "counterpartyName" TEXT,
  "transferGroupId" UUID,
  "status" VARCHAR(12) NOT NULL DEFAULT 'ACTIVE',
  "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "voidedAt" TIMESTAMP(3),
  CONSTRAINT "BankAccountMovement_direction_check" CHECK ("direction" IN ('IN','OUT')),
  CONSTRAINT "BankAccountMovement_amount_positive" CHECK ("amount" > 0),
  CONSTRAINT "BankAccountMovement_balanceBefore_nonnegative" CHECK ("balanceBefore" >= 0),
  CONSTRAINT "BankAccountMovement_balanceAfter_nonnegative" CHECK ("balanceAfter" >= 0),
  CONSTRAINT "BankAccountMovement_status_check" CHECK ("status" IN ('ACTIVE','VOID'))
);

CREATE INDEX IF NOT EXISTS "BankAccountMovement_shopId_occurredAt_idx"
  ON "BankAccountMovement"("shopId", "occurredAt", "createdAt");
CREATE INDEX IF NOT EXISTS "BankAccountMovement_bankAccountId_occurredAt_idx"
  ON "BankAccountMovement"("bankAccountId", "occurredAt", "createdAt");
CREATE INDEX IF NOT EXISTS "BankAccountMovement_shopId_source_idx"
  ON "BankAccountMovement"("shopId", "sourceType", "sourceId");
CREATE INDEX IF NOT EXISTS "BankAccountMovement_shopId_customer_occurred_idx"
  ON "BankAccountMovement"("shopId", "customerId", "occurredAt");
CREATE INDEX IF NOT EXISTS "BankAccountMovement_shopId_transferGroup_idx"
  ON "BankAccountMovement"("shopId", "transferGroupId");
CREATE INDEX IF NOT EXISTS "BankAccountMovement_shopId_status_occurred_idx"
  ON "BankAccountMovement"("shopId", "status", "occurredAt");

-- Persist the selected bank account on source records that already persist drawer/wallet selection.
ALTER TABLE IF EXISTS "PurchaseInvoice" ADD COLUMN IF NOT EXISTS "paymentBankAccountId" UUID;
ALTER TABLE IF EXISTS "PurchasePayment" ADD COLUMN IF NOT EXISTS "bankAccountId" UUID;
ALTER TABLE IF EXISTS "SupplierReturnSettlement" ADD COLUMN IF NOT EXISTS "bankAccountId" UUID;
ALTER TABLE IF EXISTS "Expense" ADD COLUMN IF NOT EXISTS "fundingBankAccountId" UUID;

CREATE INDEX IF NOT EXISTS "PurchaseInvoice_paymentBankAccountId_idx" ON "PurchaseInvoice"("paymentBankAccountId");
CREATE INDEX IF NOT EXISTS "PurchasePayment_bankAccountId_idx" ON "PurchasePayment"("bankAccountId");
CREATE INDEX IF NOT EXISTS "SupplierReturnSettlement_bankAccountId_idx" ON "SupplierReturnSettlement"("bankAccountId");
CREATE INDEX IF NOT EXISTS "Expense_fundingBankAccountId_idx" ON "Expense"("fundingBankAccountId");

DO $$
BEGIN
  IF to_regclass('"PurchaseInvoice"') IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'PurchaseInvoice_paymentBankAccountId_fkey') THEN
    ALTER TABLE "PurchaseInvoice" ADD CONSTRAINT "PurchaseInvoice_paymentBankAccountId_fkey"
      FOREIGN KEY ("paymentBankAccountId") REFERENCES "BankAccount"("id") ON DELETE SET NULL;
  END IF;
  IF to_regclass('"PurchasePayment"') IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'PurchasePayment_bankAccountId_fkey') THEN
    ALTER TABLE "PurchasePayment" ADD CONSTRAINT "PurchasePayment_bankAccountId_fkey"
      FOREIGN KEY ("bankAccountId") REFERENCES "BankAccount"("id") ON DELETE SET NULL;
  END IF;
  IF to_regclass('"SupplierReturnSettlement"') IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'SupplierReturnSettlement_bankAccountId_fkey') THEN
    ALTER TABLE "SupplierReturnSettlement" ADD CONSTRAINT "SupplierReturnSettlement_bankAccountId_fkey"
      FOREIGN KEY ("bankAccountId") REFERENCES "BankAccount"("id") ON DELETE SET NULL;
  END IF;
  IF to_regclass('"Expense"') IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Expense_fundingBankAccountId_fkey') THEN
    ALTER TABLE "Expense" ADD CONSTRAINT "Expense_fundingBankAccountId_fkey"
      FOREIGN KEY ("fundingBankAccountId") REFERENCES "BankAccount"("id") ON DELETE SET NULL;
  END IF;
END $$;

-- Electronic-service tables are migration-managed earlier in this repository. Keep this guard
-- so the bank migration remains additive/safe in partial verification databases.
DO $$
BEGIN
  IF to_regclass('"ElectronicServiceTransaction"') IS NOT NULL THEN
    ALTER TABLE "ElectronicServiceTransaction" ADD COLUMN IF NOT EXISTS "bankAccountId" UUID;
    -- Phase 3 originally restricted payment destinations to drawer/wallet/other/debt.
    -- Recreate the check so BANK is a first-class destination at the database layer too.
    ALTER TABLE "ElectronicServiceTransaction"
      DROP CONSTRAINT IF EXISTS "ElectronicServiceTransaction_paymentDestination_check";
    ALTER TABLE "ElectronicServiceTransaction"
      ADD CONSTRAINT "ElectronicServiceTransaction_paymentDestination_check"
      CHECK ("paymentDestination" IN ('DRAWER','WALLET','BANK','OTHER','DEBT'));
    CREATE INDEX IF NOT EXISTS "ElectronicServiceTransaction_bankAccountId_idx"
      ON "ElectronicServiceTransaction"("bankAccountId");
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ElectronicServiceTransaction_bankAccountId_fkey') THEN
      ALTER TABLE "ElectronicServiceTransaction" ADD CONSTRAINT "ElectronicServiceTransaction_bankAccountId_fkey"
        FOREIGN KEY ("bankAccountId") REFERENCES "BankAccount"("id") ON DELETE SET NULL;
    END IF;
  END IF;
END $$;
