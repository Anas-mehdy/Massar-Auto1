import { InvoiceStatus, InvoiceType, PaymentMethod, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { invoiceService } from "@/lib/services/invoiceService";
import { moneyAccountService, type MoneyAccountDestination } from "@/lib/services/moneyAccountService";
import { sourceDebtService } from "@/lib/services/sourceDebtService";

type CatalogRow = {
  id: string;
  name: string;
  defaultPrice: Prisma.Decimal | null;
  defaultCost: Prisma.Decimal | null;
  isActive: boolean;
};

type SaleRow = {
  id: string;
  customerId: string | null;
  customerName: string | null;
  customerPhone: string | null;
  catalogId: string | null;
  invoiceId: string;
  invoiceNumber: string;
  invoiceStatus: InvoiceStatus;
  invoiceTotal: Prisma.Decimal;
  invoiceDiscountTotal: Prisma.Decimal;
  invoiceBalanceDue: Prisma.Decimal;
  serviceName: string;
  deviceBrand: string | null;
  deviceModel: string | null;
  deviceSerial: string | null;
  salePrice: Prisma.Decimal;
  serviceCost: Prisma.Decimal | null;
  notes: string | null;
  deviceKept: boolean;
  deliveredAt: Date | null;
  soldAt: Date;
};

export type SoftwareServicePaymentDestination = Exclude<MoneyAccountDestination, "OTHER"> | "DEBT";

export type CreateSoftwareServiceSaleInput = {
  customerId?: string;
  newCustomerName?: string;
  newCustomerPhone?: string;
  catalogId?: string;
  serviceName: string;
  deviceBrand?: string;
  deviceModel?: string;
  deviceSerial?: string;
  salePrice: string;
  serviceCost?: string;
  notes?: string;
  deviceKept?: boolean;
  paymentDestination?: SoftwareServicePaymentDestination;
  walletId?: string;
  bankAccountId?: string;
  amountReceived?: string;
  changeDestination?: Exclude<MoneyAccountDestination, "OTHER">;
  changeWalletId?: string;
  changeBankAccountId?: string;
};

function decimal(value: string | number | Prisma.Decimal) {
  return new Prisma.Decimal(String(value).replace(",", "."));
}

function nullableText(value?: string) {
  const text = value?.trim();
  return text ? text : null;
}

function normalizePhone(value?: string) {
  const text = value?.trim();
  if (!text) return null;
  return text.replace(/[^\d+]/g, "");
}

let tablesReady: Promise<void> | null = null;

async function createTables() {
  try {
    await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe("SELECT pg_advisory_xact_lock(68119723)");

      await tx.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "SoftwareServiceCatalog" (
        "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "shopId" UUID NOT NULL REFERENCES "Shop"("id") ON DELETE CASCADE,
        "name" TEXT NOT NULL,
        "defaultPrice" DECIMAL(12,2),
        "defaultCost" DECIMAL(12,2),
        "isActive" BOOLEAN NOT NULL DEFAULT TRUE,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "deletedAt" TIMESTAMP(3)
      )`);
      await tx.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "SoftwareServiceCatalog_shopId_name_idx" ON "SoftwareServiceCatalog"("shopId", "name")`);
      await tx.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "SoftwareServiceSale" (
        "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "shopId" UUID NOT NULL REFERENCES "Shop"("id") ON DELETE CASCADE,
        "customerId" UUID REFERENCES "Customer"("id") ON DELETE SET NULL,
        "catalogId" UUID REFERENCES "SoftwareServiceCatalog"("id") ON DELETE SET NULL,
        "invoiceId" UUID NOT NULL UNIQUE REFERENCES "Invoice"("id") ON DELETE CASCADE,
        "createdByUserId" UUID,
        "serviceName" TEXT NOT NULL,
        "deviceBrand" TEXT,
        "deviceModel" TEXT,
        "deviceSerial" TEXT,
        "salePrice" DECIMAL(12,2) NOT NULL,
        "serviceCost" DECIMAL(12,2),
        "notes" TEXT,
        "deviceKept" BOOLEAN NOT NULL DEFAULT FALSE,
        "deliveredAt" TIMESTAMP(3),
        "soldAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "deletedAt" TIMESTAMP(3)
      )`);
      await tx.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "SoftwareServiceSale_shopId_soldAt_idx" ON "SoftwareServiceSale"("shopId", "soldAt")`);
      await tx.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "SoftwareServiceSale_shopId_customerId_idx" ON "SoftwareServiceSale"("shopId", "customerId")`);
      await tx.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "SoftwareServiceSale_shopId_deviceKept_idx" ON "SoftwareServiceSale"("shopId", "deviceKept", "deliveredAt")`);
    }, { timeout: 10_000 });
  } catch {
    throw new Error("تعذر تجهيز مساحة خدمات السوفتوير. يرجى تطبيق تحديث قاعدة البيانات ثم المحاولة مجدداً.");
  }
}

