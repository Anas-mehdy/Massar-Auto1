import { reportService, type FinancialRange } from "@/lib/services/reportService";
import { autoServiceReportCostService } from "@/lib/services/autoServiceReportCostService";

function money(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export async function getAutoFinancialReport(shopId: string, range: FinancialRange) {
  const [base, autoServiceCost] = await Promise.all([
    reportService.getFinancialReport(shopId, range),
    autoServiceReportCostService.getAutoServiceInventoryCostForInvoiceRange(shopId, range.start, range.end),
  ]);

  const autoServiceInventoryCost = money(Number(autoServiceCost.netCost));
  const autoServiceManualPartCost = money(Number(autoServiceCost.manualPartCost));
  const autoServiceLaborCost = money(Number(autoServiceCost.laborCost));
  const autoServiceDirectCost = money(Number(autoServiceCost.totalCost));
  const directCosts = money(Math.max(0, base.metrics.directCosts + autoServiceDirectCost));
  const grossProfit = money(base.metrics.netRevenueBeforeTax - directCosts);
  const netProfit = money(grossProfit - base.metrics.expenseTotal);
  const profitMargin = base.metrics.netRevenueBeforeTax > 0
    ? money((netProfit / base.metrics.netRevenueBeforeTax) * 100)
    : 0;

  return {
    ...base,
    metrics: {
      ...base.metrics,
      directCosts,
      grossProfit,
      netProfit,
      profitMargin,
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
