-- Massar Auto: finance controls required by vehicle workshops.
-- Additive and isolated from the legacy phone-repair workflow.

CREATE TABLE "ReceiptVoucher" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "shopId" uuid NOT NULL,
  "voucherNumber" text NOT NULL,
  "customerId" uuid,
  "payerName" text,
  "amount" numeric(14,2) NOT NULL,
  "accountType" varchar(16) NOT NULL DEFAULT 'DRAWER',
  "walletId" uuid,
  "bankAccountId" uuid,
  "sourceName" text,
  "reason" text NOT NULL,
  "reference" text,
  "notes" text,
  "status" varchar(12) NOT NULL DEFAULT 'ACTIVE',
  "receivedAt" timestamptz NOT NULL DEFAULT now(),
  "cashDrawerMovementId" uuid,
  "bankAccountMovementId" uuid,
  "financialTransferId" uuid,
  "createdByUserId" uuid,
  "voidedByUserId" uuid,
  "voidedAt" timestamptz,
  "voidReason" text,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "ReceiptVoucher_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE,
  CONSTRAINT "ReceiptVoucher_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL,
  CONSTRAINT "ReceiptVoucher_walletId_fkey" FOREIGN KEY ("walletId") REFERENCES "FinancialWallet"("id") ON DELETE SET NULL,
  CONSTRAINT "ReceiptVoucher_bankAccountId_fkey" FOREIGN KEY ("bankAccountId") REFERENCES "BankAccount"("id") ON DELETE SET NULL,
  CONSTRAINT "ReceiptVoucher_cashMovementId_fkey" FOREIGN KEY ("cashDrawerMovementId") REFERENCES "CashDrawerMovement"("id") ON DELETE SET NULL,
  CONSTRAINT "ReceiptVoucher_bankMovementId_fkey" FOREIGN KEY ("bankAccountMovementId") REFERENCES "BankAccountMovement"("id") ON DELETE SET NULL,
  CONSTRAINT "ReceiptVoucher_financialTransferId_fkey" FOREIGN KEY ("financialTransferId") REFERENCES "FinancialTransfer"("id") ON DELETE SET NULL,
  CONSTRAINT "ReceiptVoucher_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL,
  CONSTRAINT "ReceiptVoucher_voidedByUserId_fkey" FOREIGN KEY ("voidedByUserId") REFERENCES "User"("id") ON DELETE SET NULL,
  CONSTRAINT "ReceiptVoucher_amount_check" CHECK ("amount" > 0),
  CONSTRAINT "ReceiptVoucher_account_type_check" CHECK ("accountType" IN ('DRAWER','WALLET','BANK','OTHER')),
  CONSTRAINT "ReceiptVoucher_status_check" CHECK ("status" IN ('ACTIVE','VOIDED')),
  CONSTRAINT "ReceiptVoucher_shop_number_key" UNIQUE ("shopId", "voucherNumber")
);
CREATE INDEX "ReceiptVoucher_shop_date_idx" ON "ReceiptVoucher" ("shopId", "receivedAt" DESC);
CREATE INDEX "ReceiptVoucher_customer_idx" ON "ReceiptVoucher" ("shopId", "customerId", "receivedAt" DESC);
CREATE INDEX "ReceiptVoucher_status_idx" ON "ReceiptVoucher" ("shopId", "status", "receivedAt" DESC);

