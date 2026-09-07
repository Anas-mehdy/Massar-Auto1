import {
  ExpenseCategory,
  InstallmentPlanSource,
  InstallmentPlanStatus,
  InventoryMovementType,
  InvoiceStatus,
  PaymentMethod,
  Prisma,
  RepairStatus,
  SaleStatus,
} from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { debtReportService } from "@/lib/services/debtReportService";
import { softwareServiceService } from "@/lib/services/softwareServiceService";
import { cashDrawerService } from "@/lib/services/cashDrawerService";
import { financialTransferService } from "@/lib/services/financialTransferService";

export type FinancialRange = { start: Date; end: Date };
export type ExpenseFundingSource = "DRAWER" | "WALLET";

export type CreateExpenseInput = {
  title: string;
  category: ExpenseCategory;
  amount: string;
  spentAt: Date;
  notes?: string;
  fundingSource: ExpenseFundingSource;
  fundingWalletId?: string;
};

const expenseCategoryLabels: Record<ExpenseCategory, string> = {
  RENT: "إيجار",
  SALARIES: "رواتب وأجور",
  UTILITIES: "كهرباء وإنترنت وخدمات",
  MARKETING: "تسويق وإعلانات",
  TRANSPORT: "نقل وتوصيل",
  MAINTENANCE: "صيانة وتجهيزات",
  OTHER: "مصروف آخر",
};

const paymentMethodLabels: Record<PaymentMethod, string> = {
  CASH: "نقدي",
  CARD: "بطاقة",
  BANK_TRANSFER: "تحويل بنكي",
  OTHER: "أخرى",
};

type ElectronicServiceFinancialRow = {
  operationCount: number;
  revenue: Prisma.Decimal;
  providerCost: Prisma.Decimal;
  profit: Prisma.Decimal;
  drawerCollected: Prisma.Decimal;
  walletCollected: Prisma.Decimal;
  otherCollected: Prisma.Decimal;
  deferred: Prisma.Decimal;
};

function decimalNumber(value: Prisma.Decimal | number | string | null | undefined) {
  return value == null ? 0 : Number(value);
}

