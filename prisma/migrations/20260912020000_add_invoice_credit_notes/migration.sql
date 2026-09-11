-- Immutable credit-note ledger for post-invoice financial corrections.
-- The original Invoice totals remain unchanged; Invoice.balanceDue/status are cached net state.

CREATE TABLE "InvoiceCreditNote" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "shopId" UUID NOT NULL,
  "invoiceId" UUID NOT NULL,
  "serviceOrderId" UUID,
  "createdByUserId" UUID,
  "creditNoteNumber" TEXT NOT NULL,
  "reasonCode" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "amount" NUMERIC(12,2) NOT NULL,
  "netAmount" NUMERIC(12,2) NOT NULL,
  "taxAmount" NUMERIC(12,2) NOT NULL DEFAULT 0,
  "originalInvoiceTotal" NUMERIC(12,2) NOT NULL,
  "previousCreditTotal" NUMERIC(12,2) NOT NULL DEFAULT 0,
  "effectiveInvoiceTotalAfter" NUMERIC(12,2) NOT NULL,
  "issuedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "notes" TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "InvoiceCreditNote_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "InvoiceCreditNote_reason_code_check" CHECK ("reasonCode" IN (
    'PRICE_ADJUSTMENT',
    'CUSTOMER_COMPENSATION',
    'SERVICE_CORRECTION',
    'DISCOUNT_AFTER_DELIVERY',
    'OTHER'
  )),
  CONSTRAINT "InvoiceCreditNote_amount_check" CHECK (
    "amount" > 0 AND
    "netAmount" >= 0 AND
    "taxAmount" >= 0 AND
    "netAmount" + "taxAmount" = "amount" AND
    "originalInvoiceTotal" >= 0 AND
    "previousCreditTotal" >= 0 AND
    "effectiveInvoiceTotalAfter" >= 0
  ),
  CONSTRAINT "InvoiceCreditNote_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT "InvoiceCreditNote_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT "InvoiceCreditNote_serviceOrderId_fkey" FOREIGN KEY ("serviceOrderId") REFERENCES "ServiceOrder"("id") ON UPDATE CASCADE ON DELETE SET NULL,
  CONSTRAINT "InvoiceCreditNote_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON UPDATE CASCADE ON DELETE SET NULL
);

CREATE UNIQUE INDEX "InvoiceCreditNote_shop_number_key"
  ON "InvoiceCreditNote" ("shopId", "creditNoteNumber");
CREATE INDEX "InvoiceCreditNote_invoice_issued_idx"
  ON "InvoiceCreditNote" ("shopId", "invoiceId", "issuedAt" DESC);
CREATE INDEX "InvoiceCreditNote_service_order_idx"
  ON "InvoiceCreditNote" ("shopId", "serviceOrderId")
  WHERE "serviceOrderId" IS NOT NULL;