CREATE TABLE "PaymentVoucher" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "shopId" uuid NOT NULL,
  "voucherNumber" text NOT NULL,
  "supplierId" uuid,
  "payeeName" text,
  "amount" numeric(14,2) NOT NULL,
  "accountType" varchar(16) NOT NULL DEFAULT 'DRAWER',
  "walletId" uuid,
  "bankAccountId" uuid,
  "sourceName" text,
  "reason" text NOT NULL,
  "reference" text,
  "notes" text,
  "status" varchar(12) NOT NULL DEFAULT 'ACTIVE',
  "paidAt" timestamptz NOT NULL DEFAULT now(),
  "cashDrawerMovementId" uuid,
  "bankAccountMovementId" uuid,
  "financialTransferId" uuid,
  "createdByUserId" uuid,
  "voidedByUserId" uuid,
  "voidedAt" timestamptz,
  "voidReason" text,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "PaymentVoucher_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE,
  CONSTRAINT "PaymentVoucher_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE SET NULL,
  CONSTRAINT "PaymentVoucher_walletId_fkey" FOREIGN KEY ("walletId") REFERENCES "FinancialWallet"("id") ON DELETE SET NULL,
  CONSTRAINT "PaymentVoucher_bankAccountId_fkey" FOREIGN KEY ("bankAccountId") REFERENCES "BankAccount"("id") ON DELETE SET NULL,
  CONSTRAINT "PaymentVoucher_cashMovementId_fkey" FOREIGN KEY ("cashDrawerMovementId") REFERENCES "CashDrawerMovement"("id") ON DELETE SET NULL,
  CONSTRAINT "PaymentVoucher_bankMovementId_fkey" FOREIGN KEY ("bankAccountMovementId") REFERENCES "BankAccountMovement"("id") ON DELETE SET NULL,
  CONSTRAINT "PaymentVoucher_financialTransferId_fkey" FOREIGN KEY ("financialTransferId") REFERENCES "FinancialTransfer"("id") ON DELETE SET NULL,
  CONSTRAINT "PaymentVoucher_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL,
  CONSTRAINT "PaymentVoucher_voidedByUserId_fkey" FOREIGN KEY ("voidedByUserId") REFERENCES "User"("id") ON DELETE SET NULL,
  CONSTRAINT "PaymentVoucher_amount_check" CHECK ("amount" > 0),
  CONSTRAINT "PaymentVoucher_account_type_check" CHECK ("accountType" IN ('DRAWER','WALLET','BANK','OTHER')),
  CONSTRAINT "PaymentVoucher_status_check" CHECK ("status" IN ('ACTIVE','VOIDED')),
  CONSTRAINT "PaymentVoucher_shop_number_key" UNIQUE ("shopId", "voucherNumber")
);
CREATE INDEX "PaymentVoucher_shop_date_idx" ON "PaymentVoucher" ("shopId", "paidAt" DESC);
CREATE INDEX "PaymentVoucher_supplier_idx" ON "PaymentVoucher" ("shopId", "supplierId", "paidAt" DESC);
CREATE INDEX "PaymentVoucher_status_idx" ON "PaymentVoucher" ("shopId", "status", "paidAt" DESC);

CREATE TABLE "SalesReturn" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "shopId" uuid NOT NULL,
  "saleId" uuid NOT NULL,
  "customerId" uuid,
  "returnNumber" text NOT NULL,
  "status" varchar(12) NOT NULL DEFAULT 'DRAFT',
  "reason" text NOT NULL,
  "total" numeric(14,2) NOT NULL DEFAULT 0,
  "refundAccountType" varchar(16),
  "refundWalletId" uuid,
  "refundBankAccountId" uuid,
  "refundSourceName" text,
  "cashDrawerMovementId" uuid,
  "bankAccountMovementId" uuid,
  "financialTransferId" uuid,
  "createdByUserId" uuid,
  "postedByUserId" uuid,
  "returnedAt" timestamptz NOT NULL DEFAULT now(),
  "postedAt" timestamptz,
  "cancelledAt" timestamptz,
  "notes" text,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "SalesReturn_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE,
  CONSTRAINT "SalesReturn_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "Sale"("id") ON DELETE RESTRICT,
  CONSTRAINT "SalesReturn_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL,
  CONSTRAINT "SalesReturn_refundWalletId_fkey" FOREIGN KEY ("refundWalletId") REFERENCES "FinancialWallet"("id") ON DELETE SET NULL,
  CONSTRAINT "SalesReturn_refundBankAccountId_fkey" FOREIGN KEY ("refundBankAccountId") REFERENCES "BankAccount"("id") ON DELETE SET NULL,
  CONSTRAINT "SalesReturn_cashMovementId_fkey" FOREIGN KEY ("cashDrawerMovementId") REFERENCES "CashDrawerMovement"("id") ON DELETE SET NULL,
  CONSTRAINT "SalesReturn_bankMovementId_fkey" FOREIGN KEY ("bankAccountMovementId") REFERENCES "BankAccountMovement"("id") ON DELETE SET NULL,
  CONSTRAINT "SalesReturn_financialTransferId_fkey" FOREIGN KEY ("financialTransferId") REFERENCES "FinancialTransfer"("id") ON DELETE SET NULL,
  CONSTRAINT "SalesReturn_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL,
  CONSTRAINT "SalesReturn_postedByUserId_fkey" FOREIGN KEY ("postedByUserId") REFERENCES "User"("id") ON DELETE SET NULL,
  CONSTRAINT "SalesReturn_status_check" CHECK ("status" IN ('DRAFT','POSTED','CANCELLED')),
  CONSTRAINT "SalesReturn_total_check" CHECK ("total" >= 0),
  CONSTRAINT "SalesReturn_refund_account_check" CHECK ("refundAccountType" IS NULL OR "refundAccountType" IN ('DRAWER','WALLET','BANK','OTHER')),
  CONSTRAINT "SalesReturn_shop_number_key" UNIQUE ("shopId", "returnNumber"),
  CONSTRAINT "SalesReturn_shop_id_key" UNIQUE ("shopId", "id")
);
CREATE INDEX "SalesReturn_sale_idx" ON "SalesReturn" ("shopId", "saleId", "returnedAt" DESC);
CREATE INDEX "SalesReturn_status_idx" ON "SalesReturn" ("shopId", "status", "returnedAt" DESC);

