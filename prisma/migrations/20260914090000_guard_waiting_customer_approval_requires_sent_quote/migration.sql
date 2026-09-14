CREATE OR REPLACE FUNCTION public.guard_service_order_waiting_customer_approval()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF NEW."status" = 'WAITING_CUSTOMER_APPROVAL'
     AND OLD."status" IS DISTINCT FROM NEW."status" THEN
    IF NOT EXISTS (
      SELECT 1
      FROM public."Quotation" q
      WHERE q."shopId" = NEW."shopId"
        AND q."serviceOrderId" = NEW."id"
        AND q."status" = 'SENT'
    ) THEN
      RAISE EXCEPTION USING
        ERRCODE = '23514',
        MESSAGE = 'WAITING_CUSTOMER_APPROVAL requires a sent quotation for the same service order';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_service_order_waiting_customer_approval() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.guard_service_order_waiting_customer_approval() FROM anon;
REVOKE ALL ON FUNCTION public.guard_service_order_waiting_customer_approval() FROM authenticated;

DROP TRIGGER IF EXISTS "ServiceOrder_waiting_customer_approval_guard" ON public."ServiceOrder";
CREATE TRIGGER "ServiceOrder_waiting_customer_approval_guard"
BEFORE UPDATE OF "status" ON public."ServiceOrder"
FOR EACH ROW
EXECUTE FUNCTION public.guard_service_order_waiting_customer_approval();
