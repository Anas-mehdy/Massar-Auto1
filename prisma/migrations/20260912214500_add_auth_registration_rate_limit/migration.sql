CREATE TABLE IF NOT EXISTS "AuthRegistrationAttempt" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "emailHash" TEXT NOT NULL,
  "requestFingerprint" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AuthRegistrationAttempt_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AuthRegistrationAttempt_emailHash_length_check" CHECK (char_length("emailHash") = 64),
  CONSTRAINT "AuthRegistrationAttempt_requestFingerprint_length_check" CHECK (char_length("requestFingerprint") = 64)
);

CREATE INDEX IF NOT EXISTS "AuthRegistrationAttempt_requestFingerprint_createdAt_idx"
  ON "AuthRegistrationAttempt"("requestFingerprint", "createdAt");

CREATE INDEX IF NOT EXISTS "AuthRegistrationAttempt_emailHash_requestFingerprint_createdAt_idx"
  ON "AuthRegistrationAttempt"("emailHash", "requestFingerprint", "createdAt");

ALTER TABLE "AuthRegistrationAttempt" ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE "AuthRegistrationAttempt" FROM PUBLIC;
REVOKE ALL ON TABLE "AuthRegistrationAttempt" FROM anon;
REVOKE ALL ON TABLE "AuthRegistrationAttempt" FROM authenticated;