CREATE TABLE "InvoiceCreditRefund" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "shopId" UUID NOT NULL,
  "invoiceId" UUID NOT NULL,
  "creditNoteId" UUID,
  "customerId" UUID,
  "createdByUserId" UUID,
  "refundNumber" TEXT NOT NULL,
  "amount" NUMERIC(12,2) NOT NULL,
  "accountType" TEXT NOT NULL,
  "walletId" UUID,
  "bankAccountId" UUID,
  "sourceName" TEXT,
  "reference" TEXT,
  "notes" TEXT,
  "refundedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "cashDrawerMovementId" UUID,
  "bankAccountMovementId" UUID,
  "financialTransferId" UUID,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "InvoiceCreditRefund_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "InvoiceCreditRefund_amount_check" CHECK ("amount" > 0),
  CONSTRAINT "InvoiceCreditRefund_account_type_check" CHECK ("accountType" IN ('DRAWER','WALLET','BANK','OTHER')),
  CONSTRAINT "InvoiceCreditRefund_account_fields_check" CHECK (
    ("accountType" = 'WALLET' AND "walletId" IS NOT NULL AND "bankAccountId" IS NULL) OR
    ("accountType" = 'BANK' AND "bankAccountId" IS NOT NULL AND "walletId" IS NULL) OR
    ("accountType" IN ('DRAWER','OTHER') AND "walletId" IS NULL AND "bankAccountId" IS NULL)
  ),
  CONSTRAINT "InvoiceCreditRefund_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT "InvoiceCreditRefund_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT "InvoiceCreditRefund_creditNoteId_fkey" FOREIGN KEY ("creditNoteId") REFERENCES "InvoiceCreditNote"("id") ON UPDATE CASCADE ON DELETE SET NULL,
  CONSTRAINT "InvoiceCreditRefund_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON UPDATE CASCADE ON DELETE SET NULL,
  CONSTRAINT "InvoiceCreditRefund_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON UPDATE CASCADE ON DELETE SET NULL,
  CONSTRAINT "InvoiceCreditRefund_walletId_fkey" FOREIGN KEY ("walletId") REFERENCES "FinancialWallet"("id") ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT "InvoiceCreditRefund_bankAccountId_fkey" FOREIGN KEY ("bankAccountId") REFERENCES "BankAccount"("id") ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT "InvoiceCreditRefund_cashDrawerMovementId_fkey" FOREIGN KEY ("cashDrawerMovementId") REFERENCES "CashDrawerMovement"("id") ON UPDATE CASCADE ON DELETE SET NULL,
  CONSTRAINT "InvoiceCreditRefund_bankAccountMovementId_fkey" FOREIGN KEY ("bankAccountMovementId") REFERENCES "BankAccountMovement"("id") ON UPDATE CASCADE ON DELETE SET NULL,
  CONSTRAINT "InvoiceCreditRefund_financialTransferId_fkey" FOREIGN KEY ("financialTransferId") REFERENCES "FinancialTransfer"("id") ON UPDATE CASCADE ON DELETE SET NULL
);

CREATE UNIQUE INDEX "InvoiceCreditRefund_shop_number_key"
  ON "InvoiceCreditRefund" ("shopId", "refundNumber");
CREATE INDEX "InvoiceCreditRefund_invoice_refunded_idx"
  ON "InvoiceCreditRefund" ("shopId", "invoiceId", "refundedAt" DESC);
CREATE INDEX "InvoiceCreditRefund_credit_note_idx"
  ON "InvoiceCreditRefund" ("shopId", "creditNoteId")
  WHERE "creditNoteId" IS NOT NULL;

CREATE OR REPLACE FUNCTION "assertInvoiceCreditNoteIntegrity"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  invoice_total NUMERIC(12,2);
  invoice_tax NUMERIC(12,2);
  invoice_service_order UUID;
  prior_credit NUMERIC(12,2);
  prior_tax NUMERIC(12,2);
BEGIN
  SELECT i."total", i."taxTotal", i."serviceOrderId"
    INTO invoice_total, invoice_tax, invoice_service_order
  FROM "Invoice" i
  WHERE i."id" = NEW."invoiceId"
    AND i."shopId" = NEW."shopId"
    AND i."deletedAt" IS NULL
    AND i."status" <> 'VOID'::"InvoiceStatus"
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'invoice_credit_note_invalid_invoice';
  END IF;

  SELECT COALESCE(SUM(cn."amount"), 0), COALESCE(SUM(cn."taxAmount"), 0)
    INTO prior_credit, prior_tax
  FROM "InvoiceCreditNote" cn
  WHERE cn."shopId" = NEW."shopId"
    AND cn."invoiceId" = NEW."invoiceId";

  IF prior_credit + NEW."amount" > invoice_total THEN
    RAISE EXCEPTION 'invoice_credit_note_exceeds_invoice_total';
  END IF;

  IF prior_tax + NEW."taxAmount" > invoice_tax THEN
    RAISE EXCEPTION 'invoice_credit_note_exceeds_invoice_tax';
  END IF;

  IF NEW."serviceOrderId" IS NOT NULL AND NEW."serviceOrderId" IS DISTINCT FROM invoice_service_order THEN
    RAISE EXCEPTION 'invoice_credit_note_service_order_mismatch';
  END IF;

  NEW."serviceOrderId" := invoice_service_order;
  NEW."originalInvoiceTotal" := invoice_total;
  NEW."previousCreditTotal" := prior_credit;
  NEW."effectiveInvoiceTotalAfter" := invoice_total - prior_credit - NEW."amount";
  RETURN NEW;
