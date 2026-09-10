import { randomBytes } from "node:crypto";
import { InventoryMovementType, Prisma, SaleStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { dailyCashCloseService } from "@/lib/services/dailyCashCloseService";
import { moneyAccountService, type MoneyAccountDestination } from "@/lib/services/moneyAccountService";

export type SalesReturnRefundAccountType = MoneyAccountDestination;

export type SalesReturnLineInput = {
  saleItemId: string;
  quantity: number;
  restock?: boolean;
  warehouseId?: string | null;
  reason?: string | null;
};

export type CreateSalesReturnInput = {
  saleId: string;
  reason: string;
  returnedAt?: Date | null;
  refundAccountType: SalesReturnRefundAccountType;
  refundWalletId?: string | null;
  refundBankAccountId?: string | null;
  refundSourceName?: string | null;
  notes?: string | null;
  lines: SalesReturnLineInput[];
};

type SaleItemLocked = {
  id: string;
  saleId: string;
  inventoryItemId: string | null;
  description: string;
  quantity: number;
  unitPriceSnapshot: Prisma.Decimal;
  lineTotal: Prisma.Decimal;
};

type PreviousReturnAggregate = {
  saleItemId: string;
  returnedQuantity: number;
  returnedValue: Prisma.Decimal;
};

function clean(value?: string | null) {
  const text = value?.trim();
  return text ? text : null;
}

function returnNumber() {
  const day = new Date().toISOString().slice(0, 10).replaceAll("-", "");
  return `SR-${day}-${randomBytes(3).toString("hex").toUpperCase()}`;
}

function uniqueLines(lines: SalesReturnLineInput[]) {
  const seen = new Set<string>();
  return lines.map((line) => {
    if (seen.has(line.saleItemId)) throw new Error("لا يمكن تكرار نفس بند البيع في المرتجع.");
    seen.add(line.saleItemId);
    if (!Number.isInteger(line.quantity) || line.quantity <= 0) throw new Error("كمية المرتجع يجب أن تكون عدداً صحيحاً أكبر من صفر.");
    return { ...line, restock: line.restock !== false };
  });
}

async function prepareRefundAccount(shopId: string, input: CreateSalesReturnInput) {
  if (input.refundAccountType === "WALLET" && !input.refundWalletId) throw new Error("اختر المحفظة التي سيخرج منها مبلغ المرتجع.");
  if (input.refundAccountType === "BANK" && !input.refundBankAccountId) throw new Error("اختر الحساب البنكي الذي سيخرج منه مبلغ المرتجع.");
  await moneyAccountService.prepareMoneyAccounts(shopId, input.refundAccountType);
}

async function resolveRestockWarehouseTx(
  tx: Prisma.TransactionClient,
  shopId: string,
  requestedWarehouseId?: string | null,
) {
  if (requestedWarehouseId) {
    const rows = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT "id" FROM "Warehouse"
      WHERE "id"=${requestedWarehouseId}::uuid AND "shopId"=${shopId}::uuid
        AND "isActive"=TRUE AND "deletedAt" IS NULL
      LIMIT 1
    `;
    if (!rows[0]) throw new Error("مستودع الإرجاع المحدد غير موجود أو متوقف.");
    return rows[0].id;
  }

  const defaults = await tx.$queryRaw<Array<{ id: string }>>`
    SELECT "id" FROM "Warehouse"
    WHERE "shopId"=${shopId}::uuid AND "isDefault"=TRUE AND "isActive"=TRUE AND "deletedAt" IS NULL
    LIMIT 1
  `;
  return defaults[0]?.id ?? null;
}

async function restockInventoryTx(
  tx: Prisma.TransactionClient,
  input: {
    shopId: string;
    userId: string;
    saleId: string;
    saleItemId: string;
    inventoryItemId: string;
    salesReturnId: string;
    returnNumber: string;
    quantity: number;
    warehouseId?: string | null;
  },
) {
  const rows = await tx.$queryRaw<Array<{ id: string; quantity: number; unitCost: Prisma.Decimal | null }>>`
    SELECT "id", "quantity", "unitCost" FROM "InventoryItem"
    WHERE "id"=${input.inventoryItemId}::uuid AND "shopId"=${input.shopId}::uuid AND "deletedAt" IS NULL
    FOR UPDATE
  `;
  const item = rows[0];
  if (!item) throw new Error("قطعة المخزون المرتبطة ببند البيع غير موجودة.");

  const nextQuantity = item.quantity + input.quantity;
  await tx.$executeRaw`
    UPDATE "InventoryItem"
    SET "quantity"=${nextQuantity}, "version"="version"+1, "updatedAt"=NOW()
    WHERE "id"=${item.id}::uuid AND "shopId"=${input.shopId}::uuid
  `;
  await tx.inventoryMovement.create({
    data: {
      shopId: input.shopId,
      inventoryItemId: item.id,
      saleId: input.saleId,
      saleItemId: input.saleItemId,
      createdByUserId: input.userId,
      type: InventoryMovementType.RETURN,
      quantityChange: input.quantity,
      quantityAfter: nextQuantity,
      unitCostSnapshot: item.unitCost,
      note: `مرتجع بيع ${input.returnNumber}`,
    },
  });

  const warehouseId = await resolveRestockWarehouseTx(tx, input.shopId, input.warehouseId);
  if (!warehouseId) return null;

  await tx.$executeRaw`
    INSERT INTO "WarehouseStock" (
      "shopId", "warehouseId", "inventoryItemId", "quantity", "reservedQuantity", "reorderLevel", "averageCost"
    ) VALUES (
      ${input.shopId}::uuid, ${warehouseId}::uuid, ${item.id}::uuid, 0, 0, 0, ${item.unitCost}
    ) ON CONFLICT ("warehouseId", "inventoryItemId") DO NOTHING
  `;
  const stocks = await tx.$queryRaw<Array<{ quantity: number; averageCost: Prisma.Decimal | null }>>`
    SELECT "quantity", "averageCost" FROM "WarehouseStock"
    WHERE "warehouseId"=${warehouseId}::uuid AND "inventoryItemId"=${item.id}::uuid AND "shopId"=${input.shopId}::uuid
    FOR UPDATE
  `;
  const stock = stocks[0];
  if (!stock) throw new Error("تعذر تجهيز رصيد المستودع للمرتجع.");
  const warehouseAfter = stock.quantity + input.quantity;
  await tx.$executeRaw`
    UPDATE "WarehouseStock"
    SET "quantity"=${warehouseAfter}, "averageCost"=COALESCE("averageCost", ${item.unitCost}), "updatedAt"=NOW()
    WHERE "warehouseId"=${warehouseId}::uuid AND "inventoryItemId"=${item.id}::uuid AND "shopId"=${input.shopId}::uuid
  `;
  await tx.$executeRaw`
    INSERT INTO "WarehouseMovement" (
      "shopId", "warehouseId", "inventoryItemId", "type", "quantityChange", "quantityBefore", "quantityAfter",
      "unitCostSnapshot", "saleId", "salesReturnId", "createdByUserId", "reference", "note"
    ) VALUES (
      ${input.shopId}::uuid, ${warehouseId}::uuid, ${item.id}::uuid, 'SALES_RETURN', ${input.quantity}, ${stock.quantity}, ${warehouseAfter},
      ${item.unitCost}, ${input.saleId}::uuid, ${input.salesReturnId}::uuid, ${input.userId}::uuid,
      ${input.returnNumber}, 'إرجاع قطعة من مرتجع بيع'
    )
  `;
  return warehouseId;
}

async function captureRefundMovementIdsTx(
  tx: Prisma.TransactionClient,
  shopId: string,
  salesReturnId: string,
  accountType: SalesReturnRefundAccountType,
) {
  if (accountType === "DRAWER") {
    const rows = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT "id" FROM "CashDrawerMovement"
      WHERE "shopId"=${shopId}::uuid AND "sourceType"='SALE_CHANGE' AND "sourceId"=${salesReturnId} AND "status"='ACTIVE'
      ORDER BY "createdAt" DESC LIMIT 1
    `;
    return { cashDrawerMovementId: rows[0]?.id ?? null, bankAccountMovementId: null, financialTransferId: null };
  }
  if (accountType === "BANK") {
    const rows = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT "id" FROM "BankAccountMovement"
      WHERE "shopId"=${shopId}::uuid AND "sourceType"='SALE_CHANGE' AND "sourceId"=${salesReturnId} AND "status"='ACTIVE'
      ORDER BY "createdAt" DESC LIMIT 1
    `;
    return { cashDrawerMovementId: null, bankAccountMovementId: rows[0]?.id ?? null, financialTransferId: null };
  }
  if (accountType === "WALLET") {
    const rows = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT "id" FROM "FinancialTransfer"
      WHERE "shopId"=${shopId}::uuid AND "sourceType"='SALE_CHANGE' AND "sourceId"=${salesReturnId}
        AND "status"='ACTIVE' AND "deletedAt" IS NULL
      ORDER BY "createdAt" DESC LIMIT 1
    `;
    return { cashDrawerMovementId: null, bankAccountMovementId: null, financialTransferId: rows[0]?.id ?? null };
  }
  return { cashDrawerMovementId: null, bankAccountMovementId: null, financialTransferId: null };
}

export async function createSalesReturn(shopId: string, userId: string, rawInput: CreateSalesReturnInput) {
  const returnedAt = rawInput.returnedAt ?? new Date();
  await dailyCashCloseService.assertBusinessDateOpen(shopId, returnedAt);
  const reason = clean(rawInput.reason);
  if (!reason) throw new Error("سبب المرتجع مطلوب.");
  const lines = uniqueLines(rawInput.lines);
  if (!lines.length) throw new Error("أضف بنداً واحداً على الأقل للمرتجع.");
  const input = { ...rawInput, returnedAt, reason, lines };
  await prepareRefundAccount(shopId, input);

  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`
      SELECT "id" FROM "Sale"
      WHERE "id"=${input.saleId}::uuid AND "shopId"=${shopId}::uuid AND "deletedAt" IS NULL
      FOR UPDATE
    `;
    const sale = await tx.sale.findFirst({
      where: { id: input.saleId, shopId, deletedAt: null },
      include: { customer: true, invoices: { where: { deletedAt: null }, select: { id: true, status: true } } },
    });
    if (!sale) throw new Error("عملية البيع غير موجودة.");
    if (sale.status === SaleStatus.CANCELLED || sale.status === SaleStatus.DRAFT) throw new Error("لا يمكن إنشاء مرتجع على هذه المبيعة.");
    if (sale.invoices.length) throw new Error("هذه المبيعة مرتبطة بفاتورة. يلزم مسار إشعار دائن قبل تنفيذ مرتجع جزئي عليها.");

    const debtRows = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT "id" FROM "DebtLedgerEntry"
      WHERE "shopId"=${shopId}::uuid AND "type"='DEBT' AND "isReversed"=FALSE
        AND "reference" LIKE ${`[SOURCE-DEBT:SALE:${sale.id}]%`}
      LIMIT 1
    `;
    if (debtRows[0]) throw new Error("هذه المبيعة مرتبطة بذمة عميل. سوِّ الذمة أو استخدم مسار تسوية الدين قبل المرتجع الجزئي.");

    const selectedIds = lines.map((line) => line.saleItemId);
    const saleItems = await tx.$queryRaw<SaleItemLocked[]>(Prisma.sql`
      SELECT "id", "saleId", "inventoryItemId", "description", "quantity", "unitPriceSnapshot", "lineTotal"
      FROM "SaleItem"
      WHERE "shopId"=${shopId}::uuid AND "saleId"=${sale.id}::uuid AND "deletedAt" IS NULL
        AND "id" IN (${Prisma.join(selectedIds.map((id) => Prisma.sql`${id}::uuid`))})
      FOR UPDATE
    `);
    if (saleItems.length !== selectedIds.length) throw new Error("أحد بنود المرتجع لا يتبع هذه المبيعة.");

    const previous = await tx.$queryRaw<PreviousReturnAggregate[]>`
      SELECT srl."saleItemId",
             COALESCE(SUM(srl."quantity"),0)::int AS "returnedQuantity",
             COALESCE(SUM(srl."lineTotal"),0) AS "returnedValue"
      FROM "SalesReturnLine" srl
      JOIN "SalesReturn" sr ON sr."id"=srl."salesReturnId" AND sr."shopId"=srl."shopId"
      WHERE sr."shopId"=${shopId}::uuid AND sr."saleId"=${sale.id}::uuid AND sr."status"='POSTED'
      GROUP BY srl."saleItemId"
    `;
    const previousMap = new Map(previous.map((row) => [row.saleItemId, row]));
    const itemMap = new Map(saleItems.map((item) => [item.id, item]));

    const prepared = lines.map((line) => {
      const item = itemMap.get(line.saleItemId)!;
      const prior = previousMap.get(item.id);
      const priorQty = Number(prior?.returnedQuantity ?? 0);
      const priorValue = new Prisma.Decimal(prior?.returnedValue ?? 0);
      const remainingQty = item.quantity - priorQty;
      if (line.quantity > remainingQty) throw new Error(`الكمية المرتجعة من «${item.description}» أكبر من الكمية المتبقية القابلة للمرتجع (${remainingQty}).`);
      const remainingValue = item.lineTotal.sub(priorValue);
      const lineTotal = line.quantity === remainingQty
        ? remainingValue.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP)
        : item.lineTotal.mul(line.quantity).div(item.quantity).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
      return { ...line, item, priorQty, lineTotal };
    });
    const total = prepared.reduce((sum, line) => sum.add(line.lineTotal), new Prisma.Decimal(0)).toDecimalPlaces(2);
    if (total.lte(0)) throw new Error("قيمة المرتجع يجب أن تكون أكبر من صفر.");

    const number = returnNumber();
    const returnRows = await tx.$queryRaw<Array<{ id: string }>>`
      INSERT INTO "SalesReturn" (
        "shopId", "saleId", "customerId", "returnNumber", "status", "reason", "total",
        "refundAccountType", "refundWalletId", "refundBankAccountId", "refundSourceName",
        "createdByUserId", "returnedAt", "notes"
      ) VALUES (
        ${shopId}::uuid, ${sale.id}::uuid, ${sale.customerId}::uuid, ${number}, 'DRAFT', ${reason}, ${total},
        ${input.refundAccountType}, ${input.refundWalletId ?? null}::uuid, ${input.refundBankAccountId ?? null}::uuid,
        ${clean(input.refundSourceName)}, ${userId}::uuid, ${returnedAt}, ${clean(input.notes)}
      ) RETURNING "id"
    `;
    const salesReturnId = returnRows[0]?.id;
    if (!salesReturnId) throw new Error("تعذر إنشاء مستند المرتجع.");

    for (const line of prepared) {
      const restockWarehouseId = line.restock && line.item.inventoryItemId
        ? await restockInventoryTx(tx, {
            shopId,
            userId,
            saleId: sale.id,
            saleItemId: line.item.id,
            inventoryItemId: line.item.inventoryItemId,
            salesReturnId,
            returnNumber: number,
            quantity: line.quantity,
            warehouseId: line.warehouseId,
          })
        : null;
      await tx.$executeRaw`
        INSERT INTO "SalesReturnLine" (
          "shopId", "salesReturnId", "saleItemId", "inventoryItemId", "warehouseId", "quantity",
          "unitPriceSnapshot", "lineTotal", "restock", "reason"
        ) VALUES (
          ${shopId}::uuid, ${salesReturnId}::uuid, ${line.item.id}::uuid, ${line.item.inventoryItemId}::uuid,
          ${restockWarehouseId}::uuid, ${line.quantity}, ${line.item.unitPriceSnapshot}, ${line.lineTotal}, ${line.restock}, ${clean(line.reason)}
        )
      `;
    }

    if (input.refundAccountType !== "OTHER") {
      await moneyAccountService.applyOutgoingMoneyTx(tx, shopId, userId, {
        destination: input.refundAccountType,
        walletId: input.refundWalletId ?? undefined,
        bankAccountId: input.refundBankAccountId ?? undefined,
        amount: total,
        reference: number,
        description: `مرتجع بيع ${number} عن ${sale.receiptNumber ?? sale.id.slice(0, 8)}`,
        movementType: "SALE_RETURN",
        contextLabel: `مرتجع البيع ${number}`,
        occurredAt: returnedAt,
        source: {
          sourceType: "SALE_CHANGE",
          sourceId: salesReturnId,
          sourceReference: number,
          customerId: sale.customerId,
          customerName: sale.customer?.name ?? null,
          customerPhone: sale.customer?.phone ?? null,
        },
      });
    }

    const movementIds = await captureRefundMovementIdsTx(tx, shopId, salesReturnId, input.refundAccountType);
    await tx.$executeRaw`
      UPDATE "SalesReturn"
      SET "status"='POSTED', "postedByUserId"=${userId}::uuid, "postedAt"=NOW(), "updatedAt"=NOW(),
          "cashDrawerMovementId"=${movementIds.cashDrawerMovementId}::uuid,
          "bankAccountMovementId"=${movementIds.bankAccountMovementId}::uuid,
          "financialTransferId"=${movementIds.financialTransferId}::uuid
      WHERE "id"=${salesReturnId}::uuid AND "shopId"=${shopId}::uuid
    `;

    const completion = await tx.$queryRaw<Array<{ remaining: number }>>`
      SELECT COALESCE(SUM(GREATEST(si."quantity" - COALESCE(r."returnedQuantity",0),0)),0)::int AS "remaining"
      FROM "SaleItem" si
      LEFT JOIN (
        SELECT srl."saleItemId", SUM(srl."quantity")::int AS "returnedQuantity"
        FROM "SalesReturnLine" srl
        JOIN "SalesReturn" sr ON sr."id"=srl."salesReturnId" AND sr."shopId"=srl."shopId"
        WHERE sr."shopId"=${shopId}::uuid AND sr."saleId"=${sale.id}::uuid AND sr."status"='POSTED'
        GROUP BY srl."saleItemId"
      ) r ON r."saleItemId"=si."id"
      WHERE si."shopId"=${shopId}::uuid AND si."saleId"=${sale.id}::uuid AND si."deletedAt" IS NULL
    `;
    if (Number(completion[0]?.remaining ?? 0) === 0) {
      await tx.sale.update({ where: { id: sale.id }, data: { status: SaleStatus.REFUNDED, version: { increment: 1 } } });
    }

    return { id: salesReturnId, returnNumber: number, total };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 15_000 });
}

export async function getReturnableSale(shopId: string, saleId: string) {
  const sale = await prisma.sale.findFirst({
    where: { id: saleId, shopId, deletedAt: null },
    include: { customer: true, items: { where: { deletedAt: null }, include: { inventoryItem: true }, orderBy: { createdAt: "asc" } } },
  });
  if (!sale) return null;
  const previous = await prisma.$queryRaw<PreviousReturnAggregate[]>`
    SELECT srl."saleItemId", COALESCE(SUM(srl."quantity"),0)::int AS "returnedQuantity", COALESCE(SUM(srl."lineTotal"),0) AS "returnedValue"
    FROM "SalesReturnLine" srl
    JOIN "SalesReturn" sr ON sr."id"=srl."salesReturnId" AND sr."shopId"=srl."shopId"
    WHERE sr."shopId"=${shopId}::uuid AND sr."saleId"=${saleId}::uuid AND sr."status"='POSTED'
    GROUP BY srl."saleItemId"
  `;
  const map = new Map(previous.map((row) => [row.saleItemId, row]));
  return {
    ...sale,
    items: sale.items.map((item) => ({
      ...item,
      returnedQuantity: Number(map.get(item.id)?.returnedQuantity ?? 0),
      returnableQuantity: Math.max(0, item.quantity - Number(map.get(item.id)?.returnedQuantity ?? 0)),
    })),
  };
}

export async function listSalesReturns(shopId: string, limit = 100) {
  return prisma.$queryRaw<Array<{
    id: string;
    returnNumber: string;
    saleId: string;
    receiptNumber: string | null;
    customerName: string | null;
    reason: string;
    total: Prisma.Decimal;
    refundAccountType: SalesReturnRefundAccountType | null;
    status: string;
    returnedAt: Date;
    postedAt: Date | null;
    itemCount: number;
    totalQuantity: number;
  }>>`
    SELECT sr."id", sr."returnNumber", sr."saleId", s."receiptNumber", c."name" AS "customerName", sr."reason", sr."total",
           sr."refundAccountType", sr."status", sr."returnedAt", sr."postedAt",
           COUNT(srl."id")::int AS "itemCount", COALESCE(SUM(srl."quantity"),0)::int AS "totalQuantity"
    FROM "SalesReturn" sr
    JOIN "Sale" s ON s."id"=sr."saleId" AND s."shopId"=sr."shopId"
    LEFT JOIN "Customer" c ON c."id"=sr."customerId" AND c."shopId"=sr."shopId"
    LEFT JOIN "SalesReturnLine" srl ON srl."salesReturnId"=sr."id" AND srl."shopId"=sr."shopId"
    WHERE sr."shopId"=${shopId}::uuid
    GROUP BY sr."id", s."receiptNumber", c."name"
    ORDER BY sr."returnedAt" DESC, sr."createdAt" DESC
    LIMIT ${Math.max(1, Math.min(limit, 250))}
  `;
}

export const salesReturnService = { createSalesReturn, getReturnableSale, listSalesReturns };
