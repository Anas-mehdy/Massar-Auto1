-- Massar Auto: multi-warehouse inventory foundation.
-- Additive: legacy InventoryItem.quantity / InventoryMovement remain untouched for compatibility.

CREATE TABLE "Warehouse" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "shopId" uuid NOT NULL,
  "code" varchar(40),
  "name" text NOT NULL,
  "location" text,
  "isDefault" boolean NOT NULL DEFAULT false,
  "isActive" boolean NOT NULL DEFAULT true,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  "deletedAt" timestamptz,
  CONSTRAINT "Warehouse_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE,
  CONSTRAINT "Warehouse_shop_id_key" UNIQUE ("shopId", "id")
);
CREATE UNIQUE INDEX "Warehouse_shop_code_active_key"
  ON "Warehouse" ("shopId", lower(btrim("code")))
  WHERE "code" IS NOT NULL AND btrim("code") <> '' AND "deletedAt" IS NULL;
CREATE UNIQUE INDEX "Warehouse_shop_name_active_key"
  ON "Warehouse" ("shopId", lower(btrim("name")))
  WHERE "deletedAt" IS NULL;
CREATE UNIQUE INDEX "Warehouse_one_default_per_shop_key"
  ON "Warehouse" ("shopId")
  WHERE "isDefault" = true AND "isActive" = true AND "deletedAt" IS NULL;
CREATE INDEX "Warehouse_shop_active_idx" ON "Warehouse" ("shopId", "isActive", "createdAt");

CREATE TABLE "WarehouseStock" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "shopId" uuid NOT NULL,
  "warehouseId" uuid NOT NULL,
  "inventoryItemId" uuid NOT NULL,
  "quantity" integer NOT NULL DEFAULT 0,
  "reservedQuantity" integer NOT NULL DEFAULT 0,
  "reorderLevel" integer NOT NULL DEFAULT 0,
  "averageCost" numeric(18,6),
  "lastCountedAt" timestamptz,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "WarehouseStock_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE,
  CONSTRAINT "WarehouseStock_warehouse_shop_fkey" FOREIGN KEY ("shopId", "warehouseId") REFERENCES "Warehouse"("shopId", "id") ON DELETE CASCADE,
  CONSTRAINT "WarehouseStock_inventoryItemId_fkey" FOREIGN KEY ("inventoryItemId") REFERENCES "InventoryItem"("id") ON DELETE RESTRICT,
  CONSTRAINT "WarehouseStock_quantity_check" CHECK ("quantity" >= 0),
  CONSTRAINT "WarehouseStock_reserved_check" CHECK ("reservedQuantity" >= 0 AND "reservedQuantity" <= "quantity"),
  CONSTRAINT "WarehouseStock_reorder_check" CHECK ("reorderLevel" >= 0),
  CONSTRAINT "WarehouseStock_cost_check" CHECK ("averageCost" IS NULL OR "averageCost" >= 0),
  CONSTRAINT "WarehouseStock_warehouse_item_key" UNIQUE ("warehouseId", "inventoryItemId"),
  CONSTRAINT "WarehouseStock_shop_id_key" UNIQUE ("shopId", "id")
);
CREATE INDEX "WarehouseStock_shop_item_idx" ON "WarehouseStock" ("shopId", "inventoryItemId");
CREATE INDEX "WarehouseStock_shop_low_stock_idx" ON "WarehouseStock" ("shopId", "warehouseId", "quantity", "reorderLevel");

CREATE TABLE "StockTransfer" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "shopId" uuid NOT NULL,
  "transferNumber" text NOT NULL,
  "fromWarehouseId" uuid NOT NULL,
  "toWarehouseId" uuid NOT NULL,
  "status" varchar(16) NOT NULL DEFAULT 'DRAFT',
  "notes" text,
  "createdByUserId" uuid,
  "postedByUserId" uuid,
  "postedAt" timestamptz,
  "cancelledAt" timestamptz,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "StockTransfer_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE,
  CONSTRAINT "StockTransfer_from_warehouse_shop_fkey" FOREIGN KEY ("shopId", "fromWarehouseId") REFERENCES "Warehouse"("shopId", "id") ON DELETE RESTRICT,
  CONSTRAINT "StockTransfer_to_warehouse_shop_fkey" FOREIGN KEY ("shopId", "toWarehouseId") REFERENCES "Warehouse"("shopId", "id") ON DELETE RESTRICT,
  CONSTRAINT "StockTransfer_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL,
  CONSTRAINT "StockTransfer_postedByUserId_fkey" FOREIGN KEY ("postedByUserId") REFERENCES "User"("id") ON DELETE SET NULL,
  CONSTRAINT "StockTransfer_different_warehouses_check" CHECK ("fromWarehouseId" <> "toWarehouseId"),
  CONSTRAINT "StockTransfer_status_check" CHECK ("status" IN ('DRAFT','POSTED','CANCELLED')),
  CONSTRAINT "StockTransfer_shop_number_key" UNIQUE ("shopId", "transferNumber"),
  CONSTRAINT "StockTransfer_shop_id_key" UNIQUE ("shopId", "id")
);
CREATE INDEX "StockTransfer_shop_status_idx" ON "StockTransfer" ("shopId", "status", "createdAt" DESC);
CREATE INDEX "StockTransfer_from_idx" ON "StockTransfer" ("shopId", "fromWarehouseId", "createdAt" DESC);
CREATE INDEX "StockTransfer_to_idx" ON "StockTransfer" ("shopId", "toWarehouseId", "createdAt" DESC);