END;
$$;

CREATE TRIGGER "InvoiceCreditNote_integrity_guard"
BEFORE INSERT ON "InvoiceCreditNote"
FOR EACH ROW EXECUTE FUNCTION "assertInvoiceCreditNoteIntegrity"();

CREATE OR REPLACE FUNCTION "assertInvoiceCreditRefundIntegrity"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  invoice_total NUMERIC(12,2);
  invoice_paid NUMERIC(12,2);
  invoice_customer UUID;
  credit_total NUMERIC(12,2);
  refunded_total NUMERIC(12,2);
  refundable_total NUMERIC(12,2);
BEGIN
  SELECT i."total", i."amountPaid", i."customerId"
    INTO invoice_total, invoice_paid, invoice_customer
  FROM "Invoice" i
  WHERE i."id" = NEW."invoiceId"
    AND i."shopId" = NEW."shopId"
    AND i."deletedAt" IS NULL
    AND i."status" <> 'VOID'::"InvoiceStatus"
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'invoice_credit_refund_invalid_invoice';
  END IF;

  SELECT COALESCE(SUM(cn."amount"), 0)
    INTO credit_total
  FROM "InvoiceCreditNote" cn
  WHERE cn."shopId" = NEW."shopId"
    AND cn."invoiceId" = NEW."invoiceId";

  SELECT COALESCE(SUM(r."amount"), 0)
    INTO refunded_total
  FROM "InvoiceCreditRefund" r
  WHERE r."shopId" = NEW."shopId"
    AND r."invoiceId" = NEW."invoiceId";

  refundable_total := GREATEST(invoice_paid - GREATEST(invoice_total - credit_total, 0), 0);

  IF refunded_total + NEW."amount" > refundable_total THEN
    RAISE EXCEPTION 'invoice_credit_refund_exceeds_refundable_amount';
  END IF;

  IF NEW."creditNoteId" IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM "InvoiceCreditNote" cn
    WHERE cn."id" = NEW."creditNoteId"
      AND cn."shopId" = NEW."shopId"
      AND cn."invoiceId" = NEW."invoiceId"
  ) THEN
    RAISE EXCEPTION 'invoice_credit_refund_credit_note_mismatch';
  END IF;

  NEW."customerId" := invoice_customer;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "InvoiceCreditRefund_integrity_guard"
BEFORE INSERT ON "InvoiceCreditRefund"
FOR EACH ROW EXECUTE FUNCTION "assertInvoiceCreditRefundIntegrity"();

CREATE OR REPLACE FUNCTION "preventInvoiceCreditLedgerMutation"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'invoice_credit_ledger_is_immutable';
END;
$$;

CREATE TRIGGER "InvoiceCreditNote_immutable"
BEFORE UPDATE OR DELETE ON "InvoiceCreditNote"
FOR EACH ROW EXECUTE FUNCTION "preventInvoiceCreditLedgerMutation"();

CREATE TRIGGER "InvoiceCreditRefund_immutable"
BEFORE UPDATE OR DELETE ON "InvoiceCreditRefund"
FOR EACH ROW EXECUTE FUNCTION "preventInvoiceCreditLedgerMutation"();

ALTER TABLE "InvoiceCreditNote" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "InvoiceCreditRefund" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "InvoiceCreditNote" FROM anon, authenticated;
REVOKE ALL ON TABLE "InvoiceCreditRefund" FROM anon, authenticated;
