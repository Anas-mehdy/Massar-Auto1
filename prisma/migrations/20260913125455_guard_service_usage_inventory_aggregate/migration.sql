CREATE OR REPLACE FUNCTION public."assertServiceUsageInventoryAggregate"()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'pg_catalog', 'public'
AS $$
DECLARE
  inventory_quantity BIGINT;
  warehouse_quantity BIGINT;
BEGIN
  IF NEW."type"::text <> 'SERVICE_USAGE' THEN
    RETURN NEW;
  END IF;

  SELECT i."quantity"::bigint,
         COALESCE(SUM(ws."quantity"), 0)::bigint
  INTO inventory_quantity, warehouse_quantity
  FROM public."InventoryItem" i
  LEFT JOIN public."WarehouseStock" ws
    ON ws."shopId" = i."shopId"
   AND ws."inventoryItemId" = i."id"
  WHERE i."id" = NEW."inventoryItemId"
    AND i."shopId" = NEW."shopId"
    AND i."deletedAt" IS NULL
  GROUP BY i."quantity";

  IF inventory_quantity IS NULL THEN
    RAISE EXCEPTION 'Service usage references a missing inventory item in this shop';
  END IF;

  IF inventory_quantity <> warehouse_quantity THEN
    RAISE EXCEPTION 'Concurrent service stock update detected; inventory aggregate would become inconsistent';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS "WarehouseMovement_guard_service_usage_inventory_aggregate" ON public."WarehouseMovement";
CREATE TRIGGER "WarehouseMovement_guard_service_usage_inventory_aggregate"
BEFORE INSERT ON public."WarehouseMovement"
FOR EACH ROW
EXECUTE FUNCTION public."assertServiceUsageInventoryAggregate"();
