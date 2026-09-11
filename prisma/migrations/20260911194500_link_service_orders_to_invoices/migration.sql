-- Link automotive service orders to the shared invoice/payment ledger.
-- Massar Auto only. Existing phone-repair invoice links remain untouched.

ALTER TABLE "Invoice" ADD COLUMN IF NOT EXISTS "serviceOrderId" uuid;

CREATE INDEX IF NOT EXISTS "Invoice_shopId_serviceOrderId_idx"
  ON "Invoice" ("shopId", "serviceOrderId");

CREATE UNIQUE INDEX IF NOT EXISTS "Invoice_one_active_service_order_invoice_key"
  ON "Invoice" ("shopId", "serviceOrderId")
  WHERE "serviceOrderId" IS NOT NULL
    AND "deletedAt" IS NULL
    AND "status" <> 'VOID'::"InvoiceStatus";

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'Invoice_service_order_shop_fkey'
      AND conrelid = '"Invoice"'::regclass
  ) THEN
    ALTER TABLE "Invoice"
      ADD CONSTRAINT "Invoice_service_order_shop_fkey"
      FOREIGN KEY ("shopId", "serviceOrderId")
      REFERENCES "ServiceOrder" ("shopId", "id")
      ON DELETE RESTRICT;
  END IF;
END $$;
