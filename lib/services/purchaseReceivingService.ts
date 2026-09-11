import {
  CompatibilityCandidateStatus,
  CompatibilityImportStatus,
  InventoryMovementType,
  PaymentMethod,
  Prisma,
} from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  allocatePurchaseCosts,
  allocatedPartialValue,
  cost as inventoryCost,
  inventoryOutboundValue,
  money as accountingMoney,
  movingWeightedAverage,
} from "@/lib/purchase-costing";
import { requestFingerprint } from "@/lib/idempotency";
import { purchaseMoneyService } from "@/lib/services/purchaseMoneyService";
import { inventoryCategoryService } from "@/lib/services/inventoryCategoryService";
import {
  resolveImportedMatch,
  scoreNameCandidate,
  type PurchaseMatchCandidateLike,
  type PurchaseMatchResolution,
} from "@/lib/purchase-import";

export type PurchaseDraftLineInput = {
  id?: string;
  inventoryItemId?: string | null;
  newItemName?: string | null;
  newItemSku?: string | null;
  newItemBarcode?: string | null;
  newItemCategoryId?: string | null;
  newItemCategory?: string | null;
  newItemDescription?: string | null;
  importedSourceText?: string | null;
  importSourceId?: string | null;
  importRowKey?: string | null;
  importedPurchaseUnit?: string | null;
  matchReviewRequired?: boolean;
  compatibilityGroupIds?: string[];
  compatibilityReviewNeeded?: boolean;
  updateSalePrice?: boolean;
  quantity: number;
  unitCost: string | number;
  manualExtraCostAllocation?: string | number | null;
  salePrice?: string | number | null;
};

export type PurchaseDraftInput = {
  id?: string | null;
  expectedVersion?: number | null;
  supplierId?: string | null;
  supplierNameSnapshot?: string | null;
  supplierInvoiceNumber?: string | null;
  invoiceDate: string | Date;
  notes?: string | null;
  discountTotal?: string | number | null;
  extraCostsTotal?: string | number | null;
  amountPaid?: string | number | null;
  paymentAccountType?: PurchaseMoneyAccountType | null;
  paymentWalletId?: string | null;
  paymentBankAccountId?: string | null;
  paymentMethod?: PaymentMethod | null;
  paymentSourceName?: string | null;
  paymentReference?: string | null;
  lines: PurchaseDraftLineInput[];
};

export type PurchaseListFilters = {
  search?: string;
  status?: "DRAFT" | "POSTED" | "PAID" | "PARTIAL" | "UNPAID" | "";
};

export type PurchaseReceiptMode = "FULL" | "PARTIAL";
export type PurchaseReceiptLineInput = { purchaseItemId: string; quantity: number };
export type InitialPurchaseReceiptLineInput = { sortOrder: number; quantity: number };
export type PurchaseMoneyAccountType = "DRAWER" | "WALLET" | "BANK" | "OTHER";
export type SupplierReturnSettlementType = "PAYABLE_REDUCTION" | "SUPPLIER_CREDIT" | "REFUND";

export type RecordPurchaseReceiptInput = {
  requestKey: string;
  receivedAt: string | Date;
  reference?: string | null;
  note?: string | null;
  lines: PurchaseReceiptLineInput[];
};

export type RecordPurchasePaymentInput = {
  requestKey: string;
  amount: string | number;
  method: PaymentMethod;
  sourceName?: string | null;
  reference?: string | null;
  paidAt: string | Date;
  accountType: PurchaseMoneyAccountType;
  walletId?: string | null;
  bankAccountId?: string | null;
};

export type RecordSupplierReturnInput = {
  requestKey: string;
  reason: string;
  reference?: string | null;
  returnedAt: string | Date;
  lines: PurchaseReceiptLineInput[];
  shippingRefundAmount?: string | number | null;
  settlementAdjustmentAmount?: string | number | null;
  settlementAdjustmentReason?: string | null;
  allowFinancialAdjustment?: boolean;
};

export type SettleSupplierReturnInput = {
  requestKey: string;
  type: SupplierReturnSettlementType;
  amount: string | number;
  settledAt: string | Date;
  accountType?: PurchaseMoneyAccountType | null;
  walletId?: string | null;
  bankAccountId?: string | null;
  sourceName?: string | null;
  reference?: string | null;
  note?: string | null;
};

export type PurchaseInventorySearchItem = {
  id: string;
  name: string;
  sku: string | null;
  barcode: string | null;
  category: string | null;
  description: string | null;
  quantity: number;
  unitCost: Prisma.Decimal | null;
  unitPrice: Prisma.Decimal;
  compatibilityCount: number;
  lastPurchaseCost: Prisma.Decimal | null;
  lastPurchaseAt: Date | null;
  lastPurchaseSupplierName: string | null;
};

export type ImportedPurchaseMatchInput = {
  rowIndex: number;
  sourceText: string;
  name?: string | null;
  barcode?: string | null;
};

export type ImportedPurchaseMatchResult = {
  rowIndex: number;
  resolution: PurchaseMatchResolution;
  enrichedCandidates: PurchaseInventorySearchItem[];
};

export type PurchaseInvoiceListRow = {
  id: string;
  supplierId: string | null;
  supplierName: string | null;
  supplierInvoiceNumber: string | null;
  invoiceDate: Date;
  status: "DRAFT" | "POSTED";
  currency: string;
  total: Prisma.Decimal;
  amountPaid: Prisma.Decimal;
  returnAdjustmentTotal: Prisma.Decimal;
  balanceDue: Prisma.Decimal;
  receiptStatus: "NONE" | "PARTIAL" | "COMPLETE";
  itemCount: number;
  updatedAt: Date;
};

export type PurchaseDetail = {
  id: string;
  supplierId: string | null;
  supplierNameSnapshot: string | null;
  supplierName: string | null;
  supplierInvoiceNumber: string | null;
  invoiceDate: Date;
  notes: string | null;
  currency: string;
  status: "DRAFT" | "POSTED";
  subtotal: Prisma.Decimal;
  discountTotal: Prisma.Decimal;
  extraCostsTotal: Prisma.Decimal;
  total: Prisma.Decimal;
  amountPaid: Prisma.Decimal;
  returnAdjustmentTotal: Prisma.Decimal;
  balanceDue: Prisma.Decimal;
  receiptStatus: "NONE" | "PARTIAL" | "COMPLETE";
  supplierOutstanding: Prisma.Decimal;
  supplierCredit: Prisma.Decimal;
  postedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  version: number;
  paymentAccountType: PurchaseMoneyAccountType | null;
  paymentWalletId: string | null;
  paymentBankAccountId: string | null;
  paymentMethod: PaymentMethod | null;
  paymentSourceName: string | null;
  paymentReference: string | null;
  items: Array<{
    id: string;
    inventoryItemId: string | null;
    inventoryItemName: string | null;
    inventoryItemSku: string | null;
    inventoryItemBarcode: string | null;
    inventoryItemCategory: string | null;
    inventoryItemDescription: string | null;
    inventoryCurrentSalePrice: Prisma.Decimal | null;
    inventoryCurrentQuantity: number | null;
    lastPurchaseCost: Prisma.Decimal | null;
    lastPurchaseAt: Date | null;
    lastPurchaseSupplierName: string | null;
    newItemName: string | null;
    newItemSku: string | null;
    newItemBarcode: string | null;
    newItemCategoryId: string | null;
    newItemCategory: string | null;
    newItemDescription: string | null;
    importedSourceText: string | null;
    importSourceId: string | null;
    importRowKey: string | null;
    importedPurchaseUnit: string | null;
    matchReviewRequired: boolean;
    compatibilityGroupIds: string[];
    compatibilityReviewNeeded: boolean;
    updateSalePrice: boolean;
    salePriceBeforeSnapshot: Prisma.Decimal | null;
    orderedQuantity: number;
    receivedQuantity: number;
    returnedQuantity: number;
    remainingQuantity: number;
    returnableQuantity: number;
    unitCost: Prisma.Decimal;
    manualExtraCostAllocation: Prisma.Decimal | null;
    discountAllocation: Prisma.Decimal | null;
    netMerchandiseValue: Prisma.Decimal | null;
    netUnitCost: Prisma.Decimal | null;
    extraCostAllocation: Prisma.Decimal | null;
    capitalizedLineValue: Prisma.Decimal | null;
    capitalizedUnitCost: Prisma.Decimal | null;
    receivedCapitalizedValue: Prisma.Decimal;
    receivedNetMerchandiseValue: Prisma.Decimal;
    returnedNetMerchandiseValue: Prisma.Decimal;
    salePriceSnapshot: Prisma.Decimal | null;
    lineTotal: Prisma.Decimal;
    sortOrder: number;
    movements: Array<{
      id: string;
      inventoryItemId: string;
      type: InventoryMovementType;
      quantityChange: number;
      quantityAfter: number | null;
      unitCostSnapshot: Prisma.Decimal | null;
      createdAt: Date;
    }>;
  }>;
  payments: Array<{
    id: string;
    method: PaymentMethod;
    sourceName: string | null;
    amount: Prisma.Decimal;
    reference: string | null;
    paidAt: Date;
    accountType: PurchaseMoneyAccountType | null;
    walletId: string | null;
    bankAccountId: string | null;
    createdByName: string | null;
  }>;
  receipts: Array<{
    id: string;
    receivedAt: Date;
    reference: string | null;
    note: string | null;
    createdByName: string | null;
    lines: Array<{ purchaseItemId: string; quantity: number; unitCostSnapshot: Prisma.Decimal; netMerchandiseValue: Prisma.Decimal; capitalizedValue: Prisma.Decimal }>;
  }>;
  supplierReturns: Array<{
    id: string;
    reason: string;
    reference: string | null;
    returnedAt: Date;
    totalValue: Prisma.Decimal;
    baseSettlementValue: Prisma.Decimal;
    inventoryValue: Prisma.Decimal;
    shippingRefundValue: Prisma.Decimal;
    settlementAdjustmentValue: Prisma.Decimal;
    settlementAdjustmentReason: string | null;
    settledValue: Prisma.Decimal;
    remainingSettlementValue: Prisma.Decimal;
    createdByName: string | null;
    lines: Array<{ purchaseItemId: string; quantity: number; unitCostSnapshot: Prisma.Decimal; inventoryValue: Prisma.Decimal; netMerchandiseValue: Prisma.Decimal; lineTotal: Prisma.Decimal }>;
    settlements: Array<{
      id: string; type: SupplierReturnSettlementType; amount: Prisma.Decimal; accountType: PurchaseMoneyAccountType | null; bankAccountId: string | null;
      sourceName: string | null; reference: string | null; settledAt: Date; createdByName: string | null;
    }>;
  }>;
};

function money(value: string | number | Prisma.Decimal | null | undefined) {
  const raw = typeof value === "string" ? value.trim().replace(",", ".") : String(value ?? 0);
  const result = new Prisma.Decimal(raw || "0").toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
  if (!result.isFinite()) throw new Error("قيمة مالية غير صالحة.");
  return result;
}

function nullableText(value?: string | null) {
  const text = value?.trim();
  return text ? text : null;
}

function normalizedBarcode(value?: string | null) {
  return nullableText(value)?.replace(/\s+/g, "") ?? null;
}

function dateValue(value: string | Date) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error("تاريخ فاتورة الشراء غير صالح.");
  return date;
}

function uniqueUuids(ids?: string[]) {
  return [...new Set((ids ?? []).map((id) => id.trim()).filter(Boolean))];
}

function uuidArraySql(ids?: string[]) {
  const values = uniqueUuids(ids);
  if (!values.length) return Prisma.sql`ARRAY[]::uuid[]`;
  return Prisma.sql`ARRAY[${Prisma.join(values.map((id) => Prisma.sql`${id}::uuid`))}]`;
}

function cleanLines(lines: PurchaseDraftLineInput[]) {
  return lines
    .map((line, index) => ({ ...line, sortOrder: index }))
    .filter((line) => Boolean(line.inventoryItemId || nullableText(line.newItemName) || normalizedBarcode(line.newItemBarcode)));
}

function calculate(input: PurchaseDraftInput, strict = true) {
  const lines = cleanLines(input.lines);
  const normalizedLines = lines.map((line) => {
    const quantity = Number(line.quantity);
    if (!Number.isInteger(quantity) || quantity <= 0) throw new Error("كل كمية يجب أن تكون عدداً صحيحاً أكبر من صفر.");
    const unitCost = inventoryCost(line.unitCost);
    if (!unitCost) throw new Error("تكلفة شراء الصنف مطلوبة ولا يمكن اعتبارها صفراً ضمنياً.");
    const salePrice = line.salePrice === null || line.salePrice === undefined || String(line.salePrice).trim() === ""
      ? null
      : money(line.salePrice);
    if (salePrice?.lt(0)) throw new Error("سعر البيع لا يمكن أن يكون سالباً.");
    if (line.updateSalePrice && line.inventoryItemId && salePrice === null) {
      throw new Error("أدخل سعر البيع الجديد قبل تفعيل تحديث سعر البيع.");
    }
    const manualExtraCostAllocation = line.manualExtraCostAllocation === null || line.manualExtraCostAllocation === undefined || String(line.manualExtraCostAllocation).trim() === ""
      ? null
      : money(line.manualExtraCostAllocation);
    if (manualExtraCostAllocation?.lt(0)) throw new Error("توزيع مصاريف الشراء اليدوي لا يمكن أن يكون سالباً.");
    return {
      ...line,
      newItemBarcode: normalizedBarcode(line.newItemBarcode),
      compatibilityGroupIds: uniqueUuids(line.compatibilityGroupIds),
      quantity,
      unitCost,
      manualExtraCostAllocation,
      salePrice,
      lineTotal: accountingMoney(unitCost.mul(quantity)),
    };
  });

  const subtotal = normalizedLines.reduce((sum, line) => sum.add(line.lineTotal), new Prisma.Decimal(0));
  const discountTotal = money(input.discountTotal);
  const extraCostsTotal = money(input.extraCostsTotal);
  const amountPaid = money(input.amountPaid);
  if (discountTotal.lt(0) || extraCostsTotal.lt(0) || amountPaid.lt(0)) throw new Error("المجاميع لا يمكن أن تكون سالبة.");
  if (strict && discountTotal.gt(subtotal)) throw new Error("خصم الفاتورة لا يمكن أن يتجاوز مجموع البنود.");
  const rawTotal = accountingMoney(subtotal.sub(discountTotal).add(extraCostsTotal));
  const total = strict ? rawTotal : Prisma.Decimal.max(rawTotal, new Prisma.Decimal(0));
  if (strict && amountPaid.gt(total)) throw new Error("المبلغ المدفوع لا يمكن أن يتجاوز إجمالي فاتورة الشراء.");
  const balanceDue = accountingMoney(Prisma.Decimal.max(total.sub(amountPaid), new Prisma.Decimal(0)));

  // Validate the allocation rule while drafting when it is determinable. A zero-value
  // invoice with direct costs intentionally requires explicit per-line allocation.
  if (strict || (subtotal.eq(0) && extraCostsTotal.gt(0))) {
    allocatePurchaseCosts(
      normalizedLines.map((line) => ({
        quantity: line.quantity,
        originalUnitCost: line.unitCost,
        manualExtraCostAllocation: line.manualExtraCostAllocation,
      })),
      discountTotal,
      extraCostsTotal,
    );
  }

  return { lines: normalizedLines, subtotal, discountTotal, extraCostsTotal, total, amountPaid, balanceDue };
}

async function validateSupplier(shopId: string, supplierId?: string | null) {
  if (!supplierId) return null;
  const supplier = await prisma.supplier.findFirst({
    where: { id: supplierId, shopId, deletedAt: null },
    select: { id: true, name: true },
  });
  if (!supplier) throw new Error("المورد المحدد غير موجود أو لا ينتمي إلى هذا المتجر.");
  return supplier;
}

async function validateExistingInventoryIds(shopId: string, ids: string[]) {
  const unique = [...new Set(ids)];
  if (!unique.length) return;
  const count = await prisma.inventoryItem.count({ where: { id: { in: unique }, shopId, deletedAt: null } });
  if (count !== unique.length) throw new Error("أحد أصناف المخزون لم يعد متاحاً أو لا ينتمي إلى هذا المتجر.");
}

