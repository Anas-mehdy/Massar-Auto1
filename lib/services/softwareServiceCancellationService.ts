import { InvoiceStatus, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { moneyAccountService } from "@/lib/services/moneyAccountService";
import { softwareServiceService } from "@/lib/services/softwareServiceService";
import { sourceDebtService } from "@/lib/services/sourceDebtService";

export async function cancelSoftwareServiceSale(
  shopId: string,
  saleId: string,
  cancelledByUserId: string | null,
) {
  // Ensure runtime-managed cash drawer and wallet tables exist before a possible money reversal.
  await moneyAccountService.prepareMoneyAccounts(shopId, "DRAWER");
  await moneyAccountService.prepareMoneyAccounts(shopId, "WALLET");
  await moneyAccountService.prepareMoneyAccounts(shopId, "BANK");

  const existing = await softwareServiceService.getSaleById(shopId, saleId);
  if (!existing) throw new Error("خدمة السوفتوير غير موجودة أو تم إلغاؤها مسبقاً.");

  return prisma.$transaction(async (tx) => {
    const lockedSales = await tx.$queryRaw<Array<{ id: string; invoiceId: string; deletedAt: Date | null }>>`
      SELECT "id", "invoiceId", "deletedAt"
      FROM "SoftwareServiceSale"
      WHERE "id" = ${saleId}::uuid AND "shopId" = ${shopId}::uuid
      FOR UPDATE
    `;
    const sale = lockedSales[0];
    if (!sale || sale.deletedAt) throw new Error("خدمة السوفتوير غير موجودة أو تم إلغاؤها مسبقاً.");

    await tx.$queryRaw`
      SELECT "id"
      FROM "Invoice"
      WHERE "id" = ${sale.invoiceId}::uuid AND "shopId" = ${shopId}::uuid
      FOR UPDATE
    `;

    const invoice = await tx.invoice.findFirst({
      where: { id: sale.invoiceId, shopId, deletedAt: null },
      include: {
        payments: { where: { deletedAt: null }, select: { id: true } },
        installmentPlan: { select: { id: true } },
      },
    });
    if (!invoice) throw new Error("الفاتورة المرتبطة بالخدمة غير موجودة.");
    if (invoice.installmentPlan) {
      throw new Error("لا يمكن إلغاء خدمة مرتبطة بخطة أقساط. عالج أو ألغِ خطة الأقساط أولاً.");
    }

    // If this service was deferred to the debt ledger, reverse that exact debt entry.
    // If any part of the linked debt was already collected, reverseSourceDebtTx blocks cancellation.
    await sourceDebtService.reverseSourceDebtTx(tx, {
      shopId,
      sourceType: "SOFTWARE_SERVICE",
      sourceId: sale.id,
    });

    const now = new Date();
    if (invoice.status !== InvoiceStatus.VOID) {
      await moneyAccountService.reverseSourceMoneyTx(tx, shopId, "INVOICE", invoice.id, cancelledByUserId);
      // Legacy fallback: rows written before source IDs were consistently stored.
      await moneyAccountService.reverseInvoiceMoneyTx(tx, shopId, invoice.invoiceNumber, cancelledByUserId);
      if (invoice.payments.length > 0) {
        await tx.payment.updateMany({
          where: { shopId, invoiceId: invoice.id, deletedAt: null },
          data: { deletedAt: now },
        });
      }
      await tx.invoice.update({
        where: { id: invoice.id },
        data: {
          status: InvoiceStatus.VOID,
          amountPaid: new Prisma.Decimal(0),
          balanceDue: invoice.total,
          paidAt: null,
          version: { increment: 1 },
        },
      });
    }

    await tx.$executeRaw`
      UPDATE "SoftwareServiceSale"
      SET "deletedAt" = ${now}, "updatedAt" = ${now}
      WHERE "id" = ${sale.id}::uuid AND "shopId" = ${shopId}::uuid
    `;

    return { id: sale.id, invoiceId: invoice.id };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 15_000 });
}

export const softwareServiceCancellationService = { cancelSoftwareServiceSale };
