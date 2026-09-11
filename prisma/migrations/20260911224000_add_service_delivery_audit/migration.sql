ALTER TABLE "ServiceOrder"
  ADD COLUMN IF NOT EXISTS "odometerAtDelivery" INTEGER,
  ADD COLUMN IF NOT EXISTS "deliveryNotes" TEXT,
  ADD COLUMN IF NOT EXISTS "deliveredByUserId" UUID;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ServiceOrder_odometer_delivery_check'
  ) THEN
    ALTER TABLE "ServiceOrder"
      ADD CONSTRAINT "ServiceOrder_odometer_delivery_check"
      CHECK ("odometerAtDelivery" IS NULL OR "odometerAtDelivery" >= 0);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ServiceOrder_deliveredByUserId_fkey'
  ) THEN
    ALTER TABLE "ServiceOrder"
      ADD CONSTRAINT "ServiceOrder_deliveredByUserId_fkey"
      FOREIGN KEY ("deliveredByUserId") REFERENCES "User"("id") ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "ServiceOrder_shop_delivered_by_idx"
  ON "ServiceOrder" ("shopId", "deliveredByUserId")
  WHERE "deliveredByUserId" IS NOT NULL;