async function validateCategoryIds(shopId: string, ids: string[]) {
  const unique = [...new Set(ids.filter(Boolean))];
  if (!unique.length) return;
  const rows = await prisma.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    SELECT "id" FROM "InventoryCategory"
    WHERE "shopId" = ${shopId}::uuid AND "deletedAt" IS NULL
      AND "id" IN (${Prisma.join(unique.map((id) => Prisma.sql`${id}::uuid`))})
  `);
  if (rows.length !== unique.length) throw new Error("أحد التصنيفات المحددة غير موجود أو لا ينتمي إلى هذا المتجر.");
}

async function validateImportSources(shopId: string, purchaseId: string | null | undefined, lines: Array<Pick<PurchaseDraftLineInput, "importSourceId" | "importRowKey">>) {
  const sourceIds = [...new Set(lines.flatMap((line) => line.importSourceId ? [line.importSourceId] : []))];
  for (const line of lines) {
    if (line.importRowKey && !line.importSourceId) throw new Error("مرجع سطر الاستيراد غير مكتمل.");
    if (line.importSourceId && !line.importRowKey) throw new Error("مرجع سطر الاستيراد غير مكتمل.");
  }
  if (!sourceIds.length) return;
  if (!purchaseId) throw new Error("يجب حفظ مسودة الفاتورة قبل نقل بنود مصدر مستورد إليها.");
  const rows = await prisma.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    SELECT "id" FROM "PurchaseImportSource"
    WHERE "shopId"=${shopId}::uuid AND "purchaseInvoiceId"=${purchaseId}::uuid
      AND "id" IN (${Prisma.join(sourceIds.map((id) => Prisma.sql`${id}::uuid`))})
  `);
  if (rows.length !== sourceIds.length) throw new Error("أحد مصادر الاستيراد لا ينتمي إلى هذه المسودة أو هذا المتجر.");
}

async function validateCompatibilityGroups(tx: Prisma.TransactionClient, ids: string[]) {
  const groupIds = uniqueUuids(ids);
  if (!groupIds.length) return groupIds;
  const validGroups = await tx.compatibilityCandidateGroup.count({
    where: {
      id: { in: groupIds },
      status: { in: [CompatibilityCandidateStatus.READY_FOR_CORROBORATION, CompatibilityCandidateStatus.APPROVED] },
      batch: { status: { in: [CompatibilityImportStatus.READY_FOR_REVIEW, CompatibilityImportStatus.IMPORTED] } },
    },
  });
  if (validGroups !== groupIds.length) throw new Error("أحد اقتراحات التوافق لم يعد متاحاً في دليل التوافقات.");
  return groupIds;
}

type BaseInventoryRow = {
  id: string;
  name: string;
  sku: string | null;
  barcode: string | null;
  category: string | null;
  description: string | null;
  quantity: number;
  unitCost: Prisma.Decimal | null;
  unitPrice: Prisma.Decimal;
  compatibilityCount: number;
};

async function enrichLastPurchase(shopId: string, rows: BaseInventoryRow[]): Promise<PurchaseInventorySearchItem[]> {
  if (!rows.length) return [];
  const ids = rows.map((row) => row.id);
  const history = await prisma.$queryRaw<Array<{
    inventoryItemId: string;
    lastPurchaseCost: Prisma.Decimal | null;
    lastPurchaseAt: Date | null;
    lastPurchaseSupplierName: string | null;
  }>>(Prisma.sql`
    SELECT DISTINCT ON (m."inventoryItemId")
      m."inventoryItemId",
      m."unitCostSnapshot" AS "lastPurchaseCost",
      m."createdAt" AS "lastPurchaseAt",
      s."name" AS "lastPurchaseSupplierName"
    FROM "InventoryMovement" m
    LEFT JOIN "Supplier" s ON s."id" = m."supplierId" AND s."shopId" = ${shopId}::uuid AND s."deletedAt" IS NULL
    WHERE m."shopId" = ${shopId}::uuid
      AND m."deletedAt" IS NULL
      AND m."type" = 'STOCK_IN'::"InventoryMovementType"
      AND m."unitCostSnapshot" IS NOT NULL
      AND m."inventoryItemId" IN (${Prisma.join(ids.map((id) => Prisma.sql`${id}::uuid`))})
    ORDER BY m."inventoryItemId", m."createdAt" DESC
  `);
  const byId = new Map(history.map((row) => [row.inventoryItemId, row]));
  return rows.map((row) => ({
    ...row,
    lastPurchaseCost: byId.get(row.id)?.lastPurchaseCost ?? null,
    lastPurchaseAt: byId.get(row.id)?.lastPurchaseAt ?? null,
    lastPurchaseSupplierName: byId.get(row.id)?.lastPurchaseSupplierName ?? null,
  }));
}

export async function searchInventory(shopId: string, query: string): Promise<PurchaseInventorySearchItem[]> {
  const q = query.trim();
  if (!q) return [];
  const rows = await prisma.$queryRaw<BaseInventoryRow[]>(Prisma.sql`
    SELECT i."id", i."name", i."sku", i."barcode", i."category", i."description", i."quantity", i."unitCost", i."unitPrice",
      COUNT(icg."id")::int AS "compatibilityCount"
    FROM "InventoryItem" i
    LEFT JOIN "InventoryCompatibilityGroup" icg ON icg."inventoryItemId" = i."id"
    WHERE i."shopId" = ${shopId}::uuid AND i."deletedAt" IS NULL
      AND (
        i."name" ILIKE ${`%${q}%`} OR COALESCE(i."sku", '') ILIKE ${`%${q}%`}
        OR COALESCE(i."barcode", '') = ${q.replace(/\s+/g, "")}
        OR COALESCE(i."category", '') ILIKE ${`%${q}%`} OR COALESCE(i."description", '') ILIKE ${`%${q}%`}
      )
    GROUP BY i."id"
    ORDER BY CASE WHEN COALESCE(i."barcode", '') = ${q.replace(/\s+/g, "")} THEN 0 WHEN LOWER(COALESCE(i."sku", '')) = LOWER(${q}) THEN 1 ELSE 2 END,
      i."updatedAt" DESC
    LIMIT 15
  `);
  return enrichLastPurchase(shopId, rows);
}

async function exactIdentifierCandidates(shopId: string, code: string) {
  const normalized = code.trim().replace(/\s+/g, "");
  if (!normalized) return { barcode: [] as PurchaseInventorySearchItem[], sku: [] as PurchaseInventorySearchItem[] };
  const barcodeRows = await prisma.$queryRaw<BaseInventoryRow[]>(Prisma.sql`
    SELECT i."id", i."name", i."sku", i."barcode", i."category", i."description", i."quantity", i."unitCost", i."unitPrice",
      COUNT(icg."id")::int AS "compatibilityCount"
    FROM "InventoryItem" i
    LEFT JOIN "InventoryCompatibilityGroup" icg ON icg."inventoryItemId" = i."id"
    WHERE i."shopId" = ${shopId}::uuid AND i."deletedAt" IS NULL AND i."barcode" = ${normalized}
    GROUP BY i."id" ORDER BY i."updatedAt" DESC LIMIT 5
  `);
  if (barcodeRows.length) return { barcode: await enrichLastPurchase(shopId, barcodeRows), sku: [] as PurchaseInventorySearchItem[] };
  const skuRows = await prisma.$queryRaw<BaseInventoryRow[]>(Prisma.sql`
    SELECT i."id", i."name", i."sku", i."barcode", i."category", i."description", i."quantity", i."unitCost", i."unitPrice",
      COUNT(icg."id")::int AS "compatibilityCount"
    FROM "InventoryItem" i
    LEFT JOIN "InventoryCompatibilityGroup" icg ON icg."inventoryItemId" = i."id"
    WHERE i."shopId" = ${shopId}::uuid AND i."deletedAt" IS NULL AND LOWER(COALESCE(i."sku", '')) = LOWER(${normalized})
    GROUP BY i."id" ORDER BY i."updatedAt" DESC LIMIT 5
  `);
  return { barcode: [], sku: await enrichLastPurchase(shopId, skuRows) };
}

export async function lookupInventoryByIdentifier(shopId: string, code: string) {
  const exact = await exactIdentifierCandidates(shopId, code);
  if (exact.barcode.length === 1) return { state: "existing" as const, reason: "barcode" as const, item: exact.barcode[0], candidates: exact.barcode };
  if (exact.barcode.length > 1) return { state: "review" as const, reason: "identifier-duplicate" as const, item: null, candidates: exact.barcode };
  if (exact.sku.length === 1) return { state: "existing" as const, reason: "sku" as const, item: exact.sku[0], candidates: exact.sku };
  if (exact.sku.length > 1) return { state: "review" as const, reason: "identifier-duplicate" as const, item: null, candidates: exact.sku };
  return { state: "new" as const, reason: "no-match" as const, item: null, candidates: [] as PurchaseInventorySearchItem[] };
}

export async function getInventoryItemsByIds(shopId: string, ids: string[]): Promise<PurchaseInventorySearchItem[]> {
  const uniqueIds = [...new Set(ids.filter(Boolean))].slice(0, 250);
  if (!uniqueIds.length) return [];
  const rows = await prisma.$queryRaw<BaseInventoryRow[]>(Prisma.sql`
    SELECT i."id", i."name", i."sku", i."barcode", i."category", i."description", i."quantity", i."unitCost", i."unitPrice",
      COUNT(icg."id")::int AS "compatibilityCount"
    FROM "InventoryItem" i
    LEFT JOIN "InventoryCompatibilityGroup" icg ON icg."inventoryItemId" = i."id"
    WHERE i."shopId" = ${shopId}::uuid AND i."deletedAt" IS NULL
      AND i."id" IN (${Prisma.join(uniqueIds.map((id) => Prisma.sql`${id}::uuid`))})
    GROUP BY i."id"
  `);
  return enrichLastPurchase(shopId, rows);
}

function asMatchCandidate(item: PurchaseInventorySearchItem): PurchaseMatchCandidateLike {
  return { id: item.id, name: item.name, barcode: item.barcode, sku: item.sku, category: item.category, description: item.description };
}

export async function matchImportedRows(shopId: string, rows: ImportedPurchaseMatchInput[]): Promise<ImportedPurchaseMatchResult[]> {
  const results: ImportedPurchaseMatchResult[] = [];
  for (let offset = 0; offset < rows.length; offset += 8) {
    const chunk = rows.slice(offset, offset + 8);
    const chunkResults = await Promise.all(chunk.map(async (row) => {
      const code = normalizedBarcode(row.barcode);
      const exact = code ? await exactIdentifierCandidates(shopId, code) : { barcode: [], sku: [] };
      let nameCandidates: PurchaseInventorySearchItem[] = [];
      if (!exact.barcode.length && !exact.sku.length && nullableText(row.name)) {
        nameCandidates = await searchInventory(shopId, row.name!.trim());
      }
      const resolution = resolveImportedMatch({
        barcode: code ?? undefined,
        name: row.name ?? undefined,
        exactBarcode: exact.barcode.map(asMatchCandidate),
        exactSku: exact.sku.map(asMatchCandidate),
        nameCandidates: nameCandidates.map(asMatchCandidate),
      });
      const candidateIds = new Set(
        resolution.state === "existing"
          ? [resolution.item.id]
          : resolution.state === "review"
            ? resolution.candidates.map((candidate) => candidate.id)
            : [],
      );
      const enrichedCandidates = [...exact.barcode, ...exact.sku, ...nameCandidates].filter((item, index, all) =>
        candidateIds.has(item.id) && all.findIndex((candidate) => candidate.id === item.id) === index,
      );
      return { rowIndex: row.rowIndex, resolution, enrichedCandidates } satisfies ImportedPurchaseMatchResult;
    }));
    results.push(...chunkResults);
  }
  return results;
}

export async function suggestNewItemMetadata(shopId: string, text: string) {
  const query = text.trim();
  if (query.length < 2) return { categories: [] as Array<{ id: string; name: string; score: number }>, modelQuery: query };
  const categories = await inventoryCategoryService.listInventoryCategories(shopId);
  const candidates = await searchInventory(shopId, query);
  const categoryScore = new Map<string, { id: string; name: string; score: number }>();
  for (const candidate of candidates) {
    if (!candidate.category) continue;
    const category = categories.find((item) => item.name.toLocaleLowerCase() === candidate.category!.toLocaleLowerCase());
    if (!category) continue;
    const score = scoreNameCandidate(query, candidate);
    const current = categoryScore.get(category.id);
    if (!current || score > current.score) categoryScore.set(category.id, { id: category.id, name: category.name, score });
  }
  return {
    categories: [...categoryScore.values()].sort((a, b) => b.score - a.score).slice(0, 3),
    // This is only a search seed for the existing compatibility guide. It never creates a link.
    modelQuery: query,
  };
}

export async function listPurchaseInvoices(shopId: string, filters: PurchaseListFilters = {}): Promise<PurchaseInvoiceListRow[]> {
  const search = nullableText(filters.search);
  const searchLike = search ? `%${search.replace(/[%_]/g, "\\$&")}%` : null;
  const status = filters.status || "";
  return prisma.$queryRaw<PurchaseInvoiceListRow[]>(Prisma.sql`
    SELECT p."id", p."supplierId", COALESCE(s."name", p."supplierNameSnapshot") AS "supplierName",
      p."supplierInvoiceNumber", p."invoiceDate", p."status", p."currency", p."total", p."amountPaid",
      COALESCE(p."returnAdjustmentTotal", 0) AS "returnAdjustmentTotal", p."balanceDue",
      CASE
        WHEN COALESCE(SUM(pi."receivedQuantity"), 0) = 0 THEN 'NONE'
        WHEN COALESCE(SUM(pi."receivedQuantity"), 0) >= COALESCE(SUM(pi."orderedQuantity"), 0) THEN 'COMPLETE'
        ELSE 'PARTIAL'
      END AS "receiptStatus",
      COUNT(pi."id")::int AS "itemCount", p."updatedAt"
    FROM "PurchaseInvoice" p
    LEFT JOIN "Supplier" s ON s."id" = p."supplierId" AND s."shopId" = ${shopId}::uuid
    LEFT JOIN "PurchaseItem" pi ON pi."purchaseInvoiceId" = p."id" AND pi."shopId" = ${shopId}::uuid
    WHERE p."shopId" = ${shopId}::uuid AND p."deletedAt" IS NULL
      ${searchLike ? Prisma.sql`AND (COALESCE(s."name", p."supplierNameSnapshot", '') ILIKE ${searchLike} ESCAPE '\\' OR COALESCE(p."supplierInvoiceNumber", '') ILIKE ${searchLike} ESCAPE '\\')` : Prisma.empty}
      ${status === "DRAFT" || status === "POSTED" ? Prisma.sql`AND p."status" = ${status}` : Prisma.empty}
      ${status === "PAID" ? Prisma.sql`AND p."status" = 'POSTED' AND p."balanceDue" = 0` : Prisma.empty}
      ${status === "PARTIAL" ? Prisma.sql`AND p."status" = 'POSTED' AND (p."amountPaid" > 0 OR COALESCE(p."returnAdjustmentTotal", 0) > 0) AND p."balanceDue" > 0` : Prisma.empty}
      ${status === "UNPAID" ? Prisma.sql`AND p."status" = 'POSTED' AND p."amountPaid" = 0 AND COALESCE(p."returnAdjustmentTotal", 0) = 0 AND p."balanceDue" > 0` : Prisma.empty}
    GROUP BY p."id", s."name"
    ORDER BY CASE WHEN p."status" = 'DRAFT' THEN 0 ELSE 1 END, p."updatedAt" DESC
    LIMIT 150
  `);
}

export async function findDuplicateSupplierInvoice(
  shopId: string,
  supplierId: string | null | undefined,
  supplierInvoiceNumber: string | null | undefined,
  excludeId?: string | null,
) {
  const number = nullableText(supplierInvoiceNumber);
  if (!supplierId || !number) return null;
  const rows = await prisma.$queryRaw<Array<{ id: string; invoiceDate: Date; status: string }>>(Prisma.sql`
    SELECT "id", "invoiceDate", "status"
    FROM "PurchaseInvoice"
    WHERE "shopId" = ${shopId}::uuid AND "supplierId" = ${supplierId}::uuid AND "deletedAt" IS NULL
      AND LOWER(BTRIM("supplierInvoiceNumber")) = LOWER(${number})
      ${excludeId ? Prisma.sql`AND "id" <> ${excludeId}::uuid` : Prisma.empty}
    ORDER BY "createdAt" DESC LIMIT 1
  `);
  return rows[0] ?? null;
}

