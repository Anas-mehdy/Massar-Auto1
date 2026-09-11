import { InvoiceStatus, InvoiceType, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { moneyAccountService } from "@/lib/services/moneyAccountService";

export type InvoiceFilters = { search?: string; status?: InvoiceStatus | "ALL"; type?: InvoiceType | "ALL" };
function decimal(value: Prisma.Decimal | number | string) { return new Prisma.Decimal(String(value).replace(",", ".")); }

export async function generateInvoiceNumber(shopId: string) {
  const now = new Date(); const year = now.getFullYear(); const month = String(now.getMonth() + 1).padStart(2, "0"); const prefix = `INV-${year}${month}-`;
  const count = await prisma.invoice.count({ where: { shopId, invoiceNumber: { startsWith: prefix } } });
  for (let offset = 1; offset <= 50; offset += 1) {
    const invoiceNumber = `${prefix}${String(count + offset).padStart(4, "0")}`;
    const existing = await prisma.invoice.findUnique({ where: { shopId_invoiceNumber: { shopId, invoiceNumber } }, select: { id: true } });
    if (!existing) return invoiceNumber;
  }
  return `${prefix}${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
}

export async function listInvoices(shopId: string, filters: InvoiceFilters = {}) {
  const search = filters.search?.trim(); const status = filters.status && filters.status !== "ALL" ? filters.status : undefined; const type = filters.type && filters.type !== "ALL" ? filters.type : undefined;
  return prisma.invoice.findMany({ where: { shopId, deletedAt: null, ...(status ? { status } : {}), ...(type ? { type } : {}), ...(search ? { OR: [{ invoiceNumber: { contains: search, mode: "insensitive" } }, { customer: { is: { OR: [{ name: { contains: search, mode: "insensitive" } }, { phone: { contains: search, mode: "insensitive" } }, { phoneNormalized: { contains: search, mode: "insensitive" } }] } } }] } : {}) }, include: { customer: true }, orderBy: { issuedAt: "desc" }, take: 100 });
}

export async function getInvoiceById(shopId: string, invoiceId: string) {
  return prisma.invoice.findFirst({ where: { id: invoiceId, shopId, deletedAt: null }, include: { customer: true, repairOrder: true, sale: true, payments: { where: { deletedAt: null }, orderBy: { paidAt: "desc" } }, installmentPlan: { select: { id: true, planNumber: true, status: true } } } });
}

export async function createInvoiceFromRepairOrder(shopId: string, repairOrderId: string, createdByUserId: string | null) {
  const existingInvoice = await prisma.invoice.findFirst({ where: { shopId, repairOrderId, deletedAt: null, status: { not: InvoiceStatus.VOID } } });
  if (existingInvoice) return existingInvoice;
  const repairOrder = await prisma.repairOrder.findFirst({ where: { id: repairOrderId, shopId, deletedAt: null } });
  if (!repairOrder) throw new Error("طلب الصيانة غير موجود.");
  const total = repairOrder.finalTotal ?? repairOrder.estimatedTotal;
  if (!total || decimal(total).lte(0)) throw new Error("لا يمكن إنشاء فاتورة بدون مبلغ أكبر من صفر.");
  const invoiceNumber = await generateInvoiceNumber(shopId);
  return prisma.invoice.create({ data: { shopId, customerId: repairOrder.customerId, repairOrderId: repairOrder.id, createdByUserId, invoiceNumber, type: InvoiceType.REPAIR, status: InvoiceStatus.UNPAID, subtotal: total, discountTotal: new Prisma.Decimal(0), taxTotal: new Prisma.Decimal(0), total, amountPaid: new Prisma.Decimal(0), balanceDue: total } });
}

export async function createInvoiceFromSale(shopId: string, saleId: string, createdByUserId: string | null) {
  const existingInvoice = await prisma.invoice.findFirst({ where: { shopId, saleId, deletedAt: null, status: { not: InvoiceStatus.VOID } } });
  if (existingInvoice) return existingInvoice;
  const sale = await prisma.sale.findFirst({ where: { id: saleId, shopId, deletedAt: null } });
  if (!sale) throw new Error("عملية البيع غير موجودة.");
  const invoiceNumber = await generateInvoiceNumber(shopId);
  return prisma.invoice.create({ data: { shopId, customerId: sale.customerId, saleId: sale.id, createdByUserId, invoiceNumber, type: InvoiceType.SALE, status: InvoiceStatus.UNPAID, subtotal: sale.subtotal, discountTotal: sale.discountTotal, taxTotal: sale.taxTotal, total: sale.total, amountPaid: new Prisma.Decimal(0), balanceDue: sale.total } });
}

export async function voidInvoice(shopId: string, invoiceId: string, createdByUserId: string | null) {
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Invoice" WHERE id = ${invoiceId}::uuid AND "shopId" = ${shopId}::uuid FOR UPDATE`;
    const invoice = await tx.invoice.findFirst({ where: { id: invoiceId, shopId, deletedAt: null }, include: { payments: { where: { deletedAt: null }, select: { id: true } }, installmentPlan: { select: { id: true } } } });
    if (!invoice) throw new Error("الفاتورة غير موجودة.");
    if (invoice.status === InvoiceStatus.VOID) return invoice;
    if (invoice.installmentPlan) throw new Error("لا يمكن إلغاء هذه الفاتورة من هنا لأنها مرتبطة بخطة أقساط. قم بإلغاء أو معالجة خطة الأقساط أولاً.");

    const autoLinks = await tx.$queryRaw<Array<{ serviceOrderId: string; status: string }>>`
      SELECT so."id" AS "serviceOrderId", so."status"::text AS "status"
      FROM "Invoice" inv
      JOIN "ServiceOrder" so
        ON so."id" = inv."serviceOrderId"
       AND so."shopId" = inv."shopId"
       AND so."deletedAt" IS NULL
      WHERE inv."id" = ${invoiceId}::uuid
        AND inv."shopId" = ${shopId}::uuid
        AND inv."serviceOrderId" IS NOT NULL
      LIMIT 1
    `;
    const autoLink = autoLinks[0] ?? null;
    if (autoLink && ["DELIVERED", "CLOSED"].includes(autoLink.status)) {
      throw new Error("لا يمكن إلغاء فاتورة مركبة بعد تسليمها. استخدم مسار تصحيح/إشعار دائن عند توفره للحفاظ على السجل المالي والتسليم.");
    }

    await moneyAccountService.reverseSourceMoneyTx(tx, shopId, "INVOICE", invoice.id, createdByUserId);
    // Legacy fallback for drawer/wallet movements created before source IDs were persisted.
    await moneyAccountService.reverseInvoiceMoneyTx(tx, shopId, invoice.invoiceNumber, createdByUserId);
    const now = new Date();
    if (invoice.payments.length > 0) await tx.payment.updateMany({ where: { shopId, invoiceId, deletedAt: null }, data: { deletedAt: now } });
    const voided = await tx.invoice.update({ where: { id: invoiceId }, data: { status: InvoiceStatus.VOID, amountPaid: new Prisma.Decimal(0), balanceDue: invoice.total, paidAt: null, version: { increment: 1 } } });

    if (autoLink) {
      await tx.$executeRaw`
        UPDATE "ServiceOrder"
        SET "finalTotal" = NULL,
            "updatedByUserId" = COALESCE(${createdByUserId}::uuid, "updatedByUserId"),
            "updatedAt" = now(),
            "version" = "version" + 1
        WHERE "id" = ${autoLink.serviceOrderId}::uuid
          AND "shopId" = ${shopId}::uuid
          AND "status" NOT IN ('DELIVERED', 'CLOSED')
      `;
    }

    return voided;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 10_000 });
}

export const invoiceService = { listInvoices, getInvoiceById, createInvoiceFromRepairOrder, createInvoiceFromSale, voidInvoice, generateInvoiceNumber };
