-- Keep purchase warehouse audit columns populated while the legacy purchase UI
-- still falls back to the shop default warehouse. Explicit warehouse choices
-- added by the application later always win because this trigger only fills NULL.

CREATE OR REPLACE FUNCTION public."fillPurchaseWarehouseDefault"()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW."warehouseId" IS NULL THEN
    SELECT w."id"
      INTO NEW."warehouseId"
    FROM "Warehouse" w
    WHERE w."shopId" = NEW."shopId"
      AND w."deletedAt" IS NULL
      AND w."isActive" = TRUE
      AND w."isDefault" = TRUE
    LIMIT 1;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS "PurchaseReceipt_fill_default_warehouse" ON "PurchaseReceipt";
CREATE TRIGGER "PurchaseReceipt_fill_default_warehouse"
BEFORE INSERT OR UPDATE OF "warehouseId"
ON "PurchaseReceipt"
FOR EACH ROW
EXECUTE FUNCTION public."fillPurchaseWarehouseDefault"();

DROP TRIGGER IF EXISTS "SupplierReturn_fill_default_warehouse" ON "SupplierReturn";
CREATE TRIGGER "SupplierReturn_fill_default_warehouse"
BEFORE INSERT OR UPDATE OF "warehouseId"
ON "SupplierReturn"
FOR EACH ROW
EXECUTE FUNCTION public."fillPurchaseWarehouseDefault"();

-- Backfill only when a concrete default warehouse already exists for the shop.
UPDATE "PurchaseReceipt" pr
SET "warehouseId" = w."id"
FROM "Warehouse" w
WHERE pr."warehouseId" IS NULL
  AND w."shopId" = pr."shopId"
  AND w."deletedAt" IS NULL
  AND w."isActive" = TRUE
  AND w."isDefault" = TRUE;

UPDATE "SupplierReturn" sr
SET "warehouseId" = w."id"
FROM "Warehouse" w
WHERE sr."warehouseId" IS NULL
  AND w."shopId" = sr."shopId"
  AND w."deletedAt" IS NULL
  AND w."isActive" = TRUE
  AND w."isDefault" = TRUE;
