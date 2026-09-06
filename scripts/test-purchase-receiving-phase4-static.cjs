const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

const service = read('lib/services/purchaseReceivingService.ts');
const actions = read('app/inventory/purchases/actions.ts');
const form = read('app/inventory/purchases/_purchase-form.tsx');
const ops = read('app/inventory/purchases/_purchase-operations-panel.tsx');
const detail = read('app/inventory/purchases/[id]/page.tsx');
const list = read('app/inventory/purchases/page.tsx');
const migration = read('prisma/migrations/20260906190000_purchase_receipts_supplier_returns/migration.sql');

function segment(start, end) {
  const a = service.indexOf(start); assert(a >= 0, `missing ${start}`);
  const b = end ? service.indexOf(end, a + start.length) : service.length;
  assert(b > a, `missing end ${end}`);
  return service.slice(a, b);
}

for (const fn of ['postPurchaseInvoice','recordPurchaseReceipt','recordPurchasePayment','recordSupplierReturn','settleSupplierReturn']) {
  assert(service.includes(`function ${fn}`) || service.includes(`function ${fn}(`));
}
assert((service.match(/TransactionIsolationLevel\.Serializable/g) || []).length >= 6, 'write operations must remain serializable');

const post = segment('export async function postPurchaseInvoice', 'export async function recordPurchaseReceipt');
assert(post.includes('FOR UPDATE'));
assert(post.includes('if (purchase.status === "POSTED") {'));
assert(post.includes('purchase.postingKey !== normalizedPostingKey'));
assert(post.includes('purchase.postingFingerprint !== postingFingerprint'));
assert(post.includes('alreadyPosted: true'));
assert(post.includes('receiptMode === "FULL" ? line.orderedQuantity'));
assert(post.includes('createReceiptTx'));
assert(!post.includes('"receivedQuantity" = "orderedQuantity"'));

const receipt = segment('export async function recordPurchaseReceipt', 'export async function recordPurchasePayment');
assert(/FROM \"PurchaseInvoice\"[\s\S]*\"shopId\"\s*=\s*\$\{shopId\}::uuid[\s\S]*FOR UPDATE/.test(receipt));
assert(/FROM \"PurchaseItem\"[\s\S]*\"shopId\"\s*=\s*\$\{shopId\}::uuid/.test(receipt));
assert(receipt.includes('FOR UPDATE'));
assert(receipt.includes('requestKey'));
assert(receipt.includes('createReceiptTx'));

const payment = segment('export async function recordPurchasePayment', 'export async function recordSupplierReturn');
assert(payment.includes('"balanceDue" = "balanceDue" - ${amount}'));
assert(payment.includes('requestKey'));
assert(payment.includes('applyPurchasePaymentMoneyTx'));

const physicalReturn = segment('export async function recordSupplierReturn', 'export async function settleSupplierReturn');
assert(physicalReturn.includes('InventoryMovementType.STOCK_OUT'));
assert(/const\s+returnable\s*=\s*line\.receivedQuantity\s*-\s*line\.returnedQuantity/.test(physicalReturn));
assert(physicalReturn.includes('inventory.quantity'));
assert(physicalReturn.includes('inventoryOutboundValue(inventory.unitCost,quantity)'));
assert(physicalReturn.includes('unitCostSnapshot'));
assert(!physicalReturn.includes('applySupplierRefundMoneyTx'), 'physical return must have no automatic money movement');
assert(!physicalReturn.includes('"balanceDue" ='), 'physical return must not silently change invoice due');

const settlement = segment('export async function settleSupplierReturn', 'export async function getPurchaseInvoice');
assert(settlement.includes('PAYABLE_REDUCTION'));
assert(settlement.includes('SUPPLIER_CREDIT'));
assert(settlement.includes('REFUND'));
assert(settlement.includes('applySupplierRefundMoneyTx'));
assert(settlement.includes('"returnAdjustmentTotal" = "returnAdjustmentTotal" + ${amount}'));

for (const table of ['PurchaseReceipt','SupplierReturn','SupplierReturnSettlement']) {
  assert(migration.includes(`CREATE UNIQUE INDEX IF NOT EXISTS "${table}_shopId_requestKey_key"`));
}
assert(migration.includes('"returnedQuantity" <= "receivedQuantity"'));
assert(migration.includes('PurchaseReceiptItem_receipt_purchaseItem_key'));
assert(migration.includes('SupplierReturnItem_return_purchaseItem_key'));
for (const table of ['PurchaseReceipt','PurchaseReceiptItem','SupplierReturn','SupplierReturnItem','SupplierReturnSettlement']) {
  assert(migration.includes(`ALTER TABLE "${table}" ENABLE ROW LEVEL SECURITY`));
  assert(migration.includes(`REVOKE ALL ON TABLE "${table}" FROM anon, authenticated`));
}

const manageCalls = ['postPurchaseInvoiceAction','recordPurchaseReceiptAction','recordPurchasePaymentAction','recordSupplierReturnAction','settleSupplierReturnAction'];
for (const name of manageCalls) {
  const a = actions.indexOf(`export async function ${name}`); assert(a >= 0);
  const snippet = actions.slice(a, a + 1800);
  assert(snippet.includes('requirePermission("inventory:manage")'), `${name} missing manage permission`);
}

assert(form.includes('استلمت جزءاً من البضاعة'));
assert(form.includes('receiptMode: partialReceipt ? "PARTIAL" : "FULL"'));
assert(ops.includes('تسجيل المرتجع بدون تسوية مالية'));
assert(ops.includes('سيُستخدم نفس مفتاح العملية لمنع التكرار'));
assert(list.includes('receiptStatusView'));
assert(list.includes('السداد</th><th>الاستلام'));
assert(detail.includes('حالة الاستلام'));

// Responsive + dark-mode review markers on all new/updated operation surfaces.
for (const [name, source] of [['form',form],['ops',ops],['detail',detail],['list',list]]) {
  assert(source.includes('dark:'), `${name} missing dark-mode classes`);
}
assert(ops.includes('sm:grid-cols-2') && ops.includes('xl:grid-cols-2'));
assert(list.includes('md:hidden') && list.includes('hidden overflow-x-auto md:block'));

// Tenant scoping markers in every server operation segment.
for (const [name, source] of [['post',post],['receipt',receipt],['payment',payment],['return',physicalReturn],['settlement',settlement]]) {
  assert(source.includes('${shopId}::uuid') || source.includes('${input.shopId}::uuid'), `${name} missing shop scope`);
}

console.log('PASS purchase receiving phase4 static safeguards');
