CREATE OR REPLACE FUNCTION public."assertServiceOrderExecutionAuthorized"()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'pg_catalog', 'public'
AS $$
BEGIN
  IF NEW."status" IS NOT DISTINCT FROM OLD."status" THEN
    RETURN NEW;
  END IF;

  IF NEW."status" NOT IN (
    'APPROVED',
    'IN_SERVICE',
    'WAITING_PARTS',
    'READY_FOR_DELIVERY',
    'DELIVERED',
    'CLOSED'
  ) THEN
    RETURN NEW;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public."CustomerApproval" ca
    WHERE ca."shopId" = NEW."shopId"
      AND ca."serviceOrderId" = NEW."id"
      AND ca."decision" IN ('APPROVED', 'PARTIALLY_APPROVED')
  ) THEN
    RETURN NEW;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public."ServiceWarrantyClaim" wc
    WHERE wc."shopId" = NEW."shopId"
      AND wc."followUpServiceOrderId" = NEW."id"
      AND wc."coverageDecision" IN ('COVERED', 'PARTIAL', 'CUSTOMER_PAY')
      AND wc."status" IN ('APPROVED', 'IN_SERVICE', 'RESOLVED', 'CLOSED')
  ) THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'Service execution requires customer approval or an authorized warranty follow-up';
END;
$$;

DROP TRIGGER IF EXISTS "ServiceOrder_require_execution_authorization" ON public."ServiceOrder";
CREATE TRIGGER "ServiceOrder_require_execution_authorization"
BEFORE UPDATE OF "status" ON public."ServiceOrder"
FOR EACH ROW
EXECUTE FUNCTION public."assertServiceOrderExecutionAuthorized"();
