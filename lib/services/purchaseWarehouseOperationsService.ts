import { InventoryMovementType, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requestFingerprint } from "@/lib/idempotency";
import {
  accountingMoney as _unusedAccountingMoney,
} from "@/lib/purchase-costing";
import {
  allocatedPartialValue,
  inventoryOutboundValue,
  money as accountingMoney,
  movingWeightedAverage,
} from "@/lib/purchase-costing";

export type WarehouseOperationLineInput = { purchaseItemId: string; quantity: number };

export type WarehouseReceiptInput = {
  warehouseId: string;
  requestKey: string;
  receivedAt: string | Date;
  reference?: string | null;
  note?: string | null;
  lines: WarehouseOperationLineInput[];
};

export type WarehouseSupplierReturnInput = {
  warehouseId: string;
  requestKey: string;
  reason: string;
  reference?: string | null;
  returnedAt: string | Date;
  lines: WarehouseOperationLineInput[];
  shippingRefundAmount?: string | number | null;
  settlementAdjustmentAmount?: string | number | null;
  settlementAdjustmentReason?: string | null;
  allowFinancialAdjustment?: boolean;
};

export type PurchaseWarehouseAudit = {
  receipts: Array<{ id: string; warehouseId: string | null; warehouseName: string | null }>;
  supplierReturns: Array<{ id: string; warehouseId: string | null; warehouseName: string | null }>;
};

type LockedPurchase = {
  id: string;
  supplierId: string | null;
  supplierInvoiceNumber: string | null;
  status: string;
};

type LockedPurchaseItem = {
  id: string;
  inventoryItemId: string | null;
  orderedQuantity: number;
  receivedQuantity: number;
  returnedQuantity: number;
  receivedCapitalizedValue: Prisma.Decimal;
  receivedNetMerchandiseValue: Prisma.Decimal;
  returnedNetMerchandiseValue: Prisma.Decimal;
  capitalizedLineValue: Prisma.Decimal | null;
  netMerchandiseValue: Prisma.Decimal | null;
};

function nullableText(value?: string | null) {
  const text = value?.trim();
  return text ? text : null;
}

function safeDate(value: string | Date, label: string) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error(`${label} غير صالح.`);
  return date;
}

function money(value: string | number | Prisma.Decimal | null | undefined) {
  const raw = typeof value === "string" ? value.trim().replace(",", ".") : String(value ?? 0);
  const result = new Prisma.Decimal(raw || "0").toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
  if (!result.isFinite()) throw new Error("قيمة مالية غير صالحة.");
  return result;
}

function assertRequestKey(value: string) {
  const key = value.trim();
  if (key.length < 12 || key.length > 120) throw new Error("مفتاح العملية غير صالح. أعد المحاولة.");
  return key;
}

function normalizeRequestedLines(lines: WarehouseOperationLineInput[]) {
  const requested = new Map<string, number>();
  for (const line of lines) {
    if (!line.purchaseItemId || !Number.isInteger(line.quantity) || line.quantity <= 0) {
      throw new Error("حدد كمية صحيحة لكل بند.");
    }
    if (requested.has(line.purchaseItemId)) throw new Error("تكرر نفس بند الفاتورة في العملية.");
    requested.set(line.purchaseItemId, line.quantity);
  }
  if (!requested.size) throw new Error("حدد بنداً واحداً على الأقل.");
  return requested;
}

async function requireActiveWarehouseTx(tx: Prisma.TransactionClient, shopId: string, warehouseId: string) {
  const rows = await tx.$queryRaw<Array<{ id: string; name: string; isActive: boolean }>>`
    SELECT "id", "name", "isActive"
    FROM "Warehouse"
    WHERE "id" = ${warehouseId}::uuid
      AND "shopId" = ${shopId}::uuid
      AND "deletedAt" IS NULL
    LIMIT 1
    FOR SHARE
  `;
  const warehouse = rows[0];
  if (!warehouse) throw new Error("المستودع المحدد غير موجود في هذا المركز.");
  if (!warehouse.isActive) throw new Error(`المستودع ${warehouse.name} غير نشط.`);
  return warehouse;
}

