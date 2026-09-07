-- Purchase receiving phase 2: Excel import traceability, exact barcode matching,
-- explicit sale-price updates, category/compatibility review metadata.
-- Additive only. Do NOT apply to production before isolated verification.

ALTER TABLE "InventoryItem"
  ADD COLUMN IF NOT EXISTS "barcode" TEXT,
  ADD COLUMN IF NOT EXISTS "compatibilityReviewNeeded" BOOLEAN NOT NULL DEFAULT FALSE;

-- Barcodes are exact identifiers inside one active shop. Empty values are ignored.
CREATE UNIQUE INDEX IF NOT EXISTS "InventoryItem_shopId_barcode_active_key"
  ON "InventoryItem" ("shopId", "barcode")
  WHERE "barcode" IS NOT NULL
    AND btrim("barcode") <> ''
    AND "deletedAt" IS NULL;

CREATE INDEX IF NOT EXISTS "InventoryItem_shopId_compatibilityReviewNeeded_idx"
  ON "InventoryItem" ("shopId", "compatibilityReviewNeeded", "updatedAt" DESC)
  WHERE "deletedAt" IS NULL;

ALTER TABLE "PurchaseItem"
  ADD COLUMN IF NOT EXISTS "newItemBarcode" TEXT,
  ADD COLUMN IF NOT EXISTS "newItemCategoryId" UUID,
  ADD COLUMN IF NOT EXISTS "importedSourceText" TEXT,
  ADD COLUMN IF NOT EXISTS "matchReviewRequired" BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS "compatibilityGroupIds" UUID[] NOT NULL DEFAULT ARRAY[]::UUID[],
  ADD COLUMN IF NOT EXISTS "compatibilityReviewNeeded" BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS "updateSalePrice" BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS "salePriceBeforeSnapshot" DECIMAL(14,2);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'PurchaseItem_newItemCategoryId_fkey'
  ) THEN
    ALTER TABLE "PurchaseItem"
      ADD CONSTRAINT "PurchaseItem_newItemCategoryId_fkey"
      FOREIGN KEY ("newItemCategoryId") REFERENCES "InventoryCategory"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'PurchaseItem_salePriceBeforeSnapshot_check'
  ) THEN
    ALTER TABLE "PurchaseItem"
      ADD CONSTRAINT "PurchaseItem_salePriceBeforeSnapshot_check"
      CHECK ("salePriceBeforeSnapshot" IS NULL OR "salePriceBeforeSnapshot" >= 0);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "PurchaseItem_shopId_matchReviewRequired_idx"
  ON "PurchaseItem" ("shopId", "matchReviewRequired", "purchaseInvoiceId");

CREATE INDEX IF NOT EXISTS "PurchaseItem_shopId_newItemBarcode_idx"
  ON "PurchaseItem" ("shopId", "newItemBarcode")
  WHERE "newItemBarcode" IS NOT NULL AND btrim("newItemBarcode") <> '';
