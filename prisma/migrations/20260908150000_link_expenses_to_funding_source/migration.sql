ALTER TABLE "Expense"
  ADD COLUMN IF NOT EXISTS "fundingSource" VARCHAR(16),
  ADD COLUMN IF NOT EXISTS "fundingWalletId" UUID,
  ADD COLUMN IF NOT EXISTS "fundingWalletName" TEXT,
  ADD COLUMN IF NOT EXISTS "cashDrawerMovementId" UUID,
  ADD COLUMN IF NOT EXISTS "financialTransferId" UUID;

CREATE INDEX IF NOT EXISTS "Expense_shopId_fundingSource_spentAt_idx"
  ON "Expense"("shopId", "fundingSource", "spentAt");
CREATE INDEX IF NOT EXISTS "Expense_fundingWalletId_idx"
  ON "Expense"("fundingWalletId");

-- Existing expenses stay NULL intentionally: older expenses never changed drawer/wallet balances,
-- so backfilling a funding source would fabricate historical liquidity movements.
