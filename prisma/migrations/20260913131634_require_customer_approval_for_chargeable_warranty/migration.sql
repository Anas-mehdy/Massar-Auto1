CREATE OR REPLACE FUNCTION public."assertServiceOrderExecutionAuthorized"()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'pg_catalog', 'public'
AS $$
DECLARE
  approved_quotation_id UUID;
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

  -- A fully covered warranty creates no customer receivable, so the approved
  -- warranty claim itself is sufficient authorization to execute the follow-up.
  IF EXISTS (
    SELECT 1
    FROM public."ServiceWarrantyClaim" wc
    WHERE wc."shopId" = NEW."shopId"
      AND wc."followUpServiceOrderId" = NEW."id"
      AND wc."coverageDecision" = 'COVERED'
      AND wc."status" IN ('APPROVED', 'IN_SERVICE', 'RESOLVED', 'CLOSED')
  ) THEN
    RETURN NEW;
  END IF;

  -- Any normal repair, CUSTOMER_PAY warranty, or PARTIAL warranty with a
  -- customer receivable must have a customer-approved quotation.
  SELECT ca."quotationId"
  INTO approved_quotation_id
  FROM public."CustomerApproval" ca
  WHERE ca."shopId" = NEW."shopId"
    AND ca."serviceOrderId" = NEW."id"
    AND ca."decision" IN ('APPROVED', 'PARTIALLY_APPROVED')
  ORDER BY ca."decidedAt" DESC, ca."createdAt" DESC, ca."id" DESC
  LIMIT 1;

  IF approved_quotation_id IS NULL THEN
    RAISE EXCEPTION 'Chargeable service execution requires customer-approved quotation authorization';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public."ServiceLaborLine" sl
    WHERE sl."shopId" = NEW."shopId"
      AND sl."serviceOrderId" = NEW."id"
      AND sl."status" <> 'CANCELLED'
      AND NOT EXISTS (
        SELECT 1
        FROM public."QuotationLine" ql
        WHERE ql."shopId" = NEW."shopId"
          AND ql."quotationId" = approved_quotation_id
          AND ql."serviceLaborLineId" = sl."id"
          AND ql."lineType" = 'LABOR'
          AND ql."approvalStatus" = 'APPROVED'
          AND ql."description" = sl."description"
          AND ql."quantity" = sl."quantity"
          AND ql."unitPrice" = sl."unitPrice"
          AND ql."lineTotal" = sl."lineTotal"
      )
  ) THEN
    RAISE EXCEPTION 'Current labor work does not match the customer-approved quotation';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public."ServicePartLine" sp
    WHERE sp."shopId" = NEW."shopId"
      AND sp."serviceOrderId" = NEW."id"
      AND sp."status" <> 'CANCELLED'
      AND NOT EXISTS (
        SELECT 1
        FROM public."QuotationLine" ql
        WHERE ql."shopId" = NEW."shopId"
          AND ql."quotationId" = approved_quotation_id
          AND ql."servicePartLineId" = sp."id"
          AND ql."lineType" = 'PART'
          AND ql."approvalStatus" = 'APPROVED'
          AND ql."description" = sp."partName"
          AND ql."inventoryItemId" IS NOT DISTINCT FROM sp."inventoryItemId"
          AND ql."quantity" = sp."quantity"
          AND ql."unitPrice" = sp."unitPrice"
          AND ql."lineTotal" = sp."lineTotal"
      )
  ) THEN
    RAISE EXCEPTION 'Current parts work does not match the customer-approved quotation';
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public."assertNoPostApprovalServiceLineInsert"()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'pg_catalog', 'public'
AS $$
BEGIN
  PERFORM 1
  FROM public."ServiceOrder" so
  WHERE so."id" = NEW."serviceOrderId"
    AND so."shopId" = NEW."shopId"
    AND so."deletedAt" IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Service order does not exist in this shop';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public."CustomerApproval" ca
    WHERE ca."shopId" = NEW."shopId"
      AND ca."serviceOrderId" = NEW."serviceOrderId"
      AND ca."decision" IN ('APPROVED', 'PARTIALLY_APPROVED')
  ) THEN
    RETURN NEW;
  END IF;

  -- Only a zero-receivable fully covered warranty may continue receiving work
  -- lines without a customer-approved quotation lifecycle.
  IF EXISTS (
    SELECT 1
    FROM public."ServiceWarrantyClaim" wc
    WHERE wc."shopId" = NEW."shopId"
      AND wc."followUpServiceOrderId" = NEW."serviceOrderId"
      AND wc."coverageDecision" = 'COVERED'
      AND wc."status" IN ('APPROVED', 'IN_SERVICE', 'RESOLVED', 'CLOSED')
  ) THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'New service work requires a new customer authorization after the existing approval';
END;
$$;

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
      AND wc."coverageDecision" = 'COVERED'
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
