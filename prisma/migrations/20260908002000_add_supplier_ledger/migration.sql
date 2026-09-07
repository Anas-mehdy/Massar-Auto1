CREATE TABLE "SupplierLedgerEntry" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "shopId" UUID NOT NULL REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "supplierId" UUID NOT NULL REFERENCES "Supplier"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "createdByUserId" UUID REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  "type" VARCHAR(32) NOT NULL,
  "amount" NUMERIC(14,2) NOT NULL,
  "manualAppliedAmount" NUMERIC(14,2) NOT NULL DEFAULT 0,
  "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "dueAt" TIMESTAMP(3),
  "description" TEXT,
  "reference" VARCHAR(180),
  "accountType" VARCHAR(20),
  "sourceName" VARCHAR(180),
  "walletId" UUID,
  "cashDrawerMovementId" UUID,
  "financialTransferId" UUID,
  "requestKey" VARCHAR(120),
  "requestFingerprint" VARCHAR(128),
  "status" VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
  "reversedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SupplierLedgerEntry_amount_positive" CHECK ("amount" > 0),
  CONSTRAINT "SupplierLedgerEntry_manual_applied_check" CHECK ("manualAppliedAmount" >= 0 AND "manualAppliedAmount" <= "amount"),
  CONSTRAINT "SupplierLedgerEntry_type_check" CHECK ("type" IN ('OPENING_BALANCE','PAYMENT','ADJUSTMENT_DEBIT','ADJUSTMENT_CREDIT')),
  CONSTRAINT "SupplierLedgerEntry_status_check" CHECK ("status" IN ('ACTIVE','REVERSED')),
  CONSTRAINT "SupplierLedgerEntry_account_check" CHECK ("accountType" IS NULL OR "accountType" IN ('DRAWER','WALLET')),
  CONSTRAINT "SupplierLedgerEntry_wallet_account_check" CHECK (
    ("accountType" = 'WALLET' AND "walletId" IS NOT NULL)
    OR ("accountType" = 'DRAWER' AND "walletId" IS NULL)
    OR "accountType" IS NULL
  ),
  CONSTRAINT "SupplierLedgerEntry_payment_source_check" CHECK ("type" <> 'PAYMENT' OR "accountType" IS NOT NULL)
);

CREATE INDEX "SupplierLedgerEntry_shop_supplier_date_idx"
  ON "SupplierLedgerEntry"("shopId", "supplierId", "occurredAt" DESC);
CREATE INDEX "SupplierLedgerEntry_supplier_status_idx"
  ON "SupplierLedgerEntry"("supplierId", "status");
CREATE INDEX "SupplierLedgerEntry_cash_movement_idx"
  ON "SupplierLedgerEntry"("cashDrawerMovementId") WHERE "cashDrawerMovementId" IS NOT NULL;
CREATE INDEX "SupplierLedgerEntry_financial_transfer_idx"
  ON "SupplierLedgerEntry"("financialTransferId") WHERE "financialTransferId" IS NOT NULL;
CREATE UNIQUE INDEX "SupplierLedgerEntry_shop_request_key_uq"
  ON "SupplierLedgerEntry"("shopId", "requestKey") WHERE "requestKey" IS NOT NULL;

ALTER TABLE "SupplierLedgerEntry" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "SupplierLedgerEntry" FROM anon, authenticated;

-- FinancialWallet / CashDrawerMovement / FinancialTransfer are runtime-managed tables in
-- the current application. Their UUIDs are deliberately stored without migration-time FKs;
-- server writes validate shop ownership and lock the referenced balance row transactionally.
