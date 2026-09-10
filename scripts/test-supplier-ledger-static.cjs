const fs = require("node:fs");

function read(path) { return fs.readFileSync(path, "utf8"); }
function must(text, fragment, label) {
  if (!text.includes(fragment)) throw new Error(`Supplier ledger static check failed: ${label}`);
}
function mustNot(text, fragment, label) {
  if (text.includes(fragment)) throw new Error(`Supplier ledger static check failed: ${label}`);
}

const migration = read("prisma/migrations/20260908002000_add_supplier_ledger/migration.sql");
const bankMigration = read("prisma/migrations/20260910150000_supplier_ledger_bank_payments/migration.sql");
const service = read("lib/services/supplierLedgerService.ts");
const actions = read("app/suppliers/[id]/ledger-actions.ts");
const panel = read("app/suppliers/[id]/_supplier-ledger.tsx");
const cashService = read("lib/services/cashDrawerService.ts");
const cashPresentation = read("lib/cash-drawer-presentation.ts");
const transferService = read("lib/services/financialTransferService.ts");
const transferPresentation = read("lib/financial-transfer-presentation.ts");
const transferDetail = read("app/transfers/[id]/page.tsx");

must(migration, 'CREATE TABLE "SupplierLedgerEntry"', "migration creates supplier ledger");
must(migration, 'ENABLE ROW LEVEL SECURITY', "supplier ledger enables RLS");
must(migration, 'REVOKE ALL ON TABLE "SupplierLedgerEntry" FROM anon, authenticated', "supplier ledger blocks Supabase client roles");
must(migration, 'SupplierLedgerEntry_shop_request_key_uq', "idempotency key is unique per shop");
must(migration, 'SupplierLedgerEntry_wallet_account_check', "wallet/account consistency is constrained");
must(bankMigration, '"accountType" IN (\'DRAWER\',\'WALLET\',\'BANK\')', "supplier ledger DB check allows bank payments");
must(bankMigration, '"bankAccountId" UUID', "supplier ledger stores bank account id");
must(bankMigration, 'SupplierLedgerEntry_bankAccountMovementId_fkey', "supplier ledger links bank movement");

must(service, 'Prisma.TransactionIsolationLevel.Serializable', "supplier writes use serializable transactions");
must(service, 'FOR UPDATE', "supplier payment locks financial rows");
must(service, 'requestFingerprint', "supplier writes fingerprint retries");
must(service, 'manualAppliedAmount', "payment allocation tracks opening/manual debt separately");
must(service, 'ORDER BY "invoiceDate" ASC', "supplier payment targets oldest invoices first");
must(service, '"CashDrawerMovement"', "drawer payment movement is created");
must(service, "'SUPPLIER_PAYMENT'", "supplier money movement has a supplier-specific type");
must(service, '"FinancialTransfer"', "wallet payment movement is created");
must(service, 'bankAccountService.createBankMovementTx', "bank payment movement is created through bank ledger service");
must(service, 'bankAccountMovementId', "supplier ledger persists linked bank movement id");
must(service, 'bankAccountId', "supplier payment persists selected bank account");
must(service, "'SUPPLIER'", "money movements point back to supplier source");
must(service, '[SUPPLIER-LEDGER:', "allocated invoice payments are linked to the supplier-ledger payment");
must(service, '${input.accountType},${walletId}::uuid,${bankAccountId}::uuid', "invoice allocation keeps actual money-account metadata");
mustNot(service, 'INSERT INTO "DebtLedgerEntry"', "supplier debt must never enter customer debt ledger");

must(actions, 'requirePermission("inventory:manage")', "supplier money writes require inventory management permission");
must(actions, 'bankAccountId', "supplier action accepts bank account id");
must(actions, 'revalidatePath("/inventory/purchases/[id]", "page")', "allocated invoices are revalidated");
must(actions, 'revalidatePath("/cash-drawer")', "drawer is revalidated");
must(actions, 'revalidatePath("/transfers")', "wallet transfers are revalidated");
must(actions, 'revalidatePath("/bank-accounts")', "bank accounts are revalidated");

must(panel, 'openingAttempt', "opening balance keeps retry key");
must(panel, 'paymentAttempt', "supplier payment keeps retry key");
must(panel, 'crypto.randomUUID()', "client creates idempotency keys");
must(panel, 'الدرج النقدي', "drawer can fund supplier payments");
must(panel, 'محفظة إلكترونية', "wallet can fund supplier payments");
must(panel, 'حساب بنكي', "bank can fund supplier payments");
must(panel, 'bankAccountId', "supplier UI submits bank account id");
must(panel, 'رصيد المرتجعات لنا لدى المورد', "supplier credit behavior is explained");

must(cashService, '"SUPPLIER_PAYMENT"', "cash drawer type union supports supplier payments");
must(cashService, '"SUPPLIER"', "cash drawer source union supports suppliers");
must(cashPresentation, 'دفعة للمورد', "cash drawer renders supplier payment label");
must(cashPresentation, '/suppliers/${movement.sourceId}', "cash drawer links to supplier");

must(transferService, '"SUPPLIER"', "wallet source union supports suppliers");
must(transferPresentation, 'دفعة للمورد', "wallet history renders supplier payment label");
must(transferPresentation, '/suppliers/${transfer.sourceId}', "wallet history links to supplier");
must(transferDetail, 'SUPPLIER-LEDGER', "wallet details hide internal supplier-ledger retry tag");
must(transferDetail, 'دفعة مورد — خصم مباشر من المحفظة', "wallet details explain supplier settlement");

console.log("Supplier ledger static checks passed.");
