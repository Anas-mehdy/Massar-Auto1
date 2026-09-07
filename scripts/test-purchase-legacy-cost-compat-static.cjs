const fs = require('node:fs');
const assert = require('node:assert/strict');
const read = (path) => fs.readFileSync(path, 'utf8');

const sales = read('lib/services/salesService.ts');
const repairs = read('lib/services/repairOrderService.ts');
const damage = read('lib/services/inventoryDamageService.ts');
const inventory = read('lib/services/inventoryService.ts');
const purchases = read('lib/purchase-costing.ts');
const legacyInvoiceReceipt = read('lib/services/supplierInvoiceAttachmentService.ts');

// Existing outbound/quantity-only flows must preserve unknown cost as NULL instead
// of silently blocking stores that already have such products or inventing zero.
assert.doesNotMatch(sales, /unitCost === null[^\n]*throw/);
assert.doesNotMatch(repairs, /unitCost === null[\s\S]{0,180}throw new Error/);
assert.doesNotMatch(damage, /unitCost === null[^\n]*throw/);
assert.doesNotMatch(inventory, /item\.unitCost===null[^\n]*throw/);
assert.match(sales, /unitCostSnapshot:\s*inventoryItem\.unitCost/);
assert.match(repairs, /return \{[\s\S]*unitCost: item\.unitCost/);
assert.match(repairs, /unitCostSnapshot:\s*deduction\.unitCost/);
assert.match(damage, /unitCostSnapshot:\s*item\.unitCost/);

// Cost-bearing inbound receipts still fail closed when positive legacy stock has
// no known average; a zero-balance item may adopt the new receipt cost.
assert.match(purchases, /if \(currentQuantity === 0\) return receivedUnitCost/);
assert.match(purchases, /if \(input\.currentAverageCost === null\)/);
assert.match(purchases, /حدّد متوسط التكلفة الحالي صراحةً قبل إضافة شراء جديد/);
assert.match(legacyInvoiceReceipt, /movingWeightedAverage/);

console.log('PASS purchase legacy unknown-cost compatibility safeguards');
