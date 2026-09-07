import assert from "node:assert/strict";
import { Prisma } from "@prisma/client";
import { allocatePurchaseCosts, allocatedPartialValue, movingWeightedAverage } from "../lib/purchase-costing";
const D = (value: number | string) => new Prisma.Decimal(value);
let cases = 0;
for (let count = 1; count <= 30; count++) {
  for (let cents = 0; cents <= 50; cents++) {
    const total = D(cents).div(100);
    const lines = Array.from({ length: count }, () => ({ quantity: 1, originalUnitCost: D(1) }));
    const allocated = allocatePurchaseCosts(lines, D(0), total);
    assert(allocated.every(line => line.extraCostAllocation.gte(0)));
    assert(allocated.reduce((sum, line) => sum.add(line.extraCostAllocation), D(0)).eq(total));
    let applied = D(0);
    for (let quantity = 0; quantity < count; quantity++) {
      const value = allocatedPartialValue({ totalValue: total, totalQuantity: count, quantityAlreadyApplied: quantity, valueAlreadyApplied: applied, quantityNow: 1 });
      assert(value.gte(0), `negative receipt: count=${count}, cents=${cents}`);
      applied = applied.add(value);
    }
    assert(applied.eq(total));
    cases++;
  }
}
assert(movingWeightedAverage({ currentQuantity: 10, currentAverageCost: D(5), receivedQuantity: 10, receivedCapitalizedValue: D(80) }).eq('6.5'));
console.log(`PASS actual purchase costing: ${cases} rounding cases and weighted average`);
