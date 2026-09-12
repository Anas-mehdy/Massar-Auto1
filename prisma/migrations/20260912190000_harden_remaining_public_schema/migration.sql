-- Massar Auto uses trusted server-side Prisma access. Close the remaining
-- inherited public-schema tables to direct PostgREST access so anon/authenticated
-- cannot bypass application authorization. The application DB role is postgres
-- (BYPASSRLS), so normal server requests are unchanged.

ALTER TABLE "Partner" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Part" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PartnerPortalAccount" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ElectronicServiceProvider" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ElectronicServiceProviderMovement" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "DeviceCompatibility" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PartnerActivationRequest" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "LifetimeSubscription" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "LifetimeSubscriptionPrice" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "RepairOrder" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PlatformBranding" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "RepairStatusHistory" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ShopInvitation" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Sale" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "SaleItem" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "RepairOrderItem" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "SoftwareServiceCatalog" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "WhatsAppTemplate" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "SupplierInvoiceAttachment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Device" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CompatibilityEvidence" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ElectronicServiceProviderReconciliation" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ElectronicServiceTemplate" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ElectronicServiceTransaction" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "SoftwareServiceSale" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "SubscriptionOfferSettings" ENABLE ROW LEVEL SECURITY;

REVOKE ALL PRIVILEGES ON TABLE
  "Partner",
  "Part",
  "PartnerPortalAccount",
  "ElectronicServiceProvider",
  "ElectronicServiceProviderMovement",
  "DeviceCompatibility",
  "PartnerActivationRequest",
  "LifetimeSubscription",
  "LifetimeSubscriptionPrice",
  "RepairOrder",
  "PlatformBranding",
  "RepairStatusHistory",
  "ShopInvitation",
  "Sale",
  "SaleItem",
  "RepairOrderItem",
  "SoftwareServiceCatalog",
  "WhatsAppTemplate",
  "SupplierInvoiceAttachment",
  "Device",
  "CompatibilityEvidence",
  "ElectronicServiceProviderReconciliation",
  "ElectronicServiceTemplate",
  "ElectronicServiceTransaction",
  "SoftwareServiceSale",
  "SubscriptionOfferSettings"
FROM anon, authenticated;

ALTER FUNCTION public."capture_legacy_electronic_provider_adjustment"()
  SET search_path = pg_catalog, public;