async function ensureTables() {
  if (!tablesReady) {
    tablesReady = createTables().catch((error) => {
      tablesReady = null;
      throw error;
    });
  }
  await tablesReady;
}

export async function listCatalog(shopId: string) {
  await ensureTables();
  return prisma.$queryRaw<CatalogRow[]>`
    SELECT "id", "name", "defaultPrice", "defaultCost", "isActive"
    FROM "SoftwareServiceCatalog"
    WHERE "shopId" = ${shopId}::uuid
      AND "deletedAt" IS NULL
      AND "isActive" = TRUE
    ORDER BY "name" ASC
  `;
}

export async function createCatalogItem(
  shopId: string,
  input: { name: string; defaultPrice?: string; defaultCost?: string },
) {
  await ensureTables();
  const name = input.name.trim();
  if (!name) throw new Error("اسم الخدمة مطلوب.");

  const price = input.defaultPrice?.trim() ? decimal(input.defaultPrice) : null;
  const cost = input.defaultCost?.trim() ? decimal(input.defaultCost) : null;
  if (price?.lt(0)) throw new Error("السعر الافتراضي لا يمكن أن يكون سالباً.");
  if (cost?.lt(0)) throw new Error("التكلفة الافتراضية لا يمكن أن تكون سالبة.");

  const rows = await prisma.$queryRaw<CatalogRow[]>`
    INSERT INTO "SoftwareServiceCatalog"
      ("shopId", "name", "defaultPrice", "defaultCost")
    VALUES (${shopId}::uuid, ${name}, ${price}, ${cost})
    RETURNING "id", "name", "defaultPrice", "defaultCost", "isActive"
  `;
  return rows[0];
}

export async function listSales(shopId: string, take = 100) {
  await ensureTables();
  return prisma.$queryRaw<SaleRow[]>`
    SELECT
      s."id", s."customerId", c."name" AS "customerName", c."phone" AS "customerPhone",
      s."catalogId", s."invoiceId", i."invoiceNumber", i."status" AS "invoiceStatus",
      i."total" AS "invoiceTotal", i."discountTotal" AS "invoiceDiscountTotal",
      i."balanceDue" AS "invoiceBalanceDue", s."serviceName", s."deviceBrand",
      s."deviceModel", s."deviceSerial", s."salePrice", s."serviceCost", s."notes",
      s."deviceKept", s."deliveredAt", s."soldAt"
    FROM "SoftwareServiceSale" s
    LEFT JOIN "Customer" c ON c."id" = s."customerId" AND c."deletedAt" IS NULL
    JOIN "Invoice" i ON i."id" = s."invoiceId" AND i."deletedAt" IS NULL
    WHERE s."shopId" = ${shopId}::uuid AND s."deletedAt" IS NULL
    ORDER BY s."soldAt" DESC
    LIMIT ${take}
  `;
}

export async function getSaleById(shopId: string, id: string) {
  await ensureTables();
  const rows = await prisma.$queryRaw<SaleRow[]>`
    SELECT
      s."id", s."customerId", c."name" AS "customerName", c."phone" AS "customerPhone",
      s."catalogId", s."invoiceId", i."invoiceNumber", i."status" AS "invoiceStatus",
      i."total" AS "invoiceTotal", i."discountTotal" AS "invoiceDiscountTotal",
      i."balanceDue" AS "invoiceBalanceDue", s."serviceName", s."deviceBrand",
      s."deviceModel", s."deviceSerial", s."salePrice", s."serviceCost", s."notes",
      s."deviceKept", s."deliveredAt", s."soldAt"
    FROM "SoftwareServiceSale" s
    LEFT JOIN "Customer" c ON c."id" = s."customerId" AND c."deletedAt" IS NULL
    JOIN "Invoice" i ON i."id" = s."invoiceId" AND i."deletedAt" IS NULL
    WHERE s."shopId" = ${shopId}::uuid
      AND s."id" = ${id}::uuid
      AND s."deletedAt" IS NULL
    LIMIT 1
  `;
  return rows[0] ?? null;
}

