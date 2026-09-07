-- Purchase receiving integrity hardening: moving weighted-average costing, immutable
-- purchase-cost allocation snapshots, strict idempotency fingerprints, draft OCC,
-- return financial/inventory value separation, and composite tenant FKs.
-- Additive/precision-widening only. DO NOT run on production before isolated verification.

-- Current InventoryItem.unitCost values are the declared starting moving averages.
-- No historical movements or snapshots are recalculated by this migration.
ALTER TABLE "InventoryItem"
  ALTER COLUMN "unitCost" TYPE DECIMAL(18,6) USING "unitCost"::DECIMAL(18,6),
  ADD COLUMN IF NOT EXISTS "salePriceConfigured" BOOLEAN NOT NULL DEFAULT TRUE;

ALTER TABLE "InventoryMovement"
  ALTER COLUMN "unitCostSnapshot" TYPE DECIMAL(18,6) USING "unitCostSnapshot"::DECIMAL(18,6);

-- Repair item snapshots and legacy damage snapshots are also cost-history fields.
-- Widen precision only; never recompute or round historical values.
ALTER TABLE "RepairOrderItem"
  ALTER COLUMN "unitCost" TYPE DECIMAL(18,6) USING "unitCost"::DECIMAL(18,6);

ALTER TABLE IF EXISTS "InventoryDamage"
  ALTER COLUMN "unitCostSnapshot" TYPE DECIMAL(18,6) USING "unitCostSnapshot"::DECIMAL(18,6);

ALTER TABLE "PurchaseInvoice"
  ADD COLUMN IF NOT EXISTS "postingFingerprint" CHAR(64),
  ADD COLUMN IF NOT EXISTS "costAllocatedAt" TIMESTAMP(3);

