CREATE OR REPLACE FUNCTION public.assert_cash_drawer_ledger_balance(
  p_shop_id uuid,
  p_drawer_id uuid
)
RETURNS void
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_current numeric(14,2);
  v_ledger numeric(14,2);
BEGIN
  SELECT d."currentBalance"
  INTO v_current
  FROM public."CashDrawer" d
  WHERE d."id" = p_drawer_id
    AND d."shopId" = p_shop_id;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  SELECT COALESCE(SUM(
    CASE
      WHEN m."status" <> 'ACTIVE' THEN 0
      WHEN m."direction" = 'IN' THEN m."amount"
      WHEN m."direction" = 'OUT' THEN -m."amount"
      ELSE 0
    END
  ), 0)::numeric(14,2)
  INTO v_ledger
  FROM public."CashDrawerMovement" m
  WHERE m."shopId" = p_shop_id
    AND m."drawerId" = p_drawer_id;

  IF v_current IS DISTINCT FROM v_ledger THEN
    RAISE EXCEPTION 'Cash drawer balance does not match active movement ledger';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.guard_cash_drawer_row_balance()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  PERFORM public.assert_cash_drawer_ledger_balance(NEW."shopId", NEW."id");
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.guard_cash_drawer_movement_balance()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM public.assert_cash_drawer_ledger_balance(OLD."shopId", OLD."drawerId");
    RETURN OLD;
  END IF;

  PERFORM public.assert_cash_drawer_ledger_balance(NEW."shopId", NEW."drawerId");
  IF TG_OP = 'UPDATE' AND (OLD."shopId", OLD."drawerId") IS DISTINCT FROM (NEW."shopId", NEW."drawerId") THEN
    PERFORM public.assert_cash_drawer_ledger_balance(OLD."shopId", OLD."drawerId");
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.guard_cash_drawer_movement_closed_business_day()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public.assert_financial_business_date_open(NEW."shopId", NEW."createdAt");
    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    PERFORM public.assert_financial_business_date_open(OLD."shopId", OLD."createdAt");
    RETURN OLD;
  END IF;

  PERFORM public.assert_financial_business_date_open(OLD."shopId", OLD."createdAt");
  IF (OLD."shopId", OLD."createdAt") IS DISTINCT FROM (NEW."shopId", NEW."createdAt") THEN
    PERFORM public.assert_financial_business_date_open(NEW."shopId", NEW."createdAt");
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS "CashDrawer_ledger_balance_guard" ON public."CashDrawer";
CREATE CONSTRAINT TRIGGER "CashDrawer_ledger_balance_guard"
AFTER INSERT OR UPDATE ON public."CashDrawer"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION public.guard_cash_drawer_row_balance();

DROP TRIGGER IF EXISTS "CashDrawerMovement_ledger_balance_guard" ON public."CashDrawerMovement";
CREATE CONSTRAINT TRIGGER "CashDrawerMovement_ledger_balance_guard"
AFTER INSERT OR UPDATE OR DELETE ON public."CashDrawerMovement"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION public.guard_cash_drawer_movement_balance();

DROP TRIGGER IF EXISTS "CashDrawerMovement_closed_business_day_guard" ON public."CashDrawerMovement";
CREATE TRIGGER "CashDrawerMovement_closed_business_day_guard"
BEFORE INSERT OR UPDATE OR DELETE ON public."CashDrawerMovement"
FOR EACH ROW
EXECUTE FUNCTION public.guard_cash_drawer_movement_closed_business_day();

REVOKE ALL ON FUNCTION public.assert_cash_drawer_ledger_balance(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.guard_cash_drawer_row_balance() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.guard_cash_drawer_movement_balance() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.guard_cash_drawer_movement_closed_business_day() FROM PUBLIC, anon, authenticated;
