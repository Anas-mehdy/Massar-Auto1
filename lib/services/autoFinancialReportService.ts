import { reportService, type FinancialRange } from "@/lib/services/reportService";
import { autoServiceReportCostService } from "@/lib/services/autoServiceReportCostService";

function money(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export async function getAutoFinancialReport(shopId: string, range: FinancialRange) {
  const [base, autoServiceInventory] = await Promise.all([
    reportService.getFinancialReport(shopId, range),
    autoServiceReportCostService.getAutoServiceInventoryCostForInvoiceRange(shopId, range.start, range.end),
  ]);

  const autoServiceInventoryCost = money(Number(autoServiceInventory.netCost));
  const directCosts = money(Math.max(0, base.metrics.directCosts + autoServiceInventoryCost));
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
      autoServiceInventoryCost,
      autoServiceInventoryUsedCost: money(Number(autoServiceInventory.usedCost)),
      autoServiceInventoryReturnedCost: money(Number(autoServiceInventory.returnedCost)),
    },
  };
}

export const autoFinancialReportService = { getFinancialReport: getAutoFinancialReport };
