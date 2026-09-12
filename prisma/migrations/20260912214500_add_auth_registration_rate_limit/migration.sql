CREATE TABLE IF NOT EXISTS "AuthRegistrationAttempt" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "emailHash" VARCHAR(64) NOT NULL,
  "requestFingerprint" VARCHAR(64) NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "AuthRegistrationAttempt_emailHash_requestFingerprint_createdAt_idx"
  ON "AuthRegistrationAttempt" ("emailHash", "requestFingerprint", "createdAt");
CREATE INDEX IF NOT EXISTS "AuthRegistrationAttempt_requestFingerprint_createdAt_idx"
  ON "AuthRegistrationAttempt" ("requestFingerprint", "createdAt");
CREATE INDEX IF NOT EXISTS "AuthRegistrationAttempt_createdAt_idx"
  ON "AuthRegistrationAttempt" ("createdAt");

ALTER TABLE "AuthRegistrationAttempt" ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE "AuthRegistrationAttempt" FROM PUBLIC, anon, authenticated;