async function lockPostedPurchaseTx(tx: Prisma.TransactionClient, shopId: string, purchaseId: string) {
  const rows = await tx.$queryRaw<LockedPurchase[]>`
    SELECT "id", "supplierId", "supplierInvoiceNumber", "status"
    FROM "PurchaseInvoice"
    WHERE "id" = ${purchaseId}::uuid
      AND "shopId" = ${shopId}::uuid
      AND "deletedAt" IS NULL
    FOR UPDATE
  `;
  const purchase = rows[0];
  if (!purchase || purchase.status !== "POSTED") {
    throw new Error("لا يمكن تنفيذ العملية إلا على فاتورة شراء معتمدة.");
  }
  return purchase;
}

async function lockPurchaseItemsTx(
  tx: Prisma.TransactionClient,
  shopId: string,
  purchaseId: string,
  ids: string[],
) {
  const rows = await tx.$queryRaw<LockedPurchaseItem[]>(Prisma.sql`
    SELECT "id", "inventoryItemId", "orderedQuantity", "receivedQuantity",
      COALESCE("returnedQuantity", 0) AS "returnedQuantity",
      COALESCE("receivedCapitalizedValue", 0) AS "receivedCapitalizedValue",
      COALESCE("receivedNetMerchandiseValue", 0) AS "receivedNetMerchandiseValue",
      COALESCE("returnedNetMerchandiseValue", 0) AS "returnedNetMerchandiseValue",
      "capitalizedLineValue", "netMerchandiseValue"
    FROM "PurchaseItem"
    WHERE "shopId" = ${shopId}::uuid
      AND "purchaseInvoiceId" = ${purchaseId}::uuid
      AND "id" IN (${Prisma.join(ids.map((id) => Prisma.sql`${id}::uuid`))})
    ORDER BY "sortOrder", "createdAt"
    FOR UPDATE
  `);
  if (rows.length !== ids.length) throw new Error("أحد البنود لا ينتمي إلى فاتورة الشراء.");
  return rows;
}

export async function listActivePurchaseWarehouses(shopId: string) {
  return prisma.$queryRaw<Array<{ id: string; name: string; code: string | null; isDefault: boolean }>>`
    SELECT "id", "name", "code", "isDefault"
    FROM "Warehouse"
    WHERE "shopId" = ${shopId}::uuid
      AND "deletedAt" IS NULL
      AND "isActive" = TRUE
    ORDER BY "isDefault" DESC, "name" ASC
  `;
}

export async function getPurchaseWarehouseAudit(shopId: string, purchaseId: string): Promise<PurchaseWarehouseAudit> {
  const [receipts, supplierReturns] = await Promise.all([
    prisma.$queryRaw<Array<{ id: string; warehouseId: string | null; warehouseName: string | null }>>`
      SELECT r."id", r."warehouseId", w."name" AS "warehouseName"
      FROM "PurchaseReceipt" r
      LEFT JOIN "Warehouse" w ON w."id" = r."warehouseId" AND w."shopId" = r."shopId"
      WHERE r."shopId" = ${shopId}::uuid AND r."purchaseInvoiceId" = ${purchaseId}::uuid
    `,
    prisma.$queryRaw<Array<{ id: string; warehouseId: string | null; warehouseName: string | null }>>`
      SELECT r."id", r."warehouseId", w."name" AS "warehouseName"
      FROM "SupplierReturn" r
      LEFT JOIN "Warehouse" w ON w."id" = r."warehouseId" AND w."shopId" = r."shopId"
      WHERE r."shopId" = ${shopId}::uuid AND r."purchaseInvoiceId" = ${purchaseId}::uuid
    `,
  ]);
  return { receipts, supplierReturns };
}

export async function recordWarehousePurchaseReceipt(
  shopId: string,
  userId: string,
  purchaseId: string,
  input: WarehouseReceiptInput,
) {
  const requestKey = assertRequestKey(input.requestKey);
  const receivedAt = safeDate(input.receivedAt, "تاريخ الاستلام");
  const requested = normalizeRequestedLines(input.lines);
  const fingerprint = requestFingerprint({
    purchaseId,
    warehouseId: input.warehouseId,
    receivedAt: receivedAt.toISOString(),
    reference: nullableText(input.reference),
    note: nullableText(input.note),
    lines: [...requested]
      .map(([purchaseItemId, quantity]) => ({ purchaseItemId, quantity }))
      .sort((a, b) => a.purchaseItemId.localeCompare(b.purchaseItemId)),
  });

  return prisma.$transaction(async (tx) => {
    const warehouse = await requireActiveWarehouseTx(tx, shopId, input.warehouseId);
    const purchase = await lockPostedPurchaseTx(tx, shopId, purchaseId);

    const prior = await tx.$queryRaw<Array<{ id: string; purchaseInvoiceId: string; requestFingerprint: string | null }>>`
      SELECT "id", "purchaseInvoiceId", "requestFingerprint"
      FROM "PurchaseReceipt"
      WHERE "shopId" = ${shopId}::uuid AND "requestKey" = ${requestKey}
      LIMIT 1
    `;
    if (prior[0]) {
      if (prior[0].purchaseInvoiceId !== purchaseId) throw new Error("مفتاح إعادة المحاولة مستخدم لاستلام آخر.");
      if (!prior[0].requestFingerprint || prior[0].requestFingerprint !== fingerprint) {
        throw new Error("مفتاح إعادة المحاولة مستخدم مسبقاً ببيانات مختلفة.");
      }
      return { id: prior[0].id, alreadyApplied: true };
    }

    const lines = await lockPurchaseItemsTx(tx, shopId, purchaseId, [...requested.keys()]);
    const receiptRows = await tx.$queryRaw<Array<{ id: string }>>`
      INSERT INTO "PurchaseReceipt" (
        "shopId", "purchaseInvoiceId", "warehouseId", "createdByUserId", "requestKey", "requestFingerprint",
        "receivedAt", "reference", "note"
      ) VALUES (
        ${shopId}::uuid, ${purchaseId}::uuid, ${warehouse.id}::uuid, ${userId}::uuid, ${requestKey}, ${fingerprint},
        ${receivedAt}, ${nullableText(input.reference)}, ${nullableText(input.note)}
      ) RETURNING "id"
    `;
    const receiptId = receiptRows[0]?.id;
    if (!receiptId) throw new Error("تعذر إنشاء سجل الاستلام.");

    for (const line of lines) {
      if (!line.inventoryItemId) throw new Error("صنف الاستلام غير مرتبط بالمخزون.");
      const quantity = requested.get(line.id)!;
      const remaining = line.orderedQuantity - line.receivedQuantity;
      if (quantity > remaining) throw new Error("كمية الاستلام تتجاوز الكمية المتبقية في أحد البنود.");
      if (line.capitalizedLineValue === null || line.netMerchandiseValue === null) {
        throw new Error("تكلفة بند الشراء لم تُوزّع عند الاعتماد. لا يمكن الاستلام قبل إصلاح الفاتورة.");
      }

      const inventoryRows = await tx.$queryRaw<Array<{ id: string; quantity: number; unitCost: Prisma.Decimal | null }>>`
        SELECT "id", "quantity", "unitCost"
        FROM "InventoryItem"
        WHERE "id" = ${line.inventoryItemId}::uuid
          AND "shopId" = ${shopId}::uuid
          AND "deletedAt" IS NULL
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
        quantityNow: quantity,
      });
      const capitalizedValue = allocatedPartialValue({
        totalValue: line.capitalizedLineValue,
        totalQuantity: line.orderedQuantity,
        quantityAlreadyApplied: line.receivedQuantity,
        valueAlreadyApplied: line.receivedCapitalizedValue,
        quantityNow: quantity,
      });
      const inboundUnitCost = capitalizedValue.div(quantity).toDecimalPlaces(6, Prisma.Decimal.ROUND_HALF_UP);
      const newAverage = movingWeightedAverage({
        currentQuantity: inventory.quantity,
        currentAverageCost: inventory.unitCost,
        receivedQuantity: quantity,
        receivedCapitalizedValue: capitalizedValue,
      });
      const quantityAfter = inventory.quantity + quantity;

      await tx.$executeRaw`
        INSERT INTO "WarehouseStock" (
          "shopId", "warehouseId", "inventoryItemId", "quantity", "reservedQuantity", "reorderLevel", "averageCost"
        ) VALUES (
          ${shopId}::uuid, ${warehouse.id}::uuid, ${line.inventoryItemId}::uuid, 0, 0, 0, ${inventory.unitCost}
        ) ON CONFLICT ("warehouseId", "inventoryItemId") DO NOTHING
      `;
      const warehouseRows = await tx.$queryRaw<Array<{ quantity: number; reservedQuantity: number; averageCost: Prisma.Decimal | null }>>`
        SELECT "quantity", "reservedQuantity", "averageCost"
        FROM "WarehouseStock"
        WHERE "shopId" = ${shopId}::uuid
          AND "warehouseId" = ${warehouse.id}::uuid
          AND "inventoryItemId" = ${line.inventoryItemId}::uuid
        FOR UPDATE
      `;
      const warehouseStock = warehouseRows[0];
      if (!warehouseStock) throw new Error(`تعذر تهيئة رصيد القطعة في مستودع ${warehouse.name}.`);
      const warehouseAverage = movingWeightedAverage({
        currentQuantity: warehouseStock.quantity,
        currentAverageCost: warehouseStock.averageCost,
        receivedQuantity: quantity,
        receivedCapitalizedValue: capitalizedValue,
      });
      const warehouseQuantityAfter = warehouseStock.quantity + quantity;

      await tx.$executeRaw`
        UPDATE "WarehouseStock"
        SET "quantity" = ${warehouseQuantityAfter}, "averageCost" = ${warehouseAverage}, "updatedAt" = NOW()
        WHERE "shopId" = ${shopId}::uuid
          AND "warehouseId" = ${warehouse.id}::uuid
          AND "inventoryItemId" = ${line.inventoryItemId}::uuid
      `;
      await tx.$executeRaw`
        UPDATE "InventoryItem"
        SET "quantity" = ${quantityAfter}, "unitCost" = ${newAverage}, "version" = "version" + 1, "updatedAt" = NOW()
        WHERE "id" = ${line.inventoryItemId}::uuid AND "shopId" = ${shopId}::uuid
      `;

      const receiptItemRows = await tx.$queryRaw<Array<{ id: string }>>`
        INSERT INTO "PurchaseReceiptItem" (
          "shopId", "purchaseReceiptId", "purchaseItemId", "inventoryItemId", "quantity",
          "unitCostSnapshot", "netMerchandiseValue", "capitalizedValue"
        ) VALUES (
          ${shopId}::uuid, ${receiptId}::uuid, ${line.id}::uuid, ${line.inventoryItemId}::uuid, ${quantity},
          ${inboundUnitCost}, ${netValue}, ${capitalizedValue}
        ) RETURNING "id"
      `;
      const receiptItemId = receiptItemRows[0]?.id;
      if (!receiptItemId) throw new Error("تعذر إنشاء بند الاستلام.");

      await tx.$executeRaw`
        INSERT INTO "InventoryMovement" (
          "shopId", "inventoryItemId", "supplierId", "purchaseInvoiceId", "purchaseItemId", "purchaseReceiptId", "purchaseReceiptItemId",
          "createdByUserId", "type", "quantityChange", "quantityAfter", "unitCostSnapshot", "note", "createdAt", "updatedAt", "version"
        ) VALUES (
          ${shopId}::uuid, ${line.inventoryItemId}::uuid, ${purchase.supplierId}::uuid, ${purchaseId}::uuid, ${line.id}::uuid,
          ${receiptId}::uuid, ${receiptItemId}::uuid, ${userId}::uuid, ${InventoryMovementType.STOCK_IN}::"InventoryMovementType",
          ${quantity}, ${quantityAfter}, ${inboundUnitCost},
          ${`استلام شراء إلى ${warehouse.name}${purchase.supplierInvoiceNumber ? ` — فاتورة ${purchase.supplierInvoiceNumber}` : ""}`},
          ${receivedAt}, NOW(), 1
        )
      `;
      await tx.$executeRaw`
        INSERT INTO "WarehouseMovement" (
          "shopId", "warehouseId", "inventoryItemId", "type", "quantityChange", "quantityBefore", "quantityAfter",
          "unitCostSnapshot", "purchaseInvoiceId", "createdByUserId", "reference", "note", "createdAt"
        ) VALUES (
          ${shopId}::uuid, ${warehouse.id}::uuid, ${line.inventoryItemId}::uuid, 'PURCHASE_IN', ${quantity},
          ${warehouseStock.quantity}, ${warehouseQuantityAfter}, ${inboundUnitCost}, ${purchaseId}::uuid, ${userId}::uuid,
          ${nullableText(input.reference) ?? purchase.supplierInvoiceNumber}, ${`استلام شراء — ${warehouse.name}`}, ${receivedAt}
        )
      `;
      await tx.$executeRaw`
        UPDATE "PurchaseItem"
        SET "receivedQuantity" = "receivedQuantity" + ${quantity},
            "receivedNetMerchandiseValue" = "receivedNetMerchandiseValue" + ${netValue},
            "receivedCapitalizedValue" = "receivedCapitalizedValue" + ${capitalizedValue},
            "updatedAt" = NOW()
        WHERE "id" = ${line.id}::uuid AND "shopId" = ${shopId}::uuid
      `;
    }

    return { id: receiptId, alreadyApplied: false, warehouseId: warehouse.id, warehouseName: warehouse.name };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 20_000 });
}

export async function recordWarehouseSupplierReturn(
  shopId: string,
  userId: string,
  purchaseId: string,
  input: WarehouseSupplierReturnInput,
) {
  const requestKey = assertRequestKey(input.requestKey);
  const reason = nullableText(input.reason);
  if (!reason) throw new Error("سبب المرتجع مطلوب.");
  const returnedAt = safeDate(input.returnedAt, "تاريخ المرتجع");
  const requested = normalizeRequestedLines(input.lines);
  const shippingRefundValue = money(input.shippingRefundAmount);
  const settlementAdjustmentValue = money(input.settlementAdjustmentAmount);
  const adjustmentReason = nullableText(input.settlementAdjustmentReason);
  if (shippingRefundValue.lt(0)) throw new Error("قيمة الشحن المسترد لا يمكن أن تكون سالبة.");
  const hasFinancialAdjustment = shippingRefundValue.gt(0) || !settlementAdjustmentValue.eq(0);
  if (hasFinancialAdjustment && !input.allowFinancialAdjustment) {
    throw new Error("تعديل قيمة تسوية المرتجع يحتاج صلاحية مالية إضافية.");
  }
  if (hasFinancialAdjustment && !adjustmentReason) {
    throw new Error("اكتب سبب تعديل قيمة التسوية أو استرداد الشحن.");
  }

  const fingerprint = requestFingerprint({
    purchaseId,
    warehouseId: input.warehouseId,
    reason,
    reference: nullableText(input.reference),
    returnedAt: returnedAt.toISOString(),
    lines: [...requested]
      .map(([purchaseItemId, quantity]) => ({ purchaseItemId, quantity }))
      .sort((a, b) => a.purchaseItemId.localeCompare(b.purchaseItemId)),
    shippingRefundValue: shippingRefundValue.toFixed(2),
    settlementAdjustmentValue: settlementAdjustmentValue.toFixed(2),
    adjustmentReason,
  });

  return prisma.$transaction(async (tx) => {
    const warehouse = await requireActiveWarehouseTx(tx, shopId, input.warehouseId);
    const purchase = await lockPostedPurchaseTx(tx, shopId, purchaseId);
    if (!purchase.supplierId) throw new Error("مرتجع المورد يتطلب فاتورة مرتبطة بمورد مسجل.");

    const prior = await tx.$queryRaw<Array<{ id: string; purchaseInvoiceId: string; requestFingerprint: string | null }>>`
      SELECT "id", "purchaseInvoiceId", "requestFingerprint"
      FROM "SupplierReturn"
      WHERE "shopId" = ${shopId}::uuid AND "requestKey" = ${requestKey}
      LIMIT 1
    `;
    if (prior[0]) {
      if (prior[0].purchaseInvoiceId !== purchaseId) throw new Error("مفتاح إعادة المحاولة مستخدم لمرتجع آخر.");
      if (!prior[0].requestFingerprint || prior[0].requestFingerprint !== fingerprint) {
        throw new Error("مفتاح إعادة المحاولة مستخدم مسبقاً ببيانات مرتجع مختلفة.");
      }
      return { id: prior[0].id, alreadyApplied: true };
    }

    const lines = await lockPurchaseItemsTx(tx, shopId, purchaseId, [...requested.keys()]);
    let baseSettlementValue = new Prisma.Decimal(0);
    let totalInventoryValue = new Prisma.Decimal(0);
    const prepared: Array<{
      line: LockedPurchaseItem;
      quantity: number;
      inventoryQuantity: number;
      inventoryAverage: Prisma.Decimal;
      inventoryLineValue: Prisma.Decimal;
      financialLineValue: Prisma.Decimal;
      warehouseQuantity: number;
      warehouseReservedQuantity: number;
      warehouseAverage: Prisma.Decimal | null;
    }> = [];

    for (const line of lines) {
      if (!line.inventoryItemId) throw new Error("لا يمكن إرجاع بند غير مرتبط بالمخزون.");
      const quantity = requested.get(line.id)!;
      const returnable = line.receivedQuantity - line.returnedQuantity;
      if (quantity > returnable) {
        throw new Error("كمية المرتجع تتجاوز الكمية المستلمة القابلة للإرجاع في أحد البنود.");
      }
      const remainingFinancial = accountingMoney(line.receivedNetMerchandiseValue.sub(line.returnedNetMerchandiseValue));
      if (remainingFinancial.lt(0)) throw new Error("قيمة المرتجع السابقة غير متسقة مع البند.");
      const financialLineValue = quantity === returnable
        ? remainingFinancial
        : accountingMoney(remainingFinancial.mul(quantity).div(returnable));

      const inventoryRows = await tx.$queryRaw<Array<{ quantity: number; unitCost: Prisma.Decimal | null }>>`
        SELECT "quantity", "unitCost"
        FROM "InventoryItem"
        WHERE "id" = ${line.inventoryItemId}::uuid
          AND "shopId" = ${shopId}::uuid
          AND "deletedAt" IS NULL
        FOR UPDATE
      `;
      const inventory = inventoryRows[0];
      if (!inventory) throw new Error("صنف المخزون المرتبط بالمرتجع غير موجود.");
      if (inventory.quantity < quantity) throw new Error("الرصيد الإجمالي للصنف لا يكفي لتنفيذ المرتجع.");
      const outbound = inventoryOutboundValue(inventory.unitCost, quantity);

      const warehouseRows = await tx.$queryRaw<Array<{ quantity: number; reservedQuantity: number; averageCost: Prisma.Decimal | null }>>`
        SELECT "quantity", "reservedQuantity", "averageCost"
        FROM "WarehouseStock"
        WHERE "shopId" = ${shopId}::uuid
          AND "warehouseId" = ${warehouse.id}::uuid
          AND "inventoryItemId" = ${line.inventoryItemId}::uuid
        FOR UPDATE
      `;
      const warehouseStock = warehouseRows[0];
      const available = warehouseStock ? warehouseStock.quantity - warehouseStock.reservedQuantity : 0;
      if (!warehouseStock || quantity > available) {
        throw new Error(`الرصيد المتاح في مستودع ${warehouse.name} لا يكفي لإرجاع الصنف للمورد. المتاح غير المحجوز: ${Math.max(0, available)}.`);
      }

      baseSettlementValue = baseSettlementValue.add(financialLineValue);
      totalInventoryValue = totalInventoryValue.add(outbound.totalValue);
      prepared.push({
        line,
        quantity,
        inventoryQuantity: inventory.quantity,
        inventoryAverage: outbound.unitCost,
        inventoryLineValue: outbound.totalValue,
        financialLineValue,
        warehouseQuantity: warehouseStock.quantity,
        warehouseReservedQuantity: warehouseStock.reservedQuantity,
        warehouseAverage: warehouseStock.averageCost,
      });
    }

    baseSettlementValue = accountingMoney(baseSettlementValue);
    totalInventoryValue = accountingMoney(totalInventoryValue);
    const approvedTotal = accountingMoney(baseSettlementValue.add(shippingRefundValue).add(settlementAdjustmentValue));
    if (approvedTotal.lt(0)) throw new Error("القيمة المعتمدة للمرتجع لا يمكن أن تكون سالبة.");

    const returnRows = await tx.$queryRaw<Array<{ id: string }>>`
      INSERT INTO "SupplierReturn" (
        "shopId", "purchaseInvoiceId", "warehouseId", "supplierId", "createdByUserId", "requestKey", "requestFingerprint",
        "reason", "reference", "returnedAt", "baseSettlementValue", "inventoryValue", "shippingRefundValue",
        "settlementAdjustmentValue", "settlementAdjustmentReason", "settlementAdjustedByUserId", "totalValue"
      ) VALUES (
        ${shopId}::uuid, ${purchaseId}::uuid, ${warehouse.id}::uuid, ${purchase.supplierId}::uuid, ${userId}::uuid,
        ${requestKey}, ${fingerprint}, ${reason}, ${nullableText(input.reference)}, ${returnedAt}, ${baseSettlementValue},
        ${totalInventoryValue}, ${shippingRefundValue}, ${settlementAdjustmentValue}, ${adjustmentReason},
        ${hasFinancialAdjustment ? userId : null}::uuid, ${approvedTotal}
      ) RETURNING "id"
    `;
    const supplierReturnId = returnRows[0]?.id;
    if (!supplierReturnId) throw new Error("تعذر إنشاء مرتجع المورد.");

    for (const preparedLine of prepared) {
      const { line, quantity } = preparedLine;
      if (!line.inventoryItemId) continue;
      const warehouseOutboundCost = preparedLine.warehouseAverage ?? preparedLine.inventoryAverage;
      const warehouseQuantityAfter = preparedLine.warehouseQuantity - quantity;
      const inventoryQuantityAfter = preparedLine.inventoryQuantity - quantity;

      const itemRows = await tx.$queryRaw<Array<{ id: string }>>`
        INSERT INTO "SupplierReturnItem" (
          "shopId", "supplierReturnId", "purchaseItemId", "inventoryItemId", "quantity", "unitCostSnapshot",
          "inventoryValue", "netMerchandiseValue", "lineTotal"
        ) VALUES (
          ${shopId}::uuid, ${supplierReturnId}::uuid, ${line.id}::uuid, ${line.inventoryItemId}::uuid, ${quantity},
          ${preparedLine.inventoryAverage}, ${preparedLine.inventoryLineValue}, ${preparedLine.financialLineValue}, ${preparedLine.financialLineValue}
        ) RETURNING "id"
      `;
      const returnItemId = itemRows[0]?.id;
      if (!returnItemId) throw new Error("تعذر إنشاء بند مرتجع المورد.");

      await tx.$executeRaw`
        UPDATE "WarehouseStock"
        SET "quantity" = ${warehouseQuantityAfter}, "updatedAt" = NOW()
        WHERE "shopId" = ${shopId}::uuid
          AND "warehouseId" = ${warehouse.id}::uuid
          AND "inventoryItemId" = ${line.inventoryItemId}::uuid
      `;
      await tx.$executeRaw`
        UPDATE "InventoryItem"
        SET "quantity" = ${inventoryQuantityAfter}, "version" = "version" + 1, "updatedAt" = NOW()
        WHERE "id" = ${line.inventoryItemId}::uuid AND "shopId" = ${shopId}::uuid
      `;
      await tx.$executeRaw`
        INSERT INTO "InventoryMovement" (
          "shopId", "inventoryItemId", "supplierId", "purchaseInvoiceId", "purchaseItemId", "supplierReturnId", "supplierReturnItemId",
          "createdByUserId", "type", "quantityChange", "quantityAfter", "unitCostSnapshot", "note", "createdAt", "updatedAt", "version"
        ) VALUES (
          ${shopId}::uuid, ${line.inventoryItemId}::uuid, ${purchase.supplierId}::uuid, ${purchaseId}::uuid, ${line.id}::uuid,
          ${supplierReturnId}::uuid, ${returnItemId}::uuid, ${userId}::uuid, ${InventoryMovementType.STOCK_OUT}::"InventoryMovementType",
          ${-quantity}, ${inventoryQuantityAfter}, ${preparedLine.inventoryAverage},
          ${`مرتجع للمورد من ${warehouse.name} — ${reason}`}, ${returnedAt}, NOW(), 1
        )
      `;
      await tx.$executeRaw`
        INSERT INTO "WarehouseMovement" (
          "shopId", "warehouseId", "inventoryItemId", "type", "quantityChange", "quantityBefore", "quantityAfter",
          "unitCostSnapshot", "purchaseInvoiceId", "supplierReturnId", "createdByUserId", "reference", "note", "createdAt"
        ) VALUES (
          ${shopId}::uuid, ${warehouse.id}::uuid, ${line.inventoryItemId}::uuid, 'SUPPLIER_RETURN', ${-quantity},
          ${preparedLine.warehouseQuantity}, ${warehouseQuantityAfter}, ${warehouseOutboundCost}, ${purchaseId}::uuid,
          ${supplierReturnId}::uuid, ${userId}::uuid, ${nullableText(input.reference)},
          ${`مرتجع مورد — ${warehouse.name}: ${reason}`}, ${returnedAt}
        )
      `;
      await tx.$executeRaw`
        UPDATE "PurchaseItem"
        SET "returnedQuantity" = "returnedQuantity" + ${quantity},
            "returnedNetMerchandiseValue" = "returnedNetMerchandiseValue" + ${preparedLine.financialLineValue},
            "updatedAt" = NOW()
        WHERE "id" = ${line.id}::uuid AND "shopId" = ${shopId}::uuid
      `;
    }

    return {
      id: supplierReturnId,
      alreadyApplied: false,
      totalValue: approvedTotal,
      baseSettlementValue,
      inventoryValue: totalInventoryValue,
      warehouseId: warehouse.id,
      warehouseName: warehouse.name,
    };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 20_000 });
}

export const purchaseWarehouseOperationsService = {
  listActivePurchaseWarehouses,
  getPurchaseWarehouseAudit,
  recordWarehousePurchaseReceipt,
  recordWarehouseSupplierReturn,
};
