-- Purchase receiving phase 4: partial receipts, idempotent follow-up payments,
-- supplier returns, and return financial settlements.
-- Additive/forward-only. Do NOT apply to production before isolated database verification.

ALTER TABLE "PurchaseInvoice"
  ADD COLUMN IF NOT EXISTS "returnAdjustmentTotal" DECIMAL(14,2) NOT NULL DEFAULT 0;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'PurchaseInvoice_returnAdjustmentTotal_check') THEN
    ALTER TABLE "PurchaseInvoice"
      ADD CONSTRAINT "PurchaseInvoice_returnAdjustmentTotal_check"
      CHECK ("returnAdjustmentTotal" >= 0 AND "returnAdjustmentTotal" <= "total");
  END IF;
END $$;

ALTER TABLE "PurchaseItem"
  ADD COLUMN IF NOT EXISTS "returnedQuantity" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "PurchaseItem" DROP CONSTRAINT IF EXISTS "PurchaseItem_quantities_check";
ALTER TABLE "PurchaseItem"
  ADD CONSTRAINT "PurchaseItem_quantities_check"
  CHECK (
    "orderedQuantity" > 0
    AND "receivedQuantity" >= 0
    AND "receivedQuantity" <= "orderedQuantity"
    AND "returnedQuantity" >= 0
    AND "returnedQuantity" <= "receivedQuantity"
  );

ALTER TABLE "PurchasePayment"
  ADD COLUMN IF NOT EXISTS "requestKey" VARCHAR(120),
  ADD COLUMN IF NOT EXISTS "accountType" VARCHAR(20),
  ADD COLUMN IF NOT EXISTS "walletId" UUID;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'PurchasePayment_accountType_check') THEN
    ALTER TABLE "PurchasePayment"
      ADD CONSTRAINT "PurchasePayment_accountType_check"
      CHECK ("accountType" IS NULL OR "accountType" IN ('DRAWER','WALLET','OTHER'));
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "PurchasePayment_shopId_requestKey_key"
  ON "PurchasePayment" ("shopId", "requestKey")
  WHERE "requestKey" IS NOT NULL;

CREATE TABLE IF NOT EXISTS "PurchaseReceipt" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "shopId" UUID NOT NULL,
  "purchaseInvoiceId" UUID NOT NULL,
  "createdByUserId" UUID,
  "requestKey" VARCHAR(120) NOT NULL,
  "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "reference" TEXT,
  "note" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PurchaseReceipt_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "PurchaseReceipt_purchaseInvoiceId_fkey" FOREIGN KEY ("purchaseInvoiceId") REFERENCES "PurchaseInvoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "PurchaseReceipt_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "PurchaseReceipt_shopId_requestKey_key"
  ON "PurchaseReceipt" ("shopId", "requestKey");
CREATE INDEX IF NOT EXISTS "PurchaseReceipt_shopId_purchaseInvoiceId_receivedAt_idx"
  ON "PurchaseReceipt" ("shopId", "purchaseInvoiceId", "receivedAt" DESC);

CREATE TABLE IF NOT EXISTS "PurchaseReceiptItem" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "shopId" UUID NOT NULL,
  "purchaseReceiptId" UUID NOT NULL,
  "purchaseItemId" UUID NOT NULL,
  "inventoryItemId" UUID NOT NULL,
  "quantity" INTEGER NOT NULL,
  "unitCostSnapshot" DECIMAL(14,2) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PurchaseReceiptItem_quantity_check" CHECK ("quantity" > 0),
  CONSTRAINT "PurchaseReceiptItem_unitCost_check" CHECK ("unitCostSnapshot" >= 0),
  CONSTRAINT "PurchaseReceiptItem_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "PurchaseReceiptItem_purchaseReceiptId_fkey" FOREIGN KEY ("purchaseReceiptId") REFERENCES "PurchaseReceipt"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "PurchaseReceiptItem_purchaseItemId_fkey" FOREIGN KEY ("purchaseItemId") REFERENCES "PurchaseItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "PurchaseReceiptItem_inventoryItemId_fkey" FOREIGN KEY ("inventoryItemId") REFERENCES "InventoryItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "PurchaseReceiptItem_receipt_purchaseItem_key"
  ON "PurchaseReceiptItem" ("purchaseReceiptId", "purchaseItemId");
