import { randomBytes } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { assertBusinessDateOpenTx } from "@/lib/services/businessDateLockService";

export type AutoServiceInvoiceSummary = {
  id: string;
  invoiceNumber: string;
  status: string;
  subtotal: number;
  discountTotal: number;
  taxTotal: number;
  total: number;
  amountPaid: number;
  balanceDue: number;
  issuedAt: Date;
};

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function generateAutoInvoiceNumber() {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  return `INV-A-${date}-${randomBytes(4).toString("hex").toUpperCase()}`;
}

type InvoiceReader = Pick<Prisma.TransactionClient, "invoice">;

async function findActiveInvoiceTx(
  tx: InvoiceReader,
  shopId: string,
  serviceOrderId: string,
): Promise<AutoServiceInvoiceSummary | null> {
  const row = await tx.invoice.findFirst({
    where: {
      shopId,
      serviceOrderId,
      deletedAt: null,
      status: { not: "VOID" },
    },
    orderBy: { issuedAt: "desc" },
    select: {
      id: true,
      invoiceNumber: true,
      status: true,
      subtotal: true,
      discountTotal: true,
      taxTotal: true,
      total: true,
      amountPaid: true,
      balanceDue: true,
      issuedAt: true,
    },
  });

  if (!row) return null;
  return {
    id: row.id,
    invoiceNumber: row.invoiceNumber,
    status: row.status,
    subtotal: Number(row.subtotal),
    discountTotal: Number(row.discountTotal),
    taxTotal: Number(row.taxTotal),
    total: Number(row.total),
    amountPaid: Number(row.amountPaid),
    balanceDue: Number(row.balanceDue),
    issuedAt: row.issuedAt,
  };
}

export async function getServiceOrderInvoice(shopId: string, serviceOrderId: string) {
  return findActiveInvoiceTx(prisma, shopId, serviceOrderId);
}