export async function saveDraft(shopId: string, userId: string, currency: string, input: PurchaseDraftInput) {
  const totals = calculate(input, false);
  const paymentAccountType = input.paymentAccountType ?? (input.paymentMethod === PaymentMethod.CASH ? "DRAWER" : "OTHER");
  if (!["DRAWER", "WALLET", "BANK", "OTHER"].includes(paymentAccountType)) throw new Error("مصدر الدفع غير صالح.");
  const paymentWalletId = paymentAccountType === "WALLET" ? nullableText(input.paymentWalletId) : null;
  const paymentBankAccountId = paymentAccountType === "BANK" ? nullableText(input.paymentBankAccountId) : null;
  if (paymentWalletId) {
    const wallets = await prisma.$queryRaw<Array<{id:string}>>`SELECT "id" FROM "FinancialWallet" WHERE "id"=${paymentWalletId}::uuid AND "shopId"=${shopId}::uuid AND "deletedAt" IS NULL AND "isActive"=TRUE`;
    if (!wallets.length) throw new Error("المحفظة المختارة غير موجودة أو غير نشطة.");
  }
  if (paymentBankAccountId) {
    const accounts = await prisma.$queryRaw<Array<{id:string}>>`SELECT "id" FROM "BankAccount" WHERE "id"=${paymentBankAccountId}::uuid AND "shopId"=${shopId}::uuid AND "deletedAt" IS NULL AND "isActive"=TRUE`;
    if (!accounts.length) throw new Error("الحساب البنكي المختار غير موجود أو غير نشط.");
  }
  const supplier = await validateSupplier(shopId, input.supplierId);
  const existingIds = totals.lines.flatMap((line) => line.inventoryItemId ? [line.inventoryItemId] : []);
  await validateExistingInventoryIds(shopId, existingIds);
  await validateCategoryIds(shopId, totals.lines.flatMap((line) => line.newItemCategoryId ? [line.newItemCategoryId] : []));
  await validateImportSources(shopId, input.id, totals.lines);
  const invoiceDate = dateValue(input.invoiceDate);
  const supplierNameSnapshot = supplier?.name ?? nullableText(input.supplierNameSnapshot);
  const supplierInvoiceNumber = nullableText(input.supplierInvoiceNumber);
  const notes = nullableText(input.notes);

  return prisma.$transaction(async (tx) => {
    let purchaseId = input.id || null;
    let nextVersion = 1;
    if (purchaseId) {
      const locked = await tx.$queryRaw<Array<{ id: string; status: string; version: number }>>`
        SELECT "id", "status", "version" FROM "PurchaseInvoice"
        WHERE "id" = ${purchaseId}::uuid AND "shopId" = ${shopId}::uuid AND "deletedAt" IS NULL
        FOR UPDATE
      `;
      const current = locked[0];
      if (!current) throw new Error("مسودة فاتورة الشراء غير موجودة.");
      if (current.status !== "DRAFT") throw new Error("الفاتورة المعتمدة للقراءة فقط ولا يمكن تعديلها.");
      if (!Number.isInteger(input.expectedVersion)) {
        throw new Error("نسخة المسودة غير معروفة. أعد تحميل الفاتورة قبل الحفظ لمنع استبدال تعديل أحدث.");
      }
      if (input.expectedVersion !== current.version) {
        throw new Error("تم تعديل هذه المسودة من نافذة أخرى. أعد تحميل الصفحة قبل المتابعة حتى لا تستبدل بيانات أحدث.");
      }
      nextVersion = current.version + 1;
      await tx.$executeRaw`
        UPDATE "PurchaseInvoice" SET
          "supplierId" = ${supplier?.id ?? null}::uuid,
          "supplierNameSnapshot" = ${supplierNameSnapshot},
          "supplierInvoiceNumber" = ${supplierInvoiceNumber},
          "invoiceDate" = ${invoiceDate}, "notes" = ${notes}, "currency" = ${currency},
          "subtotal" = ${totals.subtotal}, "discountTotal" = ${totals.discountTotal},
          "extraCostsTotal" = ${totals.extraCostsTotal}, "total" = ${totals.total},
          "amountPaid" = ${totals.amountPaid}, "balanceDue" = ${totals.balanceDue},
          "paymentAccountType" = ${paymentAccountType}, "paymentWalletId" = ${paymentWalletId}::uuid, "paymentBankAccountId"=${paymentBankAccountId}::uuid,
          "paymentMethod" = ${input.paymentMethod ?? null}, "paymentSourceName" = ${nullableText(input.paymentSourceName)},
          "paymentReference" = ${nullableText(input.paymentReference)},
          "updatedAt" = NOW(), "version" = ${nextVersion}
        WHERE "id" = ${purchaseId}::uuid AND "shopId" = ${shopId}::uuid AND "status"='DRAFT'
      `;
      await tx.$executeRaw`DELETE FROM "PurchaseItem" WHERE "purchaseInvoiceId" = ${purchaseId}::uuid AND "shopId" = ${shopId}::uuid`;
    } else {
      const rows = await tx.$queryRaw<Array<{ id: string; version: number }>>`
        INSERT INTO "PurchaseInvoice" (
          "shopId", "supplierId", "supplierNameSnapshot", "createdByUserId", "supplierInvoiceNumber",
          "invoiceDate", "notes", "currency", "status", "subtotal", "discountTotal", "extraCostsTotal",
          "total", "amountPaid", "balanceDue", "paymentAccountType", "paymentWalletId", "paymentBankAccountId", "paymentMethod", "paymentSourceName", "paymentReference"
        ) VALUES (
          ${shopId}::uuid, ${supplier?.id ?? null}::uuid, ${supplierNameSnapshot}, ${userId}::uuid, ${supplierInvoiceNumber},
          ${invoiceDate}, ${notes}, ${currency}, 'DRAFT', ${totals.subtotal}, ${totals.discountTotal}, ${totals.extraCostsTotal},
          ${totals.total}, ${totals.amountPaid}, ${totals.balanceDue}, ${paymentAccountType}, ${paymentWalletId}::uuid, ${paymentBankAccountId}::uuid, ${input.paymentMethod ?? null},
          ${nullableText(input.paymentSourceName)}, ${nullableText(input.paymentReference)}
        ) RETURNING "id", "version"
      `;
      purchaseId = rows[0]?.id ?? null;
      nextVersion = rows[0]?.version ?? 1;
      if (!purchaseId) throw new Error("تعذر إنشاء مسودة فاتورة الشراء.");
    }

    for (const line of totals.lines) {
      const compatibilitySql = line.inventoryItemId ? Prisma.sql`ARRAY[]::uuid[]` : uuidArraySql(line.compatibilityGroupIds);
      await tx.$executeRaw(Prisma.sql`
        INSERT INTO "PurchaseItem" (
          "shopId", "purchaseInvoiceId", "inventoryItemId", "newItemName", "newItemSku", "newItemBarcode", "newItemCategoryId", "newItemCategory",
          "newItemDescription", "importedSourceText", "importSourceId", "importRowKey", "importedPurchaseUnit", "matchReviewRequired", "compatibilityGroupIds", "compatibilityReviewNeeded", "updateSalePrice",
          "orderedQuantity", "receivedQuantity", "unitCost", "manualExtraCostAllocation", "salePriceSnapshot", "lineTotal", "sortOrder"
        ) VALUES (
          ${shopId}::uuid, ${purchaseId}::uuid, ${line.inventoryItemId ?? null}::uuid,
          ${line.inventoryItemId ? null : nullableText(line.newItemName)}, ${line.inventoryItemId ? null : nullableText(line.newItemSku)},
          ${line.inventoryItemId ? null : line.newItemBarcode}, ${line.inventoryItemId ? null : line.newItemCategoryId ?? null}::uuid,
          ${line.inventoryItemId ? null : nullableText(line.newItemCategory)}, ${line.inventoryItemId ? null : nullableText(line.newItemDescription)},
          ${nullableText(line.importedSourceText)}, ${line.importSourceId ?? null}::uuid, ${nullableText(line.importRowKey)}, ${nullableText(line.importedPurchaseUnit)},
          ${Boolean(line.matchReviewRequired)}, ${compatibilitySql},
          ${line.inventoryItemId ? false : Boolean(line.compatibilityReviewNeeded)}, ${line.inventoryItemId ? Boolean(line.updateSalePrice) : false},
          ${line.quantity}, 0, ${line.unitCost}, ${line.manualExtraCostAllocation}, ${line.salePrice}, ${line.lineTotal}, ${line.sortOrder}
        )
      `);
    }

    return { id: purchaseId, updatedAt: new Date(), version: nextVersion, totals };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 15_000 });
}

export async function deleteDraft(shopId: string, purchaseId: string) {
  return prisma.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<Array<{ status: string }>>`
      SELECT "status" FROM "PurchaseInvoice"
      WHERE "id" = ${purchaseId}::uuid AND "shopId" = ${shopId}::uuid AND "deletedAt" IS NULL FOR UPDATE
    `;
    if (!rows[0]) throw new Error("مسودة فاتورة الشراء غير موجودة.");
    if (rows[0].status !== "DRAFT") throw new Error("لا يمكن حذف فاتورة شراء معتمدة.");
    await tx.$executeRaw`DELETE FROM "PurchaseInvoice" WHERE "id" = ${purchaseId}::uuid AND "shopId" = ${shopId}::uuid`;
  });
}

type LockedPurchase = {
  id: string;
  supplierId: string | null;
  supplierNameSnapshot: string | null;
  supplierInvoiceNumber: string | null;
  invoiceDate: Date;
  status: string;
  currency: string;
  subtotal: Prisma.Decimal;
  discountTotal: Prisma.Decimal;
  extraCostsTotal: Prisma.Decimal;
  total: Prisma.Decimal;
  amountPaid: Prisma.Decimal;
  returnAdjustmentTotal: Prisma.Decimal;
  balanceDue: Prisma.Decimal;
  paymentAccountType: PurchaseMoneyAccountType | null;
  paymentWalletId: string | null;
  paymentBankAccountId: string | null;
  paymentMethod: PaymentMethod | null;
  paymentSourceName: string | null;
  paymentReference: string | null;
  postingKey: string | null;
  postingFingerprint: string | null;
};

type LockedPurchaseItem = {
  id: string;
  inventoryItemId: string | null;
  newItemName: string | null;
  newItemSku: string | null;
  newItemBarcode: string | null;
  newItemCategoryId: string | null;
  newItemCategory: string | null;
  newItemDescription: string | null;
  importedSourceText: string | null;
  importSourceId: string | null;
  importRowKey: string | null;
  importedPurchaseUnit: string | null;
  matchReviewRequired: boolean;
  compatibilityGroupIds: string[];
  compatibilityReviewNeeded: boolean;
  updateSalePrice: boolean;
  manualExtraCostAllocation: Prisma.Decimal | null;
  discountAllocation: Prisma.Decimal | null;
  netMerchandiseValue: Prisma.Decimal | null;
  netUnitCost: Prisma.Decimal | null;
  extraCostAllocation: Prisma.Decimal | null;
  capitalizedLineValue: Prisma.Decimal | null;
  capitalizedUnitCost: Prisma.Decimal | null;
  receivedCapitalizedValue: Prisma.Decimal;
  receivedNetMerchandiseValue: Prisma.Decimal;
  returnedNetMerchandiseValue: Prisma.Decimal;
  orderedQuantity: number;
  receivedQuantity: number;
  returnedQuantity: number;
  unitCost: Prisma.Decimal;
  salePriceSnapshot: Prisma.Decimal | null;
  lineTotal: Prisma.Decimal;
  sortOrder: number;
};

type ReceiptTxLine = Pick<LockedPurchaseItem, "id" | "inventoryItemId" | "orderedQuantity" | "receivedQuantity" | "receivedCapitalizedValue" | "receivedNetMerchandiseValue" | "capitalizedLineValue" | "netMerchandiseValue"> & { quantity: number };

function safeOperationDate(value: string | Date, label: string) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error(`${label} غير صالح.`);
  return date;
}

function assertRequestKey(value: string) {
  const key = value.trim();
  if (key.length < 12 || key.length > 120) throw new Error("مفتاح العملية غير صالح. أعد المحاولة.");
  return key;
}

async function applyPurchasePaymentMoneyTx(
  tx: Prisma.TransactionClient,
  input: {
    shopId: string;
    userId: string;
    purchaseId: string;
    supplierInvoiceNumber: string | null;
    accountType: PurchaseMoneyAccountType;
    walletId?: string | null;
    amount: Prisma.Decimal;
    sourceName?: string | null;
    reference?: string | null;
  },
) {
  if (input.accountType === "OTHER") return;
  const sourceReference = nullableText(input.supplierInvoiceNumber) ?? `شراء ${input.purchaseId.slice(0, 8)}`;
  if (input.accountType === "DRAWER") {
    const drawers = await tx.$queryRaw<Array<{ id: string; currentBalance: Prisma.Decimal }>>`
      SELECT "id", "currentBalance" FROM "CashDrawer" WHERE "shopId" = ${input.shopId}::uuid FOR UPDATE
    `;
    const drawer = drawers[0];
    if (!drawer) throw new Error("الدرج النقدي غير مهيأ.");
    const nextBalance = drawer.currentBalance.sub(input.amount);
    if (nextBalance.lt(0)) throw new Error("رصيد الدرج النقدي غير كافٍ لتسجيل دفعة الشراء.");
    await tx.$executeRaw`UPDATE "CashDrawer" SET "currentBalance" = ${nextBalance}, "updatedAt" = NOW() WHERE "id" = ${drawer.id}::uuid`;
    await tx.$executeRaw`
      INSERT INTO "CashDrawerMovement" (
        "shopId", "drawerId", "createdByUserId", "type", "direction", "amount", "description", "reference",
        "sourceType", "sourceId", "sourceReference", "status", "createdAt"
      ) VALUES (
        ${input.shopId}::uuid, ${drawer.id}::uuid, ${input.userId}::uuid, 'PURCHASE_PAYMENT', 'OUT', ${input.amount},
        'دفع فاتورة شراء', ${nullableText(input.reference)}, 'PURCHASE', ${input.purchaseId}, ${sourceReference}, 'ACTIVE', NOW()
      )
    `;
    return;
  }

  const walletId = nullableText(input.walletId);
  if (!walletId) throw new Error("اختر المحفظة التي خرجت منها دفعة الشراء.");
  const wallets = await tx.$queryRaw<Array<{ id: string; name: string; currentBalance: Prisma.Decimal }>>`
    SELECT "id", "name", "currentBalance" FROM "FinancialWallet"
    WHERE "id" = ${walletId}::uuid AND "shopId" = ${input.shopId}::uuid AND "deletedAt" IS NULL AND "isActive" = TRUE
    FOR UPDATE
  `;
  const wallet = wallets[0];
  if (!wallet) throw new Error("المحفظة المحددة غير موجودة أو غير نشطة.");
  const nextBalance = wallet.currentBalance.sub(input.amount);
  if (nextBalance.lt(0)) throw new Error(`رصيد محفظة ${wallet.name} غير كافٍ لتسجيل دفعة الشراء.`);
  await tx.$executeRaw`UPDATE "FinancialWallet" SET "currentBalance" = ${nextBalance}, "updatedAt" = NOW() WHERE "id" = ${wallet.id}::uuid`;
  await tx.$executeRaw`
    INSERT INTO "FinancialTransfer" (
      "shopId", "walletId", "createdByUserId", "operationType", "amount", "walletAmount", "commission", "commissionMode",
      "isDeferred", "notes", "sourceType", "sourceId", "sourceReference", "status", "createdAt", "updatedAt"
    ) VALUES (
      ${input.shopId}::uuid, ${wallet.id}::uuid, ${input.userId}::uuid, 'WALLET_WITHDRAWAL', ${input.amount}, ${input.amount}, 0, 'NONE',
      FALSE, ${`دفع فاتورة شراء — ${sourceReference}`}, 'PURCHASE', ${input.purchaseId}, ${sourceReference}, 'ACTIVE', NOW(), NOW()
    )
  `;
}

