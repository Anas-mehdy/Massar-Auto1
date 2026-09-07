-- Persist the chosen funding account on drafts. Existing invoices keep their
-- original payment behavior through the application's NULL fallback.
ALTER TABLE "PurchaseInvoice"
  ADD COLUMN "paymentAccountType" VARCHAR(20),
  ADD COLUMN "paymentWalletId" UUID,
  ADD CONSTRAINT "PurchaseInvoice_paymentAccountType_check"
    CHECK ("paymentAccountType" IS NULL OR "paymentAccountType" IN ('DRAWER', 'WALLET', 'OTHER')),
  ADD CONSTRAINT "PurchaseInvoice_paymentWallet_account_check"
    CHECK ("paymentWalletId" IS NULL OR ("paymentAccountType" IS NOT NULL AND "paymentAccountType" = 'WALLET')),
  ADD CONSTRAINT "PurchaseInvoice_shop_paymentWallet_fkey"
    FOREIGN KEY ("shopId", "paymentWalletId") REFERENCES "FinancialWallet"("shopId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
