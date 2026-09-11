ALTER TABLE "ServiceOrder"
  ADD COLUMN IF NOT EXISTS "closedByUserId" UUID;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ServiceOrder_closedByUserId_fkey'
  ) THEN
    ALTER TABLE "ServiceOrder"
      ADD CONSTRAINT "ServiceOrder_closedByUserId_fkey"
      FOREIGN KEY ("closedByUserId") REFERENCES "User"("id") ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "ServiceOrder_shop_closed_by_idx"
  ON "ServiceOrder" ("shopId", "closedByUserId")
  WHERE "closedByUserId" IS NOT NULL;

CREATE OR REPLACE FUNCTION "assertServiceOrderDeliveryCloseAudit"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW."status" = 'DELIVERED' AND OLD."status" IS DISTINCT FROM 'DELIVERED' THEN
    IF OLD."status" <> 'READY_FOR_DELIVERY' THEN
      RAISE EXCEPTION 'Service order can only be delivered from READY_FOR_DELIVERY';
    END IF;
    IF NEW."deliveredAt" IS NULL OR NEW."deliveredByUserId" IS NULL THEN
      RAISE EXCEPTION 'Vehicle delivery requires delivery audit data';
    END IF;
  END IF;

  IF NEW."status" = 'CLOSED' AND OLD."status" IS DISTINCT FROM 'CLOSED' THEN
    IF OLD."status" NOT IN ('DELIVERED', 'REJECTED') THEN
      RAISE EXCEPTION 'Service order can only be closed after delivery or rejection';
    END IF;
    IF NEW."closedAt" IS NULL OR NEW."closedByUserId" IS NULL THEN
      RAISE EXCEPTION 'Closing a service order requires close audit data';
    END IF;
    IF OLD."status" = 'DELIVERED' AND (NEW."deliveredAt" IS NULL OR NEW."deliveredByUserId" IS NULL) THEN
      RAISE EXCEPTION 'Delivered service order is missing delivery audit data';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS "ServiceOrder_require_delivery_close_audit" ON "ServiceOrder";
CREATE TRIGGER "ServiceOrder_require_delivery_close_audit"
BEFORE UPDATE OF "status" ON "ServiceOrder"
FOR EACH ROW
EXECUTE FUNCTION "assertServiceOrderDeliveryCloseAudit"();