async function applySupplierRefundMoneyTx(
  tx: Prisma.TransactionClient,
  input: {
    shopId: string;
    userId: string;
    purchaseId: string;
    supplierReturnId: string;
    supplierInvoiceNumber: string | null;
    accountType: PurchaseMoneyAccountType;
    walletId?: string | null;
    amount: Prisma.Decimal;
    sourceName?: string | null;
    reference?: string | null;
  },
) {
  if (input.accountType === "OTHER") return;
  const sourceReference = nullableText(input.supplierInvoiceNumber) ?? `مرتجع ${input.supplierReturnId.slice(0, 8)}`;
  if (input.accountType === "DRAWER") {
    const drawers = await tx.$queryRaw<Array<{ id: string; currentBalance: Prisma.Decimal }>>`
      SELECT "id", "currentBalance" FROM "CashDrawer" WHERE "shopId" = ${input.shopId}::uuid FOR UPDATE
    `;
    const drawer = drawers[0];
    if (!drawer) throw new Error("الدرج النقدي غير مهيأ.");
    const nextBalance = drawer.currentBalance.add(input.amount);
    await tx.$executeRaw`UPDATE "CashDrawer" SET "currentBalance" = ${nextBalance}, "updatedAt" = NOW() WHERE "id" = ${drawer.id}::uuid`;
    await tx.$executeRaw`
      INSERT INTO "CashDrawerMovement" (
        "shopId", "drawerId", "createdByUserId", "type", "direction", "amount", "description", "reference",
        "sourceType", "sourceId", "sourceReference", "status", "createdAt"
      ) VALUES (
        ${input.shopId}::uuid, ${drawer.id}::uuid, ${input.userId}::uuid, 'SUPPLIER_REFUND', 'IN', ${input.amount},
        'مبلغ مسترد من مورد عن مرتجع شراء', ${nullableText(input.reference)}, 'SUPPLIER_RETURN', ${input.purchaseId}, ${sourceReference}, 'ACTIVE', NOW()
      )
    `;
    return;
  }

  const walletId = nullableText(input.walletId);
  if (!walletId) throw new Error("اختر المحفظة التي وصل إليها مبلغ المرتجع.");
  const wallets = await tx.$queryRaw<Array<{ id: string; name: string; currentBalance: Prisma.Decimal }>>`
    SELECT "id", "name", "currentBalance" FROM "FinancialWallet"
    WHERE "id" = ${walletId}::uuid AND "shopId" = ${input.shopId}::uuid AND "deletedAt" IS NULL AND "isActive" = TRUE
    FOR UPDATE
  `;
  const wallet = wallets[0];
  if (!wallet) throw new Error("المحفظة المحددة غير موجودة أو غير نشطة.");
  await tx.$executeRaw`UPDATE "FinancialWallet" SET "currentBalance" = ${wallet.currentBalance.add(input.amount)}, "updatedAt" = NOW() WHERE "id" = ${wallet.id}::uuid`;
  await tx.$executeRaw`
    INSERT INTO "FinancialTransfer" (
      "shopId", "walletId", "createdByUserId", "operationType", "amount", "walletAmount", "commission", "commissionMode",
      "isDeferred", "notes", "sourceType", "sourceId", "sourceReference", "status", "createdAt", "updatedAt"
    ) VALUES (
      ${input.shopId}::uuid, ${wallet.id}::uuid, ${input.userId}::uuid, 'WALLET_TOPUP', ${input.amount}, ${input.amount}, 0, 'NONE',
      FALSE, ${`مبلغ مسترد من مورد — ${sourceReference}`}, 'SUPPLIER_RETURN', ${input.purchaseId}, ${sourceReference}, 'ACTIVE', NOW(), NOW()
    )
  `;
}

async function ensureDefaultWarehouseTx(tx: Prisma.TransactionClient, shopId: string) {
  const existing = await tx.$queryRaw<Array<{ id: string; name: string }>>`
    SELECT "id", "name" FROM "Warehouse"
    WHERE "shopId" = ${shopId}::uuid AND "deletedAt" IS NULL AND "isDefault" = TRUE AND "isActive" = TRUE
    LIMIT 1
    FOR UPDATE
  `;
  if (existing[0]) return existing[0];

  await tx.$queryRaw<Array<{ id: string }>>`SELECT "id" FROM "Shop" WHERE "id" = ${shopId}::uuid FOR UPDATE`;
  const secondCheck = await tx.$queryRaw<Array<{ id: string; name: string }>>`
    SELECT "id", "name" FROM "Warehouse"
    WHERE "shopId" = ${shopId}::uuid AND "deletedAt" IS NULL AND "isDefault" = TRUE AND "isActive" = TRUE
    LIMIT 1
  `;
  if (secondCheck[0]) return secondCheck[0];

  const rows = await tx.$queryRaw<Array<{ id: string; name: string }>>`
    INSERT INTO "Warehouse" ("shopId", "code", "name", "isDefault", "isActive")
    VALUES (${shopId}::uuid, 'MAIN', 'المستودع الرئيسي', TRUE, TRUE)
    RETURNING "id", "name"
  `;
  return rows[0];
}

async function createReceiptTx(
  tx: Prisma.TransactionClient,
  input: {
    shopId: string;
    userId: string;
    purchase: Pick<LockedPurchase, "id" | "supplierId" | "supplierInvoiceNumber">;
    requestKey: string;
    requestFingerprint: string;
    receivedAt: Date;
    reference?: string | null;
    note?: string | null;
    lines: ReceiptTxLine[];
  },
) {
  const positiveLines = input.lines.filter((line) => line.quantity > 0);
  if (!positiveLines.length) return null;
  const receiptRows = await tx.$queryRaw<Array<{ id: string }>>`
    INSERT INTO "PurchaseReceipt" ("shopId", "purchaseInvoiceId", "createdByUserId", "requestKey", "requestFingerprint", "receivedAt", "reference", "note")
    VALUES (${input.shopId}::uuid, ${input.purchase.id}::uuid, ${input.userId}::uuid, ${input.requestKey}, ${input.requestFingerprint}, ${input.receivedAt}, ${nullableText(input.reference)}, ${nullableText(input.note)})
    RETURNING "id"
  `;
  const receiptId = receiptRows[0]?.id;
  if (!receiptId) throw new Error("تعذر إنشاء سجل الاستلام.");
  const warehouse = await ensureDefaultWarehouseTx(tx, input.shopId);

  for (const line of positiveLines) {
    if (!line.inventoryItemId) throw new Error("صنف الاستلام غير مرتبط بالمخزون.");
    const remaining = line.orderedQuantity - line.receivedQuantity;
    if (!Number.isInteger(line.quantity) || line.quantity <= 0 || line.quantity > remaining) {
      throw new Error("كمية الاستلام تتجاوز الكمية المتبقية في أحد البنود.");
    }
    if (line.capitalizedLineValue === null || line.netMerchandiseValue === null) {
      throw new Error("تكلفة بند الشراء لم تُوزّع عند الاعتماد. لا يمكن الاستلام قبل إصلاح الفاتورة.");
    }

    // Lock the inventory row itself so receipts for the same item from different
    // purchase invoices cannot race and calculate two averages from the same base.
    const inventoryRows = await tx.$queryRaw<Array<{ id: string; quantity: number; unitCost: Prisma.Decimal | null }>>`
      SELECT "id", "quantity", "unitCost" FROM "InventoryItem"
      WHERE "id"=${line.inventoryItemId}::uuid AND "shopId"=${input.shopId}::uuid AND "deletedAt" IS NULL
      FOR UPDATE
    `;
    const inventory = inventoryRows[0];
    if (!inventory) throw new Error("صنف المخزون المرتبط بالاستلام غير موجود.");
    if (inventory.quantity < 0) throw new Error("لا يمكن تطبيق المتوسط المرجح على مخزون سالب. صحح الرصيد أولاً.");

    const netValue = allocatedPartialValue({
      totalValue: line.netMerchandiseValue,
      totalQuantity: line.orderedQuantity,
      quantityAlreadyApplied: line.receivedQuantity,
      valueAlreadyApplied: line.receivedNetMerchandiseValue,
      quantityNow: line.quantity,
    });
    const capitalizedValue = allocatedPartialValue({
      totalValue: line.capitalizedLineValue,
      totalQuantity: line.orderedQuantity,
      quantityAlreadyApplied: line.receivedQuantity,
      valueAlreadyApplied: line.receivedCapitalizedValue,
      quantityNow: line.quantity,
    });
    const inboundUnitCost = capitalizedValue.div(line.quantity).toDecimalPlaces(6, Prisma.Decimal.ROUND_HALF_UP);
    const newAverage = movingWeightedAverage({
      currentQuantity: inventory.quantity,
      currentAverageCost: inventory.unitCost,
      receivedQuantity: line.quantity,
      receivedCapitalizedValue: capitalizedValue,
    });
    const quantityAfter = inventory.quantity + line.quantity;

    await tx.$executeRaw`
      INSERT INTO "WarehouseStock" ("shopId", "warehouseId", "inventoryItemId", "quantity", "reservedQuantity", "reorderLevel", "averageCost")
      VALUES (${input.shopId}::uuid, ${warehouse.id}::uuid, ${line.inventoryItemId}::uuid, 0, 0, 0, ${inventory.unitCost})
      ON CONFLICT ("warehouseId", "inventoryItemId") DO NOTHING
    `;
    const warehouseStockRows = await tx.$queryRaw<Array<{ quantity: number; averageCost: Prisma.Decimal | null }>>`
      SELECT "quantity", "averageCost" FROM "WarehouseStock"
      WHERE "shopId" = ${input.shopId}::uuid
        AND "warehouseId" = ${warehouse.id}::uuid
        AND "inventoryItemId" = ${line.inventoryItemId}::uuid
      FOR UPDATE
    `;
    const warehouseStock = warehouseStockRows[0];
    if (!warehouseStock) throw new Error("تعذر تهيئة رصيد القطعة في المستودع الرئيسي.");
    const warehouseAverage = movingWeightedAverage({
      currentQuantity: warehouseStock.quantity,
      currentAverageCost: warehouseStock.averageCost,
      receivedQuantity: line.quantity,
      receivedCapitalizedValue: capitalizedValue,
    });
    const warehouseQuantityAfter = warehouseStock.quantity + line.quantity;

    await tx.$executeRaw`
      UPDATE "WarehouseStock"
      SET "quantity" = ${warehouseQuantityAfter}, "averageCost" = ${warehouseAverage}, "updatedAt" = NOW()
      WHERE "shopId" = ${input.shopId}::uuid
        AND "warehouseId" = ${warehouse.id}::uuid
        AND "inventoryItemId" = ${line.inventoryItemId}::uuid
    `;

    await tx.$executeRaw`
      UPDATE "InventoryItem" SET "quantity"=${quantityAfter}, "unitCost"=${newAverage}, "version"="version"+1, "updatedAt"=NOW()
      WHERE "id"=${line.inventoryItemId}::uuid AND "shopId"=${input.shopId}::uuid
    `;

    const receiptItemRows = await tx.$queryRaw<Array<{ id: string }>>`
      INSERT INTO "PurchaseReceiptItem" (
        "shopId", "purchaseReceiptId", "purchaseItemId", "inventoryItemId", "quantity", "unitCostSnapshot", "netMerchandiseValue", "capitalizedValue"
      ) VALUES (
        ${input.shopId}::uuid, ${receiptId}::uuid, ${line.id}::uuid, ${line.inventoryItemId}::uuid, ${line.quantity}, ${inboundUnitCost}, ${netValue}, ${capitalizedValue}
      ) RETURNING "id"
    `;
    const receiptItemId = receiptItemRows[0]?.id;
    if (!receiptItemId) throw new Error("تعذر إنشاء بند الاستلام.");

    await tx.$executeRaw`
      INSERT INTO "InventoryMovement" (
        "shopId", "inventoryItemId", "supplierId", "purchaseInvoiceId", "purchaseItemId", "purchaseReceiptId", "purchaseReceiptItemId",
        "createdByUserId", "type", "quantityChange", "quantityAfter", "unitCostSnapshot", "note", "createdAt", "updatedAt", "version"
      ) VALUES (
        ${input.shopId}::uuid, ${line.inventoryItemId}::uuid, ${input.purchase.supplierId}::uuid, ${input.purchase.id}::uuid, ${line.id}::uuid,
        ${receiptId}::uuid, ${receiptItemId}::uuid, ${input.userId}::uuid, ${InventoryMovementType.STOCK_IN}::"InventoryMovementType",
        ${line.quantity}, ${quantityAfter}, ${inboundUnitCost},
        ${`استلام شراء${input.purchase.supplierInvoiceNumber ? ` — فاتورة ${input.purchase.supplierInvoiceNumber}` : ""}`}, ${input.receivedAt}, NOW(), 1
      )
    `;
    await tx.$executeRaw`
      INSERT INTO "WarehouseMovement" (
        "shopId", "warehouseId", "inventoryItemId", "type", "quantityChange", "quantityBefore", "quantityAfter",
        "unitCostSnapshot", "purchaseInvoiceId", "createdByUserId", "reference", "note", "createdAt"
      ) VALUES (
        ${input.shopId}::uuid, ${warehouse.id}::uuid, ${line.inventoryItemId}::uuid, 'PURCHASE_IN', ${line.quantity},
        ${warehouseStock.quantity}, ${warehouseQuantityAfter}, ${inboundUnitCost}, ${input.purchase.id}::uuid, ${input.userId}::uuid,
        ${input.purchase.supplierInvoiceNumber}, ${`استلام شراء — ${warehouse.name}`}, ${input.receivedAt}
      )
    `;

    await tx.$executeRaw`
      UPDATE "PurchaseItem" SET
        "receivedQuantity"="receivedQuantity"+${line.quantity},
        "receivedNetMerchandiseValue"="receivedNetMerchandiseValue"+${netValue},
        "receivedCapitalizedValue"="receivedCapitalizedValue"+${capitalizedValue},
        "updatedAt"=NOW()
      WHERE "id"=${line.id}::uuid AND "shopId"=${input.shopId}::uuid
    `;
  }
  return receiptId;
}

