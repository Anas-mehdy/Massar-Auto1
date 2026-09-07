-- Purchase receiving foundation for Massar ERP.
-- This migration is intentionally additive: existing stock-in flows keep working.
-- Do NOT apply to production until the isolated preview/test database has been verified.

CREATE TABLE "PurchaseInvoice" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "shopId" UUID NOT NULL,
  "supplierId" UUID,
  "supplierNameSnapshot" TEXT,
  "createdByUserId" UUID,
  "supplierInvoiceNumber" TEXT,
  "invoiceDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "notes" TEXT,
  "currency" VARCHAR(3) NOT NULL,
  "status" VARCHAR(20) NOT NULL DEFAULT 'DRAFT',
  "subtotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "discountTotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "extraCostsTotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "total" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "amountPaid" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "balanceDue" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "paymentMethod" VARCHAR(30),
  "paymentSourceName" TEXT,
  "paymentReference" TEXT,
  "postingKey" VARCHAR(80),
  "postedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "deletedAt" TIMESTAMP(3),
  "version" INTEGER NOT NULL DEFAULT 1,
  CONSTRAINT "PurchaseInvoice_status_check" CHECK ("status" IN ('DRAFT','POSTED')),
  CONSTRAINT "PurchaseInvoice_paymentMethod_check" CHECK ("paymentMethod" IS NULL OR "paymentMethod" IN ('CASH','CARD','BANK_TRANSFER','OTHER')),
  CONSTRAINT "PurchaseInvoice_nonnegative_totals_check" CHECK (
    "subtotal" >= 0 AND "discountTotal" >= 0 AND "extraCostsTotal" >= 0
    AND "total" >= 0 AND "amountPaid" >= 0 AND "balanceDue" >= 0
  ),
  CONSTRAINT "PurchaseInvoice_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "PurchaseInvoice_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "PurchaseInvoice_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE "PurchaseItem" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "shopId" UUID NOT NULL,
  "purchaseInvoiceId" UUID NOT NULL,
  "inventoryItemId" UUID,
  "newItemName" TEXT,
  "newItemSku" TEXT,
  "newItemCategory" TEXT,
  "newItemDescription" TEXT,
  "orderedQuantity" INTEGER NOT NULL,
  "receivedQuantity" INTEGER NOT NULL DEFAULT 0,
  "unitCost" DECIMAL(14,2) NOT NULL,
  "salePriceSnapshot" DECIMAL(14,2),
  "lineTotal" DECIMAL(14,2) NOT NULL,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PurchaseItem_quantities_check" CHECK ("orderedQuantity" > 0 AND "receivedQuantity" >= 0 AND "receivedQuantity" <= "orderedQuantity"),
  CONSTRAINT "PurchaseItem_amounts_check" CHECK ("unitCost" >= 0 AND "lineTotal" >= 0 AND ("salePriceSnapshot" IS NULL OR "salePriceSnapshot" >= 0)),
  CONSTRAINT "PurchaseItem_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "PurchaseItem_purchaseInvoiceId_fkey" FOREIGN KEY ("purchaseInvoiceId") REFERENCES "PurchaseInvoice"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "PurchaseItem_inventoryItemId_fkey" FOREIGN KEY ("inventoryItemId") REFERENCES "InventoryItem"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE "PurchasePayment" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "shopId" UUID NOT NULL,
  "purchaseInvoiceId" UUID NOT NULL,
  "createdByUserId" UUID,
  "method" VARCHAR(30) NOT NULL,
  "sourceName" TEXT,
  "amount" DECIMAL(14,2) NOT NULL,
  "reference" TEXT,
  "note" TEXT,
  "paidAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PurchasePayment_amount_check" CHECK ("amount" > 0),
  CONSTRAINT "PurchasePayment_method_check" CHECK ("method" IN ('CASH','CARD','BANK_TRANSFER','OTHER')),
  CONSTRAINT "PurchasePayment_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "PurchasePayment_purchaseInvoiceId_fkey" FOREIGN KEY ("purchaseInvoiceId") REFERENCES "PurchaseInvoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "PurchasePayment_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- Normalize supplierId into Prisma's physical InventoryMovement model, if the earlier
-- supplier-link migration has not yet run in a disposable test database.
ALTER TABLE "InventoryMovement" ADD COLUMN IF NOT EXISTS "supplierId" UUID;
ALTER TABLE "InventoryMovement" ADD COLUMN IF NOT EXISTS "purchaseInvoiceId" UUID;
ALTER TABLE "InventoryMovement" ADD COLUMN IF NOT EXISTS "purchaseItemId" UUID;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'InventoryMovement_supplierId_fkey') THEN
    ALTER TABLE "InventoryMovement" ADD CONSTRAINT "InventoryMovement_supplierId_fkey"
      FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'InventoryMovement_purchaseInvoiceId_fkey') THEN
    ALTER TABLE "InventoryMovement" ADD CONSTRAINT "InventoryMovement_purchaseInvoiceId_fkey"
      FOREIGN KEY ("purchaseInvoiceId") REFERENCES "PurchaseInvoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'InventoryMovement_purchaseItemId_fkey') THEN
    ALTER TABLE "InventoryMovement" ADD CONSTRAINT "InventoryMovement_purchaseItemId_fkey"
      FOREIGN KEY ("purchaseItemId") REFERENCES "PurchaseItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX "PurchaseInvoice_shopId_invoiceDate_idx" ON "PurchaseInvoice"("shopId", "invoiceDate" DESC);
CREATE INDEX "PurchaseInvoice_shopId_status_updatedAt_idx" ON "PurchaseInvoice"("shopId", "status", "updatedAt" DESC);
CREATE INDEX "PurchaseInvoice_shopId_supplierId_invoiceDate_idx" ON "PurchaseInvoice"("shopId", "supplierId", "invoiceDate" DESC);
CREATE INDEX "PurchaseInvoice_duplicate_supplier_number_idx" ON "PurchaseInvoice"("shopId", "supplierId", "supplierInvoiceNumber") WHERE "supplierInvoiceNumber" IS NOT NULL AND "deletedAt" IS NULL;
CREATE UNIQUE INDEX "PurchaseInvoice_shopId_postingKey_key" ON "PurchaseInvoice"("shopId", "postingKey") WHERE "postingKey" IS NOT NULL;
CREATE INDEX "PurchaseItem_shopId_purchaseInvoiceId_sortOrder_idx" ON "PurchaseItem"("shopId", "purchaseInvoiceId", "sortOrder");
CREATE INDEX "PurchaseItem_shopId_inventoryItemId_idx" ON "PurchaseItem"("shopId", "inventoryItemId");
CREATE INDEX "PurchasePayment_shopId_purchaseInvoiceId_paidAt_idx" ON "PurchasePayment"("shopId", "purchaseInvoiceId", "paidAt" DESC);
CREATE INDEX IF NOT EXISTS "InventoryMovement_shopId_purchaseInvoiceId_idx" ON "InventoryMovement"("shopId", "purchaseInvoiceId");
CREATE INDEX IF NOT EXISTS "InventoryMovement_shopId_purchaseItemId_idx" ON "InventoryMovement"("shopId", "purchaseItemId");

-- Server-only purchase domain. Keep direct anon/authenticated database access closed
-- from the first migration; application services enforce membership/permission checks.
ALTER TABLE "PurchaseInvoice" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PurchaseItem" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PurchasePayment" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "PurchaseInvoice" FROM anon, authenticated;
REVOKE ALL ON TABLE "PurchaseItem" FROM anon, authenticated;
REVOKE ALL ON TABLE "PurchasePayment" FROM anon, authenticated;