CREATE TABLE "StockTransferItem" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "shopId" uuid NOT NULL,
  "stockTransferId" uuid NOT NULL,
  "inventoryItemId" uuid NOT NULL,
  "quantity" integer NOT NULL,
  "unitCostSnapshot" numeric(18,6),
  "notes" text,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "StockTransferItem_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE,
  CONSTRAINT "StockTransferItem_transfer_shop_fkey" FOREIGN KEY ("shopId", "stockTransferId") REFERENCES "StockTransfer"("shopId", "id") ON DELETE CASCADE,
  CONSTRAINT "StockTransferItem_inventoryItemId_fkey" FOREIGN KEY ("inventoryItemId") REFERENCES "InventoryItem"("id") ON DELETE RESTRICT,
  CONSTRAINT "StockTransferItem_quantity_check" CHECK ("quantity" > 0),
  CONSTRAINT "StockTransferItem_cost_check" CHECK ("unitCostSnapshot" IS NULL OR "unitCostSnapshot" >= 0),
  CONSTRAINT "StockTransferItem_transfer_item_key" UNIQUE ("stockTransferId", "inventoryItemId")
);
CREATE INDEX "StockTransferItem_transfer_idx" ON "StockTransferItem" ("shopId", "stockTransferId");
CREATE INDEX "StockTransferItem_item_idx" ON "StockTransferItem" ("shopId", "inventoryItemId");

CREATE TABLE "StockTake" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "shopId" uuid NOT NULL,
  "warehouseId" uuid NOT NULL,
  "stockTakeNumber" text NOT NULL,
  "status" varchar(16) NOT NULL DEFAULT 'DRAFT',
  "notes" text,
  "createdByUserId" uuid,
  "postedByUserId" uuid,
  "countedAt" timestamptz,
  "postedAt" timestamptz,
  "cancelledAt" timestamptz,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "StockTake_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE,
  CONSTRAINT "StockTake_warehouse_shop_fkey" FOREIGN KEY ("shopId", "warehouseId") REFERENCES "Warehouse"("shopId", "id") ON DELETE RESTRICT,
  CONSTRAINT "StockTake_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL,
  CONSTRAINT "StockTake_postedByUserId_fkey" FOREIGN KEY ("postedByUserId") REFERENCES "User"("id") ON DELETE SET NULL,
  CONSTRAINT "StockTake_status_check" CHECK ("status" IN ('DRAFT','COUNTING','COMPLETED','CANCELLED')),
  CONSTRAINT "StockTake_shop_number_key" UNIQUE ("shopId", "stockTakeNumber"),
  CONSTRAINT "StockTake_shop_id_key" UNIQUE ("shopId", "id")
);
CREATE INDEX "StockTake_shop_warehouse_idx" ON "StockTake" ("shopId", "warehouseId", "createdAt" DESC);
CREATE INDEX "StockTake_shop_status_idx" ON "StockTake" ("shopId", "status", "createdAt" DESC);

CREATE TABLE "StockTakeLine" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "shopId" uuid NOT NULL,
  "stockTakeId" uuid NOT NULL,
  "inventoryItemId" uuid NOT NULL,
  "systemQuantity" integer NOT NULL,
  "actualQuantity" integer NOT NULL,
  "difference" integer NOT NULL,
  "unitCostSnapshot" numeric(18,6),
  "notes" text,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "StockTakeLine_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE,
  CONSTRAINT "StockTakeLine_stock_take_shop_fkey" FOREIGN KEY ("shopId", "stockTakeId") REFERENCES "StockTake"("shopId", "id") ON DELETE CASCADE,
  CONSTRAINT "StockTakeLine_inventoryItemId_fkey" FOREIGN KEY ("inventoryItemId") REFERENCES "InventoryItem"("id") ON DELETE RESTRICT,
  CONSTRAINT "StockTakeLine_system_quantity_check" CHECK ("systemQuantity" >= 0),
  CONSTRAINT "StockTakeLine_actual_quantity_check" CHECK ("actualQuantity" >= 0),
  CONSTRAINT "StockTakeLine_difference_check" CHECK ("difference" = "actualQuantity" - "systemQuantity"),
  CONSTRAINT "StockTakeLine_cost_check" CHECK ("unitCostSnapshot" IS NULL OR "unitCostSnapshot" >= 0),
  CONSTRAINT "StockTakeLine_take_item_key" UNIQUE ("stockTakeId", "inventoryItemId")
);
CREATE INDEX "StockTakeLine_take_idx" ON "StockTakeLine" ("shopId", "stockTakeId");
CREATE INDEX "StockTakeLine_item_idx" ON "StockTakeLine" ("shopId", "inventoryItemId");

