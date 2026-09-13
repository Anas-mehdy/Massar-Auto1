-- Materialize the financial schema that was historically completed at runtime.
-- This migration is intentionally ordered immediately after add_financial_transfers
-- so a fresh migration replay does not depend on application startup side effects.

ALTER TABLE public."FinancialTransfer"
  ADD COLUMN IF NOT EXISTS "walletAmount" numeric(14,2),
  ADD COLUMN IF NOT EXISTS "commissionMode" text NOT NULL DEFAULT 'ADDED',
  ADD COLUMN IF NOT EXISTS "isDeferred" boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "debtEntryId" uuid,
  ADD COLUMN IF NOT EXISTS "sourceType" text,
  ADD COLUMN IF NOT EXISTS "sourceId" text,
  ADD COLUMN IF NOT EXISTS "sourceReference" text,
  ADD COLUMN IF NOT EXISTS "settlementType" text,
  ADD COLUMN IF NOT EXISTS "settlementWalletId" uuid,
  ADD COLUMN IF NOT EXISTS "settlementAmount" numeric(14,2),
  ADD COLUMN IF NOT EXISTS "settlementTransferId" uuid,
  ADD COLUMN IF NOT EXISTS "settlementCashMovementId" uuid;

UPDATE public."FinancialTransfer"
SET "walletAmount" = "amount"
WHERE "walletAmount" IS NULL;

ALTER TABLE public."FinancialTransfer"
  ALTER COLUMN "walletAmount" SET DEFAULT 0,
  ALTER COLUMN "walletAmount" SET NOT NULL;

CREATE INDEX IF NOT EXISTS "FinancialTransfer_settlementTransferId_idx"
  ON public."FinancialTransfer" ("settlementTransferId");
CREATE INDEX IF NOT EXISTS "FinancialTransfer_settlementWalletId_idx"
  ON public."FinancialTransfer" ("settlementWalletId");
CREATE INDEX IF NOT EXISTS "FinancialTransfer_shopId_sourceType_idx"
  ON public."FinancialTransfer" ("shopId", "sourceType");

CREATE UNIQUE INDEX IF NOT EXISTS "FinancialWallet_shopId_id_key"
  ON public."FinancialWallet" ("shopId", "id");

CREATE TABLE IF NOT EXISTS public."CashDrawer" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "shopId" uuid NOT NULL UNIQUE REFERENCES public."Shop"("id") ON DELETE CASCADE,
  "currentBalance" numeric(14,2) NOT NULL DEFAULT 0,
  "openingBalance" numeric(14,2) NOT NULL DEFAULT 0,
  "openingBalanceSetAt" timestamp(3),
  "createdAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS public."CashDrawerMovement" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "shopId" uuid NOT NULL REFERENCES public."Shop"("id") ON DELETE CASCADE,
  "drawerId" uuid NOT NULL REFERENCES public."CashDrawer"("id") ON DELETE CASCADE,
  "createdByUserId" uuid,
  "type" text NOT NULL,
  "direction" text NOT NULL,
  "amount" numeric(14,2) NOT NULL,
  "description" text,
  "reference" text,
  "walletId" uuid,
  "financialTransferId" uuid,
  "status" text NOT NULL DEFAULT 'ACTIVE',
  "createdAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "voidedAt" timestamp(3),
  "sourceType" text,
  "sourceId" text,
  "sourceReference" text,
  "customerId" uuid REFERENCES public."Customer"("id") ON DELETE SET NULL
);

ALTER TABLE public."CashDrawerMovement"
  ADD COLUMN IF NOT EXISTS "sourceType" text,
  ADD COLUMN IF NOT EXISTS "sourceId" text,
  ADD COLUMN IF NOT EXISTS "sourceReference" text,
  ADD COLUMN IF NOT EXISTS "customerId" uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public."CashDrawerMovement"'::regclass
      AND conname = 'CashDrawerMovement_customerId_fkey'
  ) THEN
    ALTER TABLE public."CashDrawerMovement"
      ADD CONSTRAINT "CashDrawerMovement_customerId_fkey"
      FOREIGN KEY ("customerId") REFERENCES public."Customer"("id") ON DELETE SET NULL;
  END IF;
END;
$$;

CREATE INDEX IF NOT EXISTS "CashDrawerMovement_shopId_createdAt_idx"
  ON public."CashDrawerMovement" ("shopId", "createdAt");
CREATE INDEX IF NOT EXISTS "CashDrawerMovement_drawerId_createdAt_idx"
  ON public."CashDrawerMovement" ("drawerId", "createdAt");
CREATE INDEX IF NOT EXISTS "CashDrawerMovement_source_idx"
  ON public."CashDrawerMovement" ("shopId", "sourceType", "sourceId");

ALTER TABLE public."FinancialWallet" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."FinancialTransfer" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."CashDrawer" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."CashDrawerMovement" ENABLE ROW LEVEL SECURITY;
