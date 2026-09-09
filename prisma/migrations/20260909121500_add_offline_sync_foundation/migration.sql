-- Massar Offline V1 sync foundation.
-- This migration only creates sync infrastructure; it does not change existing business rows.

CREATE TABLE IF NOT EXISTS "SyncDevice" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "shopId" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "deviceId" TEXT NOT NULL,
  "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SyncDevice_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "SyncDevice_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "SyncDevice_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "SyncDevice_shopId_deviceId_key"
  ON "SyncDevice"("shopId", "deviceId");
CREATE INDEX IF NOT EXISTS "SyncDevice_shopId_userId_idx"
  ON "SyncDevice"("shopId", "userId");

CREATE TABLE IF NOT EXISTS "SyncMutation" (
  "operationId" UUID NOT NULL,
  "shopId" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "deviceId" TEXT NOT NULL,
  "entityType" TEXT NOT NULL,
  "entityId" UUID NOT NULL,
  "mutationType" TEXT NOT NULL,
  "baseVersion" INTEGER,
  "payload" JSONB NOT NULL,
  "status" TEXT NOT NULL,
  "result" JSONB,
  "errorCode" TEXT,
  "errorMessage" TEXT,
  "clientCreatedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "appliedAt" TIMESTAMP(3),
  CONSTRAINT "SyncMutation_pkey" PRIMARY KEY ("operationId"),
  CONSTRAINT "SyncMutation_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "SyncMutation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "SyncMutation_shopId_createdAt_idx"
  ON "SyncMutation"("shopId", "createdAt");
CREATE INDEX IF NOT EXISTS "SyncMutation_shopId_entity_idx"
  ON "SyncMutation"("shopId", "entityType", "entityId");

CREATE TABLE IF NOT EXISTS "SyncChange" (
  "sequence" BIGSERIAL NOT NULL,
  "shopId" UUID NOT NULL,
  "entityType" TEXT NOT NULL,
  "entityId" UUID NOT NULL,
  "action" TEXT NOT NULL,
  "entityVersion" INTEGER,
  "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SyncChange_pkey" PRIMARY KEY ("sequence"),
  CONSTRAINT "SyncChange_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "SyncChange_shopId_sequence_idx"
  ON "SyncChange"("shopId", "sequence");
CREATE INDEX IF NOT EXISTS "SyncChange_shopId_entity_idx"
  ON "SyncChange"("shopId", "entityType", "entityId", "sequence");

-- Capture every customer change, including changes made by the existing online UI.
CREATE OR REPLACE FUNCTION "massar_record_customer_sync_change"()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO "SyncChange" (
    "shopId",
    "entityType",
    "entityId",
    "action",
    "entityVersion",
    "changedAt"
  ) VALUES (
    NEW."shopId",
    'customer',
    NEW."id",
    CASE WHEN NEW."deletedAt" IS NULL THEN 'upsert' ELSE 'delete' END,
    NEW."version",
    CURRENT_TIMESTAMP
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "Customer_sync_change_trigger" ON "Customer";
CREATE TRIGGER "Customer_sync_change_trigger"
AFTER INSERT OR UPDATE ON "Customer"
FOR EACH ROW
EXECUTE FUNCTION "massar_record_customer_sync_change"();

-- Seed the change log with all customers that already existed before Offline V1.
-- This guarantees a brand-new device can bootstrap its local customer database from cursor 0.
INSERT INTO "SyncChange" (
  "shopId",
  "entityType",
  "entityId",
  "action",
  "entityVersion",
  "changedAt"
)
SELECT
  c."shopId",
  'customer',
  c."id",
  CASE WHEN c."deletedAt" IS NULL THEN 'upsert' ELSE 'delete' END,
  c."version",
  CURRENT_TIMESTAMP
FROM "Customer" c;
