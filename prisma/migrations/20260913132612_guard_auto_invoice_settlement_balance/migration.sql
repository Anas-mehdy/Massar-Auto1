CREATE OR REPLACE FUNCTION public."assertAutoInvoiceSettlementBalance"()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'pg_catalog', 'public'
AS $$
DECLARE
  credit_total numeric(12,2) := 0;
  expected_balance numeric(12,2);
BEGIN
  IF NEW."serviceOrderId" IS NULL
     OR NEW."deletedAt" IS NOT NULL
     OR NEW."status"::text = 'VOID' THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(SUM(cn."amount"), 0)::numeric(12,2)
  INTO credit_total
  FROM public."InvoiceCreditNote" cn
  WHERE cn."shopId" = NEW."shopId"
    AND cn."invoiceId" = NEW."id";

  expected_balance := GREATEST(
    0::numeric,
    ROUND(NEW."total" - credit_total - NEW."amountPaid", 2)
  )::numeric(12,2);

  IF NEW."balanceDue" IS DISTINCT FROM expected_balance THEN
    RAISE EXCEPTION 'Automotive invoice settlement balance is inconsistent with total, credit notes and collected payments';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS "Invoice_guard_auto_settlement_balance" ON public."Invoice";
CREATE TRIGGER "Invoice_guard_auto_settlement_balance"
BEFORE INSERT OR UPDATE OF "amountPaid", "balanceDue", "serviceOrderId", "shopId", "status", "deletedAt"
ON public."Invoice"
FOR EACH ROW
EXECUTE FUNCTION public."assertAutoInvoiceSettlementBalance"();
