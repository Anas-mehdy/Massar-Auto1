import { Prisma } from "@prisma/client";

export const COST_SCALE = 6;
const ZERO = new Prisma.Decimal(0);

export function cost(value: Prisma.Decimal.Value | null | undefined) {
  if (value === null || value === undefined || String(value).trim() === "") return null;
  const result = new Prisma.Decimal(value).toDecimalPlaces(COST_SCALE, Prisma.Decimal.ROUND_HALF_UP);
  if (!result.isFinite() || result.lt(0)) throw new Error("تكلفة المخزون غير صالحة.");
  return result;
}

export function money(value: Prisma.Decimal.Value | null | undefined) {
  const result = new Prisma.Decimal(value ?? 0).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
  if (!result.isFinite()) throw new Error("قيمة مالية غير صالحة.");
  return result;
}

function proportionalAllocation(total: Prisma.Decimal, weights: Prisma.Decimal[]) {
  const roundedTotal = money(total);
  if (roundedTotal.eq(0)) return weights.map(() => ZERO);
  const weightTotal = weights.reduce((sum, weight) => sum.add(weight), ZERO);
  if (weightTotal.lte(0)) throw new Error("لا يمكن توزيع القيمة نسبياً لأن أساس التوزيع يساوي صفراً.");

  const result = weights.map(() => ZERO);
  const eligible = weights.map((weight, index) => ({ weight, index })).filter(({ weight }) => weight.gt(0));
  let allocated = ZERO;
  let cumulativeWeight = ZERO;
  eligible.forEach(({ weight, index }, eligibleIndex) => {
    cumulativeWeight = cumulativeWeight.add(weight);
    const cumulativeValue = eligibleIndex === eligible.length - 1
      ? roundedTotal
      : money(roundedTotal.mul(cumulativeWeight).div(weightTotal));
    const value = cumulativeValue.sub(allocated);
    result[index] = value;
    allocated = allocated.add(value);
  });
  return result;
}

export type PurchaseCostAllocationInput = {
  quantity: number;
  originalUnitCost: Prisma.Decimal;
  manualExtraCostAllocation?: Prisma.Decimal | null;
};

export type PurchaseCostAllocation = {
  originalLineValue: Prisma.Decimal;
  discountAllocation: Prisma.Decimal;
  netMerchandiseValue: Prisma.Decimal;
  netUnitCost: Prisma.Decimal;
  extraCostAllocation: Prisma.Decimal;
  capitalizedLineValue: Prisma.Decimal;
  capitalizedUnitCost: Prisma.Decimal;
};

export function allocatePurchaseCosts(
  lines: PurchaseCostAllocationInput[],
  discountTotalInput: Prisma.Decimal,
  extraCostsTotalInput: Prisma.Decimal,
): PurchaseCostAllocation[] {
  if (!lines.length) throw new Error("لا توجد بنود لتوزيع تكلفة الشراء.");
  const discountTotal = money(discountTotalInput);
  const extraCostsTotal = money(extraCostsTotalInput);
  const originalLineValues = lines.map((line) => {
    if (!Number.isInteger(line.quantity) || line.quantity <= 0) throw new Error("كمية بند الشراء غير صالحة.");
    return money(line.originalUnitCost.mul(line.quantity));
  });
  const subtotal = originalLineValues.reduce((sum, value) => sum.add(value), ZERO);
  if (discountTotal.lt(0) || discountTotal.gt(subtotal)) throw new Error("خصم الفاتورة لا يمكن أن يتجاوز مجموع البنود.");

  const discountAllocations = discountTotal.eq(0)
    ? lines.map(() => ZERO)
    : proportionalAllocation(discountTotal, originalLineValues);
  const netValues = originalLineValues.map((value, index) => money(value.sub(discountAllocations[index])));
  const netTotal = netValues.reduce((sum, value) => sum.add(value), ZERO);

  let extraAllocations: Prisma.Decimal[];
  if (extraCostsTotal.eq(0)) {
    extraAllocations = lines.map(() => ZERO);
  } else if (netTotal.gt(0)) {
    extraAllocations = proportionalAllocation(extraCostsTotal, netValues);
  } else {
    if (lines.some((line) => line.manualExtraCostAllocation === null || line.manualExtraCostAllocation === undefined)) {
      throw new Error("كل قيم البنود بعد الخصم تساوي صفراً. وزّع مصاريف الشراء يدوياً على البنود قبل الاعتماد.");
    }
    extraAllocations = lines.map((line) => money(line.manualExtraCostAllocation!));
    if (extraAllocations.some((value) => value.lt(0))) throw new Error("توزيع مصاريف الشراء اليدوي لا يمكن أن يكون سالباً.");
    const manualTotal = extraAllocations.reduce((sum, value) => sum.add(value), ZERO);
    if (!manualTotal.eq(extraCostsTotal)) throw new Error("مجموع التوزيع اليدوي لمصاريف الشراء يجب أن يساوي إجمالي مصاريف الشراء.");
  }

  return lines.map((line, index) => {
    const originalLineValue = originalLineValues[index];
    const discountAllocation = discountAllocations[index];
    const netMerchandiseValue = netValues[index];
    const extraCostAllocation = extraAllocations[index];
    const capitalizedLineValue = money(netMerchandiseValue.add(extraCostAllocation));
    return {
      originalLineValue,
      discountAllocation,
      netMerchandiseValue,
      netUnitCost: netMerchandiseValue.div(line.quantity).toDecimalPlaces(COST_SCALE, Prisma.Decimal.ROUND_HALF_UP),
      extraCostAllocation,
      capitalizedLineValue,
      capitalizedUnitCost: capitalizedLineValue.div(line.quantity).toDecimalPlaces(COST_SCALE, Prisma.Decimal.ROUND_HALF_UP),
    };
  });
}

