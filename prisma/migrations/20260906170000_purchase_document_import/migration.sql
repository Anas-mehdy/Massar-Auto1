-- Purchase receiving phase 3: private document/text sources, extraction review,
-- supplier-specific confirmed item aliases, and idempotent source-row transfer metadata.
-- Additive only. Do NOT apply to production before isolated verification.

CREATE TABLE IF NOT EXISTS "PurchaseImportSource" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "shopId" UUID NOT NULL,
  "purchaseInvoiceId" UUID NOT NULL,
  "createdByUserId" UUID,
  "sourceType" VARCHAR(20) NOT NULL,
  "fileName" TEXT,
  "mimeType" VARCHAR(120),
  "fileSize" INTEGER,
  "pageCount" INTEGER,
  "fileData" BYTEA,
  "textContent" TEXT,
  "contentSha256" CHAR(64) NOT NULL,
  "status" VARCHAR(24) NOT NULL DEFAULT 'UPLOADED',
  "extractionVersion" INTEGER NOT NULL DEFAULT 1,
  "extractionProvider" VARCHAR(80),
  "extractedData" JSONB,
  "safeErrorCode" VARCHAR(80),
  "safeErrorMessage" TEXT,
  "attemptCount" INTEGER NOT NULL DEFAULT 0,
  "lastAttemptAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PurchaseImportSource_sourceType_check" CHECK ("sourceType" IN ('IMAGE','PDF','TEXT')),
  CONSTRAINT "PurchaseImportSource_status_check" CHECK ("status" IN ('UPLOADED','EXTRACTING','REVIEW_READY','FAILED')),
  CONSTRAINT "PurchaseImportSource_fileSize_check" CHECK ("fileSize" IS NULL OR "fileSize" >= 0),
  CONSTRAINT "PurchaseImportSource_pageCount_check" CHECK ("pageCount" IS NULL OR "pageCount" > 0),
  CONSTRAINT "PurchaseImportSource_attemptCount_check" CHECK ("attemptCount" >= 0),
  CONSTRAINT "PurchaseImportSource_payload_check" CHECK (
    ("sourceType" = 'TEXT' AND "textContent" IS NOT NULL AND "fileData" IS NULL)
    OR
    ("sourceType" IN ('IMAGE','PDF') AND "fileData" IS NOT NULL AND "textContent" IS NULL)
  ),
  CONSTRAINT "PurchaseImportSource_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "PurchaseImportSource_purchaseInvoiceId_fkey" FOREIGN KEY ("purchaseInvoiceId") REFERENCES "PurchaseInvoice"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "PurchaseImportSource_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "PurchaseImportSource_draft_content_key"
  ON "PurchaseImportSource" ("shopId", "purchaseInvoiceId", "contentSha256", "extractionVersion");
CREATE INDEX IF NOT EXISTS "PurchaseImportSource_shopId_purchaseInvoiceId_createdAt_idx"
  ON "PurchaseImportSource" ("shopId", "purchaseInvoiceId", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS "PurchaseImportSource_shopId_status_lastAttemptAt_idx"
  ON "PurchaseImportSource" ("shopId", "status", "lastAttemptAt" DESC);

CREATE TABLE IF NOT EXISTS "PurchaseImportExtractionAttempt" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "shopId" UUID NOT NULL,
  "sourceId" UUID NOT NULL,
  "requestKey" VARCHAR(120) NOT NULL,
  "provider" VARCHAR(80) NOT NULL,
  "status" VARCHAR(24) NOT NULL DEFAULT 'STARTED',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "finishedAt" TIMESTAMP(3),
  CONSTRAINT "PurchaseImportExtractionAttempt_status_check" CHECK ("status" IN ('STARTED','SUCCEEDED','FAILED')),
  CONSTRAINT "PurchaseImportExtractionAttempt_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "PurchaseImportExtractionAttempt_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "PurchaseImportSource"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "PurchaseImportExtractionAttempt_shopId_requestKey_key"
  ON "PurchaseImportExtractionAttempt" ("shopId", "requestKey");
CREATE INDEX IF NOT EXISTS "PurchaseImportExtractionAttempt_shopId_createdAt_idx"
  ON "PurchaseImportExtractionAttempt" ("shopId", "createdAt" DESC);

CREATE TABLE IF NOT EXISTS "SupplierItemAlias" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "shopId" UUID NOT NULL,
  "supplierId" UUID NOT NULL,
  "inventoryItemId" UUID NOT NULL,
  "aliasText" TEXT NOT NULL,
  "normalizedAlias" TEXT NOT NULL,
  "barcodeSnapshot" TEXT,
  "createdByUserId" UUID,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "deletedAt" TIMESTAMP(3),
  CONSTRAINT "SupplierItemAlias_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "SupplierItemAlias_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "SupplierItemAlias_inventoryItemId_fkey" FOREIGN KEY ("inventoryItemId") REFERENCES "InventoryItem"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "SupplierItemAlias_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "SupplierItemAlias_shop_supplier_alias_active_key"
  ON "SupplierItemAlias" ("shopId", "supplierId", "normalizedAlias")
  WHERE "deletedAt" IS NULL;
CREATE INDEX IF NOT EXISTS "SupplierItemAlias_shop_supplier_inventory_idx"
  ON "SupplierItemAlias" ("shopId", "supplierId", "inventoryItemId")
  WHERE "deletedAt" IS NULL;

ALTER TABLE "PurchaseItem"
  ADD COLUMN IF NOT EXISTS "importSourceId" UUID,
  ADD COLUMN IF NOT EXISTS "importRowKey" VARCHAR(120),
  ADD COLUMN IF NOT EXISTS "importedPurchaseUnit" VARCHAR(80);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'PurchaseItem_importSourceId_fkey') THEN
    ALTER TABLE "PurchaseItem"
      ADD CONSTRAINT "PurchaseItem_importSourceId_fkey"
      FOREIGN KEY ("importSourceId") REFERENCES "PurchaseImportSource"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "PurchaseItem_purchase_import_row_key"
  ON "PurchaseItem" ("shopId", "purchaseInvoiceId", "importSourceId", "importRowKey")
  WHERE "importSourceId" IS NOT NULL AND "importRowKey" IS NOT NULL;
CREATE INDEX IF NOT EXISTS "PurchaseItem_shopId_importSourceId_idx"
  ON "PurchaseItem" ("shopId", "importSourceId");

-- As with InventoryCategory, uploaded invoice sources and supplier aliases are server-only.
ALTER TABLE "PurchaseImportSource" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PurchaseImportExtractionAttempt" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "SupplierItemAlias" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "PurchaseImportSource" FROM anon, authenticated;
REVOKE ALL ON TABLE "PurchaseImportExtractionAttempt" FROM anon, authenticated;
REVOKE ALL ON TABLE "SupplierItemAlias" FROM anon, authenticated;