function money(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function rangeWhere(range: FinancialRange) {
  return { gte: range.start, lt: range.end };
}

export async function getFinancialReport(shopId: string, range: FinancialRange) {
  const [
    sales,
    invoices,
    manualPlans,
    invoicePayments,
    manualInstallmentPayments,
    inventoryMovements,
    externalRepairItems,
    legacyRepairOrders,
    expenses,
    inventoryItems,
    softwareRows,
    debtSummary,
    electronicServiceRows,
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
      select: { amount: true, method: true, sourceName: true, paidAt: true },
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
        type: {
          in: [
            InventoryMovementType.SALE,
            InventoryMovementType.REPAIR_USAGE,
            InventoryMovementType.RETURN,
            InventoryMovementType.REPAIR_RETURN,
          ],
        },
      },
      select: {
        type: true,
        quantityChange: true,
        unitCostSnapshot: true,
        createdAt: true,
        sale: { select: { status: true, deletedAt: true } },
        repairOrder: { select: { status: true, deletedAt: true } },
      },
    }),
    prisma.repairOrderItem.findMany({
      where: {
        shopId,
        deletedAt: null,
        inventoryItemId: null,
        unitCost: { not: null },
        createdAt: rangeWhere(range),
        repairOrder: { is: { deletedAt: null, status: { not: RepairStatus.CANCELLED } } },
      },
      select: { quantity: true, unitCost: true, createdAt: true },
    }),
    prisma.repairOrder.findMany({
      where: {
        shopId,
        deletedAt: null,
        status: { not: RepairStatus.CANCELLED },
        deductPartCost: true,
        partCost: { not: null },
        createdAt: rangeWhere(range),
        items: { none: { deletedAt: null } },
      },
      select: { partCost: true, createdAt: true },
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
    softwareServiceService.getFinancialRows(shopId, range.start, range.end).catch(() => []),
    debtReportService.getDebtReportSummary(shopId, range.start, range.end).catch(() => ({
      deferredSaleIds: [],
      saleOutstanding: 0,
      electronicServiceOutstanding: 0,
      payments: [],
    })),
    prisma.$queryRaw<ElectronicServiceFinancialRow[]>`
      SELECT
        COUNT(*)::int AS "operationCount",
        COALESCE(SUM(tx."customerCharge"), 0) AS "revenue",
        COALESCE(SUM(tx."providerCost"), 0) AS "providerCost",
        COALESCE(SUM(tx."profit"), 0) AS "profit",
        COALESCE(SUM(tx."customerCharge") FILTER (WHERE tx."paymentDestination" = 'DRAWER'), 0) AS "drawerCollected",
        COALESCE(SUM(tx."customerCharge") FILTER (WHERE tx."paymentDestination" = 'WALLET'), 0) AS "walletCollected",
        COALESCE(SUM(tx."customerCharge") FILTER (WHERE tx."paymentDestination" = 'OTHER'), 0) AS "otherCollected",
        COALESCE(SUM(tx."customerCharge") FILTER (WHERE tx."paymentDestination" = 'DEBT'), 0) AS "deferred"
      FROM "ElectronicServiceTransaction" tx
      WHERE tx."shopId" = ${shopId}::uuid
        AND tx."status" = 'ACTIVE'
        AND tx."createdAt" >= ${range.start}
        AND tx."createdAt" < ${range.end}
    `,
  ]);

  const electronicService = electronicServiceRows[0];
  const electronicServiceRevenue = money(decimalNumber(electronicService?.revenue));
  const electronicServiceCost = money(decimalNumber(electronicService?.providerCost));
  const electronicServiceProfit = money(decimalNumber(electronicService?.profit));
  const electronicServiceDrawerCollected = money(decimalNumber(electronicService?.drawerCollected));
  const electronicServiceWalletCollected = money(decimalNumber(electronicService?.walletCollected));
  const electronicServiceOtherCollected = money(decimalNumber(electronicService?.otherCollected));
  const electronicServiceImmediateCollected = money(
    electronicServiceDrawerCollected + electronicServiceWalletCollected + electronicServiceOtherCollected,
  );
  const electronicServiceDeferred = money(decimalNumber(electronicService?.deferred));
  const electronicServiceOutstanding = money(debtSummary.electronicServiceOutstanding);

  const salesGross = sales.reduce((sum, sale) => sum + decimalNumber(sale.total), 0);
  const salesNet = sales.reduce(
    (sum, sale) => sum + decimalNumber(sale.subtotal) - decimalNumber(sale.discountTotal),
    0,
  );
  const standaloneInvoices = invoices.filter((invoice) => !invoice.saleId);
  const invoiceGross = standaloneInvoices.reduce((sum, invoice) => sum + decimalNumber(invoice.total), 0);
  const invoiceNet = standaloneInvoices.reduce(
    (sum, invoice) => sum + decimalNumber(invoice.subtotal) - decimalNumber(invoice.discountTotal),
    0,
  );
  const manualPlanGross = manualPlans.reduce((sum, plan) => sum + decimalNumber(plan.totalAmount), 0);

  const grossRevenue = money(salesGross + invoiceGross + manualPlanGross + electronicServiceRevenue);
  const netRevenueBeforeTax = money(salesNet + invoiceNet + manualPlanGross + electronicServiceRevenue);
  const invoiceCollected = invoicePayments.reduce((sum, payment) => sum + decimalNumber(payment.amount), 0);
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
    invoiceCollected +
      manualInstallmentsCollected +
      immediateSalesCollected +
      debtCollected +
      electronicServiceImmediateCollected,
  );

  const outstanding = money(
    invoices.reduce((sum, invoice) => sum + decimalNumber(invoice.balanceDue), 0) +
      manualPlans.reduce((sum, plan) => sum + decimalNumber(plan.balanceDue), 0) +
      debtSummary.saleOutstanding +
      electronicServiceOutstanding,
  );

  const movementCost = inventoryMovements.reduce((sum, movement) => {
    const isSaleMovement = movement.type === InventoryMovementType.SALE || movement.type === InventoryMovementType.RETURN;
    if (isSaleMovement && (movement.sale?.status !== SaleStatus.COMPLETED || movement.sale.deletedAt)) return sum;

    const isRepairMovement = movement.type === InventoryMovementType.REPAIR_USAGE || movement.type === InventoryMovementType.REPAIR_RETURN;
    if (isRepairMovement && (movement.repairOrder?.status === RepairStatus.CANCELLED || movement.repairOrder?.deletedAt)) return sum;

    const unitCost = decimalNumber(movement.unitCostSnapshot);
    const quantity = Math.abs(movement.quantityChange);
    const isReturn = movement.type === InventoryMovementType.RETURN || movement.type === InventoryMovementType.REPAIR_RETURN;
    return sum + (isReturn ? -1 : 1) * quantity * unitCost;
  }, 0);
  const externalCost = externalRepairItems.reduce(
    (sum, item) => sum + item.quantity * decimalNumber(item.unitCost),
    0,
  );
  const legacyCost = legacyRepairOrders.reduce((sum, order) => sum + decimalNumber(order.partCost), 0);
  const softwareCost = softwareRows
    .filter((row) => row.invoiceStatus !== InvoiceStatus.VOID)
    .reduce((sum, row) => sum + decimalNumber(row.serviceCost), 0);
  const directCosts = money(Math.max(0, movementCost + externalCost + legacyCost + softwareCost + electronicServiceCost));
  const expenseTotal = money(expenses.reduce((sum, expense) => sum + decimalNumber(expense.amount), 0));
  const grossProfit = money(netRevenueBeforeTax - directCosts);
  const netProfit = money(grossProfit - expenseTotal);
  const profitMargin = netRevenueBeforeTax > 0 ? money((netProfit / netRevenueBeforeTax) * 100) : 0;
  const inventoryValue = money(
    inventoryItems.reduce((sum, item) => sum + item.quantity * decimalNumber(item.unitCost), 0),
  );

  const paymentSources = new Map<string, number>();
  const paymentRows = [...invoicePayments, ...manualInstallmentPayments];
  for (const payment of paymentRows) {
    const label = payment.sourceName?.trim() || paymentMethodLabels[payment.method];
    paymentSources.set(label, (paymentSources.get(label) ?? 0) + decimalNumber(payment.amount));
  }
  if (immediateSalesCollected > 0) {
    paymentSources.set("مبيعات POS مباشرة", (paymentSources.get("مبيعات POS مباشرة") ?? 0) + immediateSalesCollected);
  }
  if (electronicServiceDrawerCollected > 0) {
    paymentSources.set(
      "خدمات إلكترونية — نقدي",
      (paymentSources.get("خدمات إلكترونية — نقدي") ?? 0) + electronicServiceDrawerCollected,
    );
  }
  if (electronicServiceWalletCollected > 0) {
    paymentSources.set(
      "خدمات إلكترونية — محفظة",
      (paymentSources.get("خدمات إلكترونية — محفظة") ?? 0) + electronicServiceWalletCollected,
    );
  }
  if (electronicServiceOtherCollected > 0) {
    paymentSources.set(
      "خدمات إلكترونية — مصدر آخر",
      (paymentSources.get("خدمات إلكترونية — مصدر آخر") ?? 0) + electronicServiceOtherCollected,
    );
  }
  for (const payment of debtSummary.payments) {
    paymentSources.set(payment.sourceName, (paymentSources.get(payment.sourceName) ?? 0) + payment.amount);
  }

  const softwareInvoiceIds = new Set(softwareRows.map((row) => row.invoiceId));
  const softwareRevenue = softwareRows
    .filter((row) => row.invoiceStatus !== InvoiceStatus.VOID)
    .reduce((sum, row) => sum + decimalNumber(row.invoiceTotal), 0);

  const revenueMix = [
    { label: "المبيعات والـ POS", value: money(salesGross) },
    { label: "خدمات السوفتوير", value: money(softwareRevenue) },
    { label: "الخدمات الإلكترونية", value: electronicServiceRevenue },
    {
      label: "فواتير الصيانة والخدمات",
      value: money(
        invoices
          .filter((invoice) => !invoice.saleId && invoice.type !== "MANUAL")
          .reduce((sum, invoice) => sum + decimalNumber(invoice.total), 0),
      ),
    },
    {
      label: "فواتير وخطط مستقلة",
      value: money(
        invoices
          .filter((invoice) => !invoice.saleId && invoice.type === "MANUAL" && !softwareInvoiceIds.has(invoice.id))
          .reduce((sum, invoice) => sum + decimalNumber(invoice.total), 0) + manualPlanGross,
      ),
    },
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
      electronicServiceRevenue,
      electronicServiceCost,
      electronicServiceProfit,
      electronicServiceImmediateCollected,
      electronicServiceDeferred,
      electronicServiceOutstanding,
    },
    counts: {
      sales: sales.length,
      invoices: invoices.length,
      manualPlans: manualPlans.length,
      expenses: expenses.length,
      softwareServices: softwareRows.filter((row) => row.invoiceStatus !== InvoiceStatus.VOID).length,
      electronicServices: electronicService?.operationCount ?? 0,
    },
    revenueMix,
    paymentSources: [...paymentSources.entries()]
      .map(([label, value]) => ({ label, value: money(value) }))
      .sort((a, b) => b.value - a.value),
    expenses,
  };
}