export async function postPurchaseInvoice(
  shopId: string,
  userId: string,
  purchaseId: string,
  postingKey: string,
  options: { receiptMode?: PurchaseReceiptMode; initialReceipt?: InitialPurchaseReceiptLineInput[] } = {},
) {
  const normalizedPostingKey = assertRequestKey(postingKey);
  const receiptMode = options.receiptMode ?? "FULL";
  if (receiptMode !== "FULL" && receiptMode !== "PARTIAL") throw new Error("نمط الاستلام غير صالح.");
  const normalizedInitialReceipt = [...(options.initialReceipt ?? [])]
    .map((entry) => ({ sortOrder: Number(entry.sortOrder), quantity: Number(entry.quantity) }))
    .sort((a, b) => a.sortOrder - b.sortOrder);
  const postingFingerprint = requestFingerprint({ purchaseId, receiptMode, initialReceipt: normalizedInitialReceipt });

  const previewRows = await prisma.$queryRaw<Array<{ amountPaid: Prisma.Decimal; status: string; paymentMethod: PaymentMethod | null; paymentAccountType: PurchaseMoneyAccountType | null }>>`
    SELECT "amountPaid", "status", "paymentAccountType", "paymentMethod"::text AS "paymentMethod" FROM "PurchaseInvoice"
    WHERE "id" = ${purchaseId}::uuid AND "shopId" = ${shopId}::uuid AND "deletedAt" IS NULL LIMIT 1
  `;
  if (!previewRows[0]) throw new Error("فاتورة الشراء غير موجودة.");
  if (previewRows[0].amountPaid.gt(0)) {
    const previewAccountType = previewRows[0].paymentAccountType ?? (previewRows[0].paymentMethod === PaymentMethod.CASH ? "DRAWER" : "OTHER");
    await purchaseMoneyService.preparePurchaseMoneyAccount(shopId, previewAccountType);
  }

  return prisma.$transaction(async (tx) => {
    const lockedRows = await tx.$queryRaw<LockedPurchase[]>`
      SELECT "id", "supplierId", "supplierNameSnapshot", "supplierInvoiceNumber", "invoiceDate", "status", "currency",
        "subtotal", "discountTotal", "extraCostsTotal", "total", "amountPaid", COALESCE("returnAdjustmentTotal", 0) AS "returnAdjustmentTotal", "balanceDue",
        "paymentAccountType", "paymentWalletId", "paymentBankAccountId", "paymentMethod"::text AS "paymentMethod", "paymentSourceName", "paymentReference", "postingKey", "postingFingerprint"
      FROM "PurchaseInvoice"
      WHERE "id" = ${purchaseId}::uuid AND "shopId" = ${shopId}::uuid AND "deletedAt" IS NULL
      FOR UPDATE
    `;
    const purchase = lockedRows[0];
    if (!purchase) throw new Error("فاتورة الشراء غير موجودة.");
    if (purchase.status === "POSTED") {
      if (purchase.postingKey !== normalizedPostingKey) throw new Error("الفاتورة معتمدة مسبقاً بعملية مختلفة.");
      if (!purchase.postingFingerprint || purchase.postingFingerprint !== postingFingerprint) {
        throw new Error("مفتاح الاعتماد مستخدم مسبقاً ببيانات مختلفة؛ لن تُعاد العملية.");
      }
      return { id: purchase.id, alreadyPosted: true };
    }
    if (purchase.status !== "DRAFT") throw new Error("حالة فاتورة الشراء غير قابلة للاعتماد.");

    const lines = await tx.$queryRaw<LockedPurchaseItem[]>`
      SELECT "id", "inventoryItemId", "newItemName", "newItemSku", "newItemBarcode", "newItemCategoryId", "newItemCategory", "newItemDescription",
        "importedSourceText", "importSourceId", "importRowKey", "importedPurchaseUnit", "matchReviewRequired", "compatibilityGroupIds", "compatibilityReviewNeeded", "updateSalePrice",
        "manualExtraCostAllocation", "discountAllocation", "netMerchandiseValue", "netUnitCost", "extraCostAllocation", "capitalizedLineValue", "capitalizedUnitCost",
        COALESCE("receivedCapitalizedValue",0) AS "receivedCapitalizedValue", COALESCE("receivedNetMerchandiseValue",0) AS "receivedNetMerchandiseValue",
        COALESCE("returnedNetMerchandiseValue",0) AS "returnedNetMerchandiseValue",
        "orderedQuantity", "receivedQuantity", COALESCE("returnedQuantity", 0) AS "returnedQuantity", "unitCost", "salePriceSnapshot", "lineTotal", "sortOrder"
      FROM "PurchaseItem"
      WHERE "purchaseInvoiceId" = ${purchaseId}::uuid AND "shopId" = ${shopId}::uuid
      ORDER BY "sortOrder" ASC, "createdAt" ASC
      FOR UPDATE
    `;
    if (!lines.length) throw new Error("أضف بنداً واحداً على الأقل قبل اعتماد فاتورة الشراء.");
    if (lines.some((line) => line.orderedQuantity <= 0 || line.receivedQuantity !== 0 || line.returnedQuantity !== 0 || line.unitCost.lt(0))) {
      throw new Error("أحد بنود الفاتورة غير صالح للاعتماد.");
    }
    if (lines.some((line) => line.matchReviewRequired)) {
      throw new Error("يوجد صنف مستورد يحتاج مراجعة المطابقة. اختر الصنف الموجود أو أكد إنشاء صنف جديد قبل الاعتماد.");
    }

    const allocations = allocatePurchaseCosts(
      lines.map((line) => ({ quantity: line.orderedQuantity, originalUnitCost: line.unitCost, manualExtraCostAllocation: line.manualExtraCostAllocation })),
      purchase.discountTotal,
      purchase.extraCostsTotal,
    );
    const recomputedSubtotal = allocations.reduce((sum, allocation) => sum.add(allocation.originalLineValue), new Prisma.Decimal(0));
    const recomputedTotal = accountingMoney(recomputedSubtotal.sub(purchase.discountTotal).add(purchase.extraCostsTotal));
    if (purchase.amountPaid.gt(recomputedTotal)) throw new Error("المبلغ المدفوع لا يمكن أن يتجاوز إجمالي فاتورة الشراء.");
    if (!recomputedSubtotal.eq(purchase.subtotal) || !recomputedTotal.eq(purchase.total)) {
      throw new Error("تغيرت مجاميع الفاتورة. احفظ المسودة من جديد قبل الاعتماد.");
    }
    if (purchase.amountPaid.lt(0) || purchase.amountPaid.gt(purchase.total) || !purchase.balanceDue.eq(accountingMoney(purchase.total.sub(purchase.amountPaid)))) {
      throw new Error("قيم الدفع في فاتورة الشراء غير متطابقة.");
    }
    if (purchase.balanceDue.gt(0) && !purchase.supplierId) throw new Error("يجب اختيار مورد مسجل قبل اعتماد فاتورة تحتوي على رصيد مستحق.");
    if (purchase.amountPaid.gt(0) && !purchase.paymentMethod) throw new Error("اختر طريقة الدفع للمبلغ المدفوع.");
    if (!purchase.supplierId && purchase.amountPaid.gt(0) && purchase.paymentMethod !== PaymentMethod.CASH) {
      throw new Error("الشراء بدون مورد مسجل متاح فقط للدفع النقدي الكامل.");
    }
    if (purchase.supplierId) {
      const supplier = await tx.supplier.findFirst({ where: { id: purchase.supplierId, shopId, deletedAt: null }, select: { id: true } });
      if (!supplier) throw new Error("المورد المحدد لم يعد متاحاً.");
    }

    const partialBySortOrder = new Map<number, number>();
    if (receiptMode === "PARTIAL") {
      for (const entry of normalizedInitialReceipt) {
        if (!Number.isInteger(entry.sortOrder) || entry.sortOrder < 0 || !Number.isInteger(entry.quantity) || entry.quantity < 0) throw new Error("كمية الاستلام الجزئي غير صالحة.");
        if (partialBySortOrder.has(entry.sortOrder)) throw new Error("تكرر بند في الاستلام الجزئي.");
        partialBySortOrder.set(entry.sortOrder, entry.quantity);
      }
    }

    const newBarcodes = lines.flatMap((line) => !line.inventoryItemId && normalizedBarcode(line.newItemBarcode) ? [normalizedBarcode(line.newItemBarcode)!] : []);
    const duplicateNewBarcode = newBarcodes.find((barcode, index) => newBarcodes.indexOf(barcode) !== index);
    if (duplicateNewBarcode) throw new Error(`الباركود ${duplicateNewBarcode} مكرر بين أصناف جديدة. راجع المطابقة قبل الاعتماد.`);

    // Freeze all allocation values before any stock receipt. Partial receipts consume
    // these frozen totals proportionally and the final receipt absorbs money rounding.
    for (let index = 0; index < lines.length; index += 1) {
      const allocation = allocations[index];
      await tx.$executeRaw`
        UPDATE "PurchaseItem" SET
          "discountAllocation"=${allocation.discountAllocation}, "netMerchandiseValue"=${allocation.netMerchandiseValue},
          "netUnitCost"=${allocation.netUnitCost}, "extraCostAllocation"=${allocation.extraCostAllocation},
          "capitalizedLineValue"=${allocation.capitalizedLineValue}, "capitalizedUnitCost"=${allocation.capitalizedUnitCost}, "updatedAt"=NOW()
        WHERE "id"=${lines[index].id}::uuid AND "shopId"=${shopId}::uuid
      `;
      Object.assign(lines[index], allocation);
    }
    await tx.$executeRaw`UPDATE "PurchaseInvoice" SET "costAllocatedAt"=NOW(), "updatedAt"=NOW() WHERE "id"=${purchaseId}::uuid AND "shopId"=${shopId}::uuid`;

    const preparedLines: LockedPurchaseItem[] = [];
    for (const line of lines) {
      let inventoryItemId = line.inventoryItemId;
      if (inventoryItemId) {
        const existing = await tx.inventoryItem.findFirst({ where: { id: inventoryItemId, shopId, deletedAt: null }, select: { id: true, unitPrice: true } });
        if (!existing) throw new Error("أحد أصناف المخزون لم يعد متاحاً.");
        if (line.updateSalePrice) {
          if (line.salePriceSnapshot === null) throw new Error("سعر البيع الجديد مفقود في أحد البنود.");
          await tx.$executeRaw`UPDATE "PurchaseItem" SET "salePriceBeforeSnapshot"=${existing.unitPrice}, "updatedAt"=NOW() WHERE "id"=${line.id}::uuid AND "shopId"=${shopId}::uuid`;
          await tx.$executeRaw`UPDATE "InventoryItem" SET "unitPrice"=${line.salePriceSnapshot}, "salePriceConfigured"=TRUE, "version"="version"+1, "updatedAt"=NOW() WHERE "id"=${inventoryItemId}::uuid AND "shopId"=${shopId}::uuid`;
        }
      } else {
        const newName = nullableText(line.newItemName);
        if (!newName) throw new Error("اسم الصنف الجديد مطلوب.");
        const barcode = normalizedBarcode(line.newItemBarcode);
        if (barcode) {
          const existingBarcode = await tx.$queryRaw<Array<{ id: string; name: string }>>`SELECT "id","name" FROM "InventoryItem" WHERE "shopId"=${shopId}::uuid AND "deletedAt" IS NULL AND "barcode"=${barcode} LIMIT 1`;
          if (existingBarcode[0]) throw new Error(`الباركود ${barcode} مرتبط مسبقاً بالصنف “${existingBarcode[0].name}”. راجع المطابقة بدلاً من إنشاء صنف جديد.`);
        }
        let categoryName = nullableText(line.newItemCategory);
        if (line.newItemCategoryId) {
          const categoryRows = await tx.$queryRaw<Array<{ id: string; name: string }>>`SELECT "id","name" FROM "InventoryCategory" WHERE "id"=${line.newItemCategoryId}::uuid AND "shopId"=${shopId}::uuid AND "deletedAt" IS NULL LIMIT 1`;
          if (!categoryRows[0]) throw new Error("تصنيف أحد الأصناف الجديدة لم يعد متاحاً.");
          categoryName = categoryRows[0].name;
        }
        const compatibilityGroupIds = await validateCompatibilityGroups(tx, line.compatibilityGroupIds ?? []);
        // Quantity and average cost are intentionally untouched until actual receipt.
        const created = await tx.inventoryItem.create({
          data: {
            shopId, name: newName, sku: nullableText(line.newItemSku), barcode, category: categoryName,
            description: nullableText(line.newItemDescription), unitCost: null,
            unitPrice: line.salePriceSnapshot ?? new Prisma.Decimal(0), salePriceConfigured: line.salePriceSnapshot !== null,
            quantity: 0, reorderLevel: 0, compatibilityReviewNeeded: compatibilityGroupIds.length > 0 ? false : Boolean(line.compatibilityReviewNeeded),
          }, select: { id: true },
        });
        inventoryItemId = created.id;
        if (line.newItemCategoryId) await tx.$executeRaw`UPDATE "InventoryItem" SET "categoryId"=${line.newItemCategoryId}::uuid WHERE "id"=${inventoryItemId}::uuid AND "shopId"=${shopId}::uuid`;
        if (compatibilityGroupIds.length) await tx.inventoryCompatibilityGroup.createMany({ data: compatibilityGroupIds.map((candidateGroupId) => ({ inventoryItemId: created.id, candidateGroupId })), skipDuplicates: true });
        await tx.$executeRaw`UPDATE "PurchaseItem" SET "inventoryItemId"=${inventoryItemId}::uuid, "updatedAt"=NOW() WHERE "id"=${line.id}::uuid AND "shopId"=${shopId}::uuid`;
      }
      preparedLines.push({ ...line, inventoryItemId });
    }

    if (purchase.amountPaid.gt(0) && purchase.paymentMethod) {
      const accountType = purchase.paymentAccountType ?? (purchase.paymentMethod === PaymentMethod.CASH ? "DRAWER" : "OTHER");
      if (!["DRAWER", "WALLET", "BANK", "OTHER"].includes(accountType)) throw new Error("مصدر الدفع غير صالح.");
      const walletId = accountType === "WALLET" ? purchase.paymentWalletId : null;
      const bankAccountId = accountType === "BANK" ? purchase.paymentBankAccountId : null;
      if (accountType === "WALLET" && !walletId) throw new Error("اختر المحفظة التي خرجت منها الدفعة.");
      if (accountType === "BANK" && !bankAccountId) throw new Error("اختر الحساب البنكي الذي خرجت منه الدفعة.");
      const initialPaymentKey = `${normalizedPostingKey}:payment`;
      const initialPaymentFingerprint = requestFingerprint({ purchaseId, amount: purchase.amountPaid.toFixed(2), method: purchase.paymentMethod, accountType, walletId, bankAccountId, reference: purchase.paymentReference ?? null });
      await tx.$executeRaw`
        INSERT INTO "PurchasePayment" ("shopId","purchaseInvoiceId","createdByUserId","method","sourceName","amount","reference","note","paidAt","requestKey","requestFingerprint","accountType","walletId","bankAccountId")
        VALUES (${shopId}::uuid,${purchaseId}::uuid,${userId}::uuid,${purchase.paymentMethod},${nullableText(purchase.paymentSourceName)},${purchase.amountPaid},${nullableText(purchase.paymentReference)},'دفعة اعتماد فاتورة شراء',NOW(),${initialPaymentKey},${initialPaymentFingerprint},${accountType},${walletId}::uuid,${bankAccountId}::uuid)
      `;
      await purchaseMoneyService.applyPurchasePaymentTx(tx, { shopId, userId, purchaseId, sourceReference: purchase.supplierInvoiceNumber ?? purchaseId, accountType, walletId, bankAccountId, amount: purchase.amountPaid, reference: purchase.paymentReference });
    }

    const receiptLines: ReceiptTxLine[] = preparedLines.map((line) => {
      const quantity = receiptMode === "FULL" ? line.orderedQuantity : (partialBySortOrder.get(line.sortOrder) ?? 0);
      if (quantity > line.orderedQuantity) throw new Error("كمية الاستلام الجزئي تتجاوز كمية الفاتورة في أحد البنود.");
      return {
        id: line.id, inventoryItemId: line.inventoryItemId, orderedQuantity: line.orderedQuantity, receivedQuantity: 0,
        receivedCapitalizedValue: new Prisma.Decimal(0), receivedNetMerchandiseValue: new Prisma.Decimal(0),
        capitalizedLineValue: line.capitalizedLineValue, netMerchandiseValue: line.netMerchandiseValue, quantity,
      };
    });
    const initialReceiptKey = `${normalizedPostingKey}:receipt`;
    const initialReceiptFingerprint = requestFingerprint({ purchaseId, lines: receiptLines.filter((line) => line.quantity > 0).map((line) => ({ purchaseItemId: line.id, quantity: line.quantity })).sort((a,b)=>a.purchaseItemId.localeCompare(b.purchaseItemId)), receiptMode });
    await createReceiptTx(tx, { shopId, userId, purchase, requestKey: initialReceiptKey, requestFingerprint: initialReceiptFingerprint, receivedAt: new Date(), note: receiptMode === "FULL" ? "الاستلام الأول عند اعتماد الفاتورة" : "استلام جزئي عند اعتماد الفاتورة", lines: receiptLines });

    await tx.$executeRaw`
      UPDATE "PurchaseInvoice" SET "status"='POSTED', "postingKey"=${normalizedPostingKey}, "postingFingerprint"=${postingFingerprint}, "postedAt"=NOW(), "updatedAt"=NOW(), "version"="version"+1
      WHERE "id"=${purchaseId}::uuid AND "shopId"=${shopId}::uuid AND "status"='DRAFT'
    `;
    return { id: purchaseId, alreadyPosted: false };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 30_000 });
}

