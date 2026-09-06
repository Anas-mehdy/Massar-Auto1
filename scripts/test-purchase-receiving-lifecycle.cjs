const assert = require('node:assert/strict');

function round(value) { return Math.round((value + Number.EPSILON) * 100) / 100; }
function clone(value) { return structuredClone(value); }

function makeFixture() {
  const items = Array.from({ length: 20 }, (_, index) => ({
    id: `line-${index + 1}`,
    inventoryItemId: index < 10 ? `existing-${index + 1}` : null,
    newItemName: index < 10 ? null : `New item ${index + 1}`,
    orderedQuantity: 4,
    receivedQuantity: 0,
    returnedQuantity: 0,
    unitCost: 10 + index,
  }));
  const inventory = new Map();
  for (let index = 0; index < 10; index += 1) {
    inventory.set(`existing-${index + 1}`, { quantity: 8 + index, unitCost: round(4.5 + index / 10) });
  }
  const total = round(items.reduce((sum, item) => sum + item.orderedQuantity * item.unitCost, 0));
  return {
    shopId: 'shop-a', status: 'DRAFT', total, amountPaid: 0, returnAdjustmentTotal: 0, balanceDue: total,
    items, inventory, receipts: [], payments: [], returns: [], settlements: [], movements: [],
    postingKeys: new Set(), receiptKeys: new Set(), paymentKeys: new Set(), returnKeys: new Set(), settlementKeys: new Set(),
    drawer: 10000, supplierCredit: 0,
  };
}

function receive(state, key, quantities, meta = {}) {
  if (state.receiptKeys.has(key)) return { alreadyApplied: true };
  const positive = Object.entries(quantities).filter(([, quantity]) => quantity > 0);
  if (!positive.length) return { alreadyApplied: false, empty: true };
  for (const [lineId, quantity] of positive) {
    const line = state.items.find((item) => item.id === lineId);
    assert(line, `unknown receipt line ${lineId}`);
    assert(Number.isInteger(quantity) && quantity > 0);
    const remaining = line.orderedQuantity - line.receivedQuantity;
    assert(quantity <= remaining, `receipt exceeds remaining on ${lineId}`);
  }
  for (const [lineId, quantity] of positive) {
    const line = state.items.find((item) => item.id === lineId);
    const inventory = state.inventory.get(line.inventoryItemId);
    inventory.quantity += quantity;
    line.receivedQuantity += quantity;
    state.movements.push({ type: 'STOCK_IN', lineId, quantityChange: quantity, unitCostSnapshot: line.unitCost });
  }
  state.receiptKeys.add(key);
  state.receipts.push({ key, date: meta.date || '2026-09-06', by: meta.by || 'user-a', quantities: clone(quantities) });
  return { alreadyApplied: false };
}

function post(state, key, { initialPayment = 0, receiptQuantities = {} } = {}) {
  if (state.status === 'POSTED') return { alreadyPosted: true };
  assert.equal(state.status, 'DRAFT');
  assert(!state.postingKeys.has(key));
  for (const line of state.items) {
    if (!line.inventoryItemId) {
      line.inventoryItemId = `new-${line.id}`;
      state.inventory.set(line.inventoryItemId, { quantity: 0, unitCost: line.unitCost });
    }
  }
  if (initialPayment > 0) {
    assert(initialPayment <= state.balanceDue);
    state.drawer = round(state.drawer - initialPayment);
    state.amountPaid = round(state.amountPaid + initialPayment);
    state.balanceDue = round(state.balanceDue - initialPayment);
    state.payments.push({ key: `${key}:payment`, amount: initialPayment, account: 'DRAWER' });
    state.paymentKeys.add(`${key}:payment`);
  }
  receive(state, `${key}:receipt`, receiptQuantities, { by: 'poster' });
  state.status = 'POSTED';
  state.postingKeys.add(key);
  return { alreadyPosted: false };
}

function pay(state, key, amount) {
  if (state.paymentKeys.has(key)) return { alreadyApplied: true };
  assert(state.status === 'POSTED');
  assert(amount > 0 && amount <= state.balanceDue);
  state.drawer = round(state.drawer - amount);
  state.amountPaid = round(state.amountPaid + amount);
  state.balanceDue = round(state.balanceDue - amount);
  state.paymentKeys.add(key);
  state.payments.push({ key, amount, account: 'DRAWER' });
  return { alreadyApplied: false };
}

