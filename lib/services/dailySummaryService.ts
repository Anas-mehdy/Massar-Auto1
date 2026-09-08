import { InvoiceStatus, Prisma } from "@prisma/client";
import { parseSourceDebtReference } from "@/lib/debt-source-reference";
import { prisma } from "@/lib/prisma";
import { getInventoryDamageReportSummary } from "@/lib/services/inventoryDamageReportService";
import { reportService } from "@/lib/services/reportService";
import { softwareServiceService } from "@/lib/services/softwareServiceService";
import { getTransferCommissionReportSummary } from "@/lib/services/transferCommissionReportService";
import { getShopTimeZone } from "@/lib/shop-timezone";
import { dayUtcBoundsForTimeZone } from "@/lib/timezone";

const money = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;
const num = (value: Prisma.Decimal | number | string | bigint | null | undefined) => Number(value ?? 0);
const isRecharge = (value: string) => /شحن|رصيد|باقة/i.test(value.replace(/\s+/g, " ").trim());

type Channel = { key: string; label: string; revenue: number; cost: number; profit: number; count: number; href: string; volumeOnly?: boolean };
type Liquidity = { id: string; label: string; balance: number; href: string; kind: "DRAWER" | "WALLET" | "PROVIDER" };
type DebtRow = { customerId: string; type: "DEBT" | "PAYMENT" | "OPENING_BALANCE" | "ADJUSTMENT_DEBIT" | "ADJUSTMENT_CREDIT"; amount: Prisma.Decimal; reference: string | null; isReversed: boolean };
type ElectronicRow = { category: string; revenue: Prisma.Decimal; cost: Prisma.Decimal; profit: Prisma.Decimal; count: bigint };

async function financialCore(shopId: string) {
  const timeZone = await getShopTimeZone(shopId);
  const range = dayUtcBoundsForTimeZone(new Date(), timeZone);
  const [report, transfer] = await Promise.all([
    reportService.getFinancialReport(shopId, range),
    getTransferCommissionReportSummary(shopId, range.start, range.end).catch(() => ({ totalProfit: 0, operationCount: 0 })),
  ]);
  return { timeZone, range, report, transfer, totals: {
    sales: report.metrics.grossRevenue,
    costs: report.metrics.directCosts,
    collected: report.metrics.collected,
    outstandingFromToday: report.metrics.outstanding,
    grossProfit: money(report.metrics.grossProfit + transfer.totalProfit),
    expenses: report.metrics.expenseTotal,
    netProfit: money(report.metrics.netProfit + transfer.totalProfit),
    transferCommissionProfit: money(transfer.totalProfit),
  }};
}

async function debtSnapshot(shopId: string) {
  const rows = await prisma.$queryRaw<DebtRow[]>`
    SELECT "customerId","type","amount","reference","isReversed" FROM "DebtLedgerEntry"
    WHERE "shopId"=${shopId}::uuid ORDER BY "customerId","occurredAt","createdAt","id"`;
  const queues = new Map<string, Array<{ amount: Prisma.Decimal; external: boolean }>>();
  for (const row of rows) {
    if (row.isReversed) continue;
    const queue = queues.get(row.customerId) ?? [];
    if (!queues.has(row.customerId)) queues.set(row.customerId, queue);
    if (["DEBT","OPENING_BALANCE","ADJUSTMENT_DEBIT"].includes(row.type)) {
      queue.push({ amount: new Prisma.Decimal(row.amount), external: row.type !== "DEBT" || !parseSourceDebtReference(row.reference) });
      continue;
    }
    let credit = new Prisma.Decimal(row.amount);
    for (const debt of queue) {
      if (credit.lte(0)) break;
      if (debt.amount.lte(0)) continue;
      const applied = Prisma.Decimal.min(debt.amount, credit);
      debt.amount = debt.amount.sub(applied); credit = credit.sub(applied);
    }
  }
  let total = 0, external = 0;
  for (const queue of queues.values()) for (const debt of queue) if (debt.amount.gt(0)) { total += num(debt.amount); if (debt.external) external += num(debt.amount); }
  return { totalOutstanding: money(total), externalOutstanding: money(external) };
}