export async function recordPurchaseReceipt(shopId: string, userId: string, purchaseId: string, input: RecordPurchaseReceiptInput) {
  const requestKey = assertRequestKey(input.requestKey);
  const receivedAt = safeOperationDate(input.receivedAt, "تاريخ الاستلام");
  const requested = new Map<string, number>();
  for (const line of input.lines) {
    if (!line.purchaseItemId || !Number.isInteger(line.quantity) || line.quantity <= 0) throw new Error("حدد كمية صحيحة لكل بند مستلم.");
    if (requested.has(line.purchaseItemId)) throw new Error("تكرر نفس بند الفاتورة في الاستلام.");
    requested.set(line.purchaseItemId, line.quantity);
  }
  if (!requested.size) throw new Error("حدد بنداً واحداً على الأقل للاستلام.");
  const fingerprint = requestFingerprint({
    purchaseId,
    receivedAt: receivedAt.toISOString(),
    reference: nullableText(input.reference),
    note: nullableText(input.note),
    lines: [...requested].map(([purchaseItemId, quantity]) => ({ purchaseItemId, quantity })).sort((a,b)=>a.purchaseItemId.localeCompare(b.purchaseItemId)),
  });

  return prisma.$transaction(async (tx) => {
    const purchaseRows = await tx.$queryRaw<LockedPurchase[]>`
      SELECT "id","supplierId","supplierNameSnapshot","supplierInvoiceNumber","invoiceDate","status","currency","subtotal","discountTotal","extraCostsTotal","total","amountPaid",
        COALESCE("returnAdjustmentTotal",0) AS "returnAdjustmentTotal","balanceDue","paymentMethod"::text AS "paymentMethod","paymentSourceName","paymentReference","postingKey","postingFingerprint"
      FROM "PurchaseInvoice" WHERE "id"=${purchaseId}::uuid AND "shopId"=${shopId}::uuid AND "deletedAt" IS NULL FOR UPDATE
    `;
    const purchase = purchaseRows[0];
    if (!purchase || purchase.status !== "POSTED") throw new Error("لا يمكن تسجيل استلام إلا لفاتورة شراء معتمدة.");

    const prior = await tx.$queryRaw<Array<{ id:string; purchaseInvoiceId:string; requestFingerprint:string|null }>>`
      SELECT "id","purchaseInvoiceId","requestFingerprint" FROM "PurchaseReceipt" WHERE "shopId"=${shopId}::uuid AND "requestKey"=${requestKey} LIMIT 1
    `;
    if (prior[0]) {
      if (prior[0].purchaseInvoiceId !== purchaseId) throw new Error("مفتاح إعادة المحاولة مستخدم لاستلام آخر.");
      if (!prior[0].requestFingerprint || prior[0].requestFingerprint !== fingerprint) throw new Error("مفتاح إعادة المحاولة مستخدم مسبقاً ببيانات مختلفة.");
      return { id: prior[0].id, alreadyApplied: true };
    }

    const ids=[...requested.keys()];
    const lines=await tx.$queryRaw<LockedPurchaseItem[]>(Prisma.sql`
      SELECT "id","inventoryItemId","newItemName","newItemSku","newItemBarcode","newItemCategoryId","newItemCategory","newItemDescription",
        "importedSourceText","importSourceId","importRowKey","importedPurchaseUnit","matchReviewRequired","compatibilityGroupIds","compatibilityReviewNeeded","updateSalePrice",
        "manualExtraCostAllocation","discountAllocation","netMerchandiseValue","netUnitCost","extraCostAllocation","capitalizedLineValue","capitalizedUnitCost",
        COALESCE("receivedCapitalizedValue",0) AS "receivedCapitalizedValue",COALESCE("receivedNetMerchandiseValue",0) AS "receivedNetMerchandiseValue",
        COALESCE("returnedNetMerchandiseValue",0) AS "returnedNetMerchandiseValue",
        "orderedQuantity","receivedQuantity",COALESCE("returnedQuantity",0) AS "returnedQuantity","unitCost","salePriceSnapshot","lineTotal","sortOrder"
      FROM "PurchaseItem" WHERE "shopId"=${shopId}::uuid AND "purchaseInvoiceId"=${purchaseId}::uuid
        AND "id" IN (${Prisma.join(ids.map((id)=>Prisma.sql`${id}::uuid`))}) ORDER BY "sortOrder" FOR UPDATE
    `);
    if(lines.length!==ids.length) throw new Error("أحد بنود الاستلام لا ينتمي لهذه الفاتورة.");
    const receiptLines:ReceiptTxLine[]=lines.map((line)=>({
      id:line.id, inventoryItemId:line.inventoryItemId, orderedQuantity:line.orderedQuantity, receivedQuantity:line.receivedQuantity,
      receivedCapitalizedValue:line.receivedCapitalizedValue, receivedNetMerchandiseValue:line.receivedNetMerchandiseValue,
      capitalizedLineValue:line.capitalizedLineValue, netMerchandiseValue:line.netMerchandiseValue, quantity:requested.get(line.id)!,
    }));
    const id=await createReceiptTx(tx,{shopId,userId,purchase,requestKey,requestFingerprint:fingerprint,receivedAt,reference:input.reference,note:input.note,lines:receiptLines});
    if(!id) throw new Error("تعذر تسجيل الاستلام.");
    return {id,alreadyApplied:false};
  },{isolationLevel:Prisma.TransactionIsolationLevel.Serializable,timeout:20_000});
}

export async function recordPurchasePayment(shopId: string, userId: string, purchaseId: string, input: RecordPurchasePaymentInput) {
  const requestKey = assertRequestKey(input.requestKey);
  const amount = money(input.amount);
  if (amount.lte(0)) throw new Error("قيمة الدفعة يجب أن تكون أكبر من صفر.");
  const paidAt = safeOperationDate(input.paidAt, "تاريخ الدفعة");
  if (!(["DRAWER", "WALLET", "BANK", "OTHER"] as const).includes(input.accountType)) throw new Error("الحساب المالي المحدد غير صالح.");
  if (input.accountType === "WALLET" && !nullableText(input.walletId)) throw new Error("اختر المحفظة التي خرجت منها الدفعة.");
  if (input.accountType === "BANK" && !nullableText(input.bankAccountId)) throw new Error("اختر الحساب البنكي الذي خرجت منه الدفعة.");
  await purchaseMoneyService.preparePurchaseMoneyAccount(shopId, input.accountType);
  const fingerprint = requestFingerprint({ purchaseId, amount: amount.toFixed(2), method: input.method, sourceName: nullableText(input.sourceName), reference: nullableText(input.reference), paidAt: paidAt.toISOString(), accountType: input.accountType, walletId: nullableText(input.walletId), bankAccountId: nullableText(input.bankAccountId) });

  return prisma.$transaction(async (tx) => {
    const purchaseRows = await tx.$queryRaw<LockedPurchase[]>`
      SELECT "id", "supplierId", "supplierNameSnapshot", "supplierInvoiceNumber", "invoiceDate", "status", "currency",
        "subtotal", "discountTotal", "extraCostsTotal", "total", "amountPaid", COALESCE("returnAdjustmentTotal", 0) AS "returnAdjustmentTotal", "balanceDue",
        "paymentAccountType", "paymentWalletId", "paymentMethod"::text AS "paymentMethod", "paymentSourceName", "paymentReference", "postingKey", "postingFingerprint"
      FROM "PurchaseInvoice" WHERE "id" = ${purchaseId}::uuid AND "shopId" = ${shopId}::uuid AND "deletedAt" IS NULL FOR UPDATE
    `;
    const purchase = purchaseRows[0];
    if (!purchase || purchase.status !== "POSTED") throw new Error("فاتورة الشراء المعتمدة غير موجودة.");
    const prior = await tx.$queryRaw<Array<{ id: string; purchaseInvoiceId: string; requestFingerprint: string | null }>>`
      SELECT "id", "purchaseInvoiceId", "requestFingerprint" FROM "PurchasePayment" WHERE "shopId" = ${shopId}::uuid AND "requestKey" = ${requestKey} LIMIT 1
    `;
    if (prior[0]) {
      if (prior[0].purchaseInvoiceId !== purchaseId) throw new Error("مفتاح إعادة المحاولة مستخدم لعملية أخرى.");
      if (!prior[0].requestFingerprint || prior[0].requestFingerprint !== fingerprint) throw new Error("مفتاح إعادة المحاولة مستخدم مسبقاً ببيانات دفع مختلفة.");
      return { id: prior[0].id, alreadyApplied: true };
    }
    if (amount.gt(purchase.balanceDue)) throw new Error("قيمة الدفعة تتجاوز المبلغ المتبقي لهذه الفاتورة.");

    const paymentRows = await tx.$queryRaw<Array<{ id: string }>>`
      INSERT INTO "PurchasePayment" (
        "shopId", "purchaseInvoiceId", "createdByUserId", "method", "sourceName", "amount", "reference", "note", "paidAt", "requestKey", "requestFingerprint", "accountType", "walletId", "bankAccountId"
      ) VALUES (
        ${shopId}::uuid, ${purchaseId}::uuid, ${userId}::uuid, ${input.method}, ${nullableText(input.sourceName)}, ${amount},
        ${nullableText(input.reference)}, 'دفعة لاحقة على فاتورة شراء', ${paidAt}, ${requestKey}, ${fingerprint}, ${input.accountType}, ${nullableText(input.walletId)}::uuid, ${nullableText(input.bankAccountId)}::uuid
      ) RETURNING "id"
    `;
    const paymentId = paymentRows[0]?.id;
    if (!paymentId) throw new Error("تعذر تسجيل الدفعة.");
    await purchaseMoneyService.applyPurchasePaymentTx(tx, { shopId, userId, purchaseId, sourceReference: purchase.supplierInvoiceNumber ?? purchaseId, accountType: input.accountType, walletId: input.walletId, bankAccountId: input.bankAccountId, amount, reference: input.reference, occurredAt: paidAt });
    await tx.$executeRaw`
      UPDATE "PurchaseInvoice" SET "amountPaid" = "amountPaid" + ${amount}, "balanceDue" = "balanceDue" - ${amount},
        "updatedAt" = NOW(), "version" = "version" + 1
      WHERE "id" = ${purchaseId}::uuid AND "shopId" = ${shopId}::uuid
    `;
    return { id: paymentId, alreadyApplied: false };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 20_000 });
}

export async function recordSupplierReturn(shopId: string, userId: string, purchaseId: string, input: RecordSupplierReturnInput) {
  const requestKey = assertRequestKey(input.requestKey);
  const reason = nullableText(input.reason);
  if (!reason) throw new Error("سبب المرتجع مطلوب.");
  const returnedAt = safeOperationDate(input.returnedAt, "تاريخ المرتجع");
  const shippingRefundValue = money(input.shippingRefundAmount);
  const settlementAdjustmentValue = money(input.settlementAdjustmentAmount);
  const adjustmentReason = nullableText(input.settlementAdjustmentReason);
  if (shippingRefundValue.lt(0)) throw new Error("قيمة الشحن المسترد لا يمكن أن تكون سالبة.");
  const hasFinancialAdjustment = shippingRefundValue.gt(0) || !settlementAdjustmentValue.eq(0);
  if (hasFinancialAdjustment && !input.allowFinancialAdjustment) throw new Error("تعديل قيمة تسوية المرتجع يحتاج صلاحية مالية إضافية.");
  if (hasFinancialAdjustment && !adjustmentReason) throw new Error("اكتب سبب تعديل قيمة التسوية أو استرداد الشحن.");

  const requested = new Map<string, number>();
  for (const line of input.lines) {
    if (!line.purchaseItemId || !Number.isInteger(line.quantity) || line.quantity <= 0) throw new Error("حدد كمية صحيحة لكل بند مرتجع.");
    if (requested.has(line.purchaseItemId)) throw new Error("تكرر نفس بند الفاتورة في المرتجع.");
    requested.set(line.purchaseItemId, line.quantity);
  }
  if (!requested.size) throw new Error("حدد بنداً واحداً على الأقل للمرتجع.");
  const fingerprint = requestFingerprint({
    purchaseId, reason, reference: nullableText(input.reference), returnedAt: returnedAt.toISOString(),
    lines: [...requested].map(([purchaseItemId,quantity])=>({purchaseItemId,quantity})).sort((a,b)=>a.purchaseItemId.localeCompare(b.purchaseItemId)),
    shippingRefundValue: shippingRefundValue.toFixed(2), settlementAdjustmentValue: settlementAdjustmentValue.toFixed(2), adjustmentReason,
  });

  return prisma.$transaction(async (tx) => {
    const purchaseRows = await tx.$queryRaw<LockedPurchase[]>`
      SELECT "id","supplierId","supplierNameSnapshot","supplierInvoiceNumber","invoiceDate","status","currency","subtotal","discountTotal","extraCostsTotal","total","amountPaid",
        COALESCE("returnAdjustmentTotal",0) AS "returnAdjustmentTotal","balanceDue","paymentMethod"::text AS "paymentMethod","paymentSourceName","paymentReference","postingKey","postingFingerprint"
      FROM "PurchaseInvoice" WHERE "id"=${purchaseId}::uuid AND "shopId"=${shopId}::uuid AND "deletedAt" IS NULL FOR UPDATE
    `;
    const purchase=purchaseRows[0];
    if(!purchase || purchase.status!=="POSTED") throw new Error("لا يمكن تسجيل مرتجع إلا على فاتورة شراء معتمدة.");
    if(!purchase.supplierId) throw new Error("مرتجع المورد يتطلب فاتورة مرتبطة بمورد مسجل.");

    const prior=await tx.$queryRaw<Array<{id:string;purchaseInvoiceId:string;requestFingerprint:string|null}>>`
      SELECT "id","purchaseInvoiceId","requestFingerprint" FROM "SupplierReturn" WHERE "shopId"=${shopId}::uuid AND "requestKey"=${requestKey} LIMIT 1
    `;
    if(prior[0]){
      if(prior[0].purchaseInvoiceId!==purchaseId) throw new Error("مفتاح إعادة المحاولة مستخدم لمرتجع آخر.");
      if(!prior[0].requestFingerprint || prior[0].requestFingerprint!==fingerprint) throw new Error("مفتاح إعادة المحاولة مستخدم مسبقاً ببيانات مرتجع مختلفة.");
      return {id:prior[0].id,alreadyApplied:true};
    }

    const ids=[...requested.keys()];
    const lines=await tx.$queryRaw<LockedPurchaseItem[]>(Prisma.sql`
      SELECT "id","inventoryItemId","newItemName","newItemSku","newItemBarcode","newItemCategoryId","newItemCategory","newItemDescription",
        "importedSourceText","importSourceId","importRowKey","importedPurchaseUnit","matchReviewRequired","compatibilityGroupIds","compatibilityReviewNeeded","updateSalePrice",
        "manualExtraCostAllocation","discountAllocation","netMerchandiseValue","netUnitCost","extraCostAllocation","capitalizedLineValue","capitalizedUnitCost",
        COALESCE("receivedCapitalizedValue",0) AS "receivedCapitalizedValue",COALESCE("receivedNetMerchandiseValue",0) AS "receivedNetMerchandiseValue",
        COALESCE("returnedNetMerchandiseValue",0) AS "returnedNetMerchandiseValue",
        "orderedQuantity","receivedQuantity",COALESCE("returnedQuantity",0) AS "returnedQuantity","unitCost","salePriceSnapshot","lineTotal","sortOrder"
      FROM "PurchaseItem" WHERE "shopId"=${shopId}::uuid AND "purchaseInvoiceId"=${purchaseId}::uuid
        AND "id" IN (${Prisma.join(ids.map((id)=>Prisma.sql`${id}::uuid`))}) ORDER BY "sortOrder" FOR UPDATE
    `);
    if(lines.length!==ids.length) throw new Error("أحد بنود المرتجع لا ينتمي لهذه الفاتورة.");

    let baseSettlementValue=new Prisma.Decimal(0);
    let totalInventoryValue=new Prisma.Decimal(0);
    const remainingByInventory = new Map<string, number>();
    const prepared:Array<LockedPurchaseItem & {quantity:number; inventoryQuantity:number; currentAverage:Prisma.Decimal; inventoryLineValue:Prisma.Decimal; financialLineValue:Prisma.Decimal}> = [];
    for(const line of lines){
      if(!line.inventoryItemId) throw new Error("لا يمكن إرجاع بند غير مرتبط بالمخزون.");
      const quantity=requested.get(line.id)!;
      const returnable=line.receivedQuantity-line.returnedQuantity;
      if(quantity>returnable) throw new Error("كمية المرتجع تتجاوز الكمية المستلمة القابلة للإرجاع في أحد البنود.");
      const remainingFinancial=accountingMoney(line.receivedNetMerchandiseValue.sub(line.returnedNetMerchandiseValue));
      if(remainingFinancial.lt(0)) throw new Error("قيمة المرتجع السابقة غير متسقة مع البند.");
      const financialLineValue = quantity===returnable
        ? remainingFinancial
        : accountingMoney(remainingFinancial.mul(quantity).div(returnable));

      const invRows=await tx.$queryRaw<Array<{id:string;quantity:number;unitCost:Prisma.Decimal|null}>>`
        SELECT "id","quantity","unitCost" FROM "InventoryItem" WHERE "id"=${line.inventoryItemId}::uuid AND "shopId"=${shopId}::uuid AND "deletedAt" IS NULL FOR UPDATE
      `;
      const inventory=invRows[0];
      if(!inventory) throw new Error("صنف المخزون المرتبط بالمرتجع غير موجود.");
      if(inventory.quantity<0) throw new Error("لا يمكن تنفيذ مرتجع على مخزون سالب.");
      const availableQuantity = remainingByInventory.get(line.inventoryItemId) ?? inventory.quantity;
      if(quantity>availableQuantity) throw new Error("لا يمكن إرجاع هذه الكمية لأن مجموع بنود المرتجع يتجاوز الرصيد الحالي للصنف.");
      remainingByInventory.set(line.inventoryItemId, availableQuantity - quantity);
      const outbound=inventoryOutboundValue(inventory.unitCost,quantity);
      baseSettlementValue=baseSettlementValue.add(financialLineValue);
      totalInventoryValue=totalInventoryValue.add(outbound.totalValue);
      prepared.push({...line,quantity,inventoryQuantity:availableQuantity,currentAverage:outbound.unitCost,inventoryLineValue:outbound.totalValue,financialLineValue});
    }
    baseSettlementValue=accountingMoney(baseSettlementValue);
    totalInventoryValue=accountingMoney(totalInventoryValue);
    const approvedTotal=accountingMoney(baseSettlementValue.add(shippingRefundValue).add(settlementAdjustmentValue));
    if(approvedTotal.lt(0)) throw new Error("القيمة المعتمدة للمرتجع لا يمكن أن تكون سالبة.");

    const returnRows=await tx.$queryRaw<Array<{id:string}>>`
      INSERT INTO "SupplierReturn" (
        "shopId","purchaseInvoiceId","supplierId","createdByUserId","requestKey","requestFingerprint","reason","reference","returnedAt",
        "baseSettlementValue","inventoryValue","shippingRefundValue","settlementAdjustmentValue","settlementAdjustmentReason","settlementAdjustedByUserId","totalValue"
      ) VALUES (
        ${shopId}::uuid,${purchaseId}::uuid,${purchase.supplierId}::uuid,${userId}::uuid,${requestKey},${fingerprint},${reason},${nullableText(input.reference)},${returnedAt},
        ${baseSettlementValue},${totalInventoryValue},${shippingRefundValue},${settlementAdjustmentValue},${adjustmentReason},${hasFinancialAdjustment?userId:null}::uuid,${approvedTotal}
      ) RETURNING "id"
    `;
    const supplierReturnId=returnRows[0]?.id;
    if(!supplierReturnId) throw new Error("تعذر إنشاء مرتجع المورد.");
    const warehouse = await ensureDefaultWarehouseTx(tx, shopId);

    for(const line of prepared){
      const rows=await tx.$queryRaw<Array<{id:string}>>`
        INSERT INTO "SupplierReturnItem" ("shopId","supplierReturnId","purchaseItemId","inventoryItemId","quantity","unitCostSnapshot","inventoryValue","netMerchandiseValue","lineTotal")
        VALUES (${shopId}::uuid,${supplierReturnId}::uuid,${line.id}::uuid,${line.inventoryItemId}::uuid,${line.quantity},${line.currentAverage},${line.inventoryLineValue},${line.financialLineValue},${line.financialLineValue}) RETURNING "id"
      `;
      const returnItemId=rows[0]?.id;
      if(!returnItemId) throw new Error("تعذر إنشاء بند مرتجع المورد.");
      const quantityAfter=line.inventoryQuantity-line.quantity;
      const warehouseStockRows = await tx.$queryRaw<Array<{ quantity: number; averageCost: Prisma.Decimal | null }>>`
        SELECT "quantity", "averageCost" FROM "WarehouseStock"
        WHERE "shopId" = ${shopId}::uuid
          AND "warehouseId" = ${warehouse.id}::uuid
          AND "inventoryItemId" = ${line.inventoryItemId}::uuid
        FOR UPDATE
      `;
      const warehouseStock = warehouseStockRows[0];
      if (!warehouseStock || warehouseStock.quantity < line.quantity) {
        throw new Error(`رصيد المستودع الرئيسي غير كافٍ لإرجاع الصنف للمورد. المتاح: ${warehouseStock?.quantity ?? 0}.`);
      }
      const warehouseQuantityAfter = warehouseStock.quantity - line.quantity;
      await tx.$executeRaw`
        UPDATE "WarehouseStock"
        SET "quantity" = ${warehouseQuantityAfter}, "updatedAt" = NOW()
        WHERE "shopId" = ${shopId}::uuid
          AND "warehouseId" = ${warehouse.id}::uuid
          AND "inventoryItemId" = ${line.inventoryItemId}::uuid
      `;
      // Outbound under moving average removes stock at the current average and leaves
      // the remaining per-unit average unchanged, including when quantity reaches zero.
      await tx.$executeRaw`UPDATE "InventoryItem" SET "quantity"=${quantityAfter},"version"="version"+1,"updatedAt"=NOW() WHERE "id"=${line.inventoryItemId}::uuid AND "shopId"=${shopId}::uuid`;
      await tx.$executeRaw`
        INSERT INTO "InventoryMovement" ("shopId","inventoryItemId","supplierId","purchaseInvoiceId","purchaseItemId","supplierReturnId","supplierReturnItemId","createdByUserId","type","quantityChange","quantityAfter","unitCostSnapshot","note","createdAt","updatedAt","version")
        VALUES (${shopId}::uuid,${line.inventoryItemId}::uuid,${purchase.supplierId}::uuid,${purchaseId}::uuid,${line.id}::uuid,${supplierReturnId}::uuid,${returnItemId}::uuid,${userId}::uuid,${InventoryMovementType.STOCK_OUT}::"InventoryMovementType",${-line.quantity},${quantityAfter},${line.currentAverage},${`مرتجع للمورد — ${reason}`},${returnedAt},NOW(),1)
      `;
      await tx.$executeRaw`
        INSERT INTO "WarehouseMovement" (
          "shopId", "warehouseId", "inventoryItemId", "type", "quantityChange", "quantityBefore", "quantityAfter",
          "unitCostSnapshot", "purchaseInvoiceId", "supplierReturnId", "createdByUserId", "reference", "note", "createdAt"
        ) VALUES (
          ${shopId}::uuid, ${warehouse.id}::uuid, ${line.inventoryItemId}::uuid, 'SUPPLIER_RETURN', ${-line.quantity},
          ${warehouseStock.quantity}, ${warehouseQuantityAfter}, ${line.currentAverage}, ${purchaseId}::uuid, ${supplierReturnId}::uuid,
          ${userId}::uuid, ${nullableText(input.reference)}, ${`مرتجع مورد — ${warehouse.name}: ${reason}`}, ${returnedAt}
        )
      `;
      await tx.$executeRaw`
        UPDATE "PurchaseItem" SET "returnedQuantity"="returnedQuantity"+${line.quantity},"returnedNetMerchandiseValue"="returnedNetMerchandiseValue"+${line.financialLineValue},"updatedAt"=NOW()
        WHERE "id"=${line.id}::uuid AND "shopId"=${shopId}::uuid
      `;
    }
    return {id:supplierReturnId,alreadyApplied:false,totalValue:approvedTotal,baseSettlementValue,inventoryValue:totalInventoryValue};
  },{isolationLevel:Prisma.TransactionIsolationLevel.Serializable,timeout:20_000});
}

