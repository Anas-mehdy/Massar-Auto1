-- Bind automotive service-order inventory parts to a concrete warehouse.
-- Massar Auto only. Nullable for manual/non-inventory part lines and backward compatibility.
ALTER TABLE "ServicePartLine"
  ADD COLUMN IF NOT EXISTS "warehouseId" uuid;

CREATE INDEX IF NOT EXISTS "ServicePartLine_warehouse_idx"
  ON "ServicePartLine" ("warehouseId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'ServicePartLine_warehouse_shop_fkey'
      AND conrelid = '"ServicePartLine"'::regclass
  ) THEN
    ALTER TABLE "ServicePartLine"
      ADD CONSTRAINT "ServicePartLine_warehouse_shop_fkey"
      FOREIGN KEY ("shopId", "warehouseId")
      REFERENCES "Warehouse" ("shopId", "id")
      ON DELETE RESTRICT;
  END IF;
END $$;
