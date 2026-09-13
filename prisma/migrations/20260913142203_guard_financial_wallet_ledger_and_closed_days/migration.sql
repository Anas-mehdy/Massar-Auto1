CREATE OR REPLACE FUNCTION public.assert_financial_wallet_ledger_balance(
  p_shop_id uuid,
  p_wallet_id uuid
)
RETURNS void
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_current numeric(14,2);
  v_ledger numeric(14,2);
BEGIN
  SELECT w."currentBalance"
  INTO v_current
  FROM public."FinancialWallet" w
  WHERE w."id" = p_wallet_id
    AND w."shopId" = p_shop_id;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  SELECT COALESCE(SUM(
    CASE
      WHEN t."status" <> 'ACTIVE' OR t."deletedAt" IS NOT NULL THEN 0
      WHEN t."operationType" IN ('WALLET_TOPUP', 'CUSTOMER_WITHDRAWAL') THEN t."walletAmount"
      WHEN t."operationType" IN ('WALLET_WITHDRAWAL', 'CUSTOMER_DEPOSIT') THEN -t."walletAmount"
      ELSE 0
    END
  ), 0)::numeric(14,2)
  INTO v_ledger
  FROM public."FinancialTransfer" t
  WHERE t."shopId" = p_shop_id
    AND t."walletId" = p_wallet_id;

  IF v_current IS DISTINCT FROM v_ledger THEN
    RAISE EXCEPTION 'Financial wallet balance does not match active transfer ledger';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.guard_financial_wallet_row_balance()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  PERFORM public.assert_financial_wallet_ledger_balance(NEW."shopId", NEW."id");
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.guard_financial_transfer_wallet_balance()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM public.assert_financial_wallet_ledger_balance(OLD."shopId", OLD."walletId");
    RETURN OLD;
  END IF;

  PERFORM public.assert_financial_wallet_ledger_balance(NEW."shopId", NEW."walletId");
  IF TG_OP = 'UPDATE' AND (OLD."shopId", OLD."walletId") IS DISTINCT FROM (NEW."shopId", NEW."walletId") THEN
    PERFORM public.assert_financial_wallet_ledger_balance(OLD."shopId", OLD."walletId");
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS "FinancialWallet_ledger_balance_guard" ON public."FinancialWallet";
CREATE CONSTRAINT TRIGGER "FinancialWallet_ledger_balance_guard"
AFTER INSERT OR UPDATE ON public."FinancialWallet"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION public.guard_financial_wallet_row_balance();

DROP TRIGGER IF EXISTS "FinancialTransfer_wallet_balance_guard" ON public."FinancialTransfer";
CREATE CONSTRAINT TRIGGER "FinancialTransfer_wallet_balance_guard"
AFTER INSERT OR UPDATE OR DELETE ON public."FinancialTransfer"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION public.guard_financial_transfer_wallet_balance();

CREATE OR REPLACE FUNCTION public.massar_auto_financial_business_date(
  p_shop_id uuid,
  p_occurred_at timestamp without time zone
)
RETURNS date
LANGUAGE plpgsql
STABLE
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_country text;
  v_tz text;
