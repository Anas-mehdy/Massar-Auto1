import { PaymentMethod, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requestFingerprint } from "@/lib/idempotency";
import { cashDrawerService } from "@/lib/services/cashDrawerService";
import { financialTransferService } from "@/lib/services/financialTransferService";

export type SupplierLedgerEntryType = "OPENING_BALANCE" | "PAYMENT" | "ADJUSTMENT_DEBIT" | "ADJUSTMENT_CREDIT";
export type SupplierPaymentAccountType = "DRAWER" | "WALLET";

export type SupplierLedgerEvent = {
  id: string;
  kind: SupplierLedgerEntryType | "PURCHASE_INVOICE" | "PURCHASE_PAYMENT" | "PAYABLE_REDUCTION" | "SUPPLIER_CREDIT";
  label: string;
  amount: number;
  signedAmount: number;
  balanceAfter: number;
  occurredAt: Date;
  dueAt: Date | null;
  description: string | null;
  reference: string | null;
  sourceName: string | null;
  href: string | null;
  createdByName: string | null;
};

export type SupplierLedgerSnapshot = {
  manualOutstanding: number;
  purchaseOutstanding: number;
  supplierCredit: number;
  totalPayable: number;
  netBalance: number;
  events: SupplierLedgerEvent[];
};

type ManualEntryRow = {
  id: string;
  type: SupplierLedgerEntryType;
  amount: Prisma.Decimal;
  manualAppliedAmount: Prisma.Decimal;
  occurredAt: Date;
  dueAt: Date | null;
  description: string | null;
  reference: string | null;
  accountType: SupplierPaymentAccountType | null;
  sourceName: string | null;
  createdByName: string | null;
};

function decimal(value: string | number | Prisma.Decimal) {
  const result = new Prisma.Decimal(String(value).replace(",", ".")).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
  if (!result.isFinite()) throw new Error("قيمة مالية غير صالحة.");
  return result;
}

function positiveMoney(value: string | number | Prisma.Decimal) {
  const amount = decimal(value);
  if (amount.lte(0)) throw new Error("المبلغ يجب أن يكون أكبر من صفر.");
  return amount;
}

function nullableText(value?: string | null) {
  const text = value?.trim();
  return text ? text : null;
}

function safeDate(value: string | Date, label: string) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error(`${label} غير صالح.`);
  return date;
}

function assertRequestKey(value: string) {
  const key = value.trim();
  if (key.length < 12 || key.length > 120) throw new Error("مفتاح العملية غير صالح. أعد المحاولة.");
  return key;
}

async function ensureSupplier(tx: Prisma.TransactionClient, shopId: string, supplierId: string, lock = false) {
  const suffix = lock ? Prisma.sql`FOR UPDATE` : Prisma.empty;
  const rows = await tx.$queryRaw<Array<{ id: string; name: string }>>(Prisma.sql`
    SELECT "id", "name" FROM "Supplier"
    WHERE "id"=${supplierId}::uuid AND "shopId"=${shopId}::uuid AND "deletedAt" IS NULL
    ${suffix}
  `);
  if (!rows[0]) throw new Error("المورد غير موجود في هذا المتجر.");
  return rows[0];
}

async function manualOutstandingTx(tx: Prisma.TransactionClient, shopId: string, supplierId: string) {
  const rows = await tx.$queryRaw<Array<{ balance: Prisma.Decimal }>>`
    SELECT COALESCE(SUM(CASE
      WHEN "status" <> 'ACTIVE' THEN 0
      WHEN "type" IN ('OPENING_BALANCE','ADJUSTMENT_DEBIT') THEN "amount"
      WHEN "type" = 'PAYMENT' THEN -"manualAppliedAmount"
      WHEN "type" = 'ADJUSTMENT_CREDIT' THEN -"amount"
      ELSE 0 END), 0) AS "balance"
    FROM "SupplierLedgerEntry"
    WHERE "shopId"=${shopId}::uuid AND "supplierId"=${supplierId}::uuid
  `;
  return Prisma.Decimal.max(rows[0]?.balance ?? new Prisma.Decimal(0), new Prisma.Decimal(0));
}

export async function getSupplierLedger(shopId: string, supplierId: string): Promise<SupplierLedgerSnapshot> {
  const supplier = await prisma.supplier.findFirst({ where: { id: supplierId, shopId, deletedAt: null }, select: { id: true } });
  if (!supplier) throw new Error("المورد غير موجود.");

  const [manualRows, purchaseRows, paymentRows, settlementRows, summaryRows] = await Promise.all([
    prisma.$queryRaw<ManualEntryRow[]>`
      SELECT e."id", e."type", e."amount", e."manualAppliedAmount", e."occurredAt", e."dueAt",
        e."description", e."reference", e."accountType", e."sourceName", u."name" AS "createdByName"
      FROM "SupplierLedgerEntry" e
      LEFT JOIN "User" u ON u."id"=e."createdByUserId"
      WHERE e."shopId"=${shopId}::uuid AND e."supplierId"=${supplierId}::uuid AND e."status"='ACTIVE'
      ORDER BY e."occurredAt" ASC, e."createdAt" ASC, e."id" ASC
    `,
    prisma.$queryRaw<Array<{ id: string; supplierInvoiceNumber: string | null; total: Prisma.Decimal; invoiceDate: Date; postedAt: Date | null }>>`
      SELECT "id", "supplierInvoiceNumber", "total", "invoiceDate", "postedAt"
      FROM "PurchaseInvoice"
      WHERE "shopId"=${shopId}::uuid AND "supplierId"=${supplierId}::uuid AND "status"='POSTED' AND "deletedAt" IS NULL
      ORDER BY "invoiceDate" ASC, "id" ASC
    `,
    prisma.$queryRaw<Array<{ id: string; purchaseInvoiceId: string; amount: Prisma.Decimal; paidAt: Date; sourceName: string | null; reference: string | null; note: string | null; createdByName: string | null; invoiceNumber: string | null }>>`
      SELECT pp."id", pp."purchaseInvoiceId", pp."amount", pp."paidAt", pp."sourceName", pp."reference", pp."note",
        u."name" AS "createdByName", p."supplierInvoiceNumber" AS "invoiceNumber"
      FROM "PurchasePayment" pp
      JOIN "PurchaseInvoice" p ON p."id"=pp."purchaseInvoiceId" AND p."shopId"=${shopId}::uuid
      LEFT JOIN "User" u ON u."id"=pp."createdByUserId"
      WHERE pp."shopId"=${shopId}::uuid AND p."supplierId"=${supplierId}::uuid
        AND COALESCE(pp."note", '') NOT LIKE '%[SUPPLIER-LEDGER:%'
      ORDER BY pp."paidAt" ASC, pp."id" ASC
    `,
    prisma.$queryRaw<Array<{ id: string; type: "PAYABLE_REDUCTION" | "SUPPLIER_CREDIT"; amount: Prisma.Decimal; settledAt: Date; reference: string | null; createdByName: string | null; purchaseInvoiceId: string; invoiceNumber: string | null }>>`
      SELECT srs."id", srs."type", srs."amount", srs."settledAt", srs."reference", u."name" AS "createdByName",
        sr."purchaseInvoiceId", p."supplierInvoiceNumber" AS "invoiceNumber"
      FROM "SupplierReturnSettlement" srs
      JOIN "SupplierReturn" sr ON sr."id"=srs."supplierReturnId" AND sr."shopId"=${shopId}::uuid
      JOIN "PurchaseInvoice" p ON p."id"=sr."purchaseInvoiceId" AND p."shopId"=${shopId}::uuid
      LEFT JOIN "User" u ON u."id"=srs."createdByUserId"
      WHERE srs."shopId"=${shopId}::uuid AND srs."supplierId"=${supplierId}::uuid
        AND srs."type" IN ('PAYABLE_REDUCTION','SUPPLIER_CREDIT')
      ORDER BY srs."settledAt" ASC, srs."id" ASC
    `,
    prisma.$queryRaw<Array<{ manualOutstanding: Prisma.Decimal; purchaseOutstanding: Prisma.Decimal; supplierCredit: Prisma.Decimal }>>`
      SELECT
        COALESCE((SELECT SUM(CASE
          WHEN e."status" <> 'ACTIVE' THEN 0
          WHEN e."type" IN ('OPENING_BALANCE','ADJUSTMENT_DEBIT') THEN e."amount"
          WHEN e."type"='PAYMENT' THEN -e."manualAppliedAmount"
          WHEN e."type"='ADJUSTMENT_CREDIT' THEN -e."amount"
          ELSE 0 END)
          FROM "SupplierLedgerEntry" e WHERE e."shopId"=${shopId}::uuid AND e."supplierId"=${supplierId}::uuid), 0) AS "manualOutstanding",
        COALESCE((SELECT SUM(p."balanceDue") FROM "PurchaseInvoice" p
          WHERE p."shopId"=${shopId}::uuid AND p."supplierId"=${supplierId}::uuid AND p."status"='POSTED' AND p."deletedAt" IS NULL), 0) AS "purchaseOutstanding",
        COALESCE((SELECT SUM(srs."amount") FROM "SupplierReturnSettlement" srs
          WHERE srs."shopId"=${shopId}::uuid AND srs."supplierId"=${supplierId}::uuid AND srs."type"='SUPPLIER_CREDIT'), 0) AS "supplierCredit"
    `,
  ]);

  const rawEvents: Omit<SupplierLedgerEvent, "balanceAfter">[] = [];
  for (const entry of manualRows) {
    const isDebit = entry.type === "OPENING_BALANCE" || entry.type === "ADJUSTMENT_DEBIT";
    const signedAmount = entry.type === "PAYMENT" ? -Number(entry.amount) : isDebit ? Number(entry.amount) : -Number(entry.amount);
    rawEvents.push({
      id: `manual:${entry.id}`, kind: entry.type,
      label: entry.type === "OPENING_BALANCE" ? "دين سابق / رصيد افتتاحي" : entry.type === "PAYMENT" ? "دفعة للمورد" : isDebit ? "زيادة على حساب المورد" : "تخفيض على حساب المورد",
      amount: Number(entry.amount), signedAmount, occurredAt: entry.occurredAt, dueAt: entry.dueAt,
      description: entry.description, reference: entry.reference, sourceName: entry.sourceName,
      href: null, createdByName: entry.createdByName,
    });
  }
  for (const invoice of purchaseRows) {
    rawEvents.push({
      id: `purchase:${invoice.id}`, kind: "PURCHASE_INVOICE", label: "فاتورة شراء", amount: Number(invoice.total), signedAmount: Number(invoice.total),
      occurredAt: invoice.postedAt ?? invoice.invoiceDate, dueAt: null, description: null, reference: invoice.supplierInvoiceNumber,
      sourceName: null, href: `/inventory/purchases/${invoice.id}`, createdByName: null,
    });
  }
  for (const payment of paymentRows) {
    rawEvents.push({
      id: `purchase-payment:${payment.id}`, kind: "PURCHASE_PAYMENT", label: "دفعة على فاتورة شراء", amount: Number(payment.amount), signedAmount: -Number(payment.amount),
      occurredAt: payment.paidAt, dueAt: null, description: payment.note, reference: payment.reference ?? payment.invoiceNumber,
      sourceName: payment.sourceName, href: `/inventory/purchases/${payment.purchaseInvoiceId}`, createdByName: payment.createdByName,
    });
  }
  for (const settlement of settlementRows) {
    rawEvents.push({
      id: `return-settlement:${settlement.id}`, kind: settlement.type,
      label: settlement.type === "PAYABLE_REDUCTION" ? "خصم من مستحق المورد بسبب مرتجع" : "رصيد لنا لدى المورد",
      amount: Number(settlement.amount), signedAmount: -Number(settlement.amount), occurredAt: settlement.settledAt, dueAt: null,
      description: null, reference: settlement.reference ?? settlement.invoiceNumber, sourceName: null,
      href: `/inventory/purchases/${settlement.purchaseInvoiceId}`, createdByName: settlement.createdByName,
    });
  }

  rawEvents.sort((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime() || a.id.localeCompare(b.id));
  let running = 0;
  const ascending = rawEvents.map((event) => {
    running = Math.round((running + event.signedAmount + Number.EPSILON) * 100) / 100;
    return { ...event, balanceAfter: running };
  });
  const summary = summaryRows[0];
  const manualOutstanding = Math.max(0, Number(summary?.manualOutstanding ?? 0));
  const purchaseOutstanding = Math.max(0, Number(summary?.purchaseOutstanding ?? 0));
  const supplierCredit = Math.max(0, Number(summary?.supplierCredit ?? 0));
  const totalPayable = Math.round((manualOutstanding + purchaseOutstanding + Number.EPSILON) * 100) / 100;
  const netBalance = Math.round((totalPayable - supplierCredit + Number.EPSILON) * 100) / 100;
  return { manualOutstanding, purchaseOutstanding, supplierCredit, totalPayable, netBalance, events: ascending.reverse() };
}

export async function createOpeningBalance(shopId: string, userId: string, supplierId: string, input: {
  requestKey: string; amount: string | number; occurredAt: string | Date; dueAt?: string | Date | null; description?: string | null; reference?: string | null;
}) {
  const requestKey = assertRequestKey(input.requestKey);
  const amount = positiveMoney(input.amount);
  const occurredAt = safeDate(input.occurredAt, "تاريخ الدين");
  const dueAt = input.dueAt ? safeDate(input.dueAt, "تاريخ الاستحقاق") : null;
  const fingerprint = requestFingerprint({ supplierId, amount: amount.toFixed(2), occurredAt: occurredAt.toISOString(), dueAt: dueAt?.toISOString() ?? null, description: nullableText(input.description), reference: nullableText(input.reference) });
  return prisma.$transaction(async (tx) => {
    await ensureSupplier(tx, shopId, supplierId, true);
    const prior = await tx.$queryRaw<Array<{ id: string; requestFingerprint: string | null }>>`
      SELECT "id", "requestFingerprint" FROM "SupplierLedgerEntry" WHERE "shopId"=${shopId}::uuid AND "requestKey"=${requestKey} LIMIT 1
    `;
    if (prior[0]) {
      if (prior[0].requestFingerprint !== fingerprint) throw new Error("مفتاح إعادة المحاولة مستخدم ببيانات مختلفة.");
      return { id: prior[0].id, alreadyApplied: true };
    }
    const rows = await tx.$queryRaw<Array<{ id: string }>>`
      INSERT INTO "SupplierLedgerEntry" ("shopId","supplierId","createdByUserId","type","amount","occurredAt","dueAt","description","reference","requestKey","requestFingerprint")
      VALUES (${shopId}::uuid,${supplierId}::uuid,${userId}::uuid,'OPENING_BALANCE',${amount},${occurredAt},${dueAt},${nullableText(input.description) ?? 'رصيد سابق قبل استخدام مسار'},${nullableText(input.reference)},${requestKey},${fingerprint}) RETURNING "id"
    `;
    return { id: rows[0].id, alreadyApplied: false };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 15_000 });
}

export async function recordSupplierPayment(shopId: string, userId: string, supplierId: string, input: {
  requestKey: string; amount: string | number; occurredAt: string | Date; accountType: SupplierPaymentAccountType; walletId?: string | null; description?: string | null; reference?: string | null;
}) {
  const requestKey = assertRequestKey(input.requestKey);
  const amount = positiveMoney(input.amount);
  const occurredAt = safeDate(input.occurredAt, "تاريخ الدفعة");
  const walletId = input.accountType === "WALLET" ? nullableText(input.walletId) : null;
  if (input.accountType === "WALLET" && !walletId) throw new Error("اختر المحفظة التي ستخرج منها الدفعة.");

  let sourceName = "الدرج النقدي";
  if (input.accountType === "DRAWER") {
    // Ensures the runtime-managed CashDrawer tables/row exist before entering the atomic payment transaction.
    await cashDrawerService.getSnapshot(shopId, 1);
  } else {
    // Ensures FinancialWallet / FinancialTransfer are present and validates the wallet belongs to this shop.
    const wallets = await financialTransferService.listWallets(shopId);
    const selectedWallet = wallets.find((wallet) => wallet.id === walletId);
    if (!selectedWallet) throw new Error("المحفظة المحددة غير موجودة أو غير نشطة.");
    sourceName = selectedWallet.name;
  }

  const fingerprint = requestFingerprint({ supplierId, amount: amount.toFixed(2), occurredAt: occurredAt.toISOString(), accountType: input.accountType, walletId, description: nullableText(input.description), reference: nullableText(input.reference) });
  return prisma.$transaction(async (tx) => {
    const supplier = await ensureSupplier(tx, shopId, supplierId, true);
    const prior = await tx.$queryRaw<Array<{ id: string; requestFingerprint: string | null }>>`
      SELECT "id", "requestFingerprint" FROM "SupplierLedgerEntry" WHERE "shopId"=${shopId}::uuid AND "requestKey"=${requestKey} LIMIT 1
    `;
    if (prior[0]) {
      if (prior[0].requestFingerprint !== fingerprint) throw new Error("مفتاح إعادة المحاولة مستخدم ببيانات مختلفة.");
      return { id: prior[0].id, alreadyApplied: true };
    }

    const manualOutstanding = await manualOutstandingTx(tx, shopId, supplierId);
    const invoiceRows = await tx.$queryRaw<Array<{ id: string; supplierInvoiceNumber: string | null; balanceDue: Prisma.Decimal }>>`
      SELECT "id", "supplierInvoiceNumber", "balanceDue" FROM "PurchaseInvoice"
      WHERE "shopId"=${shopId}::uuid AND "supplierId"=${supplierId}::uuid AND "status"='POSTED' AND "deletedAt" IS NULL AND "balanceDue">0
      ORDER BY "invoiceDate" ASC, "postedAt" ASC NULLS LAST, "id" ASC FOR UPDATE
    `;
    const purchaseOutstanding = invoiceRows.reduce((sum, row) => sum.add(row.balanceDue), new Prisma.Decimal(0));
    const payable = manualOutstanding.add(purchaseOutstanding);
    if (amount.gt(payable)) throw new Error(`الدفعة تتجاوز إجمالي المستحق للمورد (${payable.toFixed(2)}).`);

    const manualAppliedAmount = Prisma.Decimal.min(amount, manualOutstanding);
    const entryRows = await tx.$queryRaw<Array<{ id: string }>>`
      INSERT INTO "SupplierLedgerEntry" ("shopId","supplierId","createdByUserId","type","amount","manualAppliedAmount","occurredAt","description","reference","accountType","sourceName","walletId","requestKey","requestFingerprint")
      VALUES (${shopId}::uuid,${supplierId}::uuid,${userId}::uuid,'PAYMENT',${amount},${manualAppliedAmount},${occurredAt},${nullableText(input.description) ?? `دفعة للمورد ${supplier.name}`},${nullableText(input.reference)},${input.accountType},${sourceName},${walletId}::uuid,${requestKey},${fingerprint}) RETURNING "id"
    `;
    const entryId = entryRows[0].id;

    let remaining = amount.sub(manualAppliedAmount);
    let allocationIndex = 0;
    for (const invoice of invoiceRows) {
      if (remaining.lte(0)) break;
      const allocation = Prisma.Decimal.min(remaining, invoice.balanceDue);
      if (allocation.lte(0)) continue;
      const paymentKey = `${requestKey}:p${allocationIndex++}`;
      const paymentFingerprint = requestFingerprint({ supplierLedgerEntryId: entryId, purchaseId: invoice.id, amount: allocation.toFixed(2) });
      const method = input.accountType === "DRAWER" ? PaymentMethod.CASH : PaymentMethod.BANK_TRANSFER;
      await tx.$executeRaw`
        INSERT INTO "PurchasePayment" ("shopId","purchaseInvoiceId","createdByUserId","method","sourceName","amount","reference","note","paidAt","requestKey","requestFingerprint","accountType","walletId")
        VALUES (${shopId}::uuid,${invoice.id}::uuid,${userId}::uuid,${method},${sourceName},${allocation},${nullableText(input.reference)},${`دفعة من كشف حساب المورد [SUPPLIER-LEDGER:${entryId}]`},${occurredAt},${paymentKey},${paymentFingerprint},${input.accountType},${walletId}::uuid)
      `;
      await tx.$executeRaw`
        UPDATE "PurchaseInvoice" SET "amountPaid"="amountPaid"+${allocation}, "balanceDue"="balanceDue"-${allocation}, "updatedAt"=NOW(), "version"="version"+1
        WHERE "id"=${invoice.id}::uuid AND "shopId"=${shopId}::uuid
      `;
      remaining = remaining.sub(allocation);
    }
    if (remaining.gt(0.005)) throw new Error("تعذر توزيع كامل الدفعة على حساب المورد.");

    if (input.accountType === "DRAWER") {
      const drawers = await tx.$queryRaw<Array<{ id: string; currentBalance: Prisma.Decimal }>>`
        SELECT "id","currentBalance" FROM "CashDrawer" WHERE "shopId"=${shopId}::uuid FOR UPDATE
      `;
      const drawer = drawers[0];
      if (!drawer) throw new Error("الدرج النقدي غير مهيأ.");
      const next = drawer.currentBalance.sub(amount);
      if (next.lt(0)) throw new Error("رصيد الدرج النقدي غير كافٍ لدفع المورد.");
      await tx.$executeRaw`UPDATE "CashDrawer" SET "currentBalance"=${next}, "updatedAt"=NOW() WHERE "id"=${drawer.id}::uuid`;
      const movementRows = await tx.$queryRaw<Array<{ id: string }>>`
        INSERT INTO "CashDrawerMovement" ("shopId","drawerId","createdByUserId","type","direction","amount","description","reference","sourceType","sourceId","sourceReference","status","createdAt")
        VALUES (${shopId}::uuid,${drawer.id}::uuid,${userId}::uuid,'SUPPLIER_PAYMENT','OUT',${amount},${nullableText(input.description) ?? `دفعة للمورد ${supplier.name}`},${nullableText(input.reference)},'SUPPLIER',${supplierId},${supplier.name},'ACTIVE',${occurredAt}) RETURNING "id"
      `;
      await tx.$executeRaw`UPDATE "SupplierLedgerEntry" SET "cashDrawerMovementId"=${movementRows[0].id}::uuid, "updatedAt"=NOW() WHERE "id"=${entryId}::uuid`;
    } else {
      const wallets = await tx.$queryRaw<Array<{ id: string; name: string; currentBalance: Prisma.Decimal }>>`
        SELECT "id","name","currentBalance" FROM "FinancialWallet"
        WHERE "id"=${walletId}::uuid AND "shopId"=${shopId}::uuid AND "deletedAt" IS NULL AND "isActive"=TRUE FOR UPDATE
      `;
      const wallet = wallets[0];
      if (!wallet) throw new Error("المحفظة المحددة غير موجودة أو غير نشطة.");
      const next = wallet.currentBalance.sub(amount);
      if (next.lt(0)) throw new Error(`رصيد محفظة ${wallet.name} غير كافٍ لدفع المورد.`);
      await tx.$executeRaw`UPDATE "FinancialWallet" SET "currentBalance"=${next}, "updatedAt"=NOW() WHERE "id"=${wallet.id}::uuid`;
      const transferRows = await tx.$queryRaw<Array<{ id: string }>>`
        INSERT INTO "FinancialTransfer" ("shopId","walletId","createdByUserId","operationType","amount","walletAmount","commission","commissionMode","isDeferred","notes","sourceType","sourceId","sourceReference","status","createdAt","updatedAt")
        VALUES (${shopId}::uuid,${wallet.id}::uuid,${userId}::uuid,'WALLET_WITHDRAWAL',${amount},${amount},0,'NONE',FALSE,${`${nullableText(input.description) ?? `دفعة للمورد ${supplier.name}`} [SUPPLIER-LEDGER:${entryId}]`},'SUPPLIER',${supplierId},${supplier.name},'ACTIVE',${occurredAt},NOW()) RETURNING "id"
      `;
      await tx.$executeRaw`UPDATE "SupplierLedgerEntry" SET "financialTransferId"=${transferRows[0].id}::uuid, "sourceName"=${wallet.name}, "updatedAt"=NOW() WHERE "id"=${entryId}::uuid`;
    }
    return { id: entryId, alreadyApplied: false };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 20_000 });
}

export const supplierLedgerService = { getSupplierLedger, createOpeningBalance, recordSupplierPayment };
