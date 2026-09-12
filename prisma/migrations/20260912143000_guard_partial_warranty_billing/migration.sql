-- Make partial warranty billing explicit and audit-safe.
-- customerCharge is the exact final amount payable by the customer, inclusive of tax.
-- CUSTOMER_PAY uses normal full invoice billing, so it must not carry an override amount.

ALTER TABLE "ServiceWarrantyClaim"
DROP CONSTRAINT IF EXISTS "ServiceWarrantyClaim_charge_coverage_consistency_check";

ALTER TABLE "ServiceWarrantyClaim"
ADD CONSTRAINT "ServiceWarrantyClaim_charge_coverage_consistency_check"
CHECK (
  ("coverageDecision" = 'PARTIAL' AND "customerCharge" > 0)
  OR (
    "coverageDecision" IN ('PENDING', 'COVERED', 'CUSTOMER_PAY', 'NOT_APPLICABLE')
    AND "customerCharge" = 0
  )
);

CREATE OR REPLACE FUNCTION "assertServiceWarrantyClaimBillingDecisionIntegrity"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW."coverageDecision" = 'PARTIAL' AND NEW."customerCharge" <= 0 THEN
    RAISE EXCEPTION 'التغطية الجزئية تتطلب مبلغاً نهائياً أكبر من صفر على العميل (شامل الضريبة).';
  END IF;

  IF NEW."coverageDecision" IN ('PENDING', 'COVERED', 'CUSTOMER_PAY', 'NOT_APPLICABLE')
     AND NEW."customerCharge" <> 0 THEN
    RAISE EXCEPTION 'مبلغ العميل يستخدم فقط مع التغطية الجزئية؛ التغطية الكاملة صفر وعلى حساب العميل يفوتر بالقيمة الكاملة.';
  END IF;

  IF TG_OP = 'UPDATE'
     AND OLD."status" <> 'OPEN'
     AND (
       NEW."coverageDecision" IS DISTINCT FROM OLD."coverageDecision"
       OR NEW."customerCharge" IS DISTINCT FROM OLD."customerCharge"
     ) THEN
    RAISE EXCEPTION 'قرار التغطية ومبلغ العميل يصبحان نهائيين بعد حسم المطالبة.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS "ServiceWarrantyClaim_billing_decision_guard" ON "ServiceWarrantyClaim";
CREATE TRIGGER "ServiceWarrantyClaim_billing_decision_guard"
BEFORE INSERT OR UPDATE OF "status", "coverageDecision", "customerCharge"
ON "ServiceWarrantyClaim"
FOR EACH ROW
EXECUTE FUNCTION "assertServiceWarrantyClaimBillingDecisionIntegrity"();

-- Extend the already-installed invoice guard. The existing trigger keeps pointing to this function.
CREATE OR REPLACE FUNCTION "assertCoveredWarrantyInvoiceIntegrity"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  claim_coverage TEXT;
  claim_number TEXT;
  claim_customer_charge NUMERIC;
BEGIN
  IF NEW."serviceOrderId" IS NULL OR NEW."status" = 'VOID'::"InvoiceStatus" THEN
    RETURN NEW;
  END IF;

  SELECT wc."coverageDecision"::text, wc."claimNumber", wc."customerCharge"
  INTO claim_coverage, claim_number, claim_customer_charge
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
  ELSIF claim_coverage = 'PARTIAL' THEN
    IF COALESCE(claim_customer_charge, 0) <= 0
       OR NEW."subtotal" < 0
       OR NEW."discountTotal" < 0
       OR NEW."discountTotal" > NEW."subtotal"
       OR NEW."taxTotal" < 0
       OR ROUND(NEW."total", 2) <> ROUND(claim_customer_charge, 2)
       OR ROUND(NEW."subtotal" - NEW."discountTotal" + NEW."taxTotal", 2) <> ROUND(NEW."total", 2) THEN
      RAISE EXCEPTION 'أمر المتابعة % ذو تغطية جزئية؛ يجب أن يساوي إجمالي الفاتورة مبلغ العميل النهائي المتفق عليه شاملاً الضريبة.', claim_number;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;
