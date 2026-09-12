CREATE TABLE IF NOT EXISTS "AuthLoginAttempt" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "emailHash" VARCHAR(64) NOT NULL,
  "requestFingerprint" VARCHAR(64) NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "AuthLoginAttempt_emailHash_requestFingerprint_createdAt_idx"
  ON "AuthLoginAttempt" ("emailHash", "requestFingerprint", "createdAt");
CREATE INDEX IF NOT EXISTS "AuthLoginAttempt_requestFingerprint_createdAt_idx"
  ON "AuthLoginAttempt" ("requestFingerprint", "createdAt");
CREATE INDEX IF NOT EXISTS "AuthLoginAttempt_createdAt_idx"
  ON "AuthLoginAttempt" ("createdAt");

ALTER TABLE "AuthLoginAttempt" ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE "AuthLoginAttempt" FROM PUBLIC, anon, authenticated;
