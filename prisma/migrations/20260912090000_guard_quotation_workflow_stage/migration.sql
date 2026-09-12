-- Prevent stale quotations from being sent/decided after the service order has moved into execution.
-- The application already creates quotations only in early workflow stages; this trigger makes that invariant database-enforced.

CREATE OR REPLACE FUNCTION "assertQuotationWorkflowStage"()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  order_status text;
BEGIN
  IF TG_OP = 'UPDATE' AND NEW."status" IS NOT DISTINCT FROM OLD."status" THEN
    RETURN NEW;
  END IF;

  -- Historical/system terminal states do not change work authorization.
  IF NEW."status"::text IN ('SUPERSEDED', 'EXPIRED') THEN
    RETURN NEW;
  END IF;

  SELECT so."status"::text
  INTO order_status
  FROM "ServiceOrder" so
  WHERE so."id" = NEW."serviceOrderId"
    AND so."shopId" = NEW."shopId"
    AND so."deletedAt" IS NULL;

  IF order_status IS NULL THEN
    RAISE EXCEPTION 'عرض السعر يجب أن يرتبط بأمر صيانة صالح من نفس المركز.';
  END IF;

  IF order_status NOT IN ('RECEIVED', 'INSPECTING', 'WAITING_CUSTOMER_APPROVAL') THEN
    RAISE EXCEPTION 'لا يمكن إرسال أو اعتماد عرض سعر قديم بعد بدء تنفيذ الصيانة. أنشئ مسار تصحيح مناسب بدلاً من تغيير موافقة سابقة.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS "Quotation_guard_workflow_stage" ON "Quotation";
CREATE TRIGGER "Quotation_guard_workflow_stage"
BEFORE INSERT OR UPDATE OF "status", "serviceOrderId", "shopId"
ON "Quotation"
FOR EACH ROW
EXECUTE FUNCTION "assertQuotationWorkflowStage"();
