import { prisma } from "@/lib/prisma";
import { reportService, type FinancialRange } from "@/lib/services/reportService";
import { autoServiceReportCostService } from "@/lib/services/autoServiceReportCostService";

function money(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export async function getAutoFinancialReport(shopId: string, range: FinancialRange) {
  const [base, autoServiceCost, creditRows] = await Promise.all([
    reportService.getFinancialReport(shopId, range),
    autoServiceReportCostService.getAutoServiceInventoryCostForInvoiceRange(shopId, range.start, range.end),
    prisma.$queryRaw<Array<{
      creditGross: number;
      creditNet: number;
      creditTax: number;
      refunds: number;
    }>>`
      SELECT
        COALESCE((
          SELECT SUM(cn."amount")
          FROM "InvoiceCreditNote" cn
          WHERE cn."shopId"=${shopId}::uuid
            AND cn."issuedAt">=${range.start}
            AND cn."issuedAt"<${range.end}
        ),0)::double precision AS "creditGross",
        COALESCE((
          SELECT SUM(cn."netAmount")
          FROM "InvoiceCreditNote" cn
          WHERE cn."shopId"=${shopId}::uuid
            AND cn."issuedAt">=${range.start}
            AND cn."issuedAt"<${range.end}
        ),0)::double precision AS "creditNet",
        COALESCE((
          SELECT SUM(cn."taxAmount")
          FROM "InvoiceCreditNote" cn
          WHERE cn."shopId"=${shopId}::uuid
            AND cn."issuedAt">=${range.start}
            AND cn."issuedAt"<${range.end}
        ),0)::double precision AS "creditTax",
        COALESCE((
          SELECT SUM(r."amount")
          FROM "InvoiceCreditRefund" r
          WHERE r."shopId"=${shopId}::uuid
            AND r."refundedAt">=${range.start}
            AND r."refundedAt"<${range.end}
        ),0)::double precision AS "refunds"
    `,
  ]);

  const credit = creditRows[0] ?? { creditGross: 0, creditNet: 0, creditTax: 0, refunds: 0 };
  const invoiceCreditGross = money(Number(credit.creditGross));
  const invoiceCreditNet = money(Number(credit.creditNet));
  const invoiceCreditTax = money(Number(credit.creditTax));
  const invoiceCreditRefunds = money(Number(credit.refunds));

  const autoServiceInventoryCost = money(Number(autoServiceCost.netCost));
  const autoServiceManualPartCost = money(Number(autoServiceCost.manualPartCost));
  const autoServiceLaborCost = money(Number(autoServiceCost.laborCost));
  const autoServiceDirectCost = money(Number(autoServiceCost.totalCost));
  const grossRevenue = money(base.metrics.grossRevenue - invoiceCreditGross);
  const netRevenueBeforeTax = money(base.metrics.netRevenueBeforeTax - invoiceCreditNet);
  const collected = money(base.metrics.collected - invoiceCreditRefunds);
  const directCosts = money(Math.max(0, base.metrics.directCosts + autoServiceDirectCost));
  const grossProfit = money(netRevenueBeforeTax - directCosts);
  const netProfit = money(grossProfit - base.metrics.expenseTotal);
  const profitMargin = netRevenueBeforeTax > 0
    ? money((netProfit / netRevenueBeforeTax) * 100)
    : 0;

  return {
    ...base,
    metrics: {
      ...base.metrics,
      grossRevenue,
      netRevenueBeforeTax,
      collected,
      directCosts,
      grossProfit,
      netProfit,
      profitMargin,
      invoiceCreditGross,
      invoiceCreditNet,
      invoiceCreditTax,
      invoiceCreditRefunds,
      autoServiceDirectCost,
      autoServiceInventoryCost,
      autoServiceInventoryUsedCost: money(Number(autoServiceCost.usedCost)),
      autoServiceInventoryReturnedCost: money(Number(autoServiceCost.returnedCost)),
      autoServiceManualPartCost,
      autoServiceLaborCost,
    },
  };
}

export const autoFinancialReportService = { getFinancialReport: getAutoFinancialReport };