BEGIN
  SELECT UPPER(TRIM(s."countryCode"))
  INTO v_country
  FROM public."Shop" s
  WHERE s."id" = p_shop_id
    AND s."deletedAt" IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Shop not found for financial business-date guard';
  END IF;

  v_tz := CASE v_country
    WHEN 'SA' THEN 'Asia/Riyadh'
    WHEN 'EG' THEN 'Africa/Cairo'
    WHEN 'AE' THEN 'Asia/Dubai'
    WHEN 'KW' THEN 'Asia/Kuwait'
    WHEN 'QA' THEN 'Asia/Qatar'
    WHEN 'BH' THEN 'Asia/Bahrain'
    WHEN 'OM' THEN 'Asia/Muscat'
    WHEN 'JO' THEN 'Asia/Amman'
    WHEN 'IQ' THEN 'Asia/Baghdad'
    WHEN 'SY' THEN 'Asia/Damascus'
    WHEN 'PS' THEN 'Asia/Hebron'
    WHEN 'YE' THEN 'Asia/Aden'
    WHEN 'LB' THEN 'Asia/Beirut'
    WHEN 'LY' THEN 'Africa/Tripoli'
    WHEN 'TN' THEN 'Africa/Tunis'
    WHEN 'DZ' THEN 'Africa/Algiers'
    WHEN 'MA' THEN 'Africa/Casablanca'
    WHEN 'SD' THEN 'Africa/Khartoum'
    WHEN 'MR' THEN 'Africa/Nouakchott'
    WHEN 'SO' THEN 'Africa/Mogadishu'
    WHEN 'DJ' THEN 'Africa/Djibouti'
    WHEN 'KM' THEN 'Indian/Comoro'
    WHEN 'TR' THEN 'Europe/Istanbul'
    WHEN 'US' THEN 'America/New_York'
    ELSE 'UTC'
  END;

  RETURN ((p_occurred_at AT TIME ZONE 'UTC') AT TIME ZONE v_tz)::date;
END;
$$;

CREATE OR REPLACE FUNCTION public.assert_financial_business_date_open(
  p_shop_id uuid,
  p_occurred_at timestamp without time zone
)
RETURNS void
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_business_date date;
  v_status text;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(p_shop_id::text, 0));
  v_business_date := public.massar_auto_financial_business_date(p_shop_id, p_occurred_at);

  SELECT d."status"
  INTO v_status
  FROM public."DailyCashClose" d
  WHERE d."shopId" = p_shop_id
    AND d."businessDate" = v_business_date
  LIMIT 1;

  IF v_status = 'CLOSED' THEN
    RAISE EXCEPTION 'Financial business day % is closed', v_business_date;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.guard_financial_transfer_closed_business_day()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_sensitive_change boolean;
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public.assert_financial_business_date_open(NEW."shopId", NEW."createdAt");
    RETURN NEW;
  END IF;

  v_sensitive_change :=
       OLD."shopId" IS DISTINCT FROM NEW."shopId"
    OR OLD."walletId" IS DISTINCT FROM NEW."walletId"
    OR OLD."operationType" IS DISTINCT FROM NEW."operationType"
    OR OLD."amount" IS DISTINCT FROM NEW."amount"
    OR OLD."walletAmount" IS DISTINCT FROM NEW."walletAmount"
    OR OLD."commission" IS DISTINCT FROM NEW."commission"
    OR OLD."commissionMode" IS DISTINCT FROM NEW."commissionMode"
    OR OLD."isDeferred" IS DISTINCT FROM NEW."isDeferred"
    OR OLD."debtEntryId" IS DISTINCT FROM NEW."debtEntryId"
    OR OLD."settlementType" IS DISTINCT FROM NEW."settlementType"
    OR OLD."settlementWalletId" IS DISTINCT FROM NEW."settlementWalletId"
    OR OLD."settlementAmount" IS DISTINCT FROM NEW."settlementAmount"
    OR OLD."settlementTransferId" IS DISTINCT FROM NEW."settlementTransferId"
    OR OLD."settlementCashMovementId" IS DISTINCT FROM NEW."settlementCashMovementId"
    OR OLD."status" IS DISTINCT FROM NEW."status"
    OR OLD."deletedAt" IS DISTINCT FROM NEW."deletedAt"
    OR OLD."createdAt" IS DISTINCT FROM NEW."createdAt";

  IF v_sensitive_change THEN
    PERFORM public.assert_financial_business_date_open(OLD."shopId", OLD."createdAt");
    IF (OLD."shopId", OLD."createdAt") IS DISTINCT FROM (NEW."shopId", NEW."createdAt") THEN
      PERFORM public.assert_financial_business_date_open(NEW."shopId", NEW."createdAt");
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS "FinancialTransfer_closed_business_day_guard" ON public."FinancialTransfer";
CREATE TRIGGER "FinancialTransfer_closed_business_day_guard"
BEFORE INSERT OR UPDATE ON public."FinancialTransfer"
FOR EACH ROW
EXECUTE FUNCTION public.guard_financial_transfer_closed_business_day();
