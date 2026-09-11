CREATE OR REPLACE FUNCTION "assertServiceOrderLinesNotInvoiced"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  target_service_order_id UUID;
  target_shop_id UUID;
BEGIN
  target_service_order_id := COALESCE(NEW."serviceOrderId", OLD."serviceOrderId");
  target_shop_id := COALESCE(NEW."shopId", OLD."shopId");

  IF EXISTS (
    SELECT 1
    FROM "Invoice" inv
    WHERE inv."shopId" = target_shop_id
      AND inv."serviceOrderId" = target_service_order_id
      AND inv."deletedAt" IS NULL
      AND inv."status" <> 'VOID'::"InvoiceStatus"
  ) THEN
    RAISE EXCEPTION 'Service order lines are locked after an active invoice is issued';
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS "ServiceLaborLine_lock_after_invoice" ON "ServiceLaborLine";
CREATE TRIGGER "ServiceLaborLine_lock_after_invoice"
BEFORE INSERT OR UPDATE OR DELETE ON "ServiceLaborLine"
FOR EACH ROW
EXECUTE FUNCTION "assertServiceOrderLinesNotInvoiced"();

DROP TRIGGER IF EXISTS "ServicePartLine_lock_after_invoice" ON "ServicePartLine";
CREATE TRIGGER "ServicePartLine_lock_after_invoice"
BEFORE INSERT OR UPDATE OR DELETE ON "ServicePartLine"
FOR EACH ROW
EXECUTE FUNCTION "assertServiceOrderLinesNotInvoiced"();