CREATE TABLE "SalesReturnLine" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "shopId" uuid NOT NULL,
  "salesReturnId" uuid NOT NULL,
  "saleItemId" uuid NOT NULL,
  "inventoryItemId" uuid,
  "warehouseId" uuid,
  "quantity" integer NOT NULL,
  "unitPriceSnapshot" numeric(14,2) NOT NULL,
  "lineTotal" numeric(14,2) NOT NULL,
  "restock" boolean NOT NULL DEFAULT true,
  "reason" text,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "SalesReturnLine_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE,
  CONSTRAINT "SalesReturnLine_return_shop_fkey" FOREIGN KEY ("shopId", "salesReturnId") REFERENCES "SalesReturn"("shopId", "id") ON DELETE CASCADE,
  CONSTRAINT "SalesReturnLine_saleItemId_fkey" FOREIGN KEY ("saleItemId") REFERENCES "SaleItem"("id") ON DELETE RESTRICT,
  CONSTRAINT "SalesReturnLine_inventoryItemId_fkey" FOREIGN KEY ("inventoryItemId") REFERENCES "InventoryItem"("id") ON DELETE SET NULL,
  CONSTRAINT "SalesReturnLine_warehouse_shop_fkey" FOREIGN KEY ("shopId", "warehouseId") REFERENCES "Warehouse"("shopId", "id") ON DELETE SET NULL,
  CONSTRAINT "SalesReturnLine_quantity_check" CHECK ("quantity" > 0),
  CONSTRAINT "SalesReturnLine_price_check" CHECK ("unitPriceSnapshot" >= 0 AND "lineTotal" >= 0),
  CONSTRAINT "SalesReturnLine_return_sale_item_key" UNIQUE ("salesReturnId", "saleItemId")
);
CREATE INDEX "SalesReturnLine_return_idx" ON "SalesReturnLine" ("shopId", "salesReturnId");
CREATE INDEX "SalesReturnLine_inventory_idx" ON "SalesReturnLine" ("shopId", "inventoryItemId");

CREATE TABLE "DailyCashClose" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "shopId" uuid NOT NULL,
  "businessDate" date NOT NULL,
  "status" varchar(12) NOT NULL DEFAULT 'DRAFT',
  "openingBalance" numeric(14,2) NOT NULL DEFAULT 0,
  "cashSalesTotal" numeric(14,2) NOT NULL DEFAULT 0,
  "customerReceiptsTotal" numeric(14,2) NOT NULL DEFAULT 0,
  "receiptVouchersTotal" numeric(14,2) NOT NULL DEFAULT 0,
  "otherCashInTotal" numeric(14,2) NOT NULL DEFAULT 0,
  "supplierPaymentsTotal" numeric(14,2) NOT NULL DEFAULT 0,
  "expensesTotal" numeric(14,2) NOT NULL DEFAULT 0,
  "paymentVouchersTotal" numeric(14,2) NOT NULL DEFAULT 0,
  "otherCashOutTotal" numeric(14,2) NOT NULL DEFAULT 0,
  "expectedCash" numeric(14,2) NOT NULL DEFAULT 0,
  "actualCash" numeric(14,2),
  "variance" numeric(14,2),
  "notes" text,
  "closedByUserId" uuid,
  "closedAt" timestamptz,
  "reopenedByUserId" uuid,
  "reopenedAt" timestamptz,
  "reopenReason" text,
  "closeVersion" integer NOT NULL DEFAULT 1,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "DailyCashClose_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE,
  CONSTRAINT "DailyCashClose_closedByUserId_fkey" FOREIGN KEY ("closedByUserId") REFERENCES "User"("id") ON DELETE SET NULL,
  CONSTRAINT "DailyCashClose_reopenedByUserId_fkey" FOREIGN KEY ("reopenedByUserId") REFERENCES "User"("id") ON DELETE SET NULL,
  CONSTRAINT "DailyCashClose_status_check" CHECK ("status" IN ('DRAFT','CLOSED','REOPENED')),
  CONSTRAINT "DailyCashClose_amounts_check" CHECK (
    "openingBalance" >= 0 AND "cashSalesTotal" >= 0 AND "customerReceiptsTotal" >= 0 AND
    "receiptVouchersTotal" >= 0 AND "otherCashInTotal" >= 0 AND "supplierPaymentsTotal" >= 0 AND
    "expensesTotal" >= 0 AND "paymentVouchersTotal" >= 0 AND "otherCashOutTotal" >= 0 AND "expectedCash" >= 0
  ),
  CONSTRAINT "DailyCashClose_actual_variance_check" CHECK (
    ("actualCash" IS NULL AND "variance" IS NULL) OR
    ("actualCash" IS NOT NULL AND "actualCash" >= 0 AND "variance" = "actualCash" - "expectedCash")
  ),
  CONSTRAINT "DailyCashClose_closed_state_check" CHECK (
    "status" <> 'CLOSED' OR ("closedAt" IS NOT NULL AND "closedByUserId" IS NOT NULL AND "actualCash" IS NOT NULL AND "variance" IS NOT NULL)
  ),
  CONSTRAINT "DailyCashClose_reopen_state_check" CHECK (
    "status" <> 'REOPENED' OR ("reopenedAt" IS NOT NULL AND "reopenedByUserId" IS NOT NULL AND "reopenReason" IS NOT NULL AND btrim("reopenReason") <> '')
  ),
  CONSTRAINT "DailyCashClose_version_check" CHECK ("closeVersion" >= 1),
  CONSTRAINT "DailyCashClose_shop_date_key" UNIQUE ("shopId", "businessDate"),
  CONSTRAINT "DailyCashClose_shop_id_key" UNIQUE ("shopId", "id")
);
CREATE INDEX "DailyCashClose_shop_status_idx" ON "DailyCashClose" ("shopId", "status", "businessDate" DESC);

