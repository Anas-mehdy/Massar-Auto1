-- Tighten the quotation workflow guard: changing the linked order/shop must be validated even when status text stays unchanged.

CREATE OR REPLACE FUNCTION "assertQuotationWorkflowStage"()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  order_status text;
BEGIN
  IF TG_OP = 'UPDATE'
     AND NEW."status" IS NOT DISTINCT FROM OLD."status"
     AND NEW."serviceOrderId" IS NOT DISTINCT FROM OLD."serviceOrderId"
     AND NEW."shopId" IS NOT DISTINCT FROM OLD."shopId" THEN
    RETURN NEW;
  END IF;

  -- Historical/system terminal states do not change work authorization, but re-linking still requires a valid same-shop order.
  SELECT so."status"::text
  INTO order_status
  FROM "ServiceOrder" so
  WHERE so."id" = NEW."serviceOrderId"
    AND so."shopId" = NEW."shopId"
    AND so."deletedAt" IS NULL;

  IF order_status IS NULL THEN
    RAISE EXCEPTION 'عرض السعر يجب أن يرتبط بأمر صيانة صالح من نفس المركز.';
  END IF;

  IF NEW."status"::text IN ('SUPERSEDED', 'EXPIRED') THEN
    RETURN NEW;
  END IF;

  IF order_status NOT IN ('RECEIVED', 'INSPECTING', 'WAITING_CUSTOMER_APPROVAL') THEN
    RAISE EXCEPTION 'لا يمكن إرسال أو اعتماد عرض سعر قديم بعد بدء تنفيذ الصيانة. أنشئ مسار تصحيح مناسب بدلاً من تغيير موافقة سابقة.';
  END IF;

  RETURN NEW;
END;
$$;
