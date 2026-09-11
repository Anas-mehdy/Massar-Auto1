-- A vehicle may be delivered with an unpaid balance (customer debt), but it
-- must have an active invoice so the receivable is represented in the ledger.

CREATE OR REPLACE FUNCTION public."assertServiceOrderInvoiceBeforeDelivery"()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW."status" = 'DELIVERED'
     AND OLD."status" IS DISTINCT FROM NEW."status"
     AND NOT EXISTS (
       SELECT 1
       FROM "Invoice" i
       WHERE i."shopId" = NEW."shopId"
         AND i."serviceOrderId" = NEW."id"
         AND i."deletedAt" IS NULL
         AND i."status" <> 'VOID'::"InvoiceStatus"
     ) THEN
    RAISE EXCEPTION 'لا يمكن تسليم المركبة قبل إصدار فاتورة صيانة فعالة. يمكن أن تبقى الفاتورة على الذمة.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS "ServiceOrder_require_invoice_before_delivery" ON "ServiceOrder";
CREATE TRIGGER "ServiceOrder_require_invoice_before_delivery"
BEFORE UPDATE OF "status"
ON "ServiceOrder"
FOR EACH ROW
EXECUTE FUNCTION public."assertServiceOrderInvoiceBeforeDelivery"();
