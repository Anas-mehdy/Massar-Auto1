-- Massar Auto uses Prisma on the trusted server for legacy/core tables.
-- Supabase's anon/authenticated roles must not be able to bypass application
-- authorization through PostgREST or any other direct table access.
--
-- The application database role is postgres (BYPASSRLS), so these controls do
-- not change the existing Prisma request path. New Auto-native tables already
-- use RLS; this migration closes the inherited legacy gap.

ALTER TABLE "Shop" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "User" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Membership" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Customer" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Supplier" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "InventoryItem" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "InventoryMovement" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Invoice" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Payment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CashDrawer" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CashDrawerMovement" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "FinancialWallet" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "FinancialTransfer" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "BankAccount" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "BankAccountMovement" ENABLE ROW LEVEL SECURITY;

REVOKE ALL PRIVILEGES ON TABLE
  "Shop",
  "User",
  "Membership",
  "Customer",
  "Supplier",
  "InventoryItem",
  "InventoryMovement",
  "Invoice",
  "Payment",
  "CashDrawer",
  "CashDrawerMovement",
  "FinancialWallet",
  "FinancialTransfer",
  "BankAccount",
  "BankAccountMovement"
FROM anon, authenticated;