export async function getSaleByInvoiceId(shopId: string, invoiceId: string) {
  await ensureTables();
  const rows = await prisma.$queryRaw<Array<{ id: string; serviceName: string }>>`
    SELECT "id", "serviceName"
    FROM "SoftwareServiceSale"
    WHERE "shopId" = ${shopId}::uuid
      AND "invoiceId" = ${invoiceId}::uuid
      AND "deletedAt" IS NULL
    LIMIT 1
  `;
  return rows[0] ?? null;
}

export async function createSale(
  shopId: string,
  createdByUserId: string | null,
  input: CreateSoftwareServiceSaleInput,
) {
  await ensureTables();
  const serviceName = input.serviceName.trim();
  if (!serviceName) throw new Error("اسم خدمة السوفتوير مطلوب.");

  const salePrice = decimal(input.salePrice);
  if (salePrice.lte(0)) throw new Error("سعر البيع يجب أن يكون أكبر من صفر.");

  const serviceCost = input.serviceCost?.trim() ? decimal(input.serviceCost) : null;
  if (serviceCost?.lt(0)) throw new Error("تكلفة الخدمة لا يمكن أن تكون سالبة.");
  const hasServiceCost = Boolean(serviceCost?.gt(0));

  if (input.deviceKept && !nullableText(input.deviceBrand) && !nullableText(input.deviceModel)) {
    throw new Error("عند إبقاء الجهاز بالمحل، أدخل نوع الجهاز أو موديله لتمييزه.");
  }

  const paymentDestination = input.paymentDestination ?? "DRAWER";
  const isDebtSale = paymentDestination === "DEBT";
  const amountReceived = isDebtSale ? new Prisma.Decimal(0) : input.amountReceived?.trim() ? decimal(input.amountReceived) : salePrice;
  if (!isDebtSale && amountReceived.lt(salePrice)) throw new Error("المبلغ المستلم أقل من سعر الخدمة. اختر «دفتر الديون» إذا كان العميل سيدفع لاحقاً.");
  const changeAmount = isDebtSale ? new Prisma.Decimal(0) : amountReceived.sub(salePrice);
  const changeDestination = input.changeDestination ?? "DRAWER";
  const costDestination: Exclude<MoneyAccountDestination, "OTHER"> =
    paymentDestination === "WALLET" ? "WALLET" : paymentDestination === "BANK" ? "BANK" : "DRAWER";
  const costWalletId = paymentDestination === "WALLET" ? input.walletId : undefined;
  const costBankAccountId = paymentDestination === "BANK" ? input.bankAccountId : undefined;

  if (paymentDestination === "WALLET" && !input.walletId) throw new Error("اختر محفظة استلام المبلغ.");
  if (paymentDestination === "BANK" && !input.bankAccountId) throw new Error("اختر الحساب البنكي الذي استلم المبلغ.");
  if (changeAmount.gt(0) && changeDestination === "WALLET" && !input.changeWalletId) throw new Error("اختر محفظة إرجاع الباقي.");
  if (changeAmount.gt(0) && changeDestination === "BANK" && !input.changeBankAccountId) throw new Error("اختر الحساب البنكي الذي سيُرجع منه الباقي.");

  if (!isDebtSale) await moneyAccountService.prepareMoneyAccounts(shopId, paymentDestination);
  if (changeAmount.gt(0)) await moneyAccountService.prepareMoneyAccounts(shopId, changeDestination);
  if (hasServiceCost) await moneyAccountService.prepareMoneyAccounts(shopId, costDestination);

  const invoiceNumber = await invoiceService.generateInvoiceNumber(shopId);

  return prisma.$transaction(async (tx) => {
    let customerId = input.customerId?.trim() || null;
    let catalogId = input.catalogId?.trim() || null;
    let customer: { id: string; name: string; phone: string | null } | null = null;

    if (customerId) {
      customer = await tx.customer.findFirst({
        where: { id: customerId, shopId, deletedAt: null },
        select: { id: true, name: true, phone: true },
      });
      if (!customer) throw new Error("العميل المحدد غير موجود.");
      customerId = customer.id;
    } else if (input.newCustomerName?.trim()) {
      customer = await tx.customer.create({
        data: {
          shopId,
          name: input.newCustomerName.trim(),
          phone: nullableText(input.newCustomerPhone),
          phoneNormalized: normalizePhone(input.newCustomerPhone),
        },
        select: { id: true, name: true, phone: true },
      });
      customerId = customer.id;
    }

    if (isDebtSale && !customer) throw new Error("ترحيل خدمة السوفتوير إلى دفتر الديون يتطلب عميلاً مسجلاً.");

    if (catalogId) {
      const catalogRows = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT "id" FROM "SoftwareServiceCatalog"
        WHERE "id" = ${catalogId}::uuid
          AND "shopId" = ${shopId}::uuid
          AND "deletedAt" IS NULL
          AND "isActive" = TRUE
        LIMIT 1
      `;
      if (!catalogRows[0]) throw new Error("الخدمة المحفوظة غير موجودة في هذا المتجر.");
      catalogId = catalogRows[0].id;
    }

    const invoice = await tx.invoice.create({
      data: {
        shopId,
        customerId,
        createdByUserId,
        invoiceNumber,
        type: InvoiceType.MANUAL,
        status: InvoiceStatus.UNPAID,
        subtotal: salePrice,
        discountTotal: new Prisma.Decimal(0),
        taxTotal: new Prisma.Decimal(0),
        total: salePrice,
        amountPaid: new Prisma.Decimal(0),
        balanceDue: salePrice,
      },
    });

    const rows = await tx.$queryRaw<Array<{ id: string }>>`
      INSERT INTO "SoftwareServiceSale" (
        "shopId", "customerId", "catalogId", "invoiceId", "createdByUserId",
        "serviceName", "deviceBrand", "deviceModel", "deviceSerial",
        "salePrice", "serviceCost", "notes", "deviceKept"
      ) VALUES (
        ${shopId}::uuid, ${customerId}::uuid, ${catalogId}::uuid, ${invoice.id}::uuid,
        ${createdByUserId}::uuid, ${serviceName}, ${nullableText(input.deviceBrand)},
        ${nullableText(input.deviceModel)}, ${nullableText(input.deviceSerial)}, ${salePrice},
        ${serviceCost}, ${nullableText(input.notes)}, ${Boolean(input.deviceKept)}
      )
      RETURNING "id"
    `;

    const softwareSale = rows[0];
    if (!softwareSale) throw new Error("تعذر حفظ خدمة السوفتوير.");

    const source = {
      sourceType: "INVOICE" as const,
      sourceId: invoice.id,
      sourceReference: invoice.invoiceNumber,
      customerId: customer?.id ?? null,
      customerName: customer?.name ?? null,
      customerPhone: customer?.phone ?? null,
    };

    const moneyEndpoints: Array<{
      destination: Exclude<MoneyAccountDestination, "OTHER">;
      walletId?: string;
      bankAccountId?: string;
    }> = [];
    if (paymentDestination !== "DEBT") {
      moneyEndpoints.push({ destination: paymentDestination, walletId: input.walletId, bankAccountId: input.bankAccountId });
    }
    if (changeAmount.gt(0)) {
      moneyEndpoints.push({ destination: changeDestination, walletId: input.changeWalletId, bankAccountId: input.changeBankAccountId });
    }
    if (serviceCost?.gt(0)) {
      moneyEndpoints.push({ destination: costDestination, walletId: costWalletId, bankAccountId: costBankAccountId });
    }
    if (moneyEndpoints.length) await moneyAccountService.lockMoneyAccountEndpointsTx(tx, shopId, moneyEndpoints);

    if (isDebtSale) {
      if (customer) {
        await sourceDebtService.createSourceDebtTx(tx, {
          shopId,
          customerId: customer.id,
          createdByUserId,
          amount: salePrice,
          sourceType: "SOFTWARE_SERVICE",
          sourceId: softwareSale.id,
          sourceReference: invoice.invoiceNumber,
          description: `خدمة سوفتوير آجلة: ${serviceName} — ${invoice.invoiceNumber}`,
        });
      }
    } else {
      const sourceName = await moneyAccountService.applyIncomingMoneyTx(tx, shopId, createdByUserId, {
        destination: paymentDestination,
        walletId: input.walletId,
        bankAccountId: input.bankAccountId,
        amount: amountReceived,
        reference: invoice.invoiceNumber,
        description: `تحصيل خدمة سوفتوير ${serviceName} — فاتورة ${invoice.invoiceNumber}`,
        drawerType: "INVOICE_PAYMENT",
        source,
      });
      if (changeAmount.gt(0)) {
        await moneyAccountService.applyOutgoingMoneyTx(tx, shopId, createdByUserId, {
          destination: changeDestination,
          walletId: input.changeWalletId,
          bankAccountId: input.changeBankAccountId,
          amount: changeAmount,
          reference: invoice.invoiceNumber,
          description: `إرجاع باقي خدمة سوفتوير ${serviceName} — فاتورة ${invoice.invoiceNumber}`,
          source,
        });
      }

      await tx.payment.create({
        data: {
          shopId,
          invoiceId: invoice.id,
          createdByUserId,
          method: paymentDestination === "DRAWER" ? PaymentMethod.CASH : paymentDestination === "BANK" ? PaymentMethod.BANK_TRANSFER : PaymentMethod.OTHER,
          sourceName: sourceName || (paymentDestination === "DRAWER" ? "الدرج النقدي" : paymentDestination === "BANK" ? "حساب بنكي" : "محفظة إلكترونية"),
          amount: salePrice,
          reference: invoice.invoiceNumber,
          note: `تحصيل مباشر عند بيع خدمة سوفتوير: ${serviceName}`,
        },
      });
      await tx.invoice.update({
        where: { id: invoice.id },
        data: {
          status: InvoiceStatus.PAID,
          amountPaid: salePrice,
          balanceDue: new Prisma.Decimal(0),
          paidAt: new Date(),
          version: { increment: 1 },
        },
      });
    }

    if (serviceCost?.gt(0)) {
      await moneyAccountService.applyOutgoingMoneyTx(tx, shopId, createdByUserId, {
        destination: costDestination,
        walletId: costWalletId,
        bankAccountId: costBankAccountId,
        amount: serviceCost,
        reference: invoice.invoiceNumber,
        description: `دفع تكلفة خدمة سوفتوير ${serviceName} — فاتورة ${invoice.invoiceNumber}`,
        movementType: "SOFTWARE_SERVICE_COST",
        contextLabel: "تكلفة خدمة السوفتوير",
        source,
      });
    }

    return { id: softwareSale.id, invoiceId: invoice.id };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 15_000 });
}

export async function markDeviceDelivered(shopId: string, id: string) {
  await ensureTables();
  const updated = await prisma.$executeRaw`
    UPDATE "SoftwareServiceSale"
    SET "deliveredAt" = NOW(), "updatedAt" = NOW()
    WHERE "shopId" = ${shopId}::uuid
      AND "id" = ${id}::uuid
      AND "deletedAt" IS NULL
      AND "deviceKept" = TRUE
      AND "deliveredAt" IS NULL
  `;
  if (!updated) throw new Error("لم يتم العثور على جهاز بانتظار التسليم.");
}

export async function getTodaySalesTotal(shopId: string) {
  await ensureTables();
  const rows = await prisma.$queryRaw<Array<{ total: Prisma.Decimal | number | string }>>`
    SELECT COALESCE(SUM(i."total"), 0) AS total
    FROM "SoftwareServiceSale" s
    JOIN "Invoice" i ON i."id" = s."invoiceId"
    WHERE s."shopId" = ${shopId}::uuid
      AND s."deletedAt" IS NULL
      AND i."deletedAt" IS NULL
      AND i."status" <> 'VOID'
      AND s."soldAt" >= date_trunc('day', NOW())
      AND s."soldAt" < date_trunc('day', NOW()) + interval '1 day'
  `;
  return Number(rows[0]?.total ?? 0);
}

export async function getFinancialRows(shopId: string, start: Date, end: Date) {
  await ensureTables();
  return prisma.$queryRaw<Array<{
    invoiceId: string;
    invoiceTotal: Prisma.Decimal;
    invoiceStatus: InvoiceStatus;
    serviceCost: Prisma.Decimal | null;
  }>>`
    SELECT
      s."invoiceId",
      i."total" AS "invoiceTotal",
      i."status" AS "invoiceStatus",
      s."serviceCost"
    FROM "SoftwareServiceSale" s
    JOIN "Invoice" i ON i."id" = s."invoiceId"
    WHERE s."shopId" = ${shopId}::uuid
      AND s."deletedAt" IS NULL
      AND i."deletedAt" IS NULL
      AND s."soldAt" >= ${start}
      AND s."soldAt" < ${end}
  `;
}

export const softwareServiceService = {
  listCatalog,
  createCatalogItem,
  listSales,
  getSaleById,
  getSaleByInvoiceId,
  createSale,
  markDeviceDelivered,
  getTodaySalesTotal,
  getFinancialRows,
};