CREATE TABLE "WarehouseMovement" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "shopId" uuid NOT NULL,
  "warehouseId" uuid NOT NULL,
  "inventoryItemId" uuid NOT NULL,
  "type" varchar(32) NOT NULL,
  "quantityChange" integer NOT NULL,
  "quantityBefore" integer NOT NULL,
  "quantityAfter" integer NOT NULL,
  "unitCostSnapshot" numeric(18,6),
  "serviceOrderId" uuid,
  "servicePartLineId" uuid,
  "saleId" uuid,
  "purchaseInvoiceId" uuid,
  "supplierReturnId" uuid,
  "stockTransferId" uuid,
  "stockTakeId" uuid,
  "createdByUserId" uuid,
  "reference" text,
  "note" text,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "WarehouseMovement_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE,
  CONSTRAINT "WarehouseMovement_warehouse_shop_fkey" FOREIGN KEY ("shopId", "warehouseId") REFERENCES "Warehouse"("shopId", "id") ON DELETE RESTRICT,
  CONSTRAINT "WarehouseMovement_inventoryItemId_fkey" FOREIGN KEY ("inventoryItemId") REFERENCES "InventoryItem"("id") ON DELETE RESTRICT,
  CONSTRAINT "WarehouseMovement_service_order_shop_fkey" FOREIGN KEY ("shopId", "serviceOrderId") REFERENCES "ServiceOrder"("shopId", "id") ON DELETE SET NULL,
  CONSTRAINT "WarehouseMovement_service_part_shop_fkey" FOREIGN KEY ("shopId", "servicePartLineId") REFERENCES "ServicePartLine"("shopId", "id") ON DELETE SET NULL,
  CONSTRAINT "WarehouseMovement_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "Sale"("id") ON DELETE SET NULL,
  CONSTRAINT "WarehouseMovement_purchaseInvoiceId_fkey" FOREIGN KEY ("purchaseInvoiceId") REFERENCES "PurchaseInvoice"("id") ON DELETE SET NULL,
  CONSTRAINT "WarehouseMovement_supplierReturnId_fkey" FOREIGN KEY ("supplierReturnId") REFERENCES "SupplierReturn"("id") ON DELETE SET NULL,
  CONSTRAINT "WarehouseMovement_transfer_shop_fkey" FOREIGN KEY ("shopId", "stockTransferId") REFERENCES "StockTransfer"("shopId", "id") ON DELETE SET NULL,
  CONSTRAINT "WarehouseMovement_stock_take_shop_fkey" FOREIGN KEY ("shopId", "stockTakeId") REFERENCES "StockTake"("shopId", "id") ON DELETE SET NULL,
  CONSTRAINT "WarehouseMovement_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL,
  CONSTRAINT "WarehouseMovement_type_check" CHECK ("type" IN (
    'PURCHASE_IN','SALE_OUT','SERVICE_USAGE','SERVICE_RETURN','TRANSFER_IN','TRANSFER_OUT',
    'SUPPLIER_RETURN','STOCKTAKE_GAIN','STOCKTAKE_LOSS','ADJUSTMENT_IN','ADJUSTMENT_OUT'
  )),
  CONSTRAINT "WarehouseMovement_nonzero_check" CHECK ("quantityChange" <> 0),
  CONSTRAINT "WarehouseMovement_quantities_check" CHECK ("quantityBefore" >= 0 AND "quantityAfter" >= 0 AND "quantityAfter" = "quantityBefore" + "quantityChange"),
  CONSTRAINT "WarehouseMovement_cost_check" CHECK ("unitCostSnapshot" IS NULL OR "unitCostSnapshot" >= 0)
);
CREATE INDEX "WarehouseMovement_stock_history_idx" ON "WarehouseMovement" ("shopId", "warehouseId", "inventoryItemId", "createdAt" DESC);
CREATE INDEX "WarehouseMovement_service_order_idx" ON "WarehouseMovement" ("shopId", "serviceOrderId", "createdAt" DESC);
CREATE INDEX "WarehouseMovement_sale_idx" ON "WarehouseMovement" ("shopId", "saleId");
CREATE INDEX "WarehouseMovement_purchase_idx" ON "WarehouseMovement" ("shopId", "purchaseInvoiceId");
CREATE INDEX "WarehouseMovement_transfer_idx" ON "WarehouseMovement" ("shopId", "stockTransferId");
CREATE INDEX "WarehouseMovement_stock_take_idx" ON "WarehouseMovement" ("shopId", "stockTakeId");

ALTER TABLE "Warehouse" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "WarehouseStock" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "StockTransfer" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "StockTransferItem" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "StockTake" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "StockTakeLine" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "WarehouseMovement" ENABLE ROW LEVEL SECURITY;
