-- Prevent a single supplier-return transaction from applying multiple stale
-- stock snapshots to the same InventoryItem/WarehouseStock row.
--
-- Purchase invoices may intentionally contain the same inventory item on more
-- than one line (for example, different acquisition costs). Until the service
-- layer aggregates those lines before applying the stock delta, returning two
-- such lines in one SupplierReturn must fail atomically instead of risking a
-- lost decrement. Separate return operations remain valid.

CREATE OR REPLACE FUNCTION "guard_supplier_return_duplicate_inventory_item"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "SupplierReturnItem" existing
    WHERE existing."shopId" = NEW."shopId"
      AND existing."supplierReturnId" = NEW."supplierReturnId"
      AND existing."inventoryItemId" = NEW."inventoryItemId"
      AND existing."id" <> NEW."id"
  ) THEN
    RAISE EXCEPTION 'لا يمكن إرجاع سطرين من نفس صنف المخزون ضمن عملية مرتجع واحدة. سجّل كل بند في عملية مرتجع مستقلة.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS "SupplierReturnItem_duplicate_inventory_guard" ON "SupplierReturnItem";
CREATE TRIGGER "SupplierReturnItem_duplicate_inventory_guard"
BEFORE INSERT OR UPDATE OF "shopId", "supplierReturnId", "inventoryItemId"
ON "SupplierReturnItem"
FOR EACH ROW
EXECUTE FUNCTION "guard_supplier_return_duplicate_inventory_item"();

CREATE UNIQUE INDEX IF NOT EXISTS "SupplierReturnItem_return_inventory_key"
ON "SupplierReturnItem" ("shopId", "supplierReturnId", "inventoryItemId");
