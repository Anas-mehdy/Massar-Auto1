-- Harden automotive invoice lifecycle invariants.
-- 1) An active automotive invoice may only belong to a service order that is ready/delivered/closed.
-- 2) A service order with an active invoice cannot be moved back to an earlier workflow status.

CREATE OR REPLACE FUNCTION "assertAutoInvoiceServiceOrderStatus"()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  order_status text;
BEGIN
  IF NEW."serviceOrderId" IS NULL
     OR NEW."deletedAt" IS NOT NULL
     OR NEW."status"::text = 'VOID' THEN
    RETURN NEW;
  END IF;

  SELECT so."status"::text
  INTO order_status
  FROM "ServiceOrder" so
  WHERE so."id" = NEW."serviceOrderId"
    AND so."shopId" = NEW."shopId"
    AND so."deletedAt" IS NULL;

  IF order_status IS NULL THEN
    RAISE EXCEPTION 'فاتورة صيانة المركبة يجب أن ترتبط بأمر صيانة صالح من نفس المركز.';
  END IF;

  IF order_status NOT IN ('READY_FOR_DELIVERY', 'DELIVERED', 'CLOSED') THEN
    RAISE EXCEPTION 'لا يمكن إنشاء أو تفعيل فاتورة صيانة قبل وصول أمر الصيانة إلى جاهزة للتسليم.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS "Invoice_guard_auto_service_order_status" ON "Invoice";
CREATE TRIGGER "Invoice_guard_auto_service_order_status"
BEFORE INSERT OR UPDATE OF "serviceOrderId", "shopId", "status", "deletedAt"
ON "Invoice"
FOR EACH ROW
EXECUTE FUNCTION "assertAutoInvoiceServiceOrderStatus"();

CREATE OR REPLACE FUNCTION "assertServiceOrderInvoiceCompatibleStatus"()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW."status" IS NOT DISTINCT FROM OLD."status"
     OR NEW."status"::text IN ('READY_FOR_DELIVERY', 'DELIVERED', 'CLOSED') THEN
    RETURN NEW;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "Invoice" i
    WHERE i."shopId" = NEW."shopId"
      AND i."serviceOrderId" = NEW."id"
      AND i."deletedAt" IS NULL
      AND i."status"::text <> 'VOID'
  ) THEN
    RAISE EXCEPTION 'لا يمكن إعادة أمر الصيانة إلى مرحلة سابقة مع وجود فاتورة فعالة. ألغِ الفاتورة أولاً ثم أعد فتح العمل.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS "ServiceOrder_guard_active_invoice_status" ON "ServiceOrder";
CREATE TRIGGER "ServiceOrder_guard_active_invoice_status"
BEFORE UPDATE OF "status"
ON "ServiceOrder"
FOR EACH ROW
EXECUTE FUNCTION "assertServiceOrderInvoiceCompatibleStatus"();