export async function createExpense(
  shopId: string,
  createdByUserId: string,
  input: CreateExpenseInput,
) {
  const amount = new Prisma.Decimal(input.amount.replace(",", "."));
  if (!amount.isPositive()) throw new Error("قيمة المصروف يجب أن تكون أكبر من صفر.");
  if (input.fundingSource === "WALLET" && !input.fundingWalletId) throw new Error("اختر المحفظة التي سُحب منها المصروف.");

  if (input.fundingSource === "DRAWER") await cashDrawerService.getSnapshot(shopId, 1);
  else await financialTransferService.listWallets(shopId);

  const title = input.title.trim();
  const notes = input.notes?.trim() || null;
  const categoryLabel = expenseCategoryLabels[input.category];
  const movementDescription = notes
    ? `مصروف — ${categoryLabel}: ${title} — ${notes}`
    : `مصروف — ${categoryLabel}: ${title}`;

  return prisma.$transaction(async (tx) => {
    const expense = await tx.expense.create({
      data: {
        shopId,
        createdByUserId,
        category: input.category,
        title,
        amount,
        spentAt: input.spentAt,
        notes,
        fundingSource: input.fundingSource,
        fundingWalletId: input.fundingSource === "WALLET" ? input.fundingWalletId : null,
      },
    });

    if (input.fundingSource === "DRAWER") {
      const drawerRows = await tx.$queryRaw<Array<{ id: string; currentBalance: Prisma.Decimal }>>`
        SELECT "id", "currentBalance" FROM "CashDrawer"
        WHERE "shopId" = ${shopId}::uuid FOR UPDATE`;
      const drawer = drawerRows[0];
      if (!drawer) throw new Error("الدرج النقدي غير موجود.");
      if (drawer.currentBalance.lt(amount)) throw new Error("رصيد الدرج النقدي غير كافٍ لتسجيل هذا المصروف.");

      const nextBalance = drawer.currentBalance.sub(amount);
      await tx.$executeRaw`UPDATE "CashDrawer" SET "currentBalance" = ${nextBalance}, "updatedAt" = NOW() WHERE "id" = ${drawer.id}::uuid`;
      const movementRows = await tx.$queryRaw<Array<{ id: string }>>`
        INSERT INTO "CashDrawerMovement"
          ("shopId", "drawerId", "createdByUserId", "type", "direction", "amount", "description", "reference", "sourceType", "sourceId", "sourceReference", "createdAt")
        VALUES
          (${shopId}::uuid, ${drawer.id}::uuid, ${createdByUserId}::uuid, 'EXPENSE_PAYMENT', 'OUT', ${amount}, ${movementDescription}, ${title}, 'EXPENSE', ${expense.id}, ${title}, ${input.spentAt})
        RETURNING "id"`;
      const movementId = movementRows[0]?.id;
      if (!movementId) throw new Error("تعذر تسجيل حركة المصروف في الدرج النقدي.");

      return tx.expense.update({ where: { id: expense.id }, data: { cashDrawerMovementId: movementId } });
    }

    const walletRows = await tx.$queryRaw<Array<{ id: string; name: string; currentBalance: Prisma.Decimal }>>`
      SELECT "id", "name", "currentBalance" FROM "FinancialWallet"
      WHERE "id" = ${input.fundingWalletId}::uuid AND "shopId" = ${shopId}::uuid
        AND "deletedAt" IS NULL AND "isActive" = TRUE
      FOR UPDATE`;
    const wallet = walletRows[0];
    if (!wallet) throw new Error("المحفظة المختارة غير موجودة أو غير فعالة.");
    if (wallet.currentBalance.lt(amount)) throw new Error(`رصيد محفظة ${wallet.name} غير كافٍ لتسجيل هذا المصروف.`);

    const nextWalletBalance = wallet.currentBalance.sub(amount);
    await tx.$executeRaw`UPDATE "FinancialWallet" SET "currentBalance" = ${nextWalletBalance}, "updatedAt" = NOW() WHERE "id" = ${wallet.id}::uuid`;
    const transferRows = await tx.$queryRaw<Array<{ id: string }>>`
      INSERT INTO "FinancialTransfer"
        ("shopId", "walletId", "createdByUserId", "operationType", "amount", "walletAmount", "commission", "commissionMode", "isDeferred", "notes", "sourceType", "sourceId", "sourceReference", "createdAt", "updatedAt")
      VALUES
        (${shopId}::uuid, ${wallet.id}::uuid, ${createdByUserId}::uuid, 'WALLET_WITHDRAWAL', ${amount}, ${amount}, 0, 'NONE', FALSE, ${movementDescription}, 'EXPENSE', ${expense.id}, ${title}, ${input.spentAt}, NOW())
      RETURNING "id"`;
    const transferId = transferRows[0]?.id;
    if (!transferId) throw new Error("تعذر تسجيل حركة المصروف في المحفظة.");

    return tx.expense.update({
      where: { id: expense.id },
      data: { fundingWalletName: wallet.name, financialTransferId: transferId },
    });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 10_000 });
}

