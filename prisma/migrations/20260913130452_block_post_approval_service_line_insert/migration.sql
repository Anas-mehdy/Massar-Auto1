CREATE OR REPLACE FUNCTION public."assertNoPostApprovalServiceLineInsert"()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'pg_catalog', 'public'
AS $$
BEGIN
  -- Serialize with quotation approval/status work on the same service order.
  PERFORM 1
  FROM public."ServiceOrder" so
  WHERE so."id" = NEW."serviceOrderId"
    AND so."shopId" = NEW."shopId"
    AND so."deletedAt" IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Service order does not exist in this shop';
  END IF;

  -- Before the customer approves a normal quotation, lines may still be built
  -- and revised. Once an approval exists, silently adding new commercial work
  -- would bypass the approved quotation and is therefore rejected.
  IF NOT EXISTS (
    SELECT 1
    FROM public."CustomerApproval" ca
    WHERE ca."shopId" = NEW."shopId"
      AND ca."serviceOrderId" = NEW."serviceOrderId"
      AND ca."decision" IN ('APPROVED', 'PARTIALLY_APPROVED')
  ) THEN
    RETURN NEW;
  END IF;

  -- Warranty follow-up orders use the approved warranty claim as their
  -- authorization source and legitimately receive their work lines afterwards.
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

  RAISE EXCEPTION 'New service work requires a new customer authorization after the existing approval';
END;
$$;

DROP TRIGGER IF EXISTS "ServiceLaborLine_block_post_approval_insert" ON public."ServiceLaborLine";
CREATE TRIGGER "ServiceLaborLine_block_post_approval_insert"
BEFORE INSERT ON public."ServiceLaborLine"
FOR EACH ROW
EXECUTE FUNCTION public."assertNoPostApprovalServiceLineInsert"();

DROP TRIGGER IF EXISTS "ServicePartLine_block_post_approval_insert" ON public."ServicePartLine";
CREATE TRIGGER "ServicePartLine_block_post_approval_insert"
BEFORE INSERT ON public."ServicePartLine"
FOR EACH ROW
EXECUTE FUNCTION public."assertNoPostApprovalServiceLineInsert"();