function supplierReturn(state, key, quantities, reason = 'quality issue') {
  if (state.returnKeys.has(key)) return { alreadyApplied: true, id: `return:${key}` };
  const entries = Object.entries(quantities).filter(([, quantity]) => quantity > 0);
  assert(entries.length > 0);
  let totalValue = 0;
  for (const [lineId, quantity] of entries) {
    const line = state.items.find((item) => item.id === lineId);
    assert(line);
    const inv = state.inventory.get(line.inventoryItemId);
    assert(quantity <= line.receivedQuantity - line.returnedQuantity, 'return exceeds received less previous returns');
    assert(quantity <= inv.quantity, 'return exceeds current inventory');
  }
  for (const [lineId, quantity] of entries) {
    const line = state.items.find((item) => item.id === lineId);
    const inv = state.inventory.get(line.inventoryItemId);
    inv.quantity -= quantity;
    line.returnedQuantity += quantity;
    totalValue = round(totalValue + line.unitCost * quantity);
    state.movements.push({ type: 'STOCK_OUT', lineId, quantityChange: -quantity, unitCostSnapshot: line.unitCost });
  }
  const row = { id: `return:${key}`, key, reason, totalValue, settled: 0 };
  state.returnKeys.add(key); state.returns.push(row);
  return { alreadyApplied: false, id: row.id, totalValue };
}

function settle(state, key, returnId, type, amount) {
  if (state.settlementKeys.has(key)) return { alreadyApplied: true };
  const row = state.returns.find((item) => item.id === returnId);
  assert(row);
  const remaining = round(row.totalValue - row.settled);
  assert(amount > 0 && amount <= remaining);
  if (type === 'PAYABLE_REDUCTION') {
    assert(amount <= state.balanceDue);
    state.returnAdjustmentTotal = round(state.returnAdjustmentTotal + amount);
    state.balanceDue = round(state.balanceDue - amount);
  } else if (type === 'SUPPLIER_CREDIT') {
    state.supplierCredit = round(state.supplierCredit + amount);
  } else if (type === 'REFUND') {
    state.drawer = round(state.drawer + amount);
  } else throw new Error('unsupported settlement');
  row.settled = round(row.settled + amount);
  state.settlementKeys.add(key);
  state.settlements.push({ key, returnId, type, amount });
  return { alreadyApplied: false };
}

const state = makeFixture();
const historicalSale = { itemId: 'existing-1', unitCostSnapshot: 4.5, grossProfit: 75.5 };
const existingCostsBefore = Object.fromEntries([...state.inventory].map(([id, row]) => [id, row.unitCost]));

// Draft save + restore on isolated in-memory data.
const restoredDraft = clone({ status: state.status, total: state.total, items: state.items });
assert.equal(restoredDraft.items.length, 20);
assert.equal(restoredDraft.status, 'DRAFT');

// Partial receipt + partial cash payment while posting.
const firstReceipt = Object.fromEntries(state.items.map((item, index) => [item.id, index % 2 === 0 ? 1 : 2]));
const initialPayment = round(state.total * 0.25);
const drawerBeforePost = state.drawer;
assert.equal(post(state, 'post-request-0001', { initialPayment, receiptQuantities: firstReceipt }).alreadyPosted, false);
assert.equal(state.status, 'POSTED');
assert.equal(state.amountPaid, initialPayment);
assert.equal(state.balanceDue, round(state.total - initialPayment));
assert.equal(state.drawer, round(drawerBeforePost - initialPayment));
assert(state.items.every((item) => item.receivedQuantity > 0 && item.receivedQuantity < item.orderedQuantity));
assert.equal(state.receipts.length, 1);

// Posting from a second window must be a no-op even with a different key.
const snapshotAfterPost = { movements: state.movements.length, payments: state.payments.length, drawer: state.drawer };
assert.equal(post(state, 'post-request-window-2', { initialPayment: 999, receiptQuantities: firstReceipt }).alreadyPosted, true);
assert.deepEqual({ movements: state.movements.length, payments: state.payments.length, drawer: state.drawer }, snapshotAfterPost);

// Receive all remainder later, then retry same request key.
const remaining = Object.fromEntries(state.items.map((item) => [item.id, item.orderedQuantity - item.receivedQuantity]));
assert.equal(receive(state, 'receipt-request-0002', remaining, { date: '2026-09-08', by: 'receiver-b' }).alreadyApplied, false);
const movementCountAfterReceipt = state.movements.length;
assert.equal(receive(state, 'receipt-request-0002', remaining).alreadyApplied, true);
assert.equal(state.movements.length, movementCountAfterReceipt);
assert(state.items.every((item) => item.receivedQuantity === item.orderedQuantity));
assert.throws(() => receive(state, 'receipt-request-overflow', { 'line-1': 1 }), /exceeds remaining/);