export function allocatedPartialValue(input: {
  totalValue: Prisma.Decimal;
  totalQuantity: number;
  quantityAlreadyApplied: number;
  valueAlreadyApplied: Prisma.Decimal;
  quantityNow: number;
}) {
  const { totalQuantity, quantityAlreadyApplied, quantityNow } = input;
  if (!Number.isInteger(totalQuantity) || totalQuantity <= 0 || !Number.isInteger(quantityAlreadyApplied) || quantityAlreadyApplied < 0 || !Number.isInteger(quantityNow) || quantityNow <= 0) {
    throw new Error("كمية توزيع التكلفة غير صالحة.");
  }
  if (quantityAlreadyApplied + quantityNow > totalQuantity) throw new Error("كمية التوزيع تتجاوز كمية البند.");
  const totalValue = money(input.totalValue);
  const already = money(input.valueAlreadyApplied);
  if (quantityAlreadyApplied + quantityNow === totalQuantity) return money(totalValue.sub(already));
  return money(totalValue.mul(quantityAlreadyApplied + quantityNow).div(totalQuantity)).sub(already);
}

export function movingWeightedAverage(input: {
  currentQuantity: number;
  currentAverageCost: Prisma.Decimal | null;
  receivedQuantity: number;
  receivedCapitalizedValue: Prisma.Decimal;
}) {
  const { currentQuantity, receivedQuantity } = input;
  if (!Number.isInteger(currentQuantity) || currentQuantity < 0) {
    throw new Error("المخزون السالب غير مدعوم في سياسة المتوسط المرجح. صحح الرصيد قبل الاستلام.");
  }
  if (!Number.isInteger(receivedQuantity) || receivedQuantity <= 0) throw new Error("كمية الاستلام غير صالحة.");
  const receivedValue = money(input.receivedCapitalizedValue);
  const receivedUnitCost = receivedValue.div(receivedQuantity).toDecimalPlaces(COST_SCALE, Prisma.Decimal.ROUND_HALF_UP);
  if (currentQuantity === 0) return receivedUnitCost;
  if (input.currentAverageCost === null) {
    throw new Error("تكلفة هذا الصنف الحالية غير معروفة رغم وجود رصيد. حدّد متوسط التكلفة الحالي صراحةً قبل إضافة شراء جديد.");
  }
  const currentCost = cost(input.currentAverageCost)!;
  return currentCost.mul(currentQuantity).add(receivedValue).div(currentQuantity + receivedQuantity)
    .toDecimalPlaces(COST_SCALE, Prisma.Decimal.ROUND_HALF_UP);
}

export function inventoryOutboundValue(averageCost: Prisma.Decimal | null, quantity: number) {
  if (averageCost === null) throw new Error("تكلفة المخزون غير معروفة؛ لا يمكن تسجيل حركة إخراج بتكلفة صفرية ضمنياً.");
  if (!Number.isInteger(quantity) || quantity <= 0) throw new Error("كمية الإخراج غير صالحة.");
  const average = cost(averageCost)!;
  return { unitCost: average, totalValue: money(average.mul(quantity)) };
}
