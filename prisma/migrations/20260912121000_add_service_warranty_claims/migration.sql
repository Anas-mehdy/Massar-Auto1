-- Warranty / comeback / rework claims for delivered automotive service orders.
-- The original ServiceOrder and its invoice remain immutable; any follow-up work gets a new linked ServiceOrder.

CREATE TABLE "ServiceWarrantyClaim" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "shopId" UUID NOT NULL,
  "originalServiceOrderId" UUID NOT NULL,
  "followUpServiceOrderId" UUID,
  "vehicleId" UUID NOT NULL,
  "customerId" UUID NOT NULL,
  "originalServicePartLineId" UUID,
  "originalServiceLaborLineId" UUID,
  "createdByUserId" UUID,
  "decidedByUserId" UUID,
  "resolvedByUserId" UUID,
  "claimNumber" TEXT NOT NULL,
  "claimType" VARCHAR(16) NOT NULL,
  "status" VARCHAR(16) NOT NULL DEFAULT 'OPEN',
  "coverageDecision" VARCHAR(20) NOT NULL DEFAULT 'PENDING',
  "reportedIssue" TEXT NOT NULL,
  "assessment" TEXT,
  "resolution" TEXT,
  "notes" TEXT,
  "warrantyEndsAt" TIMESTAMPTZ,
  "customerCharge" NUMERIC(14,2) NOT NULL DEFAULT 0,
  "openedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "decidedAt" TIMESTAMPTZ,
  "resolvedAt" TIMESTAMPTZ,
  "closedAt" TIMESTAMPTZ,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT "ServiceWarrantyClaim_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ServiceWarrantyClaim_shop_id_key" UNIQUE ("shopId", "id"),
  CONSTRAINT "ServiceWarrantyClaim_shop_number_key" UNIQUE ("shopId", "claimNumber"),
  CONSTRAINT "ServiceWarrantyClaim_type_check" CHECK ("claimType" IN ('WARRANTY', 'COMEBACK', 'REWORK')),
  CONSTRAINT "ServiceWarrantyClaim_status_check" CHECK ("status" IN ('OPEN', 'APPROVED', 'REJECTED', 'IN_SERVICE', 'RESOLVED', 'CLOSED')),
  CONSTRAINT "ServiceWarrantyClaim_coverage_check" CHECK ("coverageDecision" IN ('PENDING', 'COVERED', 'PARTIAL', 'CUSTOMER_PAY', 'NOT_APPLICABLE')),
  CONSTRAINT "ServiceWarrantyClaim_charge_check" CHECK ("customerCharge" >= 0),
  CONSTRAINT "ServiceWarrantyClaim_distinct_orders_check" CHECK ("followUpServiceOrderId" IS NULL OR "followUpServiceOrderId" <> "originalServiceOrderId"),
  CONSTRAINT "ServiceWarrantyClaim_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE,
  CONSTRAINT "ServiceWarrantyClaim_original_order_shop_fkey" FOREIGN KEY ("shopId", "originalServiceOrderId") REFERENCES "ServiceOrder"("shopId", "id") ON DELETE RESTRICT,
  CONSTRAINT "ServiceWarrantyClaim_followup_order_shop_fkey" FOREIGN KEY ("shopId", "followUpServiceOrderId") REFERENCES "ServiceOrder"("shopId", "id") ON DELETE RESTRICT,
  CONSTRAINT "ServiceWarrantyClaim_vehicle_shop_fkey" FOREIGN KEY ("shopId", "vehicleId") REFERENCES "Vehicle"("shopId", "id") ON DELETE RESTRICT,
  CONSTRAINT "ServiceWarrantyClaim_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT,
  CONSTRAINT "ServiceWarrantyClaim_part_shop_fkey" FOREIGN KEY ("shopId", "originalServicePartLineId") REFERENCES "ServicePartLine"("shopId", "id") ON DELETE RESTRICT,
  CONSTRAINT "ServiceWarrantyClaim_labor_shop_fkey" FOREIGN KEY ("shopId", "originalServiceLaborLineId") REFERENCES "ServiceLaborLine"("shopId", "id") ON DELETE RESTRICT,
  CONSTRAINT "ServiceWarrantyClaim_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL,
  CONSTRAINT "ServiceWarrantyClaim_decidedByUserId_fkey" FOREIGN KEY ("decidedByUserId") REFERENCES "User"("id") ON DELETE SET NULL,
  CONSTRAINT "ServiceWarrantyClaim_resolvedByUserId_fkey" FOREIGN KEY ("resolvedByUserId") REFERENCES "User"("id") ON DELETE SET NULL
);

