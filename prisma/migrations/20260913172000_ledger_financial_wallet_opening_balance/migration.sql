CREATE OR REPLACE FUNCTION public.seed_financial_wallet_opening_balance()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF NEW."currentBalance" > 0 THEN
    INSERT INTO public."FinancialTransfer" (
      "shopId", "walletId", "operationType", "amount", "walletAmount",
      "commission", "commissionMode", "isDeferred", "notes",
      "sourceType", "sourceReference", "createdAt", "updatedAt"
    ) VALUES (
      NEW."shopId", NEW."id", 'WALLET_TOPUP', NEW."currentBalance", NEW."currentBalance",
      0, 'NONE', FALSE, 'الرصيد الافتتاحي للمحفظة',
      'MANUAL', 'الرصيد الافتتاحي', NEW."createdAt", NEW."createdAt"
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS "FinancialWallet_opening_balance_ledger" ON public."FinancialWallet";
CREATE TRIGGER "FinancialWallet_opening_balance_ledger"
AFTER INSERT ON public."FinancialWallet"
FOR EACH ROW
EXECUTE FUNCTION public.seed_financial_wallet_opening_balance();

REVOKE ALL ON FUNCTION public.seed_financial_wallet_opening_balance() FROM PUBLIC, anon, authenticated;