export async function settleSupplierReturn(shopId: string, userId: string, supplierReturnId: string, input: SettleSupplierReturnInput) {
  const requestKey = assertRequestKey(input.requestKey);
  const amount = money(input.amount);
  if (amount.lte(0)) throw new Error("قيمة التسوية يجب أن تكون أكبر من صفر.");
  const settledAt = safeOperationDate(input.settledAt, "تاريخ التسوية");
  if (!(["PAYABLE_REDUCTION", "SUPPLIER_CREDIT", "REFUND"] as const).includes(input.type)) throw new Error("نوع التسوية غير صالح.");
  if (input.type === "REFUND") {
    if (!input.accountType || !(["DRAWER", "WALLET", "BANK", "OTHER"] as const).includes(input.accountType)) throw new Error("حدد أين وصل مبلغ الاسترداد.");
    if (input.accountType === "WALLET" && !nullableText(input.walletId)) throw new Error("اختر المحفظة التي وصل إليها المبلغ.");
    if (input.accountType === "BANK" && !nullableText(input.bankAccountId)) throw new Error("اختر الحساب البنكي الذي وصل إليه المبلغ.");
    if (input.accountType === "OTHER" && !nullableText(input.sourceName)) throw new Error("اكتب مصدر استلام المبلغ الخارجي.");
    if (input.accountType !== "OTHER") await purchaseMoneyService.preparePurchaseMoneyAccount(shopId, input.accountType);
  }
  const fingerprint = requestFingerprint({ supplierReturnId, type: input.type, amount: amount.toFixed(2), settledAt: settledAt.toISOString(), accountType: input.type === "REFUND" ? input.accountType ?? null : null, walletId: input.type === "REFUND" ? nullableText(input.walletId) : null, bankAccountId: input.type === "REFUND" ? nullableText(input.bankAccountId) : null, sourceName: nullableText(input.sourceName), reference: nullableText(input.reference), note: nullableText(input.note) });

  return prisma.$transaction(async (tx) => {
    const returnRows = await tx.$queryRaw<Array<{
      id: string; purchaseInvoiceId: string; supplierId: string | null; totalValue: Prisma.Decimal; supplierInvoiceNumber: string | null;
    }>>`
      SELECT r."id", r."purchaseInvoiceId", r."supplierId", r."totalValue", p."supplierInvoiceNumber"
      FROM "SupplierReturn" r
      INNER JOIN "PurchaseInvoice" p ON p."id" = r."purchaseInvoiceId" AND p."shopId" = ${shopId}::uuid AND p."deletedAt" IS NULL
      WHERE r."id" = ${supplierReturnId}::uuid AND r."shopId" = ${shopId}::uuid
      FOR UPDATE OF r, p
    `;
    const supplierReturn = returnRows[0];
    if (!supplierReturn) throw new Error("مرتجع المورد غير موجود.");
    const prior = await tx.$queryRaw<Array<{ id: string; supplierReturnId: string; requestFingerprint: string | null }>>`
      SELECT "id", "supplierReturnId", "requestFingerprint" FROM "SupplierReturnSettlement"
      WHERE "shopId" = ${shopId}::uuid AND "requestKey" = ${requestKey} LIMIT 1
    `;
    if (prior[0]) {
      if (prior[0].supplierReturnId !== supplierReturnId) throw new Error("مفتاح إعادة المحاولة مستخدم لتسوية أخرى.");
      if (!prior[0].requestFingerprint || prior[0].requestFingerprint !== fingerprint) throw new Error("مفتاح إعادة المحاولة مستخدم مسبقاً ببيانات تسوية مختلفة.");
      return { id: prior[0].id, alreadyApplied: true };
    }
    const settledRows = await tx.$queryRaw<Array<{ total: Prisma.Decimal }>>`
      SELECT COALESCE(SUM("amount"), 0) AS "total" FROM "SupplierReturnSettlement"
      WHERE "shopId" = ${shopId}::uuid AND "supplierReturnId" = ${supplierReturnId}::uuid
    `;
    const alreadySettled = settledRows[0]?.total ?? new Prisma.Decimal(0);
    const remaining = supplierReturn.totalValue.sub(alreadySettled);
    if (amount.gt(remaining)) throw new Error("قيمة التسوية تتجاوز القيمة المتبقية لهذا المرتجع.");

    if (input.type === "PAYABLE_REDUCTION") {
      const invoices = await tx.$queryRaw<Array<{ balanceDue: Prisma.Decimal; returnAdjustmentTotal: Prisma.Decimal }>>`
        SELECT "balanceDue", COALESCE("returnAdjustmentTotal", 0) AS "returnAdjustmentTotal" FROM "PurchaseInvoice"
        WHERE "id" = ${supplierReturn.purchaseInvoiceId}::uuid AND "shopId" = ${shopId}::uuid FOR UPDATE
      `;
      const invoice = invoices[0];
      if (!invoice) throw new Error("فاتورة الشراء المرتبطة غير موجودة.");
      if (amount.gt(invoice.balanceDue)) throw new Error("قيمة الخصم من المستحق تتجاوز الرصيد المستحق على الفاتورة. استخدم رصيد لدى المورد أو مبلغاً مسترداً للباقي.");
      await tx.$executeRaw`
        UPDATE "PurchaseInvoice" SET "returnAdjustmentTotal" = "returnAdjustmentTotal" + ${amount}, "balanceDue" = "balanceDue" - ${amount},
          "updatedAt" = NOW(), "version" = "version" + 1
        WHERE "id" = ${supplierReturn.purchaseInvoiceId}::uuid AND "shopId" = ${shopId}::uuid
      `;
    } else if (input.type === "REFUND") {
      await purchaseMoneyService.applySupplierRefundTx(tx, {
        shopId, userId, purchaseId: supplierReturn.purchaseInvoiceId, supplierReturnId,
        sourceReference: supplierReturn.supplierInvoiceNumber ?? supplierReturn.purchaseInvoiceId,
        accountType: input.accountType!, walletId: input.walletId, bankAccountId: input.bankAccountId, amount,
        reference: input.reference, occurredAt: settledAt,
      });
    }

    const rows = await tx.$queryRaw<Array<{ id: string }>>`
      INSERT INTO "SupplierReturnSettlement" (
        "shopId", "supplierReturnId", "purchaseInvoiceId", "supplierId", "createdByUserId", "requestKey", "requestFingerprint", "type", "amount",
        "accountType", "walletId", "bankAccountId", "sourceName", "reference", "note", "settledAt"
      ) VALUES (
        ${shopId}::uuid, ${supplierReturnId}::uuid, ${supplierReturn.purchaseInvoiceId}::uuid, ${supplierReturn.supplierId}::uuid,
        ${userId}::uuid, ${requestKey}, ${fingerprint}, ${input.type}, ${amount}, ${input.type === "REFUND" ? input.accountType ?? null : null},
        ${input.type === "REFUND" ? nullableText(input.walletId) : null}::uuid, ${input.type === "REFUND" ? nullableText(input.bankAccountId) : null}::uuid, ${nullableText(input.sourceName)}, ${nullableText(input.reference)},
        ${nullableText(input.note)}, ${settledAt}
      ) RETURNING "id"
    `;
    const settlementId = rows[0]?.id;
    if (!settlementId) throw new Error("تعذر تسجيل تسوية المرتجع.");
    return { id: settlementId, alreadyApplied: false };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 20_000 });
}


