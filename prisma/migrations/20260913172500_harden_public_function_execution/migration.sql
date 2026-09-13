REVOKE ALL PRIVILEGES ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC, anon, authenticated;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL PRIVILEGES ON FUNCTIONS FROM PUBLIC, anon, authenticated;

ALTER FUNCTION public."assertServiceOrderInvoiceBeforeDelivery"()
  SET search_path = pg_catalog, public;
ALTER FUNCTION public."fillPurchaseWarehouseDefault"()
  SET search_path = pg_catalog, public;
