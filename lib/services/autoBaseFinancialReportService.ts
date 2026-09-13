import {
  InstallmentPlanSource,
  InstallmentPlanStatus,
  InventoryMovementType,
  InvoiceStatus,
  PaymentMethod,
  Prisma,
  SaleStatus,
} from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { debtReportService } from "@/lib/services/debtReportService";

export type AutoFinancialRange = { start: Date; end: Date };

const paymentMethodLabels: Record<PaymentMethod, string> = {
  CASH: "نقدي",
  CARD: "بطاقة",
  BANK_TRANSFER: "تحويل بنكي",
  OTHER: "أخرى",
};

function decimalNumber(value: Prisma.Decimal | number | string | null | undefined) {
  return value == null ? 0 : Number(value);
}

function money(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function rangeWhere(range: AutoFinancialRange) {
  return { gte: range.start, lt: range.end };
}

/**
 * Automotive-only financial truth.
 *
 * The cloned phone ERP still contains legacy RepairOrder, software-service and
 * electronic-service tables for migration/backward compatibility. None of
 * those modules are part of Massar Auto, so this reader explicitly excludes
 * them instead of relying on UI hiding.
 */
export async function getAutoBaseFinancialReport(shopId: string, range: AutoFinancialRange) {
  const [
    sales,
    invoices,
    manualPlans,
    invoicePayments,
    manualInstallmentPayments,
    saleMovements,
    expenses,
    inventoryItems,
    debtSummary,
    legacySoftwareInvoiceRows,
  ] = await Promise.all([
    prisma.sale.findMany({
      where: { shopId, deletedAt: null, status: SaleStatus.COMPLETED, soldAt: rangeWhere(range) },
      select: {
        id: true,
        total: true,
        subtotal: true,
        discountTotal: true,
        soldAt: true,
        invoices: {
          where: { deletedAt: null, status: { not: InvoiceStatus.VOID } },
          select: { id: true },
          take: 1,
        },
      },
    }),
    prisma.invoice.findMany({
      where: { shopId, deletedAt: null, status: { not: InvoiceStatus.VOID }, issuedAt: rangeWhere(range) },
      select: {
        id: true,
        saleId: true,
        repairOrderId: true,
        serviceOrderId: true,
        total: true,
        subtotal: true,
        discountTotal: true,
        balanceDue: true,
        issuedAt: true,
        type: true,
      },
    }),
    prisma.installmentPlan.findMany({
      where: {
        shopId,
        deletedAt: null,
        source: InstallmentPlanSource.MANUAL,
        status: { not: InstallmentPlanStatus.CANCELLED },
        createdAt: rangeWhere(range),
      },
      select: { id: true, totalAmount: true, balanceDue: true, createdAt: true },
    }),
    prisma.payment.findMany({
      where: {
        shopId,
        deletedAt: null,
        paidAt: rangeWhere(range),
        invoice: { is: { deletedAt: null, status: { not: InvoiceStatus.VOID } } },
      },
      select: {
        amount: true,
        method: true,
        sourceName: true,
        paidAt: true,
        invoice: { select: { id: true } },
      },
    }),
    prisma.installmentPayment.findMany({
      where: {
        shopId,
        voidedAt: null,
        paidAt: rangeWhere(range),
        plan: {
          is: {
            deletedAt: null,
            source: InstallmentPlanSource.MANUAL,
            status: { not: InstallmentPlanStatus.CANCELLED },
          },
        },
      },
      select: { amount: true, method: true, sourceName: true, paidAt: true },
    }),
    prisma.inventoryMovement.findMany({
      where: {
        shopId,
        deletedAt: null,
        createdAt: rangeWhere(range),
        type: { in: [InventoryMovementType.SALE, InventoryMovementType.RETURN] },
      },
      select: {
        type: true,
        quantityChange: true,
        unitCostSnapshot: true,
        sale: { select: { status: true, deletedAt: true } },
      },
    }),
    prisma.expense.findMany({
      where: { shopId, deletedAt: null, spentAt: rangeWhere(range) },
      include: { createdByUser: { select: { name: true } } },
      orderBy: { spentAt: "desc" },
      take: 100,
    }),
    prisma.inventoryItem.findMany({
      where: { shopId, deletedAt: null, quantity: { gt: 0 }, unitCost: { not: null } },
      select: { quantity: true, unitCost: true },
    }),
    debtReportService.getDebtReportSummary(shopId, range.start, range.end).catch(() => ({
      deferredSaleIds: [],
      saleOutstanding: 0,
      electronicServiceOutstanding: 0,
      payments: [],
    })),
    prisma.$queryRaw<Array<{ invoiceId: string }>>`
      SELECT s."invoiceId"
      FROM "SoftwareServiceSale" s
      WHERE s."shopId" = ${shopId}::uuid
        AND s."deletedAt" IS NULL
    `.catch(() => []),
  ]);

  const legacySoftwareInvoiceIds = new Set(legacySoftwareInvoiceRows.map((row) => row.invoiceId));
  const autoInvoices = invoices.filter(
    (invoice) => !invoice.repairOrderId && !legacySoftwareInvoiceIds.has(invoice.id),
  );
  const autoInvoiceIds = new Set(autoInvoices.map((invoice) => invoice.id));
  const autoInvoicePayments = invoicePayments.filter((payment) => autoInvoiceIds.has(payment.invoice.id));

  const salesGross = sales.reduce((sum, sale) => sum + decimalNumber(sale.total), 0);
  const salesNet = sales.reduce(
    (sum, sale) => sum + decimalNumber(sale.subtotal) - decimalNumber(sale.discountTotal),
    0,
  );
  const standaloneInvoices = autoInvoices.filter((invoice) => !invoice.saleId);
  const invoiceGross = standaloneInvoices.reduce((sum, invoice) => sum + decimalNumber(invoice.total), 0);
  const invoiceNet = standaloneInvoices.reduce(
    (sum, invoice) => sum + decimalNumber(invoice.subtotal) - decimalNumber(invoice.discountTotal),
    0,
  );
  const manualPlanGross = manualPlans.reduce((sum, plan) => sum + decimalNumber(plan.totalAmount), 0);

  const grossRevenue = money(salesGross + invoiceGross + manualPlanGross);
  const netRevenueBeforeTax = money(salesNet + invoiceNet + manualPlanGross);
  const invoiceCollected = autoInvoicePayments.reduce((sum, payment) => sum + decimalNumber(payment.amount), 0);
  const manualInstallmentsCollected = manualInstallmentPayments.reduce(
    (sum, payment) => sum + decimalNumber(payment.amount),
    0,
  );
  const deferredSaleIds = new Set(debtSummary.deferredSaleIds);
  const immediateSalesCollected = sales
    .filter((sale) => sale.invoices.length === 0 && !deferredSaleIds.has(sale.id))
    .reduce((sum, sale) => sum + decimalNumber(sale.total), 0);
  const debtCollected = debtSummary.payments.reduce((sum, payment) => sum + payment.amount, 0);
  const collected = money(
    invoiceCollected + manualInstallmentsCollected + immediateSalesCollected + debtCollected,
  );

  const outstanding = money(
    autoInvoices.reduce((sum, invoice) => sum + decimalNumber(invoice.balanceDue), 0) +
      manualPlans.reduce((sum, plan) => sum + decimalNumber(plan.balanceDue), 0) +
      debtSummary.saleOutstanding,
  );

  const saleInventoryCost = saleMovements.reduce((sum, movement) => {
    if (movement.sale?.status !== SaleStatus.COMPLETED || movement.sale.deletedAt) return sum;
    const unitCost = decimalNumber(movement.unitCostSnapshot);
    const quantity = Math.abs(movement.quantityChange);
    const isReturn = movement.type === InventoryMovementType.RETURN;
    return sum + (isReturn ? -1 : 1) * quantity * unitCost;
  }, 0);

  const directCosts = money(Math.max(0, saleInventoryCost));
  const expenseTotal = money(expenses.reduce((sum, expense) => sum + decimalNumber(expense.amount), 0));
  const grossProfit = money(netRevenueBeforeTax - directCosts);
  const netProfit = money(grossProfit - expenseTotal);
  const profitMargin = netRevenueBeforeTax > 0 ? money((netProfit / netRevenueBeforeTax) * 100) : 0;
  const inventoryValue = money(
    inventoryItems.reduce((sum, item) => sum + item.quantity * decimalNumber(item.unitCost), 0),
  );

  const paymentSources = new Map<string, number>();
  for (const payment of [...autoInvoicePayments, ...manualInstallmentPayments]) {
    const label = payment.sourceName?.trim() || paymentMethodLabels[payment.method];
    paymentSources.set(label, (paymentSources.get(label) ?? 0) + decimalNumber(payment.amount));
  }
  if (immediateSalesCollected > 0) {
    paymentSources.set("مبيعات POS مباشرة", (paymentSources.get("مبيعات POS مباشرة") ?? 0) + immediateSalesCollected);
  }
  for (const payment of debtSummary.payments) {
    paymentSources.set(payment.sourceName, (paymentSources.get(payment.sourceName) ?? 0) + payment.amount);
  }

  const vehicleServiceRevenue = autoInvoices
    .filter((invoice) => !invoice.saleId && invoice.serviceOrderId)
    .reduce((sum, invoice) => sum + decimalNumber(invoice.total), 0);
  const independentInvoiceRevenue = autoInvoices
    .filter((invoice) => !invoice.saleId && !invoice.serviceOrderId)
    .reduce((sum, invoice) => sum + decimalNumber(invoice.total), 0);

  const revenueMix = [
    { label: "مبيعات القطع ونقطة البيع", value: money(salesGross) },
    { label: "صيانة المركبات المفوترة", value: money(vehicleServiceRevenue) },
    { label: "فواتير وخطط مستقلة", value: money(independentInvoiceRevenue + manualPlanGross) },
  ];

  return {
    metrics: {
      grossRevenue,
      netRevenueBeforeTax,
      collected,
      outstanding,
      directCosts,
      expenseTotal,
      grossProfit,
      netProfit,
      profitMargin,
      inventoryValue,
      // Compatibility fields kept temporarily while old phone modules remain in the repository.
      // Automotive reports never populate them.
      electronicServiceRevenue: 0,
      electronicServiceCost: 0,
      electronicServiceProfit: 0,
      electronicServiceImmediateCollected: 0,
      electronicServiceDeferred: 0,
      electronicServiceOutstanding: 0,
    },
    counts: {
      sales: sales.length,
      invoices: autoInvoices.length,
      manualPlans: manualPlans.length,
      expenses: expenses.length,
      softwareServices: 0,
      electronicServices: 0,
    },
    revenueMix,
    paymentSources: [...paymentSources.entries()]
      .map(([label, value]) => ({ label, value: money(value) }))
      .sort((a, b) => b.value - a.value),
    expenses,
  };
}

export const autoBaseFinancialReportService = { getFinancialReport: getAutoBaseFinancialReport };
