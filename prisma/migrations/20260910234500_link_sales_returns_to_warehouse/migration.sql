-- Massar Auto: make partial sales returns first-class warehouse movements.
-- Additive and isolated to the automotive schema.

ALTER TABLE "WarehouseMovement"
  ADD COLUMN IF NOT EXISTS "salesReturnId" uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'WarehouseMovement_sales_return_shop_fkey'
  ) THEN
    ALTER TABLE "WarehouseMovement"
      ADD CONSTRAINT "WarehouseMovement_sales_return_shop_fkey"
      FOREIGN KEY ("shopId", "salesReturnId")
      REFERENCES "SalesReturn"("shopId", "id")
      ON DELETE SET NULL;
  END IF;
END $$;

ALTER TABLE "WarehouseMovement"
  DROP CONSTRAINT IF EXISTS "WarehouseMovement_type_check";

ALTER TABLE "WarehouseMovement"
  ADD CONSTRAINT "WarehouseMovement_type_check" CHECK ("type" IN (
    'PURCHASE_IN','SALE_OUT','SALES_RETURN','SERVICE_USAGE','SERVICE_RETURN','TRANSFER_IN','TRANSFER_OUT',
    'SUPPLIER_RETURN','STOCKTAKE_GAIN','STOCKTAKE_LOSS','ADJUSTMENT_IN','ADJUSTMENT_OUT'
  ));

CREATE INDEX IF NOT EXISTS "WarehouseMovement_sales_return_idx"
  ON "WarehouseMovement" ("shopId", "salesReturnId", "createdAt" DESC);
