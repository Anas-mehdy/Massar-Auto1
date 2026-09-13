CREATE OR REPLACE FUNCTION public."assertApprovedServiceLineCommercialFieldsImmutable"()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'pg_catalog', 'public'
AS $$
DECLARE
  commercial_changed BOOLEAN := FALSE;
BEGIN
  IF TG_TABLE_NAME = 'ServiceLaborLine' THEN
    commercial_changed :=
      NEW."description" IS DISTINCT FROM OLD."description"
      OR NEW."quantity" IS DISTINCT FROM OLD."quantity"
      OR NEW."unitPrice" IS DISTINCT FROM OLD."unitPrice"
      OR NEW."lineTotal" IS DISTINCT FROM OLD."lineTotal";
  ELSIF TG_TABLE_NAME = 'ServicePartLine' THEN
    commercial_changed :=
      NEW."partName" IS DISTINCT FROM OLD."partName"
      OR NEW."inventoryItemId" IS DISTINCT FROM OLD."inventoryItemId"
      OR NEW."quantity" IS DISTINCT FROM OLD."quantity"
      OR NEW."unitPrice" IS DISTINCT FROM OLD."unitPrice"
      OR NEW."lineTotal" IS DISTINCT FROM OLD."lineTotal";
  END IF;

  IF NOT commercial_changed THEN
    RETURN NEW;
  END IF;

  PERFORM 1
  FROM public."ServiceOrder" so
  WHERE so."id" = NEW."serviceOrderId"
    AND so."shopId" = NEW."shopId"
    AND so."deletedAt" IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Service order does not exist in this shop';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public."ServiceWarrantyClaim" wc
    WHERE wc."shopId" = NEW."shopId"
      AND wc."followUpServiceOrderId" = NEW."serviceOrderId"
      AND wc."coverageDecision" IN ('COVERED', 'PARTIAL', 'CUSTOMER_PAY')
      AND wc."status" IN ('APPROVED', 'IN_SERVICE', 'RESOLVED', 'CLOSED')
  ) THEN
    RETURN NEW;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public."CustomerApproval" ca
    WHERE ca."shopId" = NEW."shopId"
      AND ca."serviceOrderId" = NEW."serviceOrderId"
      AND ca."decision" IN ('APPROVED', 'PARTIALLY_APPROVED')
  ) THEN
    RAISE EXCEPTION 'Customer-approved service line commercial fields are immutable; create a new authorization for changed work';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS "ServiceLaborLine_freeze_approved_commercial_fields" ON public."ServiceLaborLine";
CREATE TRIGGER "ServiceLaborLine_freeze_approved_commercial_fields"
BEFORE UPDATE ON public."ServiceLaborLine"
FOR EACH ROW
EXECUTE FUNCTION public."assertApprovedServiceLineCommercialFieldsImmutable"();

DROP TRIGGER IF EXISTS "ServicePartLine_freeze_approved_commercial_fields" ON public."ServicePartLine";
CREATE TRIGGER "ServicePartLine_freeze_approved_commercial_fields"
BEFORE UPDATE ON public."ServicePartLine"
FOR EACH ROW
EXECUTE FUNCTION public."assertApprovedServiceLineCommercialFieldsImmutable"();