CREATE UNIQUE INDEX "ServiceWarrantyClaim_followup_order_key"
  ON "ServiceWarrantyClaim" ("shopId", "followUpServiceOrderId")
  WHERE "followUpServiceOrderId" IS NOT NULL;
CREATE INDEX "ServiceWarrantyClaim_original_order_idx" ON "ServiceWarrantyClaim" ("shopId", "originalServiceOrderId", "createdAt" DESC);
CREATE INDEX "ServiceWarrantyClaim_vehicle_idx" ON "ServiceWarrantyClaim" ("shopId", "vehicleId", "createdAt" DESC);
CREATE INDEX "ServiceWarrantyClaim_status_idx" ON "ServiceWarrantyClaim" ("shopId", "status", "createdAt" DESC);

CREATE TABLE "ServiceWarrantyClaimHistory" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "shopId" UUID NOT NULL,
  "claimId" UUID NOT NULL,
  "fromStatus" VARCHAR(16),
  "toStatus" VARCHAR(16) NOT NULL,
  "coverageDecision" VARCHAR(20) NOT NULL,
  "note" TEXT,
  "createdByUserId" UUID,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT "ServiceWarrantyClaimHistory_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ServiceWarrantyClaimHistory_status_check" CHECK ("fromStatus" IS NULL OR "fromStatus" IN ('OPEN', 'APPROVED', 'REJECTED', 'IN_SERVICE', 'RESOLVED', 'CLOSED')),
  CONSTRAINT "ServiceWarrantyClaimHistory_to_status_check" CHECK ("toStatus" IN ('OPEN', 'APPROVED', 'REJECTED', 'IN_SERVICE', 'RESOLVED', 'CLOSED')),
  CONSTRAINT "ServiceWarrantyClaimHistory_coverage_check" CHECK ("coverageDecision" IN ('PENDING', 'COVERED', 'PARTIAL', 'CUSTOMER_PAY', 'NOT_APPLICABLE')),
  CONSTRAINT "ServiceWarrantyClaimHistory_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE,
  CONSTRAINT "ServiceWarrantyClaimHistory_claim_shop_fkey" FOREIGN KEY ("shopId", "claimId") REFERENCES "ServiceWarrantyClaim"("shopId", "id") ON DELETE CASCADE,
  CONSTRAINT "ServiceWarrantyClaimHistory_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL
);
CREATE INDEX "ServiceWarrantyClaimHistory_claim_idx" ON "ServiceWarrantyClaimHistory" ("shopId", "claimId", "createdAt");

CREATE OR REPLACE FUNCTION "assertServiceWarrantyClaimIntegrity"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  original_order RECORD;
  followup_order RECORD;
  line_order_id UUID;
