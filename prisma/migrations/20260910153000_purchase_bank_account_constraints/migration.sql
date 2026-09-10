-- Allow BANK as a first-class money account across purchase payments and supplier refunds.
-- This migration only widens account-type checks and adds consistency checks for bank ids.

ALTER TABLE "PurchaseInvoice"
  DROP CONSTRAINT IF EXISTS "PurchaseInvoice_paymentAccountType_check";
ALTER TABLE "PurchaseInvoice"
  ADD CONSTRAINT "PurchaseInvoice_paymentAccountType_check"
  CHECK ("paymentAccountType" IS NULL OR "paymentAccountType" IN ('DRAWER','WALLET','BANK','OTHER'));

ALTER TABLE "PurchaseInvoice"
  DROP CONSTRAINT IF EXISTS "PurchaseInvoice_paymentBank_account_check";
ALTER TABLE "PurchaseInvoice"
  ADD CONSTRAINT "PurchaseInvoice_paymentBank_account_check"
  CHECK ("paymentBankAccountId" IS NULL OR "paymentAccountType" = 'BANK');

ALTER TABLE "PurchasePayment"
  DROP CONSTRAINT IF EXISTS "PurchasePayment_accountType_check";
ALTER TABLE "PurchasePayment"
  ADD CONSTRAINT "PurchasePayment_accountType_check"
  CHECK ("accountType" IS NULL OR "accountType" IN ('DRAWER','WALLET','BANK','OTHER'));

ALTER TABLE "PurchasePayment"
  DROP CONSTRAINT IF EXISTS "PurchasePayment_money_account_check";
ALTER TABLE "PurchasePayment"
  ADD CONSTRAINT "PurchasePayment_money_account_check"
  CHECK (
    ("accountType" = 'WALLET' AND "walletId" IS NOT NULL AND "bankAccountId" IS NULL)
    OR ("accountType" = 'BANK' AND "walletId" IS NULL AND "bankAccountId" IS NOT NULL)
    OR ("accountType" IN ('DRAWER','OTHER') AND "walletId" IS NULL AND "bankAccountId" IS NULL)
    OR ("accountType" IS NULL AND "walletId" IS NULL AND "bankAccountId" IS NULL)
  );

ALTER TABLE "SupplierReturnSettlement"
  DROP CONSTRAINT IF EXISTS "SupplierReturnSettlement_accountType_check";
ALTER TABLE "SupplierReturnSettlement"
  ADD CONSTRAINT "SupplierReturnSettlement_accountType_check"
  CHECK ("accountType" IS NULL OR "accountType" IN ('DRAWER','WALLET','BANK','OTHER'));

ALTER TABLE "SupplierReturnSettlement"
  DROP CONSTRAINT IF EXISTS "SupplierReturnSettlement_money_account_check";
ALTER TABLE "SupplierReturnSettlement"
  ADD CONSTRAINT "SupplierReturnSettlement_money_account_check"
  CHECK (
    ("accountType" = 'WALLET' AND "walletId" IS NOT NULL AND "bankAccountId" IS NULL)
    OR ("accountType" = 'BANK' AND "walletId" IS NULL AND "bankAccountId" IS NOT NULL)
    OR ("accountType" IN ('DRAWER','OTHER') AND "walletId" IS NULL AND "bankAccountId" IS NULL)
    OR ("accountType" IS NULL AND "walletId" IS NULL AND "bankAccountId" IS NULL)
  );

ALTER TABLE "SupplierReturnSettlement"
  DROP CONSTRAINT IF EXISTS "SupplierReturnSettlement_refund_account_check";
ALTER TABLE "SupplierReturnSettlement"
  ADD CONSTRAINT "SupplierReturnSettlement_refund_account_check"
  CHECK (
    ("type" = 'REFUND' AND "accountType" IS NOT NULL)
    OR ("type" <> 'REFUND' AND "accountType" IS NULL AND "walletId" IS NULL AND "bankAccountId" IS NULL)
  );
