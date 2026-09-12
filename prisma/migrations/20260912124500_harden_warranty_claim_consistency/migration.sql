-- Harden warranty/comeback/rework claim state, coverage, follow-up, and audit consistency.
-- This complements the original ownership/identity guards without reopening historical service orders.

ALTER TABLE "ServiceWarrantyClaim"
  ADD CONSTRAINT "ServiceWarrantyClaim_state_coverage_consistency_check"
  CHECK (
    ("status" = 'OPEN' AND "coverageDecision" = 'PENDING')
    OR ("status" IN ('APPROVED', 'IN_SERVICE', 'RESOLVED') AND "coverageDecision" IN ('COVERED', 'PARTIAL', 'CUSTOMER_PAY'))
    OR ("status" = 'REJECTED' AND "coverageDecision" = 'NOT_APPLICABLE')
    OR ("status" = 'CLOSED' AND "coverageDecision" <> 'PENDING')
  );

ALTER TABLE "ServiceWarrantyClaim"
  ADD CONSTRAINT "ServiceWarrantyClaim_charge_coverage_consistency_check"
  CHECK (
    "coverageDecision" NOT IN ('PENDING', 'COVERED', 'NOT_APPLICABLE')
    OR "customerCharge" = 0
  );

ALTER TABLE "ServiceWarrantyClaim"
  ADD CONSTRAINT "ServiceWarrantyClaim_followup_state_consistency_check"
  CHECK (
    ("followUpServiceOrderId" IS NULL OR "status" IN ('IN_SERVICE', 'RESOLVED', 'CLOSED'))
    AND ("status" <> 'IN_SERVICE' OR "followUpServiceOrderId" IS NOT NULL)
  );

CREATE OR REPLACE FUNCTION "assertServiceWarrantyClaimStateConsistency"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  followup_status TEXT;
BEGIN
  IF NEW."status" = 'OPEN' THEN
    IF NEW."coverageDecision" <> 'PENDING'
       OR NEW."customerCharge" <> 0
       OR NEW."followUpServiceOrderId" IS NOT NULL
       OR NEW."decidedAt" IS NOT NULL
       OR NEW."assessment" IS NOT NULL THEN
      RAISE EXCEPTION 'المطالبة المفتوحة يجب أن تبقى بانتظار قرار التغطية بدون مبلغ عميل أو أمر متابعة.';
    END IF;
  ELSE
    IF NEW."coverageDecision" = 'PENDING' THEN
      RAISE EXCEPTION 'يجب تحديد قرار التغطية قبل مغادرة حالة المطالبة المفتوحة.';
    END IF;
    IF NEW."decidedAt" IS NULL OR NULLIF(BTRIM(NEW."assessment"), '') IS NULL THEN
      RAISE EXCEPTION 'قرار المطالبة يتطلب تقييماً وتاريخ قرار محفوظين.';
    END IF;
  END IF;

  IF NEW."status" = 'REJECTED' THEN
    IF NEW."coverageDecision" <> 'NOT_APPLICABLE' OR NEW."customerCharge" <> 0 OR NEW."followUpServiceOrderId" IS NOT NULL THEN
      RAISE EXCEPTION 'المطالبة المرفوضة يجب أن تكون تغطيتها لا تنطبق، بدون مبلغ عميل أو أمر متابعة.';
    END IF;
  END IF;

  IF NEW."status" IN ('APPROVED', 'IN_SERVICE', 'RESOLVED')
     AND NEW."coverageDecision" NOT IN ('COVERED', 'PARTIAL', 'CUSTOMER_PAY') THEN
    RAISE EXCEPTION 'المطالبة المعتمدة أو قيد المعالجة يجب أن تملك قرار تغطية فعلياً.';
  END IF;

  IF NEW."coverageDecision" = 'COVERED' AND NEW."customerCharge" <> 0 THEN
    RAISE EXCEPTION 'المطالبة المغطاة بالكامل لا يمكن أن تحمل مبلغاً على العميل.';
  END IF;

  IF NEW."coverageDecision" = 'NOT_APPLICABLE' AND NEW."status" NOT IN ('REJECTED', 'CLOSED') THEN
    RAISE EXCEPTION 'قرار «لا ينطبق» مخصص للمطالبة المرفوضة أو المغلقة الناتجة عنها.';
  END IF;

  IF NEW."followUpServiceOrderId" IS NOT NULL THEN
    SELECT so."status"::text
    INTO followup_status
    FROM "ServiceOrder" so
    WHERE so."shopId" = NEW."shopId"
      AND so."id" = NEW."followUpServiceOrderId"
      AND so."deletedAt" IS NULL;

    IF followup_status IS NULL THEN
      RAISE EXCEPTION 'أمر المتابعة المرتبط بالمطالبة غير موجود.';
    END IF;

    IF NEW."status" NOT IN ('IN_SERVICE', 'RESOLVED', 'CLOSED') THEN
      RAISE EXCEPTION 'لا يمكن ربط أمر متابعة قبل انتقال المطالبة إلى قيد المعالجة.';
    END IF;
  ELSIF NEW."status" = 'IN_SERVICE' THEN
    RAISE EXCEPTION 'حالة قيد المعالجة تتطلب أمر متابعة مرتبطاً بالمطالبة.';
  END IF;

  IF NEW."status" = 'RESOLVED' THEN
    IF NULLIF(BTRIM(NEW."resolution"), '') IS NULL OR NEW."resolvedAt" IS NULL THEN
      RAISE EXCEPTION 'المطالبة المحلولة تتطلب نتيجة معالجة وتاريخ حل.';
    END IF;
    IF NEW."followUpServiceOrderId" IS NOT NULL
       AND followup_status NOT IN ('READY_FOR_DELIVERY', 'DELIVERED', 'CLOSED') THEN
      RAISE EXCEPTION 'لا يمكن حل المطالبة قبل وصول أمر المتابعة إلى الجاهزية للتسليم على الأقل.';
    END IF;
  END IF;

  IF NEW."status" = 'CLOSED' THEN
    IF NEW."closedAt" IS NULL THEN
      RAISE EXCEPTION 'إغلاق المطالبة يتطلب تاريخ إغلاق.';
    END IF;
    IF NEW."followUpServiceOrderId" IS NOT NULL AND followup_status <> 'CLOSED' THEN
      RAISE EXCEPTION 'يجب إغلاق أمر المتابعة قبل إغلاق مطالبة الضمان.';
    END IF;
  ELSIF NEW."closedAt" IS NOT NULL THEN
    RAISE EXCEPTION 'لا يمكن تسجيل تاريخ إغلاق قبل وصول المطالبة إلى الحالة المغلقة.';
  END IF;

  IF TG_OP = 'UPDATE' AND NEW."status" IS DISTINCT FROM OLD."status" THEN
    IF OLD."status" = 'OPEN' AND NEW."status" NOT IN ('APPROVED', 'REJECTED') THEN
      RAISE EXCEPTION 'المطالبة المفتوحة يجب اعتمادها أو رفضها أولاً.';
    ELSIF OLD."status" = 'APPROVED' AND NEW."status" NOT IN ('IN_SERVICE', 'RESOLVED') THEN
      RAISE EXCEPTION 'المطالبة المعتمدة تنتقل إلى المعالجة أو الحل فقط.';
    ELSIF OLD."status" = 'REJECTED' AND NEW."status" <> 'CLOSED' THEN
      RAISE EXCEPTION 'المطالبة المرفوضة يمكن إغلاقها فقط.';
    ELSIF OLD."status" = 'IN_SERVICE' AND NEW."status" <> 'RESOLVED' THEN
      RAISE EXCEPTION 'المطالبة قيد المعالجة يجب حلها قبل الإغلاق.';
    ELSIF OLD."status" = 'RESOLVED' AND NEW."status" <> 'CLOSED' THEN
      RAISE EXCEPTION 'المطالبة المحلولة يمكن إغلاقها فقط.';
    ELSIF OLD."status" = 'CLOSED' THEN
      RAISE EXCEPTION 'مطالبة الضمان المغلقة نهائية ولا يمكن إعادة فتحها.';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER "ServiceWarrantyClaim_state_consistency_guard"