async function supplierSnapshot(shopId: string) {
  const rows = await prisma.$queryRaw<Array<{ manual: Prisma.Decimal; purchases: Prisma.Decimal; credit: Prisma.Decimal }>>`
    SELECT
      COALESCE((SELECT SUM(GREATEST(balance,0)) FROM (SELECT "supplierId",SUM(CASE WHEN "status"<>'ACTIVE' THEN 0 WHEN "type" IN ('OPENING_BALANCE','ADJUSTMENT_DEBIT') THEN "amount" WHEN "type"='PAYMENT' THEN -"manualAppliedAmount" WHEN "type"='ADJUSTMENT_CREDIT' THEN -"amount" ELSE 0 END) balance FROM "SupplierLedgerEntry" WHERE "shopId"=${shopId}::uuid GROUP BY "supplierId") x),0) manual,
      COALESCE((SELECT SUM("balanceDue") FROM "PurchaseInvoice" WHERE "shopId"=${shopId}::uuid AND "status"='POSTED' AND "deletedAt" IS NULL AND "balanceDue">0),0) purchases,
      COALESCE((SELECT SUM("amount") FROM "SupplierReturnSettlement" WHERE "shopId"=${shopId}::uuid AND "type"='SUPPLIER_CREDIT'),0) credit`;
  const manual = num(rows[0]?.manual), purchases = num(rows[0]?.purchases), credit = num(rows[0]?.credit), total = money(manual + purchases);
  return { manual: money(manual), purchases: money(purchases), credit: money(credit), total, net: money(Math.max(0, total - credit)) };
}

export async function getDailySummaryHeadline(shopId: string) {
  const { timeZone, range, totals } = await financialCore(shopId); return { timeZone, range, totals };
}

