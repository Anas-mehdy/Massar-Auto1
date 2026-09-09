import {
  InvoiceStatus,
  InventoryMovementType,
  Prisma,
  SaleStatus,
} from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { moneyAccountService, type MoneyAccountDestination } from "@/lib/services/moneyAccountService";
import { sourceDebtService } from "@/lib/services/sourceDebtService";

export type SaleFilters = { search?: string; status?: SaleStatus | "ALL" };
export type CreateSaleLineItemInput = { inventoryItemId?: string | null; description: string; quantity: number; unitPrice: string; discountTotal?: string };
export type SalePaymentDestination = Exclude<MoneyAccountDestination, "OTHER"> | "DEBT";
export type CreateSaleInput = {
  customerId?: string;
  customerName?: string;
  customerPhone?: string;
  items: CreateSaleLineItemInput[];
  paymentDestination?: SalePaymentDestination;
  walletId?: string;
  bankAccountId?: string;
  amountReceived?: string;
  changeDestination?: Exclude<MoneyAccountDestination, "OTHER">;
  changeWalletId?: string;
  changeBankAccountId?: string;
};
function emptyToNull(value?: string | null) { const trimmed = value?.trim(); return trimmed ? trimmed : null; }
function decimal(value: string | number) { return new Prisma.Decimal(String(value).replace(",", ".")); }
function normalizePhone(phone: string) { const trimmed = phone.trim(); if (!trimmed) return null; const hasPlus = trimmed.startsWith("+"); const digits = trimmed.replace(/\D/g, ""); if (!digits) return null; return hasPlus ? `+${digits}` : digits; }

async function resolveCustomerForSale(tx: Prisma.TransactionClient, shopId: string, input: Pick<CreateSaleInput, "customerId" | "customerName" | "customerPhone">) {
  if (input.customerId) { const selectedCustomer = await tx.customer.findFirst({ where: { id: input.customerId, shopId, deletedAt: null } }); if (!selectedCustomer) throw new Error("العميل المحدد غير موجود أو لا يتبع هذا المتجر."); return selectedCustomer; }
  const customerName = emptyToNull(input.customerName); const customerPhone = emptyToNull(input.customerPhone); if (!customerName && !customerPhone) return null; const phoneNormalized = customerPhone ? normalizePhone(customerPhone) : null;
  if (customerPhone) { const existingCustomer = await tx.customer.findFirst({ where: { shopId, deletedAt: null, OR: [...(phoneNormalized ? [{ phoneNormalized }] : []), { phone: customerPhone }] }, select: { id: true, name: true, phone: true } }); if (existingCustomer) throw new Error(`يوجد عميل مسجل بهذا الرقم باسم «${existingCustomer.name}». اختر «عميل موجود» وابحث عنه بدلاً من إنشاء عميل جديد.`); }
  return tx.customer.create({ data: { shopId, name: customerName ?? customerPhone ?? "عميل", phone: customerPhone, phoneNormalized } });
}