export async function deleteExpense(shopId: string, expenseId: string, voidedByUserId?: string) {
  const existing = await prisma.expense.findFirst({
    where: { id: expenseId, shopId, deletedAt: null },
    select: { id: true, fundingSource: true },
  });
  if (!existing) throw new Error("المصروف غير موجود.");
  if (existing.fundingSource === "DRAWER") await cashDrawerService.getSnapshot(shopId, 1);
  if (existing.fundingSource === "WALLET") await financialTransferService.listWallets(shopId);

  return prisma.$transaction(async (tx) => {
    const expense = await tx.expense.findFirst({
      where: { id: expenseId, shopId, deletedAt: null },
      select: {
        id: true, amount: true, fundingSource: true, fundingWalletId: true,
        cashDrawerMovementId: true, financialTransferId: true,
      },
    });
    if (!expense) throw new Error("المصروف غير موجود.");

    if (expense.fundingSource === "DRAWER" && expense.cashDrawerMovementId) {
      const movementRows = await tx.$queryRaw<Array<{ id: string; status: string }>>`
        SELECT "id", "status" FROM "CashDrawerMovement"
        WHERE "id" = ${expense.cashDrawerMovementId}::uuid AND "shopId" = ${shopId}::uuid
          AND "sourceType" = 'EXPENSE' AND "sourceId" = ${expense.id}
        FOR UPDATE`;
      const movement = movementRows[0];
      if (!movement) throw new Error("حركة الدرج المرتبطة بالمصروف غير موجودة؛ تم إيقاف الحذف لحماية الرصيد.");
      if (movement.status === "ACTIVE") {
        const drawerRows = await tx.$queryRaw<Array<{ id: string; currentBalance: Prisma.Decimal }>>`
          SELECT "id", "currentBalance" FROM "CashDrawer" WHERE "shopId" = ${shopId}::uuid FOR UPDATE`;
        const drawer = drawerRows[0];
        if (!drawer) throw new Error("الدرج النقدي غير موجود.");
        await tx.$executeRaw`UPDATE "CashDrawer" SET "currentBalance" = ${drawer.currentBalance.add(expense.amount)}, "updatedAt" = NOW() WHERE "id" = ${drawer.id}::uuid`;
        await tx.$executeRaw`UPDATE "CashDrawerMovement" SET "status" = 'VOID', "voidedAt" = NOW() WHERE "id" = ${movement.id}::uuid`;
      }
    }

    if (expense.fundingSource === "WALLET" && expense.financialTransferId) {
      const transferRows = await tx.$queryRaw<Array<{ id: string; walletId: string; walletAmount: Prisma.Decimal; status: string }>>`
        SELECT "id", "walletId", "walletAmount", "status" FROM "FinancialTransfer"
        WHERE "id" = ${expense.financialTransferId}::uuid AND "shopId" = ${shopId}::uuid
          AND "sourceType" = 'EXPENSE' AND "sourceId" = ${expense.id}
        FOR UPDATE`;
      const transfer = transferRows[0];
      if (!transfer) throw new Error("حركة المحفظة المرتبطة بالمصروف غير موجودة؛ تم إيقاف الحذف لحماية الرصيد.");
      if (transfer.status === "ACTIVE") {
        const walletRows = await tx.$queryRaw<Array<{ id: string; currentBalance: Prisma.Decimal }>>`
          SELECT "id", "currentBalance" FROM "FinancialWallet"
          WHERE "id" = ${transfer.walletId}::uuid AND "shopId" = ${shopId}::uuid FOR UPDATE`;
        const wallet = walletRows[0];
        if (!wallet) throw new Error("المحفظة المرتبطة بالمصروف غير موجودة.");
        await tx.$executeRaw`UPDATE "FinancialWallet" SET "currentBalance" = ${wallet.currentBalance.add(transfer.walletAmount)}, "updatedAt" = NOW() WHERE "id" = ${wallet.id}::uuid`;
        await tx.$executeRaw`UPDATE "FinancialTransfer" SET "status" = 'VOID', "voidedAt" = NOW(), "voidedByUserId" = ${voidedByUserId || null}::uuid, "updatedAt" = NOW() WHERE "id" = ${transfer.id}::uuid`;
      }
    }

    return tx.expense.update({
      where: { id: expense.id },
      data: { deletedAt: new Date(), version: { increment: 1 } },
    });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 10_000 });
}

export const reportService = {
  getFinancialReport,
  createExpense,
  deleteExpense,
};
