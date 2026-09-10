-- Add tracked bank-account support to direct supplier-ledger payments.
-- This migration is additive and preserves all existing supplier ledger rows.

ALTER TABLE "SupplierLedgerEntry"
  ADD COLUMN IF NOT EXISTS "bankAccountId" UUID,
  ADD COLUMN IF NOT EXISTS "bankAccountMovementId" UUID;

ALTER TABLE "SupplierLedgerEntry"
  DROP CONSTRAINT IF EXISTS "SupplierLedgerEntry_account_check",
  DROP CONSTRAINT IF EXISTS "SupplierLedgerEntry_wallet_account_check";

ALTER TABLE "SupplierLedgerEntry"
  ADD CONSTRAINT "SupplierLedgerEntry_account_check"
    CHECK ("accountType" IS NULL OR "accountType" IN ('DRAWER','WALLET','BANK')),
  ADD CONSTRAINT "SupplierLedgerEntry_wallet_account_check"
    CHECK (
      ("accountType" = 'WALLET' AND "walletId" IS NOT NULL AND "bankAccountId" IS NULL)
      OR ("accountType" = 'BANK' AND "walletId" IS NULL AND "bankAccountId" IS NOT NULL)
      OR ("accountType" = 'DRAWER' AND "walletId" IS NULL AND "bankAccountId" IS NULL)
      OR ("accountType" IS NULL AND "walletId" IS NULL AND "bankAccountId" IS NULL)
    );

CREATE INDEX IF NOT EXISTS "SupplierLedgerEntry_bankAccountId_idx"
  ON "SupplierLedgerEntry"("bankAccountId") WHERE "bankAccountId" IS NOT NULL;
CREATE INDEX IF NOT EXISTS "SupplierLedgerEntry_bankAccountMovementId_idx"
  ON "SupplierLedgerEntry"("bankAccountMovementId") WHERE "bankAccountMovementId" IS NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'SupplierLedgerEntry_bankAccountId_fkey') THEN
    ALTER TABLE "SupplierLedgerEntry"
      ADD CONSTRAINT "SupplierLedgerEntry_bankAccountId_fkey"
      FOREIGN KEY ("bankAccountId") REFERENCES "BankAccount"("id") ON DELETE RESTRICT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'SupplierLedgerEntry_bankAccountMovementId_fkey') THEN
    ALTER TABLE "SupplierLedgerEntry"
      ADD CONSTRAINT "SupplierLedgerEntry_bankAccountMovementId_fkey"
      FOREIGN KEY ("bankAccountMovementId") REFERENCES "BankAccountMovement"("id") ON DELETE SET NULL;
  END IF;
END $$;