BEFORE INSERT OR UPDATE ON "ServiceWarrantyClaim"
FOR EACH ROW
EXECUTE FUNCTION "assertServiceWarrantyClaimStateConsistency"();

CREATE OR REPLACE FUNCTION "assertServiceWarrantyClaimHistoryIntegrity"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  claim_status TEXT;
  claim_coverage TEXT;
  previous_status TEXT;
BEGIN
  SELECT wc."status"::text, wc."coverageDecision"::text
  INTO claim_status, claim_coverage
  FROM "ServiceWarrantyClaim" wc
  WHERE wc."shopId" = NEW."shopId" AND wc."id" = NEW."claimId";

  IF claim_status IS NULL THEN
    RAISE EXCEPTION 'مطالبة الضمان المرتبطة بسجل التدقيق غير موجودة.';
  END IF;

  IF NEW."toStatus" IS DISTINCT FROM claim_status
     OR NEW."coverageDecision" IS DISTINCT FROM claim_coverage THEN
    RAISE EXCEPTION 'سجل تدقيق المطالبة يجب أن يطابق الحالة وقرار التغطية الحاليين.';
  END IF;

  SELECT h."toStatus"::text
  INTO previous_status
  FROM "ServiceWarrantyClaimHistory" h
  WHERE h."shopId" = NEW."shopId" AND h."claimId" = NEW."claimId"
  ORDER BY h."createdAt" DESC, h."id" DESC
  LIMIT 1;

  IF previous_status IS NULL THEN
    IF NEW."fromStatus" IS NOT NULL OR NEW."toStatus" <> 'OPEN' THEN
      RAISE EXCEPTION 'أول سجل تدقيق للمطالبة يجب أن يبدأ من الحالة المفتوحة بدون حالة سابقة.';
    END IF;
  ELSIF NEW."fromStatus" IS DISTINCT FROM previous_status THEN
    RAISE EXCEPTION 'الحالة السابقة في سجل تدقيق المطالبة لا تطابق آخر حالة محفوظة.';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER "ServiceWarrantyClaimHistory_integrity_guard"
BEFORE INSERT ON "ServiceWarrantyClaimHistory"
FOR EACH ROW
EXECUTE FUNCTION "assertServiceWarrantyClaimHistoryIntegrity"();
