-- Keep automotive business tables inaccessible through the public Data API by default.
-- The application currently uses server-side Prisma/custom auth, so policies can be added
-- explicitly later if a browser-side Supabase access path is introduced.

ALTER TABLE "Vehicle" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ServiceOrder" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ServiceOrderStatusHistory" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ServiceInspection" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ServiceInspectionItem" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ServiceLaborLine" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ServicePartLine" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Quotation" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "QuotationLine" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CustomerApproval" ENABLE ROW LEVEL SECURITY;