// A later payment is independent from receiving, and retry-safe.
const secondPayment = Math.min(150, round(state.balanceDue / 4));
const drawerBeforeSecondPayment = state.drawer;
assert.equal(pay(state, 'payment-request-0003', secondPayment).alreadyApplied, false);
const balanceAfterSecondPayment = state.balanceDue;
assert.equal(state.drawer, round(drawerBeforeSecondPayment - secondPayment));
assert.equal(pay(state, 'payment-request-0003', secondPayment).alreadyApplied, true);
assert.equal(state.balanceDue, balanceAfterSecondPayment);

// Physical return: inventory changes but neither payable nor money account changes.
const dueBeforeReturn = state.balanceDue;
const drawerBeforeReturn = state.drawer;
const r1 = supplierReturn(state, 'return-request-0004', { 'line-1': 1 }, 'different quality');
assert.equal(r1.alreadyApplied, false);
assert.equal(state.balanceDue, dueBeforeReturn);
assert.equal(state.drawer, drawerBeforeReturn);
const movementCountAfterReturn = state.movements.length;
assert.equal(supplierReturn(state, 'return-request-0004', { 'line-1': 1 }).alreadyApplied, true);
assert.equal(state.movements.length, movementCountAfterReturn);

// Settle independently by reducing payable; retry must not double-apply.
assert.equal(settle(state, 'settlement-request-0005', r1.id, 'PAYABLE_REDUCTION', r1.totalValue).alreadyApplied, false);
const dueAfterSettlement = state.balanceDue;
assert.equal(dueAfterSettlement, round(dueBeforeReturn - r1.totalValue));
assert.equal(state.drawer, drawerBeforeReturn);
assert.equal(settle(state, 'settlement-request-0005', r1.id, 'PAYABLE_REDUCTION', r1.totalValue).alreadyApplied, true);
assert.equal(state.balanceDue, dueAfterSettlement);

// Exercise the other financial settlement branches on separate returns.
const r2 = supplierReturn(state, 'return-request-credit', { 'line-2': 1 }, 'supplier credit');
settle(state, 'settlement-request-credit', r2.id, 'SUPPLIER_CREDIT', r2.totalValue);
assert.equal(state.supplierCredit, r2.totalValue);
const r3 = supplierReturn(state, 'return-request-refund', { 'line-3': 1 }, 'cash refund');
const drawerBeforeRefund = state.drawer;
settle(state, 'settlement-request-refund', r3.id, 'REFUND', r3.totalValue);
assert.equal(state.drawer, round(drawerBeforeRefund + r3.totalValue));

// Existing cost valuation remains unchanged; new items use purchase cost; historical sale snapshot stays unchanged.
for (const [id, cost] of Object.entries(existingCostsBefore)) assert.equal(state.inventory.get(id).unitCost, cost);
for (const line of state.items.slice(10)) assert.equal(state.inventory.get(line.inventoryItemId).unitCost, line.unitCost);
assert.deepEqual(historicalSale, { itemId: 'existing-1', unitCostSnapshot: 4.5, grossProfit: 75.5 });

// All stock movements have immutable purchase-cost snapshots and no physical retry duplicated them.
assert(state.movements.every((movement) => Number.isFinite(movement.unitCostSnapshot)));
assert.equal(state.receipts.length, 2);
assert.equal(state.payments.length, 2);
assert.equal(state.returns.length, 3);
assert.equal(state.settlements.length, 3);

console.log('PASS purchase receiving lifecycle sample');
console.log(JSON.stringify({
  invoiceLines: state.items.length,
  receiptStatus: state.items.every((item) => item.receivedQuantity === item.orderedQuantity) ? 'COMPLETE' : 'PARTIAL',
  total: state.total,
  amountPaid: state.amountPaid,
  returnAdjustmentTotal: state.returnAdjustmentTotal,
  balanceDue: state.balanceDue,
  supplierCredit: state.supplierCredit,
  receipts: state.receipts.length,
  payments: state.payments.length,
  supplierReturns: state.returns.length,
  settlements: state.settlements.length,
  stockMovements: state.movements.length,
  historicalSaleCostSnapshot: historicalSale.unitCostSnapshot,
}, null, 2));
