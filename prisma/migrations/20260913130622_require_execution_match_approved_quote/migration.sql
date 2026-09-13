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

  -- Warranty follow-up orders use the approved claim as their authorization
  -- source and do not require a normal customer quotation approval.
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

  SELECT ca."quotationId"
  INTO approved_quotation_id
  FROM public."CustomerApproval" ca
  WHERE ca."shopId" = NEW."shopId"
    AND ca."serviceOrderId" = NEW."id"
    AND ca."decision" IN ('APPROVED', 'PARTIALLY_APPROVED')
  ORDER BY ca."decidedAt" DESC, ca."createdAt" DESC, ca."id" DESC
  LIMIT 1;

  IF approved_quotation_id IS NULL THEN
    RAISE EXCEPTION 'Service execution requires customer approval or an authorized warranty follow-up';
  END IF;

  -- Every active labor line must be exactly one of the labor lines approved in
  -- the customer's quotation snapshot, at the approved quantity and price.
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

  -- Every active part line must likewise match the approved quotation snapshot,
  -- including the concrete inventory item when one is linked.
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