export async function createInvoiceFromServiceOrder(
  shopId: string,
  serviceOrderId: string,
  createdByUserId: string,
) {
  return prisma.$transaction(async (tx) => {
    const orders = await tx.$queryRaw<Array<{
      id: string;
      customerId: string;
      status: string;
      orderNumber: string;
    }>>`
      SELECT "id", "customerId", "status", "orderNumber"
      FROM "ServiceOrder"
      WHERE "id" = ${serviceOrderId}::uuid
        AND "shopId" = ${shopId}::uuid
        AND "deletedAt" IS NULL
      FOR UPDATE
    `;
    const order = orders[0];
    if (!order) throw new Error("أمر الصيانة غير موجود.");
    if (!["READY_FOR_DELIVERY", "DELIVERED", "CLOSED"].includes(order.status)) {
      throw new Error("يمكن إصدار فاتورة الصيانة بعد اكتمال العمل ووصول الأمر إلى جاهزة للتسليم.");
    }

    const existing = await findActiveInvoiceTx(tx, shopId, serviceOrderId);
    if (existing) return existing;

    const warrantyLinks = await tx.$queryRaw<Array<{
      claimNumber: string;
      coverageDecision: string;
      customerCharge: number;
    }>>`
      SELECT "claimNumber",
             "coverageDecision"::text AS "coverageDecision",
             "customerCharge"::double precision AS "customerCharge"
      FROM "ServiceWarrantyClaim"
      WHERE "shopId" = ${shopId}::uuid
        AND "followUpServiceOrderId" = ${serviceOrderId}::uuid
      LIMIT 1
      FOR SHARE
    `;
    const warrantyClaim = warrantyLinks[0] ?? null;
    const fullyCoveredWarranty = warrantyClaim?.coverageDecision === "COVERED";
    const partialWarranty = warrantyClaim?.coverageDecision === "PARTIAL";

    await assertBusinessDateOpenTx(tx, shopId, new Date());

    const totals = await tx.$queryRaw<Array<{ subtotal: number }>>`
      SELECT COALESCE(SUM(x."lineTotal"), 0)::double precision AS "subtotal"
      FROM (
        SELECT "lineTotal"
        FROM "ServiceLaborLine"
        WHERE "shopId" = ${shopId}::uuid
          AND "serviceOrderId" = ${serviceOrderId}::uuid
          AND "status" <> 'CANCELLED'
        UNION ALL
        SELECT "lineTotal"
        FROM "ServicePartLine"
        WHERE "shopId" = ${shopId}::uuid
          AND "serviceOrderId" = ${serviceOrderId}::uuid
          AND "status" NOT IN ('CANCELLED','RETURNED')
      ) x
    `;
    const subtotal = roundMoney(Number(totals[0]?.subtotal ?? 0));
    if (subtotal < 0) throw new Error("قيمة أعمال وقطع أمر الصيانة غير صالحة للفوترة.");
    if (subtotal === 0 && !fullyCoveredWarranty) {
      throw new Error("لا يمكن إصدار فاتورة صيانة بدون أجور عمل أو قطع بقيمة أكبر من صفر.");
    }

    const quotes = await tx.$queryRaw<Array<{
      id: string;
      status: string;
      subtotal: number;
      discountTotal: number;
      taxTotal: number;
      approvedSubtotal: number;
    }>>`
      SELECT q."id", q."status",
             q."subtotal"::double precision AS "subtotal",
             q."discountTotal"::double precision AS "discountTotal",
             q."taxTotal"::double precision AS "taxTotal",
             COALESCE(SUM(CASE WHEN ql."approvalStatus" = 'APPROVED' THEN ql."lineTotal" ELSE 0 END), 0)::double precision AS "approvedSubtotal"
      FROM "Quotation" q
      LEFT JOIN "QuotationLine" ql
        ON ql."quotationId" = q."id" AND ql."shopId" = q."shopId"
      WHERE q."shopId" = ${shopId}::uuid
        AND q."serviceOrderId" = ${serviceOrderId}::uuid
        AND q."status" IN ('APPROVED', 'PARTIALLY_APPROVED')
      GROUP BY q."id", q."status", q."subtotal", q."discountTotal", q."taxTotal", q."revision", q."createdAt"
      ORDER BY q."revision" DESC, q."createdAt" DESC
      LIMIT 1
    `;

    const quote = quotes[0];
    let discountTotal = 0;
    let taxTotal = 0;
    if (quote) {
      const ratio = quote.status === "APPROVED"
        ? 1
        : quote.subtotal > 0
          ? Math.min(1, Math.max(0, quote.approvedSubtotal / quote.subtotal))
          : 0;
      discountTotal = roundMoney(Number(quote.discountTotal || 0) * ratio);
      taxTotal = roundMoney(Number(quote.taxTotal || 0) * ratio);
    }

    discountTotal = Math.min(discountTotal, subtotal);
    const commercialDiscountTotal = discountTotal;
    const commercialTaxTotal = taxTotal;
    const commercialTotal = roundMoney(Math.max(0, subtotal - commercialDiscountTotal + commercialTaxTotal));

    if (fullyCoveredWarranty) {
      // Keep the real commercial value in subtotal, while warranty coverage removes the entire customer receivable.
      discountTotal = subtotal;
      taxTotal = 0;
    } else if (partialWarranty) {
      // customerCharge is the exact final amount payable by the customer, inclusive of tax.
      // The current quotation model stores an absolute tax amount (not a tax rate), so allocate tax proportionally
      // from the commercial total and express the workshop-covered portion through the invoice discount bucket.
      const customerCharge = roundMoney(Number(warrantyClaim?.customerCharge ?? 0));
      if (customerCharge <= 0) {
        throw new Error("التغطية الجزئية تتطلب مبلغاً نهائياً أكبر من صفر على العميل.");
      }
      if (commercialTotal <= 0) {
        throw new Error("لا يمكن تطبيق تغطية جزئية على قيمة تجارية صفرية.");
      }
      if (customerCharge > commercialTotal) {
        throw new Error(`مبلغ العميل في المطالبة ${warrantyClaim?.claimNumber ?? ""} يتجاوز القيمة التجارية المستحقة.`);
      }

      const proportionalTax = commercialTaxTotal > 0
        ? roundMoney((customerCharge * commercialTaxTotal) / commercialTotal)
        : 0;
      const customerNet = roundMoney(customerCharge - proportionalTax);
      discountTotal = roundMoney(subtotal - customerNet);
      if (discountTotal < 0 || discountTotal > subtotal) {
        throw new Error("تعذر توزيع التغطية الجزئية على الفاتورة بشكل محاسبي صحيح.");
      }
      // Recalculate the tax remainder from the exact gross customer charge so rounding can never change the agreed total.
      taxTotal = roundMoney(customerCharge - (subtotal - discountTotal));
      if (taxTotal < 0) {
        throw new Error("تعذر حساب ضريبة التغطية الجزئية بشكل صحيح.");
      }
    }

    const total = roundMoney(Math.max(0, subtotal - discountTotal + taxTotal));
    if (partialWarranty) {
      const customerCharge = roundMoney(Number(warrantyClaim?.customerCharge ?? 0));
      if (total !== customerCharge) {
        throw new Error("إجمالي فاتورة التغطية الجزئية لا يطابق المبلغ النهائي المتفق عليه مع العميل.");
      }
    }
    if (total < 0 || (!fullyCoveredWarranty && total <= 0)) {
      throw new Error("إجمالي فاتورة الصيانة يجب أن يكون أكبر من صفر.");
    }

    const invoiceNumber = generateAutoInvoiceNumber();
    const invoiceRows = await tx.$queryRaw<AutoServiceInvoiceSummary[]>`
      INSERT INTO "Invoice" (
        "id", "shopId", "customerId", "serviceOrderId", "createdByUserId",
        "invoiceNumber", "type", "status", "subtotal", "discountTotal", "taxTotal",
        "total", "amountPaid", "balanceDue", "paidAt", "issuedAt", "createdAt", "updatedAt", "version"
      ) VALUES (
        gen_random_uuid(), ${shopId}::uuid, ${order.customerId}::uuid, ${serviceOrderId}::uuid, ${createdByUserId}::uuid,
        ${invoiceNumber}, 'REPAIR'::"InvoiceType",
        CASE WHEN ${fullyCoveredWarranty} THEN 'PAID'::"InvoiceStatus" ELSE 'UNPAID'::"InvoiceStatus" END,
        ${subtotal}, ${discountTotal}, ${taxTotal},
        ${total}, 0, ${total}, CASE WHEN ${fullyCoveredWarranty} THEN now() ELSE NULL END, now(), now(), now(), 1
      )
      RETURNING "id", "invoiceNumber", "status"::text AS "status",
                "subtotal"::double precision AS "subtotal",
                "discountTotal"::double precision AS "discountTotal",
                "taxTotal"::double precision AS "taxTotal",
                "total"::double precision AS "total",
                "amountPaid"::double precision AS "amountPaid",
                "balanceDue"::double precision AS "balanceDue",
                "issuedAt"
    `;

    await tx.$executeRaw`
      UPDATE "ServiceOrder"
      SET "finalTotal" = ${total},
          "updatedByUserId" = ${createdByUserId}::uuid,
          "updatedAt" = now(),
          "version" = "version" + 1
      WHERE "id" = ${serviceOrderId}::uuid
        AND "shopId" = ${shopId}::uuid
    `;

    return invoiceRows[0];
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 10_000 });
}

export async function assertServiceOrderHasActiveInvoice(shopId: string, serviceOrderId: string) {
  const invoice = await getServiceOrderInvoice(shopId, serviceOrderId);
  if (!invoice) {
    throw new Error("لا يمكن تسليم المركبة قبل إصدار فاتورة الصيانة. يمكن ترك الفاتورة غير مدفوعة إذا كانت على الذمة.");
  }
  return invoice;
}

export const autoInvoiceService = {
  getServiceOrderInvoice,
  createInvoiceFromServiceOrder,
  assertServiceOrderHasActiveInvoice,
};