export async function generateReceiptNumber(shopId: string) {
  const now = new Date(); const year = now.getFullYear(); const month = String(now.getMonth() + 1).padStart(2, "0"); const prefix = `SALE-${year}${month}-`; const count = await prisma.sale.count({ where: { shopId, receiptNumber: { startsWith: prefix } } });
  for (let offset = 1; offset <= 50; offset += 1) { const receiptNumber = `${prefix}${String(count + offset).padStart(4, "0")}`; const existing = await prisma.sale.findUnique({ where: { shopId_receiptNumber: { shopId, receiptNumber } }, select: { id: true } }); if (!existing) return receiptNumber; }
  return `${prefix}${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
}

export async function listSales(shopId: string, filters: SaleFilters = {}) {
  const search = filters.search?.trim(); const status = filters.status && filters.status !== "ALL" ? filters.status : undefined;
  return prisma.sale.findMany({ where: { shopId, deletedAt: null, ...(status ? { status } : {}), ...(search ? { OR: [{ receiptNumber: { contains: search, mode: "insensitive" } }, { customer: { is: { OR: [{ name: { contains: search, mode: "insensitive" } }, { phone: { contains: search, mode: "insensitive" } }, { phoneNormalized: { contains: search, mode: "insensitive" } }] } } }] } : {}) }, include: { customer: true, _count: { select: { items: true } } }, orderBy: { soldAt: "desc" }, take: 100 });
}

export async function getSaleById(shopId: string, saleId: string) {
  return prisma.sale.findFirst({ where: { id: saleId, shopId, deletedAt: null }, include: { customer: true, items: { include: { inventoryItem: true }, orderBy: { createdAt: "asc" } }, inventoryMovements: { include: { inventoryItem: true }, orderBy: { createdAt: "desc" } }, invoices: { where: { deletedAt: null, status: { not: InvoiceStatus.VOID } }, orderBy: { issuedAt: "desc" } } } });
}

export async function createSale(shopId: string, createdByUserId: string | null, input: CreateSaleInput) {
  if (input.items.length === 0) throw new Error("يجب إضافة بند واحد على الأقل.");
  const subtotal = input.items.reduce((sum, item) => sum.add(decimal(item.unitPrice).mul(item.quantity)), new Prisma.Decimal(0)); const discountTotal = input.items.reduce((sum, item) => sum.add(decimal(item.discountTotal ?? "0")), new Prisma.Decimal(0)); const taxTotal = new Prisma.Decimal(0); const total = subtotal.sub(discountTotal).add(taxTotal); if (total.lt(0)) throw new Error("إجمالي البيع غير صحيح.");
  const paymentDestination = input.paymentDestination ?? "DRAWER";
  const isDebtSale = paymentDestination === "DEBT";
  const amountReceived = isDebtSale ? new Prisma.Decimal(0) : input.amountReceived?.trim() ? decimal(input.amountReceived) : total;
  if (!isDebtSale && amountReceived.lt(total)) throw new Error("المبلغ المستلم أقل من إجمالي البيع. اختر «دفتر الديون» إذا كان المبلغ سيُدفع لاحقاً.");
  const changeAmount = isDebtSale ? new Prisma.Decimal(0) : amountReceived.sub(total);
  const changeDestination = input.changeDestination ?? "DRAWER";
  if (paymentDestination === "WALLET" && !input.walletId) throw new Error("اختر محفظة استلام المبلغ.");
  if (paymentDestination === "BANK" && !input.bankAccountId) throw new Error("اختر الحساب البنكي الذي استلم المبلغ.");
  if (changeAmount.gt(0) && changeDestination === "WALLET" && !input.changeWalletId) throw new Error("اختر محفظة إرجاع الباقي.");
  if (changeAmount.gt(0) && changeDestination === "BANK" && !input.changeBankAccountId) throw new Error("اختر الحساب البنكي الذي سيُرجع منه الباقي.");
  if (!isDebtSale) await moneyAccountService.prepareMoneyAccounts(shopId, paymentDestination);
  if (changeAmount.gt(0)) await moneyAccountService.prepareMoneyAccounts(shopId, changeDestination);
  const receiptNumber = await generateReceiptNumber(shopId);

  return prisma.$transaction(async (tx) => {
    const customer = await resolveCustomerForSale(tx, shopId, input);
    if (isDebtSale && !customer) throw new Error("ترحيل المبيعة إلى دفتر الديون يتطلب عميلاً مسجلاً.");

    const sale = await tx.sale.create({ data: { shopId, customerId: customer?.id, createdByUserId, receiptNumber, status: SaleStatus.COMPLETED, subtotal, discountTotal, taxTotal, total } });
    for (const itemInput of input.items) {
      const inventoryItemId = emptyToNull(itemInput.inventoryItemId); let description = itemInput.description.trim(); let inventoryItem: Awaited<ReturnType<typeof tx.inventoryItem.findFirst>> | null = null;
      if (inventoryItemId) { inventoryItem = await tx.inventoryItem.findFirst({ where: { id: inventoryItemId, shopId, deletedAt: null } }); if (!inventoryItem) throw new Error("قطعة مخزون غير موجودة أو لا تتبع هذا المتجر."); if (inventoryItem.quantity < itemInput.quantity) throw new Error(`الكمية غير كافية للقطعة: ${inventoryItem.name}`); description = description || inventoryItem.name; }
      if (!description) throw new Error("وصف بند البيع مطلوب.");
      const unitPriceSnapshot = decimal(itemInput.unitPrice);
      if (inventoryItem && !inventoryItem.salePriceConfigured && unitPriceSnapshot.eq(0)) throw new Error(`سعر بيع القطعة «${inventoryItem.name}» غير محدد. أدخل سعر بيع صريحاً قبل إتمام المبيعة.`); const lineDiscount = decimal(itemInput.discountTotal ?? "0"); const lineTotal = unitPriceSnapshot.mul(itemInput.quantity).sub(lineDiscount);
      const saleItem = await tx.saleItem.create({ data: { shopId, saleId: sale.id, inventoryItemId, description, quantity: itemInput.quantity, unitPriceSnapshot, discountTotal: lineDiscount, lineTotal } });
      if (inventoryItem) { const quantityAfter = inventoryItem.quantity - itemInput.quantity; await tx.inventoryItem.update({ where: { id: inventoryItem.id }, data: { quantity: quantityAfter, version: { increment: 1 } } }); await tx.inventoryMovement.create({ data: { shopId, inventoryItemId: inventoryItem.id, saleId: sale.id, saleItemId: saleItem.id, createdByUserId, type: InventoryMovementType.SALE, quantityChange: -itemInput.quantity, quantityAfter, unitCostSnapshot: inventoryItem.unitCost, note: "بيع" } }); }
    }

    const sourceBase = { sourceId: sale.id, sourceReference: sale.receiptNumber, customerId: customer?.id ?? null, customerName: customer?.name ?? null, customerPhone: customer?.phone ?? null };
    if (!isDebtSale) {
      await moneyAccountService.lockMoneyAccountEndpointsTx(tx, shopId, [
        { destination: paymentDestination, walletId: input.walletId, bankAccountId: input.bankAccountId },
        ...(changeAmount.gt(0) ? [{ destination: changeDestination, walletId: input.changeWalletId, bankAccountId: input.changeBankAccountId }] : []),
      ]);
    }
    if (isDebtSale) {
      if (customer && total.gt(0)) {
        await sourceDebtService.createSourceDebtTx(tx, {
          shopId,
          customerId: customer.id,
          createdByUserId,
          amount: total,
          sourceType: "SALE",
          sourceId: sale.id,
          sourceReference: sale.receiptNumber,
          description: `مبيعة آجلة ${sale.receiptNumber}`,
        });
      }
    } else {
      await moneyAccountService.applyIncomingMoneyTx(tx, shopId, createdByUserId, {
        destination: paymentDestination,
        walletId: input.walletId,
        bankAccountId: input.bankAccountId,
        amount: amountReceived,
        reference: sale.receiptNumber,
        description: `تحصيل بيع ${sale.receiptNumber}`,
        drawerType: "SALE_CASH",
        source: { ...sourceBase, sourceType: "SALE" },
      });
      if (changeAmount.gt(0)) await moneyAccountService.applyOutgoingMoneyTx(tx, shopId, createdByUserId, {
        destination: changeDestination,
        walletId: input.changeWalletId,
        bankAccountId: input.changeBankAccountId,
        amount: changeAmount,
        reference: sale.receiptNumber,
        description: `إرجاع باقي للعميل من بيع ${sale.receiptNumber}`,
        source: { ...sourceBase, sourceType: "SALE" },
      });
    }
    return sale;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 10_000 });
}

export async function cancelSale(shopId: string, saleId: string, createdByUserId: string | null) {
  return prisma.$transaction(async (tx) => {
    const sale = await tx.sale.findFirst({ where: { id: saleId, shopId, deletedAt: null }, include: { items: true } }); if (!sale) throw new Error("عملية البيع غير موجودة."); if (sale.status !== SaleStatus.COMPLETED) return sale;
    await sourceDebtService.reverseSourceDebtTx(tx, { shopId, sourceType: "SALE", sourceId: sale.id });
    await moneyAccountService.reverseSourceMoneyTx(tx, shopId, "SALE", sale.id, createdByUserId);
    // Legacy fallback for historical drawer/wallet movements that predate source IDs.
    if (sale.receiptNumber) await moneyAccountService.reverseSaleMoneyTx(tx, shopId, sale.receiptNumber, createdByUserId);
    for (const saleItem of sale.items) { if (!saleItem.inventoryItemId) continue; const inventoryItem = await tx.inventoryItem.findFirst({ where: { id: saleItem.inventoryItemId, shopId, deletedAt: null } }); if (!inventoryItem) throw new Error("لا يمكن إلغاء البيع لأن قطعة مخزون مرتبطة غير موجودة."); const quantityAfter = inventoryItem.quantity + saleItem.quantity; await tx.inventoryItem.update({ where: { id: inventoryItem.id }, data: { quantity: quantityAfter, version: { increment: 1 } } }); await tx.inventoryMovement.create({ data: { shopId, inventoryItemId: inventoryItem.id, saleId: sale.id, saleItemId: saleItem.id, createdByUserId, type: InventoryMovementType.RETURN, quantityChange: saleItem.quantity, quantityAfter, unitCostSnapshot: inventoryItem.unitCost, note: "إلغاء عملية بيع" } }); }
    return tx.sale.update({ where: { id: sale.id }, data: { status: SaleStatus.CANCELLED, version: { increment: 1 } }, include: { items: true } });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 10_000 });
}

export const salesService = { listSales, getSaleById, createSale, cancelSale, generateReceiptNumber };
