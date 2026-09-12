-- Preserve warranty/comeback/rework audit records.
-- Claims are lifecycle documents: they may transition through the guarded workflow but are never deleted.
-- History rows are append-only.

CREATE OR REPLACE FUNCTION "preventServiceWarrantyClaimDelete"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'مطالبة الضمان/العودة سجل تدقيقي ولا يمكن حذفها.';
END;
$$;

CREATE TRIGGER "ServiceWarrantyClaim_delete_guard"
BEFORE DELETE ON "ServiceWarrantyClaim"
FOR EACH ROW
EXECUTE FUNCTION "preventServiceWarrantyClaimDelete"();

CREATE OR REPLACE FUNCTION "preventServiceWarrantyClaimHistoryMutation"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'سجل تاريخ مطالبة الضمان غير قابل للتعديل أو الحذف.';
END;
$$;

CREATE TRIGGER "ServiceWarrantyClaimHistory_immutable"
BEFORE UPDATE OR DELETE ON "ServiceWarrantyClaimHistory"
FOR EACH ROW
EXECUTE FUNCTION "preventServiceWarrantyClaimHistoryMutation"();
