-- Persist the concrete warehouse used by purchase receipts and supplier returns.
-- Massar Auto only. Columns stay nullable for historical/backward-compatible records.
ALTER TABLE "PurchaseReceipt" ADD COLUMN IF NOT EXISTS "warehouseId" uuid;
ALTER TABLE "SupplierReturn" ADD COLUMN IF NOT EXISTS "warehouseId" uuid;

CREATE INDEX IF NOT EXISTS "PurchaseReceipt_shop_warehouse_idx"
  ON "PurchaseReceipt" ("shopId", "warehouseId");
CREATE INDEX IF NOT EXISTS "SupplierReturn_shop_warehouse_idx"
  ON "SupplierReturn" ("shopId", "warehouseId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'PurchaseReceipt_warehouse_shop_fkey'
      AND conrelid = '"PurchaseReceipt"'::regclass
  ) THEN
    ALTER TABLE "PurchaseReceipt"
      ADD CONSTRAINT "PurchaseReceipt_warehouse_shop_fkey"
      FOREIGN KEY ("shopId", "warehouseId")
      REFERENCES "Warehouse" ("shopId", "id")
      ON DELETE RESTRICT;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'SupplierReturn_warehouse_shop_fkey'
      AND conrelid = '"SupplierReturn"'::regclass
  ) THEN
    ALTER TABLE "SupplierReturn"
      ADD CONSTRAINT "SupplierReturn_warehouse_shop_fkey"
      FOREIGN KEY ("shopId", "warehouseId")
      REFERENCES "Warehouse" ("shopId", "id")
      ON DELETE RESTRICT;
  END IF;
END $$;