BEGIN
  SELECT so."id", so."status"::text AS "status", so."vehicleId", so."customerId"
  INTO original_order
  FROM "ServiceOrder" so
  WHERE so."shopId" = NEW."shopId"
    AND so."id" = NEW."originalServiceOrderId"
    AND so."deletedAt" IS NULL
  FOR SHARE;

  IF original_order."id" IS NULL THEN
    RAISE EXCEPTION 'أمر الصيانة الأصلي للمطالبة غير موجود.';
  END IF;
  IF original_order."status" NOT IN ('DELIVERED', 'CLOSED') THEN
    RAISE EXCEPTION 'مطالبة الضمان/العودة متاحة فقط لأمر صيانة تم تسليمه أو إغلاقه.';
  END IF;
  IF NEW."vehicleId" IS DISTINCT FROM original_order."vehicleId"
     OR NEW."customerId" IS DISTINCT FROM original_order."customerId" THEN
    RAISE EXCEPTION 'المركبة أو العميل في المطالبة لا يطابقان أمر الصيانة الأصلي.';
  END IF;

  IF NEW."originalServicePartLineId" IS NOT NULL THEN
    SELECT spl."serviceOrderId" INTO line_order_id
    FROM "ServicePartLine" spl
    WHERE spl."shopId" = NEW."shopId" AND spl."id" = NEW."originalServicePartLineId";
    IF line_order_id IS DISTINCT FROM NEW."originalServiceOrderId" THEN
      RAISE EXCEPTION 'بند القطعة المحدد لا ينتمي إلى أمر الصيانة الأصلي.';
    END IF;
  END IF;

  IF NEW."originalServiceLaborLineId" IS NOT NULL THEN
    line_order_id := NULL;
    SELECT sll."serviceOrderId" INTO line_order_id
    FROM "ServiceLaborLine" sll
    WHERE sll."shopId" = NEW."shopId" AND sll."id" = NEW."originalServiceLaborLineId";
    IF line_order_id IS DISTINCT FROM NEW."originalServiceOrderId" THEN
      RAISE EXCEPTION 'بند أجرة العمل المحدد لا ينتمي إلى أمر الصيانة الأصلي.';
    END IF;
  END IF;

  IF NEW."followUpServiceOrderId" IS NOT NULL THEN
    SELECT so."id", so."vehicleId", so."customerId"
    INTO followup_order
    FROM "ServiceOrder" so
    WHERE so."shopId" = NEW."shopId"
      AND so."id" = NEW."followUpServiceOrderId"
      AND so."deletedAt" IS NULL
    FOR SHARE;
    IF followup_order."id" IS NULL THEN
      RAISE EXCEPTION 'أمر المتابعة المرتبط بالمطالبة غير موجود.';
    END IF;
    IF followup_order."vehicleId" IS DISTINCT FROM NEW."vehicleId"
       OR followup_order."customerId" IS DISTINCT FROM NEW."customerId" THEN
      RAISE EXCEPTION 'أمر المتابعة يجب أن يخص نفس المركبة والعميل.';
    END IF;
  END IF;

  IF TG_OP = 'UPDATE' AND NEW."status" IS DISTINCT FROM OLD."status" THEN
    IF OLD."status" = 'CLOSED' THEN
      RAISE EXCEPTION 'مطالبة الضمان المغلقة نهائية ولا يمكن إعادة فتحها.';
    ELSIF OLD."status" = 'OPEN' AND NEW."status" NOT IN ('APPROVED', 'REJECTED', 'CLOSED') THEN
      RAISE EXCEPTION 'انتقال حالة مطالبة الضمان غير صالح.';
    ELSIF OLD."status" = 'APPROVED' AND NEW."status" NOT IN ('IN_SERVICE', 'RESOLVED', 'CLOSED') THEN
      RAISE EXCEPTION 'انتقال حالة مطالبة الضمان غير صالح.';
    ELSIF OLD."status" = 'REJECTED' AND NEW."status" <> 'CLOSED' THEN
      RAISE EXCEPTION 'المطالبة المرفوضة يمكن إغلاقها فقط.';
    ELSIF OLD."status" = 'IN_SERVICE' AND NEW."status" NOT IN ('RESOLVED', 'CLOSED') THEN
      RAISE EXCEPTION 'انتقال حالة مطالبة الضمان غير صالح.';
    ELSIF OLD."status" = 'RESOLVED' AND NEW."status" <> 'CLOSED' THEN
      RAISE EXCEPTION 'المطالبة المحلولة يمكن إغلاقها فقط.';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER "ServiceWarrantyClaim_integrity_guard"
BEFORE INSERT OR UPDATE ON "ServiceWarrantyClaim"
FOR EACH ROW EXECUTE FUNCTION "assertServiceWarrantyClaimIntegrity"();

CREATE OR REPLACE FUNCTION "protectServiceWarrantyClaimIdentity"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW."shopId" IS DISTINCT FROM OLD."shopId"
     OR NEW."originalServiceOrderId" IS DISTINCT FROM OLD."originalServiceOrderId"
     OR NEW."vehicleId" IS DISTINCT FROM OLD."vehicleId"
     OR NEW."customerId" IS DISTINCT FROM OLD."customerId"
     OR NEW."claimNumber" IS DISTINCT FROM OLD."claimNumber"
     OR NEW."claimType" IS DISTINCT FROM OLD."claimType"
     OR NEW."originalServicePartLineId" IS DISTINCT FROM OLD."originalServicePartLineId"
     OR NEW."originalServiceLaborLineId" IS DISTINCT FROM OLD."originalServiceLaborLineId"
     OR NEW."createdByUserId" IS DISTINCT FROM OLD."createdByUserId"
     OR NEW."openedAt" IS DISTINCT FROM OLD."openedAt" THEN
    RAISE EXCEPTION 'هوية مطالبة الضمان وسياقها الأصلي غير قابلين للتعديل.';
  END IF;
  IF OLD."followUpServiceOrderId" IS NOT NULL
     AND NEW."followUpServiceOrderId" IS DISTINCT FROM OLD."followUpServiceOrderId" THEN
    RAISE EXCEPTION 'لا يمكن استبدال أمر المتابعة بعد ربطه بالمطالبة.';
  END IF;
  NEW."updatedAt" := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER "ServiceWarrantyClaim_identity_guard"
BEFORE UPDATE ON "ServiceWarrantyClaim"
FOR EACH ROW EXECUTE FUNCTION "protectServiceWarrantyClaimIdentity"();

ALTER TABLE "ServiceWarrantyClaim" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ServiceWarrantyClaimHistory" ENABLE ROW LEVEL SECURITY;
