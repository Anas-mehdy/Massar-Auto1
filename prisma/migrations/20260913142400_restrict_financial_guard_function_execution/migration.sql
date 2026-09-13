REVOKE ALL ON FUNCTION public.assert_financial_wallet_ledger_balance(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.guard_financial_wallet_row_balance() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.guard_financial_transfer_wallet_balance() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.massar_auto_financial_business_date(uuid, timestamp without time zone) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.assert_financial_business_date_open(uuid, timestamp without time zone) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.guard_financial_transfer_closed_business_day() FROM PUBLIC, anon, authenticated;
