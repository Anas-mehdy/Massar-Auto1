import { InvoiceStatus, SaleStatus, Prisma } from "@prisma/client";
import type { AppPermission } from "@/lib/auth/permissions";
import { prisma } from "@/lib/prisma";
import { softwareServiceService } from "@/lib/services/softwareServiceService";
import { dayUtcBoundsForTimeZone } from "@/lib/timezone";
import { getShopTimeZone } from "@/lib/shop-timezone";

function hasPermission(permissions: readonly string[], permission: AppPermission) {
  return permissions.includes(permission);
}

export async function getDashboardMetrics(shopId: string, permissions: readonly string[]) {
  const timeZone = await getShopTimeZone(shopId);
  const { start: startOfToday, end: startOfTomorrow } = dayUtcBoundsForTimeZone(new Date(), timeZone);
  const canReadServiceOrders = hasPermission(permissions, "service_orders:read");
  const canReadSales = hasPermission(permissions, "sales:read") || hasPermission(permissions, "reports:read");
  const canReadInvoices = hasPermission(permissions, "invoices:read") || hasPermission(permissions, "reports:read");
  const canReadInventory = hasPermission(permissions, "inventory:read") || hasPermission(permissions, "reports:read");
  const canReadFinancialReports = hasPermission(permissions, "reports:read");
  const canReadDebts = hasPermission(permissions, "debts:manage") || canReadFinancialReports;

  const [
    openServiceOrdersCount,
    readyForDeliveryCount,
    serviceOrdersCreatedToday,
    deliveredToday,
    salesTodayAggregate,
    softwareRowsToday,
    unpaidInvoicesAggregate,
    inventoryItems,
    debtRows,
  ] = await Promise.all([
    canReadServiceOrders
      ? prisma.serviceOrder.count({
          where: {
            shopId,
            deletedAt: null,
            status: { notIn: ["DELIVERED", "CLOSED", "REJECTED", "CANCELLED"] },
          },
        })
      : Promise.resolve(0),
    canReadServiceOrders
      ? prisma.serviceOrder.count({
          where: { shopId, deletedAt: null, status: "READY_FOR_DELIVERY" },
        })
      : Promise.resolve(0),
    canReadServiceOrders
      ? prisma.serviceOrder.count({
          where: {
            shopId,
            deletedAt: null,
            receivedAt: { gte: startOfToday, lt: startOfTomorrow },
          },
        })
      : Promise.resolve(0),
    canReadServiceOrders
      ? prisma.serviceOrder.count({
          where: {
            shopId,
            deletedAt: null,
            deliveredAt: { gte: startOfToday, lt: startOfTomorrow },
          },
        })
      : Promise.resolve(0),
    canReadSales
      ? prisma.sale.aggregate({
          where: {
            shopId,
            deletedAt: null,
            status: SaleStatus.COMPLETED,
            soldAt: { gte: startOfToday, lt: startOfTomorrow },
          },
          _sum: { total: true },
        })
      : Promise.resolve({ _sum: { total: null } }),
    canReadFinancialReports
      ? softwareServiceService.getFinancialRows(shopId, startOfToday, startOfTomorrow).catch(() => [])
      : Promise.resolve([]),
    canReadInvoices
      ? prisma.invoice.aggregate({
          where: {
            shopId,
            deletedAt: null,
            status: { in: [InvoiceStatus.UNPAID, InvoiceStatus.PARTIALLY_PAID] },
          },
          _count: { id: true },
          _sum: { balanceDue: true },
        })
      : Promise.resolve({ _count: { id: 0 }, _sum: { balanceDue: null } }),
    canReadInventory
      ? prisma.inventoryItem.findMany({
          where: { shopId, deletedAt: null },
          select: { quantity: true, reorderLevel: true },
        })
      : Promise.resolve([]),
    canReadDebts
      ? prisma.$queryRaw<Array<{ totalOutstanding: Prisma.Decimal | number | string }>>`
          WITH balances AS (
            SELECT
              a."customerId",
              COALESCE(SUM(
                CASE
                  WHEN e."isReversed" THEN 0
                  WHEN e."type" IN ('DEBT','OPENING_BALANCE','ADJUSTMENT_DEBIT') THEN e."amount"
                  WHEN e."type" IN ('PAYMENT','ADJUSTMENT_CREDIT') THEN -e."amount"
                  ELSE 0
                END
              ), 0) AS balance
            FROM "DebtLedgerAccount" a
            LEFT JOIN "DebtLedgerEntry" e ON e."accountId" = a."id"
            WHERE a."shopId" = ${shopId}::uuid
            GROUP BY a."customerId"
          )
          SELECT COALESCE(SUM(GREATEST(balance, 0)), 0) AS "totalOutstanding"
          FROM balances
        `
      : Promise.resolve([]),
  ]);

  const softwareSalesToday = softwareRowsToday
    .filter((row) => row.invoiceStatus !== InvoiceStatus.VOID)
    .reduce((sum, row) => sum + Number(row.invoiceTotal), 0);

  return {
    openServiceOrdersCount,
    readyForDeliveryCount,
    serviceOrdersCreatedToday,
    deliveredToday,
    salesRevenueToday: salesTodayAggregate._sum.total ?? 0,
    softwareSalesToday,
    unpaidInvoicesCount: unpaidInvoicesAggregate._count.id ?? 0,
    unpaidBalanceTotal: unpaidInvoicesAggregate._sum.balanceDue ?? 0,
    totalDebtOutstanding: Number(debtRows[0]?.totalOutstanding ?? 0),
    lowStockItemsCount: inventoryItems.filter(
      (item) => item.quantity <= item.reorderLevel,
    ).length,
  };
}

export async function getRecentActivity(shopId: string, permissions: readonly string[]) {
  const canReadServiceOrders = hasPermission(permissions, "service_orders:read");
  const canReadSales = hasPermission(permissions, "sales:read");
  const canReadInvoices = hasPermission(permissions, "invoices:read");

  const [serviceOrders, sales, invoices] = await Promise.all([
    canReadServiceOrders
      ? prisma.serviceOrder.findMany({
          where: { shopId, deletedAt: null },
          select: {
            id: true,
            orderNumber: true,
            status: true,
            receivedAt: true,
            customer: { select: { name: true } },
            vehicle: { select: { make: true, model: true, plateNumber: true } },
          },
          orderBy: { receivedAt: "desc" },
          take: 5,
        })
      : Promise.resolve([]),
    canReadSales
      ? prisma.sale.findMany({
          where: { shopId, deletedAt: null },
          include: { customer: true },
          orderBy: { soldAt: "desc" },
          take: 5,
        })
      : Promise.resolve([]),
    canReadInvoices
      ? prisma.invoice.findMany({
          where: { shopId, deletedAt: null },
          include: { customer: true },
          orderBy: { issuedAt: "desc" },
          take: 5,
        })
      : Promise.resolve([]),
  ]);

  return { serviceOrders, sales, invoices };
}

export const dashboardService = {
  getDashboardMetrics,
  getRecentActivity,
};
