import { prisma } from "@/lib/prisma";
import { purchaseWarehouseOperationsService } from "@/lib/services/purchaseWarehouseOperationsService";

export type InitialWarehouseReceiptMode = "FULL" | "PARTIAL";

export async function recordInitialWarehousePurchaseReceipt(
  shopId: string,
  userId: string,
  purchaseId: string,
  input: {
    warehouseId: string;
    requestKey: string;
    receiptMode: InitialWarehouseReceiptMode;
    initialReceipt?: Array<{ sortOrder: number; quantity: number }>;
  },
) {
  const purchases = await prisma.$queryRaw<Array<{
    postedAt: Date | null;
    supplierInvoiceNumber: string | null;
    status: string;
  }>>`
    SELECT "postedAt", "supplierInvoiceNumber", "status"
    FROM "PurchaseInvoice"
    WHERE "id" = ${purchaseId}::uuid
      AND "shopId" = ${shopId}::uuid
      AND "deletedAt" IS NULL
    LIMIT 1
  `;
  const purchase = purchases[0];
  if (!purchase || purchase.status !== "POSTED" || !purchase.postedAt) {
    throw new Error("لا يمكن تسجيل الاستلام الأول قبل اعتماد فاتورة الشراء.");
  }

  const items = await prisma.$queryRaw<Array<{
    id: string;
    sortOrder: number;
    orderedQuantity: number;
  }>>`
    SELECT "id", "sortOrder", "orderedQuantity"
    FROM "PurchaseItem"
    WHERE "purchaseInvoiceId" = ${purchaseId}::uuid
      AND "shopId" = ${shopId}::uuid
    ORDER BY "sortOrder", "createdAt"
  `;
  if (!items.length) throw new Error("فاتورة الشراء لا تحتوي على بنود للاستلام.");

  const partialBySortOrder = new Map<number, number>();
  if (input.receiptMode === "PARTIAL") {
    for (const entry of input.initialReceipt ?? []) {
      if (!Number.isInteger(entry.sortOrder) || entry.sortOrder < 0 || !Number.isInteger(entry.quantity) || entry.quantity < 0) {
        throw new Error("كمية الاستلام الجزئي غير صالحة.");
      }
      if (partialBySortOrder.has(entry.sortOrder)) throw new Error("تكرر بند في الاستلام الجزئي.");
      partialBySortOrder.set(entry.sortOrder, entry.quantity);
    }
  }

  const lines = items.map((item) => {
    const quantity = input.receiptMode === "FULL"
      ? item.orderedQuantity
      : (partialBySortOrder.get(item.sortOrder) ?? 0);
    if (quantity > item.orderedQuantity) {
      throw new Error("كمية الاستلام الجزئي تتجاوز كمية الفاتورة في أحد البنود.");
    }
    return { purchaseItemId: item.id, quantity };
  }).filter((line) => line.quantity > 0);

  if (!lines.length) {
    return { id: null, alreadyApplied: false, skipped: true as const };
  }

  const result = await purchaseWarehouseOperationsService.recordWarehousePurchaseReceipt(
    shopId,
    userId,
    purchaseId,
    {
      warehouseId: input.warehouseId,
      requestKey: input.requestKey,
      receivedAt: purchase.postedAt,
      reference: purchase.supplierInvoiceNumber,
      note: input.receiptMode === "FULL"
        ? "الاستلام الأول عند اعتماد الفاتورة"
        : "استلام جزئي عند اعتماد الفاتورة",
      lines,
    },
  );

  return { ...result, skipped: false as const };
}

export const purchaseInitialWarehouseReceiptService = {
  recordInitialWarehousePurchaseReceipt,
};