export async function getDailySummary(shopId: string) {
  const core = await financialCore(shopId); const { range, report, transfer, totals } = core;
  const [damage, software, pos, posCost, repairs, repairCost, otherInvoices, plans, electronic, walletOps, drawer, wallets, providers, damagedItems, debt, suppliers] = await Promise.all([
    getInventoryDamageReportSummary(shopId, range.start, range.end),
    softwareServiceService.getFinancialRows(shopId, range.start, range.end).catch(() => []),
    prisma.$queryRaw<Array<{ revenue: Prisma.Decimal; count: bigint }>>`SELECT COALESCE(SUM("total"),0) revenue,COUNT(*) count FROM "Sale" WHERE "shopId"=${shopId}::uuid AND "deletedAt" IS NULL AND "status"='COMPLETED' AND "soldAt">=${range.start} AND "soldAt"<${range.end}`,
    prisma.$queryRaw<Array<{ cost: Prisma.Decimal }>>`SELECT COALESCE(SUM(CASE WHEN m."type"='RETURN' THEN -ABS(m."quantityChange")*COALESCE(m."unitCostSnapshot",0) ELSE ABS(m."quantityChange")*COALESCE(m."unitCostSnapshot",0) END),0) cost FROM "InventoryMovement" m JOIN "Sale" s ON s."id"=m."saleId" WHERE m."shopId"=${shopId}::uuid AND m."deletedAt" IS NULL AND m."type" IN ('SALE','RETURN') AND m."createdAt">=${range.start} AND m."createdAt"<${range.end} AND s."deletedAt" IS NULL AND s."status"='COMPLETED'`,
    prisma.$queryRaw<Array<{ revenue: Prisma.Decimal; count: bigint }>>`SELECT COALESCE(SUM("total"),0) revenue,COUNT(*) count FROM "Invoice" WHERE "shopId"=${shopId}::uuid AND "deletedAt" IS NULL AND "status"<>'VOID' AND "repairOrderId" IS NOT NULL AND "issuedAt">=${range.start} AND "issuedAt"<${range.end}`,
    prisma.$queryRaw<Array<{ cost: Prisma.Decimal }>>`
      SELECT COALESCE((SELECT SUM(CASE WHEN m."type"='REPAIR_RETURN' THEN -ABS(m."quantityChange")*COALESCE(m."unitCostSnapshot",0) ELSE ABS(m."quantityChange")*COALESCE(m."unitCostSnapshot",0) END) FROM "InventoryMovement" m JOIN "RepairOrder" ro ON ro."id"=m."repairOrderId" WHERE m."shopId"=${shopId}::uuid AND m."deletedAt" IS NULL AND m."type" IN ('REPAIR_USAGE','REPAIR_RETURN') AND m."createdAt"<${range.end} AND ro."deletedAt" IS NULL AND ro."status"<>'CANCELLED' AND EXISTS(SELECT 1 FROM "Invoice" i WHERE i."repairOrderId"=ro."id" AND i."shopId"=${shopId}::uuid AND i."deletedAt" IS NULL AND i."status"<>'VOID' AND i."issuedAt">=${range.start} AND i."issuedAt"<${range.end})),0)
      + COALESCE((SELECT SUM(roi."quantity"*COALESCE(roi."unitCost",0)) FROM "RepairOrderItem" roi JOIN "RepairOrder" ro ON ro."id"=roi."repairOrderId" WHERE roi."shopId"=${shopId}::uuid AND roi."deletedAt" IS NULL AND roi."inventoryItemId" IS NULL AND roi."unitCost" IS NOT NULL AND roi."createdAt"<${range.end} AND ro."deletedAt" IS NULL AND ro."status"<>'CANCELLED' AND EXISTS(SELECT 1 FROM "Invoice" i WHERE i."repairOrderId"=ro."id" AND i."shopId"=${shopId}::uuid AND i."deletedAt" IS NULL AND i."status"<>'VOID' AND i."issuedAt">=${range.start} AND i."issuedAt"<${range.end})),0)
      + COALESCE((SELECT SUM(COALESCE(ro."partCost",0)) FROM "RepairOrder" ro WHERE ro."shopId"=${shopId}::uuid AND ro."deletedAt" IS NULL AND ro."status"<>'CANCELLED' AND ro."deductPartCost"=TRUE AND ro."partCost" IS NOT NULL AND ro."createdAt"<${range.end} AND NOT EXISTS(SELECT 1 FROM "RepairOrderItem" x WHERE x."repairOrderId"=ro."id" AND x."deletedAt" IS NULL) AND EXISTS(SELECT 1 FROM "Invoice" i WHERE i."repairOrderId"=ro."id" AND i."shopId"=${shopId}::uuid AND i."deletedAt" IS NULL AND i."status"<>'VOID' AND i."issuedAt">=${range.start} AND i."issuedAt"<${range.end})),0) cost`,
    prisma.$queryRaw<Array<{ revenue: Prisma.Decimal; count: bigint }>>`SELECT COALESCE(SUM(i."total"),0) revenue,COUNT(*) count FROM "Invoice" i LEFT JOIN "SoftwareServiceSale" s ON s."invoiceId"=i."id" AND s."shopId"=${shopId}::uuid AND s."deletedAt" IS NULL WHERE i."shopId"=${shopId}::uuid AND i."deletedAt" IS NULL AND i."status"<>'VOID' AND i."saleId" IS NULL AND i."repairOrderId" IS NULL AND s."id" IS NULL AND i."issuedAt">=${range.start} AND i."issuedAt"<${range.end}`,
    prisma.$queryRaw<Array<{ revenue: Prisma.Decimal; count: bigint }>>`SELECT COALESCE(SUM("totalAmount"),0) revenue,COUNT(*) count FROM "InstallmentPlan" WHERE "shopId"=${shopId}::uuid AND "deletedAt" IS NULL AND "source"='MANUAL' AND "status"<>'CANCELLED' AND "createdAt">=${range.start} AND "createdAt"<${range.end}`,
    prisma.$queryRaw<ElectronicRow[]>`SELECT COALESCE(NULLIF(TRIM("category"),''),'خدمات إلكترونية أخرى') category,COALESCE(SUM("customerCharge"),0) revenue,COALESCE(SUM("providerCost"),0) cost,COALESCE(SUM("profit"),0) profit,COUNT(*) count FROM "ElectronicServiceTransaction" WHERE "shopId"=${shopId}::uuid AND "status"='ACTIVE' AND "createdAt">=${range.start} AND "createdAt"<${range.end} GROUP BY 1 ORDER BY revenue DESC`,
    prisma.$queryRaw<Array<{ volume: Prisma.Decimal; profit: Prisma.Decimal; count: bigint }>>`SELECT COALESCE(SUM("amount"),0) volume,COALESCE(SUM("commission"),0) profit,COUNT(*) count FROM "FinancialTransfer" WHERE "shopId"=${shopId}::uuid AND "deletedAt" IS NULL AND "status"='ACTIVE' AND "sourceType"='CUSTOMER_TRANSFER' AND "operationType" IN ('CUSTOMER_DEPOSIT','CUSTOMER_WITHDRAWAL') AND "createdAt">=${range.start} AND "createdAt"<${range.end}`,
    prisma.$queryRaw<Array<{ currentBalance: Prisma.Decimal }>>`SELECT "currentBalance" FROM "CashDrawer" WHERE "shopId"=${shopId}::uuid LIMIT 1`,
    prisma.$queryRaw<Array<{ id: string; name: string; currentBalance: Prisma.Decimal }>>`SELECT "id","name","currentBalance" FROM "FinancialWallet" WHERE "shopId"=${shopId}::uuid AND "deletedAt" IS NULL AND "isActive"=TRUE ORDER BY "name"`,
    prisma.$queryRaw<Array<{ id: string; name: string; currentBalance: Prisma.Decimal }>>`SELECT "id","name","currentBalance" FROM "ElectronicServiceProvider" WHERE "shopId"=${shopId}::uuid AND "isActive"=TRUE ORDER BY "name"`,
    prisma.$queryRaw<Array<{ inventoryItemId: string; name: string; quantity: bigint; value: Prisma.Decimal }>>`SELECT d."inventoryItemId",i."name",SUM(d."quantity") quantity,COALESCE(SUM(d."quantity"*COALESCE(d."unitCostSnapshot",0)),0) value FROM "InventoryDamage" d JOIN "InventoryItem" i ON i."id"=d."inventoryItemId" AND i."shopId"=${shopId}::uuid WHERE d."shopId"=${shopId}::uuid AND d."createdAt">=${range.start} AND d."createdAt"<${range.end} GROUP BY d."inventoryItemId",i."name" ORDER BY value DESC LIMIT 20`,
    debtSnapshot(shopId), supplierSnapshot(shopId),
  ]);

  const softwareRevenue = software.filter(x => x.invoiceStatus !== InvoiceStatus.VOID).reduce((s,x) => s + num(x.invoiceTotal),0);
  const softwareCost = software.filter(x => x.invoiceStatus !== InvoiceStatus.VOID).reduce((s,x) => s + num(x.serviceCost),0);
  const recharge = electronic.filter(x => isRecharge(x.category)); const electronicOther = electronic.filter(x => !isRecharge(x.category));
  const sumRows = (rows: ElectronicRow[]) => rows.reduce((a,x) => ({ revenue:a.revenue+num(x.revenue), cost:a.cost+num(x.cost), profit:a.profit+num(x.profit), count:a.count+Number(x.count) }), { revenue:0,cost:0,profit:0,count:0 });
  const r = sumRows(recharge), e = sumRows(electronicOther);
  const posRevenue=num(pos[0]?.revenue), pc=num(posCost[0]?.cost), repairRevenue=num(repairs[0]?.revenue), rc=num(repairCost[0]?.cost);
  const otherRevenue=num(otherInvoices[0]?.revenue)+num(plans[0]?.revenue); const known=pc+rc+softwareCost+report.metrics.electronicServiceCost; const otherCost=money(Math.max(0,report.metrics.directCosts-known));
  const walletVolume=num(walletOps[0]?.volume), walletProfit=money(transfer.totalProfit || num(walletOps[0]?.profit));
  const channels: Channel[] = [
    {key:"POS",label:"الإكسسوار وبيع القطع (POS)",revenue:money(posRevenue),cost:money(pc),profit:money(posRevenue-pc),count:Number(pos[0]?.count??0),href:"/sales"},
    {key:"REPAIR",label:"الصيانة المفوترة",revenue:money(repairRevenue),cost:money(rc),profit:money(repairRevenue-rc),count:Number(repairs[0]?.count??0),href:"/repair-orders"},
    {key:"SOFTWARE",label:"خدمات السوفتوير",revenue:money(softwareRevenue),cost:money(softwareCost),profit:money(softwareRevenue-softwareCost),count:software.filter(x=>x.invoiceStatus!==InvoiceStatus.VOID).length,href:"/software-services"},
    {key:"RECHARGE",label:"شحن الرصيد والباقات",revenue:money(r.revenue),cost:money(r.cost),profit:money(r.profit),count:r.count,href:"/electronic-services"},
    {key:"ELECTRONIC_OTHER",label:"خدمات إلكترونية أخرى",revenue:money(e.revenue),cost:money(e.cost),profit:money(e.profit),count:e.count,href:"/electronic-services"},
    {key:"OTHER",label:"فواتير وخطط أخرى",revenue:money(otherRevenue),cost:otherCost,profit:money(otherRevenue-otherCost),count:Number(otherInvoices[0]?.count??0)+Number(plans[0]?.count??0),href:"/invoices"},
    {key:"WALLET_TRANSFERS",label:"عمليات المحافظ الإلكترونية",revenue:money(walletVolume),cost:0,profit:walletProfit,count:Number(walletOps[0]?.count??0),href:"/transfers",volumeOnly:true},
  ];
  const drawerBalance=money(num(drawer[0]?.currentBalance)); const walletSources: Liquidity[]=wallets.map(x=>({id:x.id,label:x.name,balance:money(num(x.currentBalance)),href:`/transfers?walletId=${x.id}`,kind:"WALLET"})); const providerSources: Liquidity[]=providers.map(x=>({id:x.id,label:x.name,balance:money(num(x.currentBalance)),href:"/electronic-services",kind:"PROVIDER"}));
  const sources: Liquidity[]=[{id:"drawer",label:"الدرج النقدي",balance:drawerBalance,href:"/cash-drawer",kind:"DRAWER"},...walletSources,...providerSources];
  return { timeZone:core.timeZone, range, totals, channels,
    electronicCategories:electronic.map(x=>({category:x.category,revenue:money(num(x.revenue)),cost:money(num(x.cost)),profit:money(num(x.profit)),count:Number(x.count)})),
    liquidity:{drawerBalance,wallets:walletSources,providers:providerSources,sources,total:money(sources.reduce((s,x)=>s+x.balance,0))},
    inventory:{valueAtCost:report.metrics.inventoryValue,damageValue:money(damage.totalValue),damageCount:damage.movementCount,damageItems:damagedItems.map(x=>({inventoryItemId:x.inventoryItemId,name:x.name,quantity:Number(x.quantity),value:money(num(x.value))}))},
    debts:{customerOutstanding:debt.totalOutstanding,externalOutstanding:debt.externalOutstanding,supplierManualOutstanding:suppliers.manual,supplierPurchaseOutstanding:suppliers.purchases,supplierCredit:suppliers.credit,supplierPayable:suppliers.total,supplierNetPayable:suppliers.net},
  };
}

export const dailySummaryService = { getDailySummary, getDailySummaryHeadline };
