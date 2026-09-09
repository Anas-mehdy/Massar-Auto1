import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { bankAccountService } from "@/lib/services/bankAccountService";
import { cashDrawerService } from "@/lib/services/cashDrawerService";
import { financialTransferService } from "@/lib/services/financialTransferService";
import { sourceDebtService } from "@/lib/services/sourceDebtService";
import { getShopTimeZone } from "@/lib/shop-timezone";
import { dayUtcBoundsForTimeZone } from "@/lib/timezone";

export type ElectronicServiceProfitMode = "AUTO_DIFFERENCE" | "FIXED" | "PERCENTAGE" | "NONE";
export type ElectronicServicePaymentDestination = "DRAWER" | "WALLET" | "BANK" | "OTHER" | "DEBT";

export type ElectronicServiceProviderOption = {
  id: string;
  name: string;
  typeLabel: string | null;
  currencyCode: string;
  currentBalance: Prisma.Decimal;
  isActive: boolean;
};

export type ElectronicServiceTemplateRow = {
  id: string;
  shopId: string;
  providerId: string;
  providerName: string;
  currencyCode: string;
  providerBalance: Prisma.Decimal;
  providerActive: boolean;
  name: string;
  category: string;
  faceValue: Prisma.Decimal | null;
  providerCost: Prisma.Decimal;
  customerCharge: Prisma.Decimal;
  isActive: boolean;
  notes: string | null;
  createdByUserId: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type ElectronicServiceTransactionRow = {
  id: string;
  providerId: string;
  providerName: string;
  templateId: string | null;
  customerId: string | null;
  customerName: string | null;
  category: string;
  serviceName: string;
  faceValue: Prisma.Decimal;
  providerCost: Prisma.Decimal;
  customerCharge: Prisma.Decimal;
  profit: Prisma.Decimal;
  profitMode: ElectronicServiceProfitMode;
  profitValue: Prisma.Decimal;
  paymentDestination: ElectronicServicePaymentDestination;
  walletId: string | null;
  walletName: string | null;
  bankAccountId: string | null;
  bankAccountName: string | null;
  debtEntryId: string | null;
  cashDrawerMovementId: string | null;
  financialTransferId: string | null;
  customerPhone: string | null;
  reference: string | null;
  notes: string | null;
  status: "ACTIVE" | "VOID";
  createdByUserId: string | null;
  createdByName: string | null;
  createdAt: Date;
  voidedAt: Date | null;
  voidReason: string | null;
};

type CommonTransactionInput = {
  paymentDestination: ElectronicServicePaymentDestination;
  walletId?: string | null;
  bankAccountId?: string | null;
  customerId?: string | null;
  customerPhone?: string | null;
  reference?: string | null;
  notes?: string | null;
};

type CreateTransactionInput =
  | (CommonTransactionInput & { mode: "TEMPLATE"; templateId: string })
  | (CommonTransactionInput & {
      mode: "FREE";
      providerId: string;
      category: string;
      serviceName: string;
      faceValue: string;
      providerCost: string;
      profitMode: ElectronicServiceProfitMode;
      profitValue?: string | null;
      customerCharge?: string | null;
    });

function decimal(value: string | number | Prisma.Decimal | null | undefined) {
  return new Prisma.Decimal(String(value ?? 0).replace(",", "."));
}

function money(value: string | number | Prisma.Decimal | null | undefined) {
  const result = decimal(value).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
  if (!result.isFinite()) throw new Error("القيمة المالية غير صحيحة.");
  return result;
}

function nullableText(value?: string | null) {
  const text = value?.trim();
  return text ? text : null;
}

function normalizedText(value: string, fallback: string) {
  const text = value.trim().replace(/\s+/g, " ");
  return text || fallback;
}

function ensureNonNegative(value: Prisma.Decimal, label: string) {
  if (!value.isFinite() || value.lt(0)) throw new Error(`${label} لا يمكن أن يكون سالباً.`);
}

async function getProviderOptions(shopId: string, activeOnly = true) {
  const activeFilter = activeOnly ? Prisma.sql`AND "isActive" = true` : Prisma.sql``;
  return prisma.$queryRaw<ElectronicServiceProviderOption[]>(Prisma.sql`
    SELECT "id", "name", "typeLabel", "currencyCode", "currentBalance", "isActive"
    FROM "ElectronicServiceProvider"
    WHERE "shopId" = ${shopId}::uuid ${activeFilter}
    ORDER BY "isActive" DESC, lower("name") ASC
  `);
}

async function listTemplates(shopId: string, includeInactive = true) {
  const activeFilter = includeInactive ? Prisma.sql`` : Prisma.sql`AND t."isActive" = true AND p."isActive" = true`;
  return prisma.$queryRaw<ElectronicServiceTemplateRow[]>(Prisma.sql`
    SELECT t."id", t."shopId", t."providerId", p."name" AS "providerName", p."currencyCode",
      p."currentBalance" AS "providerBalance", p."isActive" AS "providerActive",
      t."name", t."category", t."faceValue", t."providerCost", t."customerCharge",
      t."isActive", t."notes", t."createdByUserId", t."createdAt", t."updatedAt"
    FROM "ElectronicServiceTemplate" t
    JOIN "ElectronicServiceProvider" p ON p."id" = t."providerId" AND p."shopId" = t."shopId"
    WHERE t."shopId" = ${shopId}::uuid ${activeFilter}
    ORDER BY t."isActive" DESC, lower(t."category") ASC, lower(t."name") ASC
  `);
}

async function listRecentTransactions(shopId: string, limit = 30) {
  return prisma.$queryRaw<ElectronicServiceTransactionRow[]>`
    SELECT tx."id", tx."providerId", p."name" AS "providerName", tx."templateId",
      tx."customerId", c."name" AS "customerName", tx."category", tx."serviceName",
      tx."faceValue", tx."providerCost", tx."customerCharge", tx."profit", tx."profitMode", tx."profitValue",
      tx."paymentDestination", tx."walletId", w."name" AS "walletName",
      tx."bankAccountId", ba."name" AS "bankAccountName", tx."debtEntryId",
      tx."cashDrawerMovementId", tx."financialTransferId", tx."customerPhone", tx."reference", tx."notes",
      tx."status", tx."createdByUserId", u."name" AS "createdByName", tx."createdAt", tx."voidedAt", tx."voidReason"
    FROM "ElectronicServiceTransaction" tx
    JOIN "ElectronicServiceProvider" p ON p."id" = tx."providerId"
    LEFT JOIN "Customer" c ON c."id" = tx."customerId"
    LEFT JOIN "FinancialWallet" w ON w."id" = tx."walletId"
    LEFT JOIN "BankAccount" ba ON ba."id" = tx."bankAccountId" AND ba."shopId" = tx."shopId"
    LEFT JOIN "User" u ON u."id" = tx."createdByUserId"
    WHERE tx."shopId" = ${shopId}::uuid
    ORDER BY tx."createdAt" DESC
    LIMIT ${Math.max(1, Math.min(limit, 200))}
  `;
}

async function customerForTransaction(
  tx: Prisma.TransactionClient,
  shopId: string,
  customerId?: string | null,
) {
  if (!customerId) return null;
  const rows = await tx.$queryRaw<Array<{ id: string; name: string; phone: string | null }>>`
    SELECT "id", "name", "phone"
    FROM "Customer"
    WHERE "id" = ${customerId}::uuid AND "shopId" = ${shopId}::uuid AND "deletedAt" IS NULL
    LIMIT 1
  `;
  if (!rows[0]) throw new Error("العميل المحدد غير موجود في هذا المتجر.");
  return rows[0];
}

async function applyIncomingPaymentTx(
  tx: Prisma.TransactionClient,
  input: {
    shopId: string;
    userId: string;
    transactionId: string;
    customerId: string | null;
    serviceName: string;
    amount: Prisma.Decimal;
    destination: ElectronicServicePaymentDestination;
    walletId?: string | null;
    bankAccountId?: string | null;
    reference?: string | null;
  },
) {
  if (input.amount.lte(0) || input.destination === "OTHER" || input.destination === "DEBT") {
    return { cashDrawerMovementId: null as string | null, financialTransferId: null as string | null };
  }

  const description = `تحصيل خدمة إلكترونية: ${input.serviceName}`;
  const sourceReference = nullableText(input.reference) ?? input.serviceName;

  if (input.destination === "DRAWER") {
    const drawerRows = await tx.$queryRaw<Array<{ id: string; currentBalance: Prisma.Decimal }>>`
      SELECT "id", "currentBalance"
      FROM "CashDrawer"
      WHERE "shopId" = ${input.shopId}::uuid
      FOR UPDATE
    `;
    const drawer = drawerRows[0];
    if (!drawer) throw new Error("الدرج النقدي غير جاهز.");
    const nextBalance = drawer.currentBalance.add(input.amount);
    await tx.$executeRaw`
      UPDATE "CashDrawer" SET "currentBalance" = ${nextBalance}, "updatedAt" = NOW()
      WHERE "id" = ${drawer.id}::uuid
    `;
    const movementRows = await tx.$queryRaw<Array<{ id: string }>>`
      INSERT INTO "CashDrawerMovement" (
        "shopId", "drawerId", "createdByUserId", "type", "direction", "amount", "description", "reference",
        "sourceType", "sourceId", "sourceReference", "customerId", "createdAt"
      ) VALUES (
        ${input.shopId}::uuid, ${drawer.id}::uuid, ${input.userId}::uuid,
        'ELECTRONIC_SERVICE_PAYMENT', 'IN', ${input.amount}, ${description}, ${nullableText(input.reference)},
        'ELECTRONIC_SERVICE', ${input.transactionId}, ${sourceReference}, ${input.customerId}::uuid, NOW()
      ) RETURNING "id"
    `;
    return { cashDrawerMovementId: movementRows[0]?.id ?? null, financialTransferId: null };
  }

  if (input.destination === "BANK") {
    if (!input.bankAccountId) throw new Error("اختر الحساب البنكي الذي استلم المبلغ.");
    await bankAccountService.createBankMovementTx(tx, input.shopId, input.userId, {
      bankAccountId: input.bankAccountId,
      customerId: input.customerId,
      type: "ELECTRONIC_SERVICE_PAYMENT",
      direction: "IN",
      amount: input.amount,
      description,
      reference: nullableText(input.reference),
      sourceType: "ELECTRONIC_SERVICE",
      sourceId: input.transactionId,
      sourceReference,
      occurredAt: new Date(),
    });
    return { cashDrawerMovementId: null, financialTransferId: null };
  }

  if (!input.walletId) throw new Error("اختر المحفظة التي استلمت المبلغ.");
  const walletRows = await tx.$queryRaw<Array<{ id: string; name: string; currentBalance: Prisma.Decimal }>>`
    SELECT "id", "name", "currentBalance"
    FROM "FinancialWallet"
    WHERE "id" = ${input.walletId}::uuid AND "shopId" = ${input.shopId}::uuid
      AND "deletedAt" IS NULL AND "isActive" = TRUE
    FOR UPDATE
  `;
  const wallet = walletRows[0];
  if (!wallet) throw new Error("المحفظة المحددة غير موجودة أو متوقفة.");
  const nextBalance = wallet.currentBalance.add(input.amount);
  await tx.$executeRaw`
    UPDATE "FinancialWallet" SET "currentBalance" = ${nextBalance}, "updatedAt" = NOW()
    WHERE "id" = ${wallet.id}::uuid
  `;
  const transferRows = await tx.$queryRaw<Array<{ id: string }>>`
    INSERT INTO "FinancialTransfer" (
      "shopId", "walletId", "customerId", "createdByUserId", "operationType", "amount", "walletAmount",
      "commission", "commissionMode", "isDeferred", "sourceType", "sourceId", "sourceReference", "notes", "status", "createdAt", "updatedAt"
    ) VALUES (
      ${input.shopId}::uuid, ${wallet.id}::uuid, ${input.customerId}::uuid, ${input.userId}::uuid,
      'WALLET_TOPUP', ${input.amount}, ${input.amount}, 0, 'NONE', FALSE,
      'ELECTRONIC_SERVICE', ${input.transactionId}, ${sourceReference}, ${description}, 'ACTIVE', NOW(), NOW()
    ) RETURNING "id"
  `;
  return { cashDrawerMovementId: null, financialTransferId: transferRows[0]?.id ?? null };
}

export const electronicServiceTransactionService = {
  async getExecutionData(shopId: string) {
    // Ensures the shared wallet tables exist before recent-transaction queries join them.
    const wallets = await financialTransferService.listWallets(shopId);
    const timeZone = await getShopTimeZone(shopId);
    const todayBounds = dayUtcBoundsForTimeZone(new Date(), timeZone);
    const [providers, templates, recentTransactions, customers, bankAccounts, todayRows] = await Promise.all([
      getProviderOptions(shopId, true),
      listTemplates(shopId, false),
      listRecentTransactions(shopId, 25),
      prisma.customer.findMany({
        where: { shopId, deletedAt: null },
        select: { id: true, name: true, phone: true },
        orderBy: { name: "asc" },
        take: 500,
      }),
      bankAccountService.listAccounts(shopId),
      prisma.$queryRaw<Array<{
        count: number;
        providerCost: Prisma.Decimal;
        customerCharge: Prisma.Decimal;
        collected: Prisma.Decimal;
        deferred: Prisma.Decimal;
        profit: Prisma.Decimal;
      }>>`
        SELECT COUNT(*)::int AS "count",
          COALESCE(SUM("providerCost"),0) AS "providerCost",
          COALESCE(SUM("customerCharge"),0) AS "customerCharge",
          COALESCE(SUM("customerCharge") FILTER (WHERE "paymentDestination" <> 'DEBT'),0) AS "collected",
          COALESCE(SUM("customerCharge") FILTER (WHERE "paymentDestination" = 'DEBT'),0) AS "deferred",
          COALESCE(SUM("profit"),0) AS "profit"
        FROM "ElectronicServiceTransaction"
        WHERE "shopId" = ${shopId}::uuid AND "status" = 'ACTIVE'
          AND "createdAt" >= ${todayBounds.start}
          AND "createdAt" < ${todayBounds.end}
      `,
    ]);
    const today = todayRows[0];
    return {
      providers,
      templates,
      recentTransactions,
      customers,
      wallets,
      bankAccounts,
      today: {
        count: today?.count ?? 0,
        providerCost: Number(today?.providerCost ?? 0),
        customerCharge: Number(today?.customerCharge ?? 0),
        collected: Number(today?.collected ?? 0),
        deferred: Number(today?.deferred ?? 0),
        profit: Number(today?.profit ?? 0),
      },
    };
  },

  async getTemplateManagementData(shopId: string) {
    const [providers, templates] = await Promise.all([getProviderOptions(shopId, false), listTemplates(shopId, true)]);
    return { providers, templates };
  },

  async createTemplate(shopId: string, userId: string, input: {
    providerId: string;
    name: string;
    category: string;
    faceValue?: string | null;
    providerCost: string;
    customerCharge: string;
    notes?: string | null;
  }) {
    const name = normalizedText(input.name, "خدمة محفوظة");
    const category = normalizedText(input.category, "أخرى");
    const faceValue = input.faceValue?.trim() ? money(input.faceValue) : null;
    const providerCost = money(input.providerCost);
    const customerCharge = money(input.customerCharge);
    if (faceValue) ensureNonNegative(faceValue, "قيمة الخدمة");
    ensureNonNegative(providerCost, "تكلفة المزود");
    ensureNonNegative(customerCharge, "المبلغ على العميل");

    return prisma.$transaction(async (tx) => {
      const providerRows = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT "id" FROM "ElectronicServiceProvider"
        WHERE "shopId" = ${shopId}::uuid AND "id" = ${input.providerId}::uuid
        LIMIT 1
      `;
      if (!providerRows[0]) throw new Error("مزود الخدمة غير موجود.");

      const duplicate = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT "id" FROM "ElectronicServiceTemplate"
        WHERE "shopId" = ${shopId}::uuid AND "providerId" = ${input.providerId}::uuid
          AND lower(trim("name")) = lower(trim(${name}))
          AND (("faceValue" IS NULL AND ${faceValue}::numeric IS NULL) OR "faceValue" = ${faceValue})
        LIMIT 1
      `;
      if (duplicate[0]) throw new Error("هذه الخدمة محفوظة مسبقاً لنفس المزود والقيمة.");

      const rows = await tx.$queryRaw<Array<{ id: string }>>`
        INSERT INTO "ElectronicServiceTemplate" (
          "shopId", "providerId", "name", "category", "faceValue", "providerCost", "customerCharge",
          "isActive", "notes", "createdByUserId", "createdAt", "updatedAt"
        ) VALUES (
          ${shopId}::uuid, ${input.providerId}::uuid, ${name}, ${category}, ${faceValue}, ${providerCost}, ${customerCharge},
          true, ${nullableText(input.notes)}, ${userId}::uuid, NOW(), NOW()
        ) RETURNING "id"
      `;
      return rows[0]?.id;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 10_000 });
  },

  async setTemplateActive(shopId: string, templateId: string, isActive: boolean) {
    const changed = await prisma.$executeRaw`
      UPDATE "ElectronicServiceTemplate" SET "isActive" = ${isActive}, "updatedAt" = NOW()
      WHERE "shopId" = ${shopId}::uuid AND "id" = ${templateId}::uuid
    `;
    if (changed === 0) throw new Error("الخدمة المحفوظة غير موجودة.");
  },

  async createTransaction(shopId: string, userId: string, input: CreateTransactionInput) {
    if (input.paymentDestination === "DRAWER") {
      await cashDrawerService.getSnapshot(shopId, 1);
    } else if (input.paymentDestination === "WALLET") {
      await financialTransferService.listWallets(shopId);
    } else if (input.paymentDestination === "BANK") {
      await bankAccountService.prepareBankAccounts(shopId);
    }

    return prisma.$transaction(async (tx) => {
      let providerId: string;
      let templateId: string | null = null;
      let category: string;
      let serviceName: string;
      let faceValue: Prisma.Decimal;
      let providerCost: Prisma.Decimal;
      let customerCharge: Prisma.Decimal;
      let profitMode: ElectronicServiceProfitMode;
      let profitValue = new Prisma.Decimal(0);

      if (input.mode === "TEMPLATE") {
        const rows = await tx.$queryRaw<Array<{
          id: string;
          providerId: string;
          name: string;
          category: string;
          faceValue: Prisma.Decimal | null;
          providerCost: Prisma.Decimal;
          customerCharge: Prisma.Decimal;
          isActive: boolean;
        }>>`
          SELECT "id", "providerId", "name", "category", "faceValue", "providerCost", "customerCharge", "isActive"
          FROM "ElectronicServiceTemplate"
          WHERE "shopId" = ${shopId}::uuid AND "id" = ${input.templateId}::uuid
          LIMIT 1
        `;
        const template = rows[0];
        if (!template || !template.isActive) throw new Error("الخدمة المحفوظة غير موجودة أو متوقفة.");
        providerId = template.providerId;
        templateId = template.id;
        category = template.category;
        serviceName = template.name;
        faceValue = money(template.faceValue ?? template.customerCharge);
        providerCost = money(template.providerCost);
        customerCharge = money(template.customerCharge);
        profitMode = "AUTO_DIFFERENCE";
        profitValue = customerCharge.sub(providerCost).abs().toDecimalPlaces(2);
      } else {
        providerId = input.providerId;
        category = normalizedText(input.category, "أخرى");
        serviceName = normalizedText(input.serviceName, "خدمة إلكترونية");
        faceValue = money(input.faceValue);
        providerCost = money(input.providerCost);
        profitMode = input.profitMode;
        profitValue = decimal(input.profitValue || 0);
        ensureNonNegative(faceValue, "قيمة الخدمة");
        ensureNonNegative(providerCost, "تكلفة المزود");
        ensureNonNegative(profitValue, "قيمة الربح أو النسبة");

        if (profitMode === "NONE") {
          customerCharge = providerCost;
          profitValue = new Prisma.Decimal(0);
        } else if (profitMode === "FIXED") {
          customerCharge = providerCost.add(profitValue).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
        } else if (profitMode === "PERCENTAGE") {
          customerCharge = providerCost.add(faceValue.mul(profitValue).div(100)).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
        } else {
          customerCharge = money(input.customerCharge);
          profitValue = customerCharge.sub(providerCost).abs().toDecimalPlaces(2);
        }
      }

      ensureNonNegative(faceValue, "قيمة الخدمة");
      ensureNonNegative(providerCost, "تكلفة المزود");
      ensureNonNegative(customerCharge, "المبلغ على العميل");
      const profit = customerCharge.sub(providerCost).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);

      const customer = await customerForTransaction(tx, shopId, input.customerId);
      if (input.paymentDestination === "DEBT" && !customer) {
        throw new Error("اختر العميل عند تسجيل الخدمة على الدين.");
      }
      if (input.paymentDestination === "DEBT" && customerCharge.lte(0)) {
        throw new Error("لا يمكن إنشاء دين بقيمة صفر.");
      }
      if (input.paymentDestination === "WALLET" && !input.walletId) {
        throw new Error("اختر المحفظة التي استلمت المبلغ.");
      }
      if (input.paymentDestination === "BANK" && !input.bankAccountId) {
        throw new Error("اختر الحساب البنكي الذي استلم المبلغ.");
      }

      const providerRows = await tx.$queryRaw<Array<{ id: string; currentBalance: Prisma.Decimal; isActive: boolean }>>`
        SELECT "id", "currentBalance", "isActive"
        FROM "ElectronicServiceProvider"
        WHERE "shopId" = ${shopId}::uuid AND "id" = ${providerId}::uuid
        FOR UPDATE
      `;
      const provider = providerRows[0];
      if (!provider) throw new Error("مزود الخدمة غير موجود.");
      if (!provider.isActive) throw new Error("مزود الخدمة متوقف حالياً ولا يمكن تنفيذ عمليات جديدة عليه.");
      if (provider.currentBalance.lt(providerCost)) throw new Error("رصيد المزود غير كافٍ لتغطية تكلفة هذه الخدمة.");

      const effectivePhone = nullableText(input.customerPhone) ?? customer?.phone ?? null;
      const transactionRows = await tx.$queryRaw<Array<{ id: string }>>`
        INSERT INTO "ElectronicServiceTransaction" (
          "shopId", "providerId", "templateId", "createdByUserId", "customerId", "category", "serviceName", "faceValue",
          "providerCost", "customerCharge", "profit", "profitMode", "profitValue", "paymentDestination", "walletId", "bankAccountId",
          "customerPhone", "reference", "notes", "status", "createdAt"
        ) VALUES (
          ${shopId}::uuid, ${providerId}::uuid, ${templateId}::uuid, ${userId}::uuid, ${customer?.id ?? null}::uuid,
          ${category}, ${serviceName}, ${faceValue}, ${providerCost}, ${customerCharge}, ${profit}, ${profitMode}, ${profitValue},
          ${input.paymentDestination}, ${input.paymentDestination === "WALLET" ? input.walletId ?? null : null}::uuid,
          ${input.paymentDestination === "BANK" ? input.bankAccountId ?? null : null}::uuid,
          ${effectivePhone}, ${nullableText(input.reference)}, ${nullableText(input.notes)}, 'ACTIVE', NOW()
        ) RETURNING "id"
      `;
      const transactionId = transactionRows[0]?.id;
      if (!transactionId) throw new Error("تعذر تسجيل عملية الخدمة الإلكترونية.");

      if (providerCost.gt(0)) {
        const after = provider.currentBalance.sub(providerCost);
        await tx.$executeRaw`
          UPDATE "ElectronicServiceProvider" SET "currentBalance" = ${after}, "updatedAt" = NOW()
          WHERE "shopId" = ${shopId}::uuid AND "id" = ${providerId}::uuid
        `;
        await tx.$executeRaw`
          INSERT INTO "ElectronicServiceProviderMovement" (
            "shopId", "providerId", "createdByUserId", "type", "direction", "amount", "balanceBefore", "balanceAfter",
            "description", "reference", "sourceType", "sourceId", "createdAt"
          ) VALUES (
            ${shopId}::uuid, ${providerId}::uuid, ${userId}::uuid, 'SERVICE_DEBIT', 'OUT', ${providerCost},
            ${provider.currentBalance}, ${after}, ${`تنفيذ خدمة: ${serviceName}`}, ${nullableText(input.reference)},
            'ELECTRONIC_SERVICE', ${transactionId}, NOW()
          )
        `;
      }

      let debtEntryId: string | null = null;
      if (input.paymentDestination === "DEBT") {
        debtEntryId = await sourceDebtService.createSourceDebtTx(tx, {
          shopId,
          customerId: customer!.id,
          createdByUserId: userId,
          amount: customerCharge,
          sourceType: "ELECTRONIC_SERVICE",
          sourceId: transactionId,
          sourceReference: nullableText(input.reference) ?? serviceName,
          description: `خدمة إلكترونية: ${serviceName}`,
        });
      }

      const incoming = await applyIncomingPaymentTx(tx, {
        shopId,
        userId,
        transactionId,
        customerId: customer?.id ?? null,
        serviceName,
        amount: customerCharge,
        destination: input.paymentDestination,
        walletId: input.walletId,
        bankAccountId: input.bankAccountId,
        reference: input.reference,
      });

      await tx.$executeRaw`
        UPDATE "ElectronicServiceTransaction"
        SET "debtEntryId" = ${debtEntryId}::uuid,
            "cashDrawerMovementId" = ${incoming.cashDrawerMovementId}::uuid,
            "financialTransferId" = ${incoming.financialTransferId}::uuid
        WHERE "id" = ${transactionId}::uuid AND "shopId" = ${shopId}::uuid
      `;

      return {
        id: transactionId,
        providerId,
        serviceName,
        faceValue: Number(faceValue),
        providerCost: Number(providerCost),
        customerCharge: Number(customerCharge),
        profit: Number(profit),
        paymentDestination: input.paymentDestination,
      };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 15_000 });
  },

  async voidTransaction(shopId: string, userId: string, transactionId: string, reason?: string | null) {
    return prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<Array<{
        id: string;
        providerId: string;
        providerCost: Prisma.Decimal;
        customerCharge: Prisma.Decimal;
        paymentDestination: ElectronicServicePaymentDestination;
        customerId: string | null;
        cashDrawerMovementId: string | null;
        financialTransferId: string | null;
        serviceName: string;
        reference: string | null;
        status: "ACTIVE" | "VOID";
      }>>`
        SELECT "id", "providerId", "providerCost", "customerCharge", "paymentDestination", "customerId",
          "cashDrawerMovementId", "financialTransferId", "serviceName", "reference", "status"
        FROM "ElectronicServiceTransaction"
        WHERE "shopId" = ${shopId}::uuid AND "id" = ${transactionId}::uuid
        FOR UPDATE
      `;
      const operation = rows[0];
      if (!operation) throw new Error("عملية الخدمة الإلكترونية غير موجودة.");
      if (operation.status === "VOID") throw new Error("هذه العملية ملغاة مسبقاً.");

      if (operation.paymentDestination === "DRAWER" && operation.customerCharge.gt(0)) {
        const movementRows = await tx.$queryRaw<Array<{ id: string; drawerId: string; amount: Prisma.Decimal; status: string }>>`
          SELECT "id", "drawerId", "amount", "status"
          FROM "CashDrawerMovement"
          WHERE "shopId" = ${shopId}::uuid
            AND ("id" = ${operation.cashDrawerMovementId}::uuid OR ("sourceType" = 'ELECTRONIC_SERVICE' AND "sourceId" = ${transactionId}))
          ORDER BY "createdAt" DESC LIMIT 1 FOR UPDATE
        `;
        const movement = movementRows[0];
        if (movement && movement.status === "ACTIVE") {
          const drawerRows = await tx.$queryRaw<Array<{ currentBalance: Prisma.Decimal }>>`
            SELECT "currentBalance" FROM "CashDrawer"
            WHERE "id" = ${movement.drawerId}::uuid AND "shopId" = ${shopId}::uuid FOR UPDATE
          `;
          const drawer = drawerRows[0];
          if (!drawer) throw new Error("الدرج النقدي المرتبط بالعملية غير موجود.");
          const nextBalance = drawer.currentBalance.sub(movement.amount);
          if (nextBalance.lt(0)) throw new Error("لا يمكن إلغاء العملية لأن رصيد الدرج الحالي لا يكفي لعكس المبلغ المحصل.");
          await tx.$executeRaw`UPDATE "CashDrawer" SET "currentBalance" = ${nextBalance}, "updatedAt" = NOW() WHERE "id" = ${movement.drawerId}::uuid`;
          await tx.$executeRaw`UPDATE "CashDrawerMovement" SET "status" = 'VOID', "voidedAt" = NOW() WHERE "id" = ${movement.id}::uuid`;
        }
      }

      if (operation.paymentDestination === "WALLET" && operation.customerCharge.gt(0)) {
        const transferRows = await tx.$queryRaw<Array<{ id: string; walletId: string; walletAmount: Prisma.Decimal; status: string }>>`
          SELECT "id", "walletId", "walletAmount", "status"
          FROM "FinancialTransfer"
          WHERE "shopId" = ${shopId}::uuid AND "deletedAt" IS NULL
            AND ("id" = ${operation.financialTransferId}::uuid OR ("sourceType" = 'ELECTRONIC_SERVICE' AND "sourceId" = ${transactionId}))
          ORDER BY "createdAt" DESC LIMIT 1 FOR UPDATE
        `;
        const transfer = transferRows[0];
        if (transfer && transfer.status === "ACTIVE") {
          const walletRows = await tx.$queryRaw<Array<{ currentBalance: Prisma.Decimal }>>`
            SELECT "currentBalance" FROM "FinancialWallet"
            WHERE "id" = ${transfer.walletId}::uuid AND "shopId" = ${shopId}::uuid AND "deletedAt" IS NULL FOR UPDATE
          `;
          const wallet = walletRows[0];
          if (!wallet) throw new Error("المحفظة المرتبطة بالعملية غير موجودة.");
          const nextBalance = wallet.currentBalance.sub(transfer.walletAmount);
          if (nextBalance.lt(0)) throw new Error("لا يمكن إلغاء العملية لأن رصيد المحفظة الحالي لا يكفي لعكس المبلغ المحصل.");
          await tx.$executeRaw`UPDATE "FinancialWallet" SET "currentBalance" = ${nextBalance}, "updatedAt" = NOW() WHERE "id" = ${transfer.walletId}::uuid`;
          await tx.$executeRaw`
            UPDATE "FinancialTransfer"
            SET "status" = 'VOID', "voidedByUserId" = ${userId}::uuid, "voidedAt" = NOW(), "updatedAt" = NOW()
            WHERE "id" = ${transfer.id}::uuid
          `;
        }
      }

      if (operation.paymentDestination === "BANK" && operation.customerCharge.gt(0)) {
        await bankAccountService.reverseSourceMovementsTx(
          tx,
          shopId,
          "ELECTRONIC_SERVICE",
          transactionId,
          userId,
        );
      }

      if (operation.paymentDestination === "DEBT") {
        await sourceDebtService.reverseSourceDebtTx(tx, {
          shopId,
          sourceType: "ELECTRONIC_SERVICE",
          sourceId: transactionId,
        });
      }

      const providerRows = await tx.$queryRaw<Array<{ id: string; currentBalance: Prisma.Decimal }>>`
        SELECT "id", "currentBalance"
        FROM "ElectronicServiceProvider"
        WHERE "shopId" = ${shopId}::uuid AND "id" = ${operation.providerId}::uuid
        FOR UPDATE
      `;
      const provider = providerRows[0];
      if (!provider) throw new Error("مزود الخدمة المرتبط بالعملية غير موجود.");

      if (operation.providerCost.gt(0)) {
        const after = provider.currentBalance.add(operation.providerCost);
        await tx.$executeRaw`
          UPDATE "ElectronicServiceProvider" SET "currentBalance" = ${after}, "updatedAt" = NOW()
          WHERE "id" = ${provider.id}::uuid
        `;
        await tx.$executeRaw`
          INSERT INTO "ElectronicServiceProviderMovement" (
            "shopId", "providerId", "createdByUserId", "type", "direction", "amount", "balanceBefore", "balanceAfter",
            "description", "reference", "sourceType", "sourceId", "createdAt"
          ) VALUES (
            ${shopId}::uuid, ${provider.id}::uuid, ${userId}::uuid, 'REVERSAL', 'IN', ${operation.providerCost},
            ${provider.currentBalance}, ${after}, ${`عكس خدمة ملغاة: ${operation.serviceName}`}, ${operation.reference},
            'ELECTRONIC_SERVICE', ${transactionId}, NOW()
          )
        `;
      }

      await tx.$executeRaw`
        UPDATE "ElectronicServiceTransaction"
        SET "status" = 'VOID', "voidedByUserId" = ${userId}::uuid, "voidedAt" = NOW(),
            "voidReason" = ${nullableText(reason) ?? "إلغاء العملية بواسطة المستخدم"}
        WHERE "shopId" = ${shopId}::uuid AND "id" = ${transactionId}::uuid
      `;

      return { id: transactionId };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 15_000 });
  },
};