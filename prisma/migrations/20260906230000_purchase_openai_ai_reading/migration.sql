-- Direct OpenAI purchase-invoice reading: atomic daily quotas, failed-attempt guard,
-- and an application-level feature budget. Additive only; no production data rewrite.
-- Do NOT apply to production before isolated verification.

ALTER TABLE "PurchaseImportExtractionAttempt"
  ADD COLUMN IF NOT EXISTS "createdByUserId" UUID,
  ADD COLUMN IF NOT EXISTS "usageDay" DATE,
  ADD COLUMN IF NOT EXISTS "usageTimezone" VARCHAR(64),
  ADD COLUMN IF NOT EXISTS "quotaCharged" BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS "quotaReleasedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "providerContactedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "model" VARCHAR(80),
  ADD COLUMN IF NOT EXISTS "budgetReservedUsd" NUMERIC(12,6) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "actualCostUsd" NUMERIC(12,6),
  ADD COLUMN IF NOT EXISTS "inputTokens" INTEGER,
  ADD COLUMN IF NOT EXISTS "cachedInputTokens" INTEGER,
  ADD COLUMN IF NOT EXISTS "outputTokens" INTEGER,
  ADD COLUMN IF NOT EXISTS "providerResponseId" VARCHAR(160),
  ADD COLUMN IF NOT EXISTS "failureKind" VARCHAR(40);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='PurchaseImportExtractionAttempt_createdByUserId_fkey') THEN
    ALTER TABLE "PurchaseImportExtractionAttempt"
      ADD CONSTRAINT "PurchaseImportExtractionAttempt_createdByUserId_fkey"
      FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='PurchaseImportExtractionAttempt_budgetReservedUsd_check') THEN
    ALTER TABLE "PurchaseImportExtractionAttempt"
      ADD CONSTRAINT "PurchaseImportExtractionAttempt_budgetReservedUsd_check" CHECK ("budgetReservedUsd" >= 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='PurchaseImportExtractionAttempt_actualCostUsd_check') THEN
    ALTER TABLE "PurchaseImportExtractionAttempt"
      ADD CONSTRAINT "PurchaseImportExtractionAttempt_actualCostUsd_check" CHECK ("actualCostUsd" IS NULL OR "actualCostUsd" >= 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='PurchaseImportExtractionAttempt_token_counts_check') THEN
    ALTER TABLE "PurchaseImportExtractionAttempt"
      ADD CONSTRAINT "PurchaseImportExtractionAttempt_token_counts_check" CHECK (
        ("inputTokens" IS NULL OR "inputTokens" >= 0)
        AND ("cachedInputTokens" IS NULL OR "cachedInputTokens" >= 0)
        AND ("outputTokens" IS NULL OR "outputTokens" >= 0)
      );
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "PurchaseImportExtractionAttempt_user_day_quota_idx"
  ON "PurchaseImportExtractionAttempt" ("createdByUserId", "usageDay", "quotaCharged")
  WHERE "createdByUserId" IS NOT NULL AND "usageDay" IS NOT NULL;
CREATE INDEX IF NOT EXISTS "PurchaseImportExtractionAttempt_shop_day_quota_idx"
  ON "PurchaseImportExtractionAttempt" ("shopId", "usageDay", "quotaCharged")
  WHERE "usageDay" IS NOT NULL;
CREATE INDEX IF NOT EXISTS "PurchaseImportExtractionAttempt_failed_guard_idx"
  ON "PurchaseImportExtractionAttempt" ("shopId", "createdByUserId", "usageDay", "status")
  WHERE "providerContactedAt" IS NOT NULL;
CREATE INDEX IF NOT EXISTS "PurchaseImportExtractionAttempt_budget_idx"
  ON "PurchaseImportExtractionAttempt" ("provider", "createdAt");

-- New columns intentionally default to neutral values for any pre-feature rows.
-- No historical quotas, costs, product values, quantities, prices or compatibilities are backfilled.