CREATE TABLE "DailyCashCloseEvent" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "shopId" uuid NOT NULL,
  "dailyCashCloseId" uuid NOT NULL,
  "action" varchar(12) NOT NULL,
  "version" integer NOT NULL,
  "reason" text,
  "snapshot" jsonb NOT NULL,
  "performedByUserId" uuid,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "DailyCashCloseEvent_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE,
  CONSTRAINT "DailyCashCloseEvent_close_shop_fkey" FOREIGN KEY ("shopId", "dailyCashCloseId") REFERENCES "DailyCashClose"("shopId", "id") ON DELETE CASCADE,
  CONSTRAINT "DailyCashCloseEvent_userId_fkey" FOREIGN KEY ("performedByUserId") REFERENCES "User"("id") ON DELETE SET NULL,
  CONSTRAINT "DailyCashCloseEvent_action_check" CHECK ("action" IN ('CLOSED','REOPENED','RECLOSED')),
  CONSTRAINT "DailyCashCloseEvent_version_check" CHECK ("version" >= 1),
  CONSTRAINT "DailyCashCloseEvent_close_version_key" UNIQUE ("dailyCashCloseId", "version", "action")
);
CREATE INDEX "DailyCashCloseEvent_close_idx" ON "DailyCashCloseEvent" ("shopId", "dailyCashCloseId", "createdAt" DESC);

CREATE TABLE "ExpenseCategoryConfig" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "shopId" uuid NOT NULL,
  "code" varchar(40) NOT NULL,
  "name" text NOT NULL,
  "isActive" boolean NOT NULL DEFAULT true,
  "sortOrder" integer NOT NULL DEFAULT 0,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  "deletedAt" timestamptz,
  CONSTRAINT "ExpenseCategoryConfig_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE,
  CONSTRAINT "ExpenseCategoryConfig_shop_code_key" UNIQUE ("shopId", "code"),
  CONSTRAINT "ExpenseCategoryConfig_shop_id_key" UNIQUE ("shopId", "id")
);
CREATE UNIQUE INDEX "ExpenseCategoryConfig_shop_name_active_key" ON "ExpenseCategoryConfig" ("shopId", lower(btrim("name"))) WHERE "deletedAt" IS NULL;
CREATE INDEX "ExpenseCategoryConfig_shop_active_idx" ON "ExpenseCategoryConfig" ("shopId", "isActive", "sortOrder");

-- Optional link used by the automotive expense screen while keeping the legacy enum column intact.
ALTER TABLE "Expense" ADD COLUMN "categoryConfigId" uuid;
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_categoryConfigId_fkey" FOREIGN KEY ("categoryConfigId") REFERENCES "ExpenseCategoryConfig"("id") ON DELETE SET NULL;
CREATE INDEX "Expense_shop_category_config_idx" ON "Expense" ("shopId", "categoryConfigId", "spentAt" DESC);

-- Warehouse audit can now point directly to a partial/complete sales return.
ALTER TABLE "WarehouseMovement" ADD COLUMN "salesReturnId" uuid;
ALTER TABLE "WarehouseMovement" ADD CONSTRAINT "WarehouseMovement_salesReturnId_fkey" FOREIGN KEY ("salesReturnId") REFERENCES "SalesReturn"("id") ON DELETE SET NULL;
CREATE INDEX "WarehouseMovement_sales_return_idx" ON "WarehouseMovement" ("shopId", "salesReturnId");

ALTER TABLE "ReceiptVoucher" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PaymentVoucher" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "SalesReturn" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "SalesReturnLine" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "DailyCashClose" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "DailyCashCloseEvent" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ExpenseCategoryConfig" ENABLE ROW LEVEL SECURITY;
