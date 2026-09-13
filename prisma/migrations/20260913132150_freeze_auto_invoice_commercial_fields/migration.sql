CREATE OR REPLACE FUNCTION public."assertAutoInvoiceCommercialFieldsImmutable"()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'pg_catalog', 'public'
AS $$
BEGIN
  -- The issued automotive invoice is an immutable commercial snapshot.
  -- Payments, credit notes, refunds and voiding may update settlement/lifecycle
  -- fields, but must never rewrite the original commercial totals in place.
  IF OLD."serviceOrderId" IS NOT NULL
     AND (
       NEW."subtotal" IS DISTINCT FROM OLD."subtotal"
       OR NEW."discountTotal" IS DISTINCT FROM OLD."discountTotal"
       OR NEW."taxTotal" IS DISTINCT FROM OLD."taxTotal"
       OR NEW."total" IS DISTINCT FROM OLD."total"
     ) THEN
    RAISE EXCEPTION 'Automotive invoice commercial totals are immutable after issuance; use quote revision before delivery or a credit note after delivery';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS "Invoice_freeze_auto_commercial_fields" ON public."Invoice";
CREATE TRIGGER "Invoice_freeze_auto_commercial_fields"
BEFORE UPDATE OF "subtotal", "discountTotal", "taxTotal", "total"
ON public."Invoice"
FOR EACH ROW
EXECUTE FUNCTION public."assertAutoInvoiceCommercialFieldsImmutable"();
