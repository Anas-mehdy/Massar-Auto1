CREATE UNIQUE INDEX IF NOT EXISTS "Customer_shopId_phoneNormalized_active_key"
ON public."Customer" ("shopId", "phoneNormalized")
WHERE "deletedAt" IS NULL AND "phoneNormalized" IS NOT NULL;
