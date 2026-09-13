CREATE OR REPLACE FUNCTION public."assertServiceOrderInitialStatus"()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO pg_catalog, public
AS $$
BEGIN
  IF NEW."status" IS DISTINCT FROM 'RECEIVED' THEN
    RAISE EXCEPTION 'Service orders must be created in RECEIVED status'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS "ServiceOrder_require_received_initial_status" ON public."ServiceOrder";
CREATE TRIGGER "ServiceOrder_require_received_initial_status"
BEFORE INSERT ON public."ServiceOrder"
FOR EACH ROW
EXECUTE FUNCTION public."assertServiceOrderInitialStatus"();

REVOKE ALL ON FUNCTION public."assertServiceOrderInitialStatus"() FROM PUBLIC;
REVOKE ALL ON FUNCTION public."assertServiceOrderInitialStatus"() FROM anon;
REVOKE ALL ON FUNCTION public."assertServiceOrderInitialStatus"() FROM authenticated;
