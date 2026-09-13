import { InvoiceStatus, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

function decimal(value: string | number | Prisma.Decimal) {
  return new Prisma.Decimal(String(value).replace(",", "."));
}

export async function updateInvoiceDiscount(
  shopId: string,
  invoiceId: string,
  discountValue: string,
) {
  const discountTotal = decimal(discountValue || "0");

  if (discountTotal.lt(0)) {
    throw new Error("قيمة الخصم لا يمكن أن تكون سالبة.");
  }

  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`
      SELECT id
      FROM "Invoice"
      WHERE id = ${invoiceId}::uuid
        AND "shopId" = ${shopId}::uuid
      FOR UPDATE
    `;

    const invoice = await tx.invoice.findFirst({
      where: {
        id: invoiceId,
        shopId,
        deletedAt: null,
      },
      include: {
        installmentPlan: {
          select: { id: true },
        },
      },
    });

    if (!invoice) {
      throw new Error("الفاتورة غير موجودة.");
    }

    if (invoice.status === InvoiceStatus.VOID) {
      throw new Error("لا يمكن تعديل الخصم على فاتورة ملغاة.");
    }

    if (invoice.serviceOrderId) {
      throw new Error("لا يمكن تعديل خصم فاتورة صيانة المركبة مباشرةً. عدّل عرض السعر قبل إصدار الفاتورة، أو استخدم إشعاراً دائناً للتصحيح بعد الإصدار.");
    }

    if (invoice.installmentPlan) {
      throw new Error("لا يمكن تعديل الخصم مباشرةً لأن الفاتورة مرتبطة بخطة أقساط.");
    }

    if (discountTotal.gt(invoice.subtotal)) {
      throw new Error("قيمة الخصم لا يمكن أن تتجاوز إجمالي الفاتورة قبل الخصم.");
    }

    const newTotal = invoice.subtotal.sub(discountTotal).add(invoice.taxTotal);

    if (newTotal.lt(invoice.amountPaid)) {
      throw new Error("هذا الخصم يجعل إجمالي الفاتورة أقل من المبلغ المدفوع مسبقاً.");
    }

    const newBalanceDue = newTotal.sub(invoice.amountPaid);
    let status: InvoiceStatus = InvoiceStatus.UNPAID;
    let paidAt: Date | null = null;

    if (newBalanceDue.lte(0)) {
      status = InvoiceStatus.PAID;
      paidAt = invoice.paidAt ?? new Date();
    } else if (invoice.amountPaid.gt(0)) {
      status = InvoiceStatus.PARTIALLY_PAID;
    }

    return tx.invoice.update({
      where: { id: invoice.id },
      data: {
        discountTotal,
        total: newTotal,
        balanceDue: newBalanceDue,
        status,
        paidAt,
        version: { increment: 1 },
      },
    });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 10_000 });
}

export const invoiceDiscountService = {
  updateInvoiceDiscount,
};