CREATE INDEX IF NOT EXISTS "PurchaseReceiptItem_shopId_purchaseItemId_idx"
  ON "PurchaseReceiptItem" ("shopId", "purchaseItemId");

CREATE TABLE IF NOT EXISTS "SupplierReturn" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "shopId" UUID NOT NULL,
  "purchaseInvoiceId" UUID NOT NULL,
  "supplierId" UUID,
  "createdByUserId" UUID,
  "requestKey" VARCHAR(120) NOT NULL,
  "reason" TEXT NOT NULL,
  "reference" TEXT,
  "returnedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "totalValue" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SupplierReturn_totalValue_check" CHECK ("totalValue" >= 0),
  CONSTRAINT "SupplierReturn_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "SupplierReturn_purchaseInvoiceId_fkey" FOREIGN KEY ("purchaseInvoiceId") REFERENCES "PurchaseInvoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "SupplierReturn_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "SupplierReturn_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "SupplierReturn_shopId_requestKey_key"
  ON "SupplierReturn" ("shopId", "requestKey");
CREATE INDEX IF NOT EXISTS "SupplierReturn_shopId_purchaseInvoiceId_returnedAt_idx"
  ON "SupplierReturn" ("shopId", "purchaseInvoiceId", "returnedAt" DESC);

CREATE TABLE IF NOT EXISTS "SupplierReturnItem" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "shopId" UUID NOT NULL,
  "supplierReturnId" UUID NOT NULL,
  "purchaseItemId" UUID NOT NULL,
  "inventoryItemId" UUID NOT NULL,
  "quantity" INTEGER NOT NULL,
  "unitCostSnapshot" DECIMAL(14,2) NOT NULL,
  "lineTotal" DECIMAL(14,2) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SupplierReturnItem_quantity_check" CHECK ("quantity" > 0),
  CONSTRAINT "SupplierReturnItem_amounts_check" CHECK ("unitCostSnapshot" >= 0 AND "lineTotal" >= 0),
  CONSTRAINT "SupplierReturnItem_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "SupplierReturnItem_supplierReturnId_fkey" FOREIGN KEY ("supplierReturnId") REFERENCES "SupplierReturn"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "SupplierReturnItem_purchaseItemId_fkey" FOREIGN KEY ("purchaseItemId") REFERENCES "PurchaseItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "SupplierReturnItem_inventoryItemId_fkey" FOREIGN KEY ("inventoryItemId") REFERENCES "InventoryItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "SupplierReturnItem_return_purchaseItem_key"
  ON "SupplierReturnItem" ("supplierReturnId", "purchaseItemId");
CREATE INDEX IF NOT EXISTS "SupplierReturnItem_shopId_purchaseItemId_idx"
  ON "SupplierReturnItem" ("shopId", "purchaseItemId");

CREATE TABLE IF NOT EXISTS "SupplierReturnSettlement" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "shopId" UUID NOT NULL,
  "supplierReturnId" UUID NOT NULL,
  "purchaseInvoiceId" UUID NOT NULL,
  "supplierId" UUID,
  "createdByUserId" UUID,
  "requestKey" VARCHAR(120) NOT NULL,
  "type" VARCHAR(30) NOT NULL,
  "amount" DECIMAL(14,2) NOT NULL,
  "accountType" VARCHAR(20),
  "walletId" UUID,
  "sourceName" TEXT,
  "reference" TEXT,
  "note" TEXT,
  "settledAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SupplierReturnSettlement_type_check" CHECK ("type" IN ('PAYABLE_REDUCTION','SUPPLIER_CREDIT','REFUND')),
  CONSTRAINT "SupplierReturnSettlement_amount_check" CHECK ("amount" > 0),
  CONSTRAINT "SupplierReturnSettlement_accountType_check" CHECK ("accountType" IS NULL OR "accountType" IN ('DRAWER','WALLET','OTHER')),
  CONSTRAINT "SupplierReturnSettlement_refund_account_check" CHECK (
    ("type" = 'REFUND' AND "accountType" IS NOT NULL)
    OR ("type" <> 'REFUND' AND "accountType" IS NULL AND "walletId" IS NULL)
  ),
  CONSTRAINT "SupplierReturnSettlement_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "SupplierReturnSettlement_supplierReturnId_fkey" FOREIGN KEY ("supplierReturnId") REFERENCES "SupplierReturn"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "SupplierReturnSettlement_purchaseInvoiceId_fkey" FOREIGN KEY ("purchaseInvoiceId") REFERENCES "PurchaseInvoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "SupplierReturnSettlement_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "SupplierReturnSettlement_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "SupplierReturnSettlement_shopId_requestKey_key"
  ON "SupplierReturnSettlement" ("shopId", "requestKey");
