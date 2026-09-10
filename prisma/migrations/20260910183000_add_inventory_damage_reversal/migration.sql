-- Preserve the original damage record while allowing an audited reversal.
ALTER TABLE "InventoryDamage"
  ADD COLUMN IF NOT EXISTS "reversedAt" timestamptz NULL,
  ADD COLUMN IF NOT EXISTS "reversedByUserId" uuid NULL,
  ADD COLUMN IF NOT EXISTS "reversalMovementId" uuid NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'InventoryDamage_reversedByUserId_fkey'
  ) THEN
    ALTER TABLE "InventoryDamage"
      ADD CONSTRAINT "InventoryDamage_reversedByUserId_fkey"
      FOREIGN KEY ("reversedByUserId") REFERENCES "User"("id") ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'InventoryDamage_reversalMovementId_fkey'
  ) THEN
    ALTER TABLE "InventoryDamage"
      ADD CONSTRAINT "InventoryDamage_reversalMovementId_fkey"
      FOREIGN KEY ("reversalMovementId") REFERENCES "InventoryMovement"("id") ON DELETE SET NULL;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "InventoryDamage_reversalMovementId_key"
  ON "InventoryDamage" ("reversalMovementId")
  WHERE "reversalMovementId" IS NOT NULL;

CREATE INDEX IF NOT EXISTS "InventoryDamage_shopId_reversedAt_idx"
  ON "InventoryDamage" ("shopId", "reversedAt");

CREATE INDEX IF NOT EXISTS "InventoryDamage_reversedByUserId_idx"
  ON "InventoryDamage" ("reversedByUserId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'InventoryDamage_reversal_consistency_check'
  ) THEN
    ALTER TABLE "InventoryDamage"
      ADD CONSTRAINT "InventoryDamage_reversal_consistency_check"
      CHECK (
        "reversedAt" IS NOT NULL
        OR ("reversalMovementId" IS NULL AND "reversedByUserId" IS NULL)
      );
  END IF;
END $$;