ALTER TABLE "PurchaseItem"
  ALTER COLUMN "unitCost" TYPE DECIMAL(18,6) USING "unitCost"::DECIMAL(18,6),
  ADD COLUMN IF NOT EXISTS "manualExtraCostAllocation" DECIMAL(14,2),
  ADD COLUMN IF NOT EXISTS "discountAllocation" DECIMAL(14,2),
  ADD COLUMN IF NOT EXISTS "netMerchandiseValue" DECIMAL(14,2),
  ADD COLUMN IF NOT EXISTS "netUnitCost" DECIMAL(18,6),
  ADD COLUMN IF NOT EXISTS "extraCostAllocation" DECIMAL(14,2),
  ADD COLUMN IF NOT EXISTS "capitalizedLineValue" DECIMAL(14,2),
  ADD COLUMN IF NOT EXISTS "capitalizedUnitCost" DECIMAL(18,6),
  ADD COLUMN IF NOT EXISTS "receivedCapitalizedValue" DECIMAL(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "receivedNetMerchandiseValue" DECIMAL(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "returnedNetMerchandiseValue" DECIMAL(14,2) NOT NULL DEFAULT 0;

ALTER TABLE "PurchasePayment"
  ADD COLUMN IF NOT EXISTS "requestFingerprint" CHAR(64);

ALTER TABLE "PurchaseReceipt"
  ADD COLUMN IF NOT EXISTS "requestFingerprint" CHAR(64);

ALTER TABLE "PurchaseReceiptItem"
  ALTER COLUMN "unitCostSnapshot" TYPE DECIMAL(18,6) USING "unitCostSnapshot"::DECIMAL(18,6),
  ADD COLUMN IF NOT EXISTS "netMerchandiseValue" DECIMAL(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "capitalizedValue" DECIMAL(14,2) NOT NULL DEFAULT 0;

ALTER TABLE "SupplierReturn"
  ADD COLUMN IF NOT EXISTS "requestFingerprint" CHAR(64),
  ADD COLUMN IF NOT EXISTS "baseSettlementValue" DECIMAL(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "inventoryValue" DECIMAL(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "shippingRefundValue" DECIMAL(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "settlementAdjustmentValue" DECIMAL(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "settlementAdjustmentReason" TEXT,
  ADD COLUMN IF NOT EXISTS "settlementAdjustedByUserId" UUID;

ALTER TABLE "SupplierReturnItem"
  ALTER COLUMN "unitCostSnapshot" TYPE DECIMAL(18,6) USING "unitCostSnapshot"::DECIMAL(18,6),
  ADD COLUMN IF NOT EXISTS "inventoryValue" DECIMAL(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "netMerchandiseValue" DECIMAL(14,2) NOT NULL DEFAULT 0;

ALTER TABLE "SupplierReturnSettlement"
  ADD COLUMN IF NOT EXISTS "requestFingerprint" CHAR(64);

ALTER TABLE "PurchaseImportExtractionAttempt"
  ADD COLUMN IF NOT EXISTS "requestFingerprint" CHAR(64);

ALTER TABLE "PurchaseImportSource"
  ADD COLUMN IF NOT EXISTS "activeExtractionAttemptId" UUID;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='SupplierReturn_settlementAdjustedByUserId_fkey') THEN
    ALTER TABLE "SupplierReturn" ADD CONSTRAINT "SupplierReturn_settlementAdjustedByUserId_fkey"
      FOREIGN KEY ("settlementAdjustedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='PurchaseItem_cost_allocations_check') THEN
    ALTER TABLE "PurchaseItem" ADD CONSTRAINT "PurchaseItem_cost_allocations_check" CHECK (
      ("manualExtraCostAllocation" IS NULL OR "manualExtraCostAllocation" >= 0)
      AND ("discountAllocation" IS NULL OR "discountAllocation" >= 0)
      AND ("netMerchandiseValue" IS NULL OR "netMerchandiseValue" >= 0)
      AND ("netUnitCost" IS NULL OR "netUnitCost" >= 0)
      AND ("extraCostAllocation" IS NULL OR "extraCostAllocation" >= 0)
      AND ("capitalizedLineValue" IS NULL OR "capitalizedLineValue" >= 0)
      AND ("capitalizedUnitCost" IS NULL OR "capitalizedUnitCost" >= 0)
      AND "receivedCapitalizedValue" >= 0
      AND "receivedNetMerchandiseValue" >= 0
      AND "returnedNetMerchandiseValue" >= 0
    );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='SupplierReturn_values_check') THEN
    ALTER TABLE "SupplierReturn" ADD CONSTRAINT "SupplierReturn_values_check" CHECK (
      "baseSettlementValue" >= 0 AND "inventoryValue" >= 0 AND "shippingRefundValue" >= 0 AND "totalValue" >= 0
    );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='SupplierReturn_adjustment_reason_check') THEN
    ALTER TABLE "SupplierReturn" ADD CONSTRAINT "SupplierReturn_adjustment_reason_check" CHECK (
      ("shippingRefundValue" = 0 AND "settlementAdjustmentValue" = 0)
      OR ("settlementAdjustmentReason" IS NOT NULL AND btrim("settlementAdjustmentReason") <> '')
    );
  END IF;
END $$;

-- Composite uniqueness provides FK targets that include tenant identity.
CREATE UNIQUE INDEX IF NOT EXISTS "PurchaseInvoice_shopId_id_key" ON "PurchaseInvoice"("shopId","id");
CREATE UNIQUE INDEX IF NOT EXISTS "PurchaseItem_shopId_id_key" ON "PurchaseItem"("shopId","id");
CREATE UNIQUE INDEX IF NOT EXISTS "PurchaseReceipt_shopId_id_key" ON "PurchaseReceipt"("shopId","id");
CREATE UNIQUE INDEX IF NOT EXISTS "SupplierReturn_shopId_id_key" ON "SupplierReturn"("shopId","id");
CREATE UNIQUE INDEX IF NOT EXISTS "PurchaseImportSource_shopId_id_key" ON "PurchaseImportSource"("shopId","id");
CREATE UNIQUE INDEX IF NOT EXISTS "PurchaseImportExtractionAttempt_shopId_id_key" ON "PurchaseImportExtractionAttempt"("shopId","id");
CREATE UNIQUE INDEX IF NOT EXISTS "Supplier_shopId_id_key" ON "Supplier"("shopId","id");
CREATE UNIQUE INDEX IF NOT EXISTS "InventoryItem_shopId_id_key" ON "InventoryItem"("shopId","id");
CREATE UNIQUE INDEX IF NOT EXISTS "InventoryCategory_shopId_id_key" ON "InventoryCategory"("shopId","id");
CREATE UNIQUE INDEX IF NOT EXISTS "PurchaseReceiptItem_shopId_id_key" ON "PurchaseReceiptItem"("shopId","id");
CREATE UNIQUE INDEX IF NOT EXISTS "SupplierReturnItem_shopId_id_key" ON "SupplierReturnItem"("shopId","id");
CREATE UNIQUE INDEX IF NOT EXISTS "FinancialWallet_shopId_id_key" ON "FinancialWallet"("shopId","id");

-- Tenant-preserving FKs. Keep legacy single-column FKs for compatibility; these
-- additional constraints ensure a child cannot point at another shop's parent.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='PurchaseInvoice_shop_supplier_fkey') THEN
    ALTER TABLE "PurchaseInvoice" ADD CONSTRAINT "PurchaseInvoice_shop_supplier_fkey"
      FOREIGN KEY ("shopId","supplierId") REFERENCES "Supplier"("shopId","id") ON DELETE SET NULL ("supplierId") ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='PurchaseItem_shop_purchaseInvoice_fkey') THEN
    ALTER TABLE "PurchaseItem" ADD CONSTRAINT "PurchaseItem_shop_purchaseInvoice_fkey"
      FOREIGN KEY ("shopId","purchaseInvoiceId") REFERENCES "PurchaseInvoice"("shopId","id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='PurchaseItem_shop_inventoryItem_fkey') THEN
    ALTER TABLE "PurchaseItem" ADD CONSTRAINT "PurchaseItem_shop_inventoryItem_fkey"
      FOREIGN KEY ("shopId","inventoryItemId") REFERENCES "InventoryItem"("shopId","id") ON DELETE SET NULL ("inventoryItemId") ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='PurchaseItem_shop_newItemCategory_fkey') THEN
    ALTER TABLE "PurchaseItem" ADD CONSTRAINT "PurchaseItem_shop_newItemCategory_fkey"
      FOREIGN KEY ("shopId","newItemCategoryId") REFERENCES "InventoryCategory"("shopId","id") ON DELETE SET NULL ("newItemCategoryId") ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='PurchaseItem_shop_importSource_fkey') THEN
    ALTER TABLE "PurchaseItem" ADD CONSTRAINT "PurchaseItem_shop_importSource_fkey"
      FOREIGN KEY ("shopId","importSourceId") REFERENCES "PurchaseImportSource"("shopId","id") ON DELETE SET NULL ("importSourceId") ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='PurchasePayment_shop_purchaseInvoice_fkey') THEN
    ALTER TABLE "PurchasePayment" ADD CONSTRAINT "PurchasePayment_shop_purchaseInvoice_fkey"
      FOREIGN KEY ("shopId","purchaseInvoiceId") REFERENCES "PurchaseInvoice"("shopId","id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='PurchasePayment_shop_wallet_fkey') THEN
    ALTER TABLE "PurchasePayment" ADD CONSTRAINT "PurchasePayment_shop_wallet_fkey"
      FOREIGN KEY ("shopId","walletId") REFERENCES "FinancialWallet"("shopId","id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='PurchaseReceipt_shop_purchaseInvoice_fkey') THEN
    ALTER TABLE "PurchaseReceipt" ADD CONSTRAINT "PurchaseReceipt_shop_purchaseInvoice_fkey"
      FOREIGN KEY ("shopId","purchaseInvoiceId") REFERENCES "PurchaseInvoice"("shopId","id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='PurchaseReceiptItem_shop_receipt_fkey') THEN
    ALTER TABLE "PurchaseReceiptItem" ADD CONSTRAINT "PurchaseReceiptItem_shop_receipt_fkey"
      FOREIGN KEY ("shopId","purchaseReceiptId") REFERENCES "PurchaseReceipt"("shopId","id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='PurchaseReceiptItem_shop_purchaseItem_fkey') THEN
    ALTER TABLE "PurchaseReceiptItem" ADD CONSTRAINT "PurchaseReceiptItem_shop_purchaseItem_fkey"
      FOREIGN KEY ("shopId","purchaseItemId") REFERENCES "PurchaseItem"("shopId","id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='PurchaseReceiptItem_shop_inventoryItem_fkey') THEN
    ALTER TABLE "PurchaseReceiptItem" ADD CONSTRAINT "PurchaseReceiptItem_shop_inventoryItem_fkey"
      FOREIGN KEY ("shopId","inventoryItemId") REFERENCES "InventoryItem"("shopId","id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='SupplierReturn_shop_purchaseInvoice_fkey') THEN
    ALTER TABLE "SupplierReturn" ADD CONSTRAINT "SupplierReturn_shop_purchaseInvoice_fkey"
      FOREIGN KEY ("shopId","purchaseInvoiceId") REFERENCES "PurchaseInvoice"("shopId","id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='SupplierReturn_shop_supplier_fkey') THEN
    ALTER TABLE "SupplierReturn" ADD CONSTRAINT "SupplierReturn_shop_supplier_fkey"
      FOREIGN KEY ("shopId","supplierId") REFERENCES "Supplier"("shopId","id") ON DELETE SET NULL ("supplierId") ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='SupplierReturnItem_shop_return_fkey') THEN
    ALTER TABLE "SupplierReturnItem" ADD CONSTRAINT "SupplierReturnItem_shop_return_fkey"
      FOREIGN KEY ("shopId","supplierReturnId") REFERENCES "SupplierReturn"("shopId","id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='SupplierReturnItem_shop_purchaseItem_fkey') THEN
    ALTER TABLE "SupplierReturnItem" ADD CONSTRAINT "SupplierReturnItem_shop_purchaseItem_fkey"
      FOREIGN KEY ("shopId","purchaseItemId") REFERENCES "PurchaseItem"("shopId","id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='SupplierReturnItem_shop_inventoryItem_fkey') THEN
    ALTER TABLE "SupplierReturnItem" ADD CONSTRAINT "SupplierReturnItem_shop_inventoryItem_fkey"
      FOREIGN KEY ("shopId","inventoryItemId") REFERENCES "InventoryItem"("shopId","id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='SupplierReturnSettlement_shop_return_fkey') THEN
    ALTER TABLE "SupplierReturnSettlement" ADD CONSTRAINT "SupplierReturnSettlement_shop_return_fkey"
      FOREIGN KEY ("shopId","supplierReturnId") REFERENCES "SupplierReturn"("shopId","id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='SupplierReturnSettlement_shop_purchaseInvoice_fkey') THEN
    ALTER TABLE "SupplierReturnSettlement" ADD CONSTRAINT "SupplierReturnSettlement_shop_purchaseInvoice_fkey"
      FOREIGN KEY ("shopId","purchaseInvoiceId") REFERENCES "PurchaseInvoice"("shopId","id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='SupplierReturnSettlement_shop_supplier_fkey') THEN
    ALTER TABLE "SupplierReturnSettlement" ADD CONSTRAINT "SupplierReturnSettlement_shop_supplier_fkey"
      FOREIGN KEY ("shopId","supplierId") REFERENCES "Supplier"("shopId","id") ON DELETE SET NULL ("supplierId") ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='SupplierReturnSettlement_shop_wallet_fkey') THEN
    ALTER TABLE "SupplierReturnSettlement" ADD CONSTRAINT "SupplierReturnSettlement_shop_wallet_fkey"
      FOREIGN KEY ("shopId","walletId") REFERENCES "FinancialWallet"("shopId","id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='PurchaseImportSource_shop_purchaseInvoice_fkey') THEN
    ALTER TABLE "PurchaseImportSource" ADD CONSTRAINT "PurchaseImportSource_shop_purchaseInvoice_fkey"
      FOREIGN KEY ("shopId","purchaseInvoiceId") REFERENCES "PurchaseInvoice"("shopId","id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='PurchaseImportExtractionAttempt_shop_source_fkey') THEN
    ALTER TABLE "PurchaseImportExtractionAttempt" ADD CONSTRAINT "PurchaseImportExtractionAttempt_shop_source_fkey"
      FOREIGN KEY ("shopId","sourceId") REFERENCES "PurchaseImportSource"("shopId","id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='PurchaseImportSource_shop_activeAttempt_fkey') THEN
    ALTER TABLE "PurchaseImportSource" ADD CONSTRAINT "PurchaseImportSource_shop_activeAttempt_fkey"
      FOREIGN KEY ("shopId","activeExtractionAttemptId") REFERENCES "PurchaseImportExtractionAttempt"("shopId","id") ON DELETE SET NULL ("activeExtractionAttemptId") ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='SupplierItemAlias_shop_supplier_fkey') THEN
    ALTER TABLE "SupplierItemAlias" ADD CONSTRAINT "SupplierItemAlias_shop_supplier_fkey"
      FOREIGN KEY ("shopId","supplierId") REFERENCES "Supplier"("shopId","id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='SupplierItemAlias_shop_inventoryItem_fkey') THEN
    ALTER TABLE "SupplierItemAlias" ADD CONSTRAINT "SupplierItemAlias_shop_inventoryItem_fkey"
      FOREIGN KEY ("shopId","inventoryItemId") REFERENCES "InventoryItem"("shopId","id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='InventoryMovement_shop_purchaseInvoice_fkey') THEN
    ALTER TABLE "InventoryMovement" ADD CONSTRAINT "InventoryMovement_shop_purchaseInvoice_fkey"
      FOREIGN KEY ("shopId","purchaseInvoiceId") REFERENCES "PurchaseInvoice"("shopId","id") ON DELETE SET NULL ("purchaseInvoiceId") ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='InventoryMovement_shop_purchaseItem_fkey') THEN
    ALTER TABLE "InventoryMovement" ADD CONSTRAINT "InventoryMovement_shop_purchaseItem_fkey"
      FOREIGN KEY ("shopId","purchaseItemId") REFERENCES "PurchaseItem"("shopId","id") ON DELETE SET NULL ("purchaseItemId") ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='InventoryMovement_shop_purchaseReceipt_fkey') THEN
    ALTER TABLE "InventoryMovement" ADD CONSTRAINT "InventoryMovement_shop_purchaseReceipt_fkey"
      FOREIGN KEY ("shopId","purchaseReceiptId") REFERENCES "PurchaseReceipt"("shopId","id") ON DELETE SET NULL ("purchaseReceiptId") ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='InventoryMovement_shop_purchaseReceiptItem_fkey') THEN
    ALTER TABLE "InventoryMovement" ADD CONSTRAINT "InventoryMovement_shop_purchaseReceiptItem_fkey"
      FOREIGN KEY ("shopId","purchaseReceiptItemId") REFERENCES "PurchaseReceiptItem"("shopId","id") ON DELETE SET NULL ("purchaseReceiptItemId") ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='InventoryMovement_shop_supplierReturn_fkey') THEN
    ALTER TABLE "InventoryMovement" ADD CONSTRAINT "InventoryMovement_shop_supplierReturn_fkey"
      FOREIGN KEY ("shopId","supplierReturnId") REFERENCES "SupplierReturn"("shopId","id") ON DELETE SET NULL ("supplierReturnId") ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='InventoryMovement_shop_supplierReturnItem_fkey') THEN
    ALTER TABLE "InventoryMovement" ADD CONSTRAINT "InventoryMovement_shop_supplierReturnItem_fkey"
      FOREIGN KEY ("shopId","supplierReturnItemId") REFERENCES "SupplierReturnItem"("shopId","id") ON DELETE SET NULL ("supplierReturnItemId") ON UPDATE CASCADE;
  END IF;
END $$;

-- Purchase-domain tables are intentionally server-only. App-level authorization
-- remains in services; direct anon/authenticated SQL access is denied.
ALTER TABLE "PurchaseInvoice" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PurchaseItem" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PurchasePayment" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "PurchaseInvoice" FROM anon, authenticated;
REVOKE ALL ON TABLE "PurchaseItem" FROM anon, authenticated;
REVOKE ALL ON TABLE "PurchasePayment" FROM anon, authenticated;