CREATE INDEX IF NOT EXISTS "SupplierReturnSettlement_shopId_supplierReturnId_settledAt_idx"
  ON "SupplierReturnSettlement" ("shopId", "supplierReturnId", "settledAt" DESC);
CREATE INDEX IF NOT EXISTS "SupplierReturnSettlement_shopId_supplierId_type_idx"
  ON "SupplierReturnSettlement" ("shopId", "supplierId", "type", "settledAt" DESC);

ALTER TABLE "InventoryMovement"
  ADD COLUMN IF NOT EXISTS "purchaseReceiptId" UUID,
  ADD COLUMN IF NOT EXISTS "purchaseReceiptItemId" UUID,
  ADD COLUMN IF NOT EXISTS "supplierReturnId" UUID,
  ADD COLUMN IF NOT EXISTS "supplierReturnItemId" UUID;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'InventoryMovement_purchaseReceiptId_fkey') THEN
    ALTER TABLE "InventoryMovement" ADD CONSTRAINT "InventoryMovement_purchaseReceiptId_fkey"
      FOREIGN KEY ("purchaseReceiptId") REFERENCES "PurchaseReceipt"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'InventoryMovement_purchaseReceiptItemId_fkey') THEN
    ALTER TABLE "InventoryMovement" ADD CONSTRAINT "InventoryMovement_purchaseReceiptItemId_fkey"
      FOREIGN KEY ("purchaseReceiptItemId") REFERENCES "PurchaseReceiptItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'InventoryMovement_supplierReturnId_fkey') THEN
    ALTER TABLE "InventoryMovement" ADD CONSTRAINT "InventoryMovement_supplierReturnId_fkey"
      FOREIGN KEY ("supplierReturnId") REFERENCES "SupplierReturn"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'InventoryMovement_supplierReturnItemId_fkey') THEN
    ALTER TABLE "InventoryMovement" ADD CONSTRAINT "InventoryMovement_supplierReturnItemId_fkey"
      FOREIGN KEY ("supplierReturnItemId") REFERENCES "SupplierReturnItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "InventoryMovement_shopId_purchaseReceiptId_idx"
  ON "InventoryMovement" ("shopId", "purchaseReceiptId");
CREATE INDEX IF NOT EXISTS "InventoryMovement_shopId_supplierReturnId_idx"
  ON "InventoryMovement" ("shopId", "supplierReturnId");

-- These purchase-operation tables are server-only; every application query also scopes by shopId.
ALTER TABLE "PurchaseReceipt" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PurchaseReceiptItem" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "SupplierReturn" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "SupplierReturnItem" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "SupplierReturnSettlement" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "PurchaseReceipt" FROM anon, authenticated;
REVOKE ALL ON TABLE "PurchaseReceiptItem" FROM anon, authenticated;
REVOKE ALL ON TABLE "SupplierReturn" FROM anon, authenticated;
REVOKE ALL ON TABLE "SupplierReturnItem" FROM anon, authenticated;
REVOKE ALL ON TABLE "SupplierReturnSettlement" FROM anon, authenticated;
