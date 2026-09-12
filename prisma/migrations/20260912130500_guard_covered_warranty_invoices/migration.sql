-- Fully covered warranty/comeback follow-ups must never create a customer receivable.
-- Keep the real service value in subtotal, express the coverage as a 100% warranty discount,
-- and keep total/balance at zero. No synthetic Payment row is created.

CREATE OR REPLACE FUNCTION "assertCoveredWarrantyInvoiceIntegrity"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  claim_coverage TEXT;
  claim_number TEXT;
BEGIN
  IF NEW."serviceOrderId" IS NULL OR NEW."status" = 'VOID'::"InvoiceStatus" THEN
    RETURN NEW;
  END IF;

  SELECT wc."coverageDecision"::text, wc."claimNumber"
  INTO claim_coverage, claim_number
  FROM "ServiceWarrantyClaim" wc
  WHERE wc."shopId" = NEW."shopId"
    AND wc."followUpServiceOrderId" = NEW."serviceOrderId"
  LIMIT 1;

  IF claim_coverage = 'COVERED' THEN
    IF NEW."subtotal" < 0
       OR NEW."discountTotal" IS DISTINCT FROM NEW."subtotal"
       OR NEW."taxTotal" <> 0
       OR NEW."total" <> 0
       OR NEW."amountPaid" <> 0
       OR NEW."balanceDue" <> 0
       OR NEW."status" <> 'PAID'::"InvoiceStatus" THEN
      RAISE EXCEPTION 'أمر المتابعة % مغطى بالكامل بالضمان؛ يجب أن تكون فاتورته بخصم ضمان 100%% وإجمالي/رصيد صفر.', claim_number;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER "Invoice_covered_warranty_guard"
BEFORE INSERT OR UPDATE OF "serviceOrderId", "status", "subtotal", "discountTotal", "taxTotal", "total", "amountPaid", "balanceDue"
ON "Invoice"
FOR EACH ROW
EXECUTE FUNCTION "assertCoveredWarrantyInvoiceIntegrity"();