export async function getPurchaseInvoice(shopId: string, purchaseId: string): Promise<PurchaseDetail | null> {
  type InvoiceRow = Omit<PurchaseDetail, "items" | "payments" | "receipts" | "supplierReturns">;
  const invoices = await prisma.$queryRaw<InvoiceRow[]>(Prisma.sql`
    SELECT p."id", p."supplierId", p."supplierNameSnapshot", s."name" AS "supplierName", p."supplierInvoiceNumber",
      p."paymentAccountType", p."paymentWalletId", p."paymentBankAccountId", p."invoiceDate", p."notes", p."currency", p."status", p."subtotal", p."discountTotal", p."extraCostsTotal",
      p."total", p."amountPaid", COALESCE(p."returnAdjustmentTotal", 0) AS "returnAdjustmentTotal", p."balanceDue", p."postedAt", p."createdAt", p."updatedAt", p."version",
      CASE
        WHEN COALESCE((SELECT SUM(pi2."receivedQuantity") FROM "PurchaseItem" pi2 WHERE pi2."shopId" = ${shopId}::uuid AND pi2."purchaseInvoiceId" = p."id"), 0) = 0 THEN 'NONE'
        WHEN COALESCE((SELECT SUM(pi2."receivedQuantity") FROM "PurchaseItem" pi2 WHERE pi2."shopId" = ${shopId}::uuid AND pi2."purchaseInvoiceId" = p."id"), 0)
          >= COALESCE((SELECT SUM(pi2."orderedQuantity") FROM "PurchaseItem" pi2 WHERE pi2."shopId" = ${shopId}::uuid AND pi2."purchaseInvoiceId" = p."id"), 0) THEN 'COMPLETE'
        ELSE 'PARTIAL'
      END AS "receiptStatus",
      CASE WHEN p."supplierId" IS NULL THEN 0 ELSE COALESCE((
        SELECT SUM(p2."balanceDue") FROM "PurchaseInvoice" p2
        WHERE p2."shopId" = ${shopId}::uuid AND p2."supplierId" = p."supplierId" AND p2."status" = 'POSTED' AND p2."deletedAt" IS NULL
      ), 0) END AS "supplierOutstanding",
      CASE WHEN p."supplierId" IS NULL THEN 0 ELSE COALESCE((
        SELECT SUM(srs."amount") FROM "SupplierReturnSettlement" srs
        WHERE srs."shopId" = ${shopId}::uuid AND srs."supplierId" = p."supplierId" AND srs."type" = 'SUPPLIER_CREDIT'
      ), 0) END AS "supplierCredit",
      COALESCE((SELECT pp."method"::text FROM "PurchasePayment" pp WHERE pp."purchaseInvoiceId" = p."id" AND pp."shopId" = ${shopId}::uuid ORDER BY pp."createdAt" DESC LIMIT 1), p."paymentMethod") AS "paymentMethod",
      COALESCE((SELECT pp."sourceName" FROM "PurchasePayment" pp WHERE pp."purchaseInvoiceId" = p."id" AND pp."shopId" = ${shopId}::uuid ORDER BY pp."createdAt" DESC LIMIT 1), p."paymentSourceName") AS "paymentSourceName",
      COALESCE((SELECT pp."reference" FROM "PurchasePayment" pp WHERE pp."purchaseInvoiceId" = p."id" AND pp."shopId" = ${shopId}::uuid ORDER BY pp."createdAt" DESC LIMIT 1), p."paymentReference") AS "paymentReference"
    FROM "PurchaseInvoice" p
    LEFT JOIN "Supplier" s ON s."id" = p."supplierId" AND s."shopId" = ${shopId}::uuid
    WHERE p."id" = ${purchaseId}::uuid AND p."shopId" = ${shopId}::uuid AND p."deletedAt" IS NULL LIMIT 1
  `);
  const invoice = invoices[0];
  if (!invoice) return null;

  const items = await prisma.$queryRaw<Array<Omit<PurchaseDetail["items"][number], "movements">>>(Prisma.sql`
    SELECT pi."id", pi."inventoryItemId", i."name" AS "inventoryItemName", i."sku" AS "inventoryItemSku", i."barcode" AS "inventoryItemBarcode",
      i."category" AS "inventoryItemCategory", i."description" AS "inventoryItemDescription", i."unitPrice" AS "inventoryCurrentSalePrice",
      i."quantity" AS "inventoryCurrentQuantity", hist."lastPurchaseCost", hist."lastPurchaseAt", hist."lastPurchaseSupplierName",
      pi."newItemName", pi."newItemSku", pi."newItemBarcode", pi."newItemCategoryId", pi."newItemCategory", pi."newItemDescription",
      pi."importedSourceText", pi."importSourceId", pi."importRowKey", pi."importedPurchaseUnit", pi."matchReviewRequired", pi."compatibilityGroupIds", pi."compatibilityReviewNeeded", pi."updateSalePrice", pi."salePriceBeforeSnapshot",
      pi."orderedQuantity", pi."receivedQuantity", COALESCE(pi."returnedQuantity", 0) AS "returnedQuantity",
      (pi."orderedQuantity" - pi."receivedQuantity")::int AS "remainingQuantity",
      LEAST(
        GREATEST(pi."receivedQuantity" - COALESCE(pi."returnedQuantity", 0), 0),
        GREATEST(COALESCE(i."quantity", 0), 0)
      )::int AS "returnableQuantity",
      pi."unitCost", pi."manualExtraCostAllocation", pi."discountAllocation", pi."netMerchandiseValue", pi."netUnitCost", pi."extraCostAllocation", pi."capitalizedLineValue", pi."capitalizedUnitCost", COALESCE(pi."receivedCapitalizedValue",0) AS "receivedCapitalizedValue", COALESCE(pi."receivedNetMerchandiseValue",0) AS "receivedNetMerchandiseValue", COALESCE(pi."returnedNetMerchandiseValue",0) AS "returnedNetMerchandiseValue", pi."salePriceSnapshot", pi."lineTotal", pi."sortOrder"
    FROM "PurchaseItem" pi
    LEFT JOIN "InventoryItem" i ON i."id" = pi."inventoryItemId" AND i."shopId" = ${shopId}::uuid
    LEFT JOIN LATERAL (
      SELECT m."unitCostSnapshot" AS "lastPurchaseCost", m."createdAt" AS "lastPurchaseAt", s."name" AS "lastPurchaseSupplierName"
      FROM "InventoryMovement" m
      LEFT JOIN "Supplier" s ON s."id" = m."supplierId" AND s."shopId" = ${shopId}::uuid AND s."deletedAt" IS NULL
      WHERE m."shopId" = ${shopId}::uuid AND m."inventoryItemId" = i."id" AND m."deletedAt" IS NULL
        AND m."type" = 'STOCK_IN'::"InventoryMovementType" AND m."unitCostSnapshot" IS NOT NULL
      ORDER BY m."createdAt" DESC LIMIT 1
    ) hist ON TRUE
    WHERE pi."purchaseInvoiceId" = ${purchaseId}::uuid AND pi."shopId" = ${shopId}::uuid
    ORDER BY pi."sortOrder" ASC, pi."createdAt" ASC
  `);
  const movements = await prisma.$queryRaw<Array<PurchaseDetail["items"][number]["movements"][number] & { purchaseItemId: string }>>(Prisma.sql`
    SELECT "id", "purchaseItemId", "inventoryItemId", "type"::text AS "type", "quantityChange", "quantityAfter", "unitCostSnapshot", "createdAt"
    FROM "InventoryMovement"
    WHERE "purchaseInvoiceId" = ${purchaseId}::uuid AND "shopId" = ${shopId}::uuid AND "deletedAt" IS NULL
    ORDER BY "createdAt" ASC
  `);
  const payments = await prisma.$queryRaw<PurchaseDetail["payments"]>(Prisma.sql`
    SELECT pp."id", pp."method"::text AS "method", pp."sourceName", pp."amount", pp."reference", pp."paidAt",
      pp."accountType", pp."walletId", u."name" AS "createdByName"
    FROM "PurchasePayment" pp
    LEFT JOIN "User" u ON u."id" = pp."createdByUserId"
    WHERE pp."purchaseInvoiceId" = ${purchaseId}::uuid AND pp."shopId" = ${shopId}::uuid
    ORDER BY pp."paidAt" DESC
  `);

  type ReceiptRow = Omit<PurchaseDetail["receipts"][number], "lines">;
  const receiptRows = await prisma.$queryRaw<ReceiptRow[]>(Prisma.sql`
    SELECT r."id", r."receivedAt", r."reference", r."note", u."name" AS "createdByName"
    FROM "PurchaseReceipt" r LEFT JOIN "User" u ON u."id" = r."createdByUserId"
    WHERE r."shopId" = ${shopId}::uuid AND r."purchaseInvoiceId" = ${purchaseId}::uuid
    ORDER BY r."receivedAt" DESC, r."createdAt" DESC
  `);
  const receiptItemRows = receiptRows.length ? await prisma.$queryRaw<Array<{ purchaseReceiptId: string; purchaseItemId: string; quantity: number; unitCostSnapshot: Prisma.Decimal; netMerchandiseValue: Prisma.Decimal; capitalizedValue: Prisma.Decimal }>>(Prisma.sql`
    SELECT "purchaseReceiptId", "purchaseItemId", "quantity", "unitCostSnapshot", "netMerchandiseValue", "capitalizedValue"
    FROM "PurchaseReceiptItem" WHERE "shopId" = ${shopId}::uuid AND "purchaseReceiptId" IN (${Prisma.join(receiptRows.map((row) => Prisma.sql`${row.id}::uuid`))})
    ORDER BY "createdAt" ASC
  `) : [];

  type SupplierReturnRow = Omit<PurchaseDetail["supplierReturns"][number], "lines" | "settlements" | "settledValue" | "remainingSettlementValue">;
  const supplierReturnRows = await prisma.$queryRaw<SupplierReturnRow[]>(Prisma.sql`
    SELECT r."id", r."reason", r."reference", r."returnedAt", r."baseSettlementValue", r."inventoryValue", r."shippingRefundValue", r."settlementAdjustmentValue", r."settlementAdjustmentReason", r."totalValue", u."name" AS "createdByName"
    FROM "SupplierReturn" r LEFT JOIN "User" u ON u."id" = r."createdByUserId"
    WHERE r."shopId" = ${shopId}::uuid AND r."purchaseInvoiceId" = ${purchaseId}::uuid
    ORDER BY r."returnedAt" DESC, r."createdAt" DESC
  `);
  const returnItemRows = supplierReturnRows.length ? await prisma.$queryRaw<Array<{ supplierReturnId: string; purchaseItemId: string; quantity: number; unitCostSnapshot: Prisma.Decimal; inventoryValue: Prisma.Decimal; netMerchandiseValue: Prisma.Decimal; lineTotal: Prisma.Decimal }>>(Prisma.sql`
    SELECT "supplierReturnId", "purchaseItemId", "quantity", "unitCostSnapshot", "inventoryValue", "netMerchandiseValue", "lineTotal"
    FROM "SupplierReturnItem" WHERE "shopId" = ${shopId}::uuid AND "supplierReturnId" IN (${Prisma.join(supplierReturnRows.map((row) => Prisma.sql`${row.id}::uuid`))})
    ORDER BY "createdAt" ASC
  `) : [];
  const settlementRows = supplierReturnRows.length ? await prisma.$queryRaw<Array<PurchaseDetail["supplierReturns"][number]["settlements"][number] & { supplierReturnId: string }>>(Prisma.sql`
    SELECT srs."id", srs."supplierReturnId", srs."type", srs."amount", srs."accountType", srs."sourceName", srs."reference", srs."settledAt",
      u."name" AS "createdByName"
    FROM "SupplierReturnSettlement" srs LEFT JOIN "User" u ON u."id" = srs."createdByUserId"
    WHERE srs."shopId" = ${shopId}::uuid AND srs."supplierReturnId" IN (${Prisma.join(supplierReturnRows.map((row) => Prisma.sql`${row.id}::uuid`))})
    ORDER BY srs."settledAt" ASC, srs."createdAt" ASC
  `) : [];

  return {
    ...invoice,
    paymentMethod: invoice.paymentMethod as PaymentMethod | null,
    items: items.map((item) => ({
      ...item,
      compatibilityGroupIds: item.compatibilityGroupIds ?? [],
      movements: movements.filter((movement) => movement.purchaseItemId === item.id),
    })),
    payments,
    receipts: receiptRows.map((receipt) => ({
      ...receipt,
      lines: receiptItemRows.filter((item) => item.purchaseReceiptId === receipt.id).map(({ purchaseReceiptId: _receiptId, ...item }) => item),
    })),
    supplierReturns: supplierReturnRows.map((supplierReturn) => {
      const settlements = settlementRows.filter((item) => item.supplierReturnId === supplierReturn.id);
      const settledValue = settlements.reduce((sum, settlement) => sum.add(settlement.amount), new Prisma.Decimal(0));
      return {
        ...supplierReturn,
        settledValue,
        remainingSettlementValue: Prisma.Decimal.max(supplierReturn.totalValue.sub(settledValue), new Prisma.Decimal(0)),
        lines: returnItemRows.filter((item) => item.supplierReturnId === supplierReturn.id).map(({ supplierReturnId: _returnId, ...item }) => item),
        settlements: settlements.map(({ supplierReturnId: _returnId, ...settlement }) => settlement),
      };
    }),
  } as PurchaseDetail;
}

export async function listPurchaseFinancialWallets(shopId: string) {
  try {
    return await prisma.$queryRaw<Array<{ id: string; name: string; currentBalance: Prisma.Decimal }>>`
      SELECT "id", "name", "currentBalance" FROM "FinancialWallet"
      WHERE "shopId" = ${shopId}::uuid AND "deletedAt" IS NULL AND "isActive" = TRUE
      ORDER BY "name" ASC LIMIT 100
    `;
  } catch {
    return [];
  }
}


export async function clonePurchaseToDraft(shopId: string, userId: string, currency: string, sourcePurchaseId: string) {
  const source = await getPurchaseInvoice(shopId, sourcePurchaseId);
  if (!source) throw new Error("فاتورة الشراء الأصلية غير موجودة.");
  const saved = await saveDraft(shopId, userId, currency, {
    supplierId: source.supplierId,
    supplierNameSnapshot: source.supplierId ? null : source.supplierNameSnapshot,
    supplierInvoiceNumber: null,
    invoiceDate: new Date(),
    notes: null,
    discountTotal: "0",
    extraCostsTotal: "0",
    amountPaid: "0",
    paymentMethod: PaymentMethod.CASH,
    paymentSourceName: null,
    paymentReference: null,
    lines: source.items.map((item) => ({
      inventoryItemId: item.inventoryItemId,
      newItemName: item.inventoryItemId ? null : item.newItemName,
      newItemSku: item.inventoryItemId ? null : item.newItemSku,
      newItemBarcode: item.inventoryItemId ? null : item.newItemBarcode,
      newItemCategoryId: item.inventoryItemId ? null : item.newItemCategoryId,
      newItemCategory: item.inventoryItemId ? null : item.newItemCategory,
      newItemDescription: item.inventoryItemId ? null : item.newItemDescription,
      importedSourceText: null,
      importSourceId: null,
      importRowKey: null,
      importedPurchaseUnit: null,
      matchReviewRequired: false,
      compatibilityGroupIds: item.inventoryItemId ? [] : item.compatibilityGroupIds,
      compatibilityReviewNeeded: item.inventoryItemId ? false : item.compatibilityReviewNeeded,
      updateSalePrice: false,
      quantity: item.orderedQuantity,
      unitCost: item.unitCost.toString(),
      salePrice: item.salePriceSnapshot?.toString() ?? null,
    })),
  });
  return saved;
}

export async function listCompatibilityPendingItems(shopId: string) {
  return prisma.$queryRaw<Array<{
    id: string;
    name: string;
    sku: string | null;
    barcode: string | null;
    category: string | null;
    createdAt: Date;
    compatibilityCount: number;
  }>>(Prisma.sql`
    SELECT i."id", i."name", i."sku", i."barcode", i."category", i."createdAt", COUNT(icg."id")::int AS "compatibilityCount"
    FROM "InventoryItem" i
    LEFT JOIN "InventoryCompatibilityGroup" icg ON icg."inventoryItemId" = i."id"
    WHERE i."shopId" = ${shopId}::uuid AND i."deletedAt" IS NULL AND i."compatibilityReviewNeeded" = TRUE
    GROUP BY i."id" ORDER BY i."createdAt" DESC LIMIT 200
  `);
}

export async function listPaymentSources(shopId: string) {
  return prisma.paymentSourceOption.findMany({
    where: { shopId, deletedAt: null },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
    take: 100,
  });
}

export async function getPurchaseDrawerBalance(shopId: string) {
  const rows = await prisma.$queryRaw<Array<{currentBalance: Prisma.Decimal}>>`SELECT "currentBalance" FROM "CashDrawer" WHERE "shopId"=${shopId}::uuid`;
  return rows[0]?.currentBalance ?? new Prisma.Decimal(0);
}

export async function getSupplierPurchaseAccount(shopId: string, supplierId: string) {
  const [invoices, summary] = await Promise.all([
    prisma.$queryRaw<Array<{id: string; number: string | null; date: Date; total: Prisma.Decimal; paid: Prisma.Decimal; due: Prisma.Decimal}>>`
      SELECT "id", "supplierInvoiceNumber" AS "number", "invoiceDate" AS "date", "total", "amountPaid" AS "paid", "balanceDue" AS "due"
      FROM "PurchaseInvoice" WHERE "shopId"=${shopId}::uuid AND "supplierId"=${supplierId}::uuid AND "status"='POSTED' AND "deletedAt" IS NULL
      ORDER BY ("balanceDue">0) DESC, "invoiceDate" DESC, "id"`,
    prisma.$queryRaw<Array<{outstanding: Prisma.Decimal; credit: Prisma.Decimal}>>`
      SELECT COALESCE((SELECT SUM("balanceDue") FROM "PurchaseInvoice" WHERE "shopId"=${shopId}::uuid AND "supplierId"=${supplierId}::uuid AND "status"='POSTED' AND "deletedAt" IS NULL),0) AS "outstanding",
      COALESCE((SELECT SUM("amount") FROM "SupplierReturnSettlement" WHERE "shopId"=${shopId}::uuid AND "supplierId"=${supplierId}::uuid AND "type"='SUPPLIER_CREDIT'),0) AS "credit"`
  ]);
  return {invoices, outstanding: summary[0].outstanding, credit: summary[0].credit};
}

export const purchaseReceivingService = {
  getSupplierPurchaseAccount,
  getPurchaseDrawerBalance,
  searchInventory,
  lookupInventoryByIdentifier,
  getInventoryItemsByIds,
  matchImportedRows,
  suggestNewItemMetadata,
  listPurchaseInvoices,
  findDuplicateSupplierInvoice,
  saveDraft,
  deleteDraft,
  postPurchaseInvoice,
  recordPurchaseReceipt,
  recordPurchasePayment,
  recordSupplierReturn,
  settleSupplierReturn,
  getPurchaseInvoice,
  listPurchaseFinancialWallets,
  clonePurchaseToDraft,
  listCompatibilityPendingItems,
  listPaymentSources,
};
