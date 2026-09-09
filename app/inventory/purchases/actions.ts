"use server";

import { PaymentMethod } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requirePermission } from "@/lib/auth/context";
import { supplierService } from "@/lib/services/supplierService";
import { purchaseReceivingService, type PurchaseDraftInput } from "@/lib/services/purchaseReceivingService";
import { purchaseDocumentImportService } from "@/lib/services/purchaseDocumentImportService";

const uuid = z.string().uuid("معرّف غير صالح");
const moneyString = z.union([z.string(), z.number()]).transform(String);
const lineSchema = z.object({
  id: z.string().uuid().optional(),
  inventoryItemId: z.string().uuid().nullable().optional(),
  newItemName: z.string().max(180).nullable().optional(),
  newItemSku: z.string().max(120).nullable().optional(),
  newItemBarcode: z.string().max(160).nullable().optional(),
  newItemCategoryId: z.string().uuid().nullable().optional(),
  newItemCategory: z.string().max(120).nullable().optional(),
  newItemDescription: z.string().max(1000).nullable().optional(),
  importedSourceText: z.string().max(4000).nullable().optional(),
  importSourceId: z.string().uuid().nullable().optional(),
  importRowKey: z.string().max(120).nullable().optional(),
  importedPurchaseUnit: z.string().max(80).nullable().optional(),
  matchReviewRequired: z.boolean().optional(),
  compatibilityGroupIds: z.array(z.string().uuid()).max(5).optional(),
  compatibilityReviewNeeded: z.boolean().optional(),
  updateSalePrice: z.boolean().optional(),
  quantity: z.number().int().positive(),
  unitCost: moneyString,
  manualExtraCostAllocation: z.union([moneyString, z.null()]).optional(),
  salePrice: z.union([moneyString, z.null()]).optional(),
});
const draftSchema = z.object({
  id: z.string().uuid().nullable().optional(),
  expectedVersion: z.number().int().positive().nullable().optional(),
  supplierId: z.string().uuid().nullable().optional(),
  supplierNameSnapshot: z.string().max(180).nullable().optional(),
  supplierInvoiceNumber: z.string().max(120).nullable().optional(),
  invoiceDate: z.union([z.string(), z.date()]),
  notes: z.string().max(2000).nullable().optional(),
  discountTotal: moneyString.optional(),
  extraCostsTotal: moneyString.optional(),
  amountPaid: moneyString.optional(),
  paymentAccountType: z.enum(["DRAWER", "WALLET", "BANK", "OTHER"]).nullable().optional(),
  paymentWalletId: z.string().uuid().nullable().optional(),
  paymentBankAccountId: z.string().uuid().nullable().optional(),
  paymentMethod: z.nativeEnum(PaymentMethod).nullable().optional(),
  paymentSourceName: z.string().max(180).nullable().optional(),
  paymentReference: z.string().max(180).nullable().optional(),
  lines: z.array(lineSchema).max(250),
});

const importMatchRowSchema = z.object({
  rowIndex: z.number().int().positive(),
  sourceText: z.string().max(4000),
  name: z.string().max(180).nullable().optional(),
  barcode: z.string().max(160).nullable().optional(),
});

function failure(error: unknown) {
  if (error instanceof z.ZodError) return { ok: false as const, error: error.issues[0]?.message || "تحقق من بيانات الفاتورة." };
  return { ok: false as const, error: error instanceof Error ? error.message : "تعذر تنفيذ العملية." };
}

function serializeInventoryItem<T extends {
  unitCost: { toString(): string } | null;
  unitPrice: { toString(): string };
  lastPurchaseCost: { toString(): string } | null;
  lastPurchaseAt: Date | null;
}>(row: T): Omit<T, "unitCost" | "unitPrice" | "lastPurchaseCost" | "lastPurchaseAt"> & {
  unitCost: string | null; unitPrice: string; lastPurchaseCost: string | null; lastPurchaseAt: string | null;
} {
  return {
    ...row,
    unitCost: row.unitCost?.toString() ?? null,
    unitPrice: row.unitPrice.toString(),
    lastPurchaseCost: row.lastPurchaseCost?.toString() ?? null,
    lastPurchaseAt: row.lastPurchaseAt?.toISOString() ?? null,
  };
}

export async function searchPurchaseInventoryAction(query: string) {
  const auth = await requirePermission("inventory:read");
  const q = z.string().trim().max(160).parse(query);
  if (q.length < 1) return [];
  const rows = await purchaseReceivingService.searchInventory(auth.shop.id, q);
  return rows.map(serializeInventoryItem);
}

export async function lookupPurchaseBarcodeAction(code: string) {
  try {
    const auth = await requirePermission("inventory:read");
    const parsed = z.string().trim().min(1, "الباركود فارغ").max(160).parse(code);
    const result = await purchaseReceivingService.lookupInventoryByIdentifier(auth.shop.id, parsed);
    return {
      ok: true as const,
      ...result,
      item: result.item ? serializeInventoryItem(result.item) : null,
      candidates: result.candidates.map(serializeInventoryItem),
    };
  } catch (error) {
    return failure(error);
  }
}

export async function matchImportedPurchaseRowsAction(rawRows: Array<{
  rowIndex: number;
  sourceText: string;
  name?: string | null;
  barcode?: string | null;
}>) {
  try {
    const auth = await requirePermission("inventory:read");
    const rows = z.array(importMatchRowSchema).min(1).max(250).parse(rawRows);
    const matches = await purchaseReceivingService.matchImportedRows(auth.shop.id, rows);
    return {
      ok: true as const,
      matches: matches.map((match) => ({
        rowIndex: match.rowIndex,
        resolution: match.resolution,
        candidates: match.enrichedCandidates.map(serializeInventoryItem),
      })),
    };
  } catch (error) {
    return failure(error);
  }
}

export async function suggestPurchaseItemMetadataAction(text: string) {
  try {
    const auth = await requirePermission("inventory:read");
    const query = z.string().trim().min(2).max(180).parse(text);
    const result = await purchaseReceivingService.suggestNewItemMetadata(auth.shop.id, query);
    return { ok: true as const, ...result };
  } catch (error) {
    return failure(error);
  }
}

export async function savePurchaseDraftAction(raw: PurchaseDraftInput) {
  try {
    const auth = await requirePermission("inventory:manage");
    const input = draftSchema.parse(raw) as PurchaseDraftInput;
    const saved = await purchaseReceivingService.saveDraft(auth.shop.id, auth.user.id, auth.shop.currency, input);
    const duplicate = await purchaseReceivingService.findDuplicateSupplierInvoice(
      auth.shop.id,
      input.supplierId,
      input.supplierInvoiceNumber,
      saved.id,
    );
    revalidatePath("/inventory");
    revalidatePath("/inventory/purchases");
    revalidatePath(`/inventory/purchases/${saved.id}`);
    return {
      ok: true as const,
      id: saved.id,
      updatedAt: saved.updatedAt.toISOString(),
      version: saved.version,
      duplicate: duplicate ? { id: duplicate.id, status: duplicate.status, invoiceDate: duplicate.invoiceDate.toISOString() } : null,
    };
  } catch (error) {
    return failure(error);
  }
}

export async function deletePurchaseDraftAction(purchaseId: string) {
  try {
    const auth = await requirePermission("inventory:manage");
    const id = uuid.parse(purchaseId);
    await purchaseReceivingService.deleteDraft(auth.shop.id, id);
    revalidatePath("/inventory/purchases");
    return { ok: true as const };
  } catch (error) {
    return failure(error);
  }
}

export async function quickCreatePurchaseSupplierAction(input: { name: string; phone?: string }) {
  try {
    const auth = await requirePermission("inventory:manage");
    if (!auth.permissions.includes("suppliers:manage")) throw new Error("لا تملك صلاحية إنشاء مورد.");
    const parsed = z.object({ name: z.string().trim().min(1, "اسم المورد مطلوب").max(180), phone: z.string().trim().max(60).optional() }).parse(input);
    const supplier = await supplierService.createSupplier(auth.shop.id, parsed);
    revalidatePath("/suppliers");
  revalidatePath("/suppliers/[id]", "page");
    revalidatePath("/inventory/purchases");
    return { ok: true as const, supplier: { id: supplier.id, name: supplier.name, phone: supplier.phone } };
  } catch (error) {
    return failure(error);
  }
}

export async function postPurchaseInvoiceAction(input: {
  purchaseId: string;
  postingKey: string;
  receiptMode?: "FULL" | "PARTIAL";
  initialReceipt?: Array<{ sortOrder: number; quantity: number }>;
}) {
  try {
    const auth = await requirePermission("inventory:manage");
    const parsed = z.object({
      purchaseId: uuid,
      postingKey: z.string().trim().min(12).max(80),
      receiptMode: z.enum(["FULL", "PARTIAL"]).optional(),
      initialReceipt: z.array(z.object({ sortOrder: z.number().int().nonnegative(), quantity: z.number().int().nonnegative() })).max(250).optional(),
    }).parse(input);
    const result = await purchaseReceivingService.postPurchaseInvoice(
      auth.shop.id,
      auth.user.id,
      parsed.purchaseId,
      parsed.postingKey,
      { receiptMode: parsed.receiptMode, initialReceipt: parsed.initialReceipt },
    );
    revalidatePurchasePaths(parsed.purchaseId);
    revalidatePath("/inventory/purchases/pending-compatibility");
    return { ok: true as const, id: result.id, alreadyPosted: result.alreadyPosted };
  } catch (error) {
    return failure(error);
  }
}

function revalidatePurchasePaths(purchaseId: string) {
  revalidatePath("/inventory");
  revalidatePath("/inventory/purchases");
  revalidatePath(`/inventory/purchases/${purchaseId}`);
  revalidatePath("/suppliers");
  revalidatePath("/suppliers/[id]", "page");
  revalidatePath("/cash-drawer");
  revalidatePath("/bank-accounts");
  revalidatePath("/financial-transfers");
  revalidatePath("/reports");
}

const operationLineSchema = z.object({ purchaseItemId: uuid, quantity: z.number().int().positive() });
const operationDateSchema = z.union([z.string().min(1), z.date()]);
const accountTypeSchema = z.enum(["DRAWER", "WALLET", "BANK", "OTHER"]);

export async function recordPurchaseReceiptAction(input: {
  purchaseId: string;
  requestKey: string;
  receivedAt: string;
  reference?: string | null;
  note?: string | null;
  lines: Array<{ purchaseItemId: string; quantity: number }>;
}) {
  try {
    const auth = await requirePermission("inventory:manage");
    const parsed = z.object({
      purchaseId: uuid,
      requestKey: z.string().trim().min(12).max(120),
      receivedAt: operationDateSchema,
      reference: z.string().trim().max(180).nullable().optional(),
      note: z.string().trim().max(1000).nullable().optional(),
      lines: z.array(operationLineSchema).min(1).max(250),
    }).parse(input);
    const result = await purchaseReceivingService.recordPurchaseReceipt(auth.shop.id, auth.user.id, parsed.purchaseId, parsed);
    revalidatePurchasePaths(parsed.purchaseId);
    return { ok: true as const, id: result.id, alreadyApplied: result.alreadyApplied };
  } catch (error) {
    return failure(error);
  }
}

export async function recordPurchasePaymentAction(input: {
  purchaseId: string;
  requestKey: string;
  amount: string;
  method: PaymentMethod;
  sourceName?: string | null;
  reference?: string | null;
  paidAt: string;
  accountType: "DRAWER" | "WALLET" | "BANK" | "OTHER";
  walletId?: string | null;
  bankAccountId?: string | null;
}) {
  try {
    const auth = await requirePermission("inventory:manage");
    const parsed = z.object({
      purchaseId: uuid,
      requestKey: z.string().trim().min(12).max(120),
      amount: moneyString,
      method: z.nativeEnum(PaymentMethod),
      sourceName: z.string().trim().max(180).nullable().optional(),
      reference: z.string().trim().max(180).nullable().optional(),
      paidAt: operationDateSchema,
      accountType: accountTypeSchema,
      walletId: z.string().uuid().nullable().optional(),
      bankAccountId: z.string().uuid().nullable().optional(),
    }).parse(input);
    const result = await purchaseReceivingService.recordPurchasePayment(auth.shop.id, auth.user.id, parsed.purchaseId, parsed);
    revalidatePurchasePaths(parsed.purchaseId);
    return { ok: true as const, id: result.id, alreadyApplied: result.alreadyApplied };
  } catch (error) {
    return failure(error);
  }
}

export async function recordSupplierReturnAction(input: {
  purchaseId: string;
  requestKey: string;
  reason: string;
  reference?: string | null;
  returnedAt: string;
  lines: Array<{ purchaseItemId: string; quantity: number }>;
  shippingRefundAmount?: string | null;
  settlementAdjustmentAmount?: string | null;
  settlementAdjustmentReason?: string | null;
}) {
  try {
    const auth = await requirePermission("inventory:manage");
    const parsed = z.object({
      purchaseId: uuid,
      requestKey: z.string().trim().min(12).max(120),
      reason: z.string().trim().min(2, "سبب المرتجع مطلوب").max(1000),
      reference: z.string().trim().max(180).nullable().optional(),
      returnedAt: operationDateSchema,
      lines: z.array(operationLineSchema).min(1).max(250),
      shippingRefundAmount: z.union([moneyString, z.null()]).optional(),
      settlementAdjustmentAmount: z.union([moneyString, z.null()]).optional(),
      settlementAdjustmentReason: z.string().trim().max(1000).nullable().optional(),
    }).parse(input);
    const hasFinancialAdjustment = Number(parsed.shippingRefundAmount ?? 0) !== 0 || Number(parsed.settlementAdjustmentAmount ?? 0) !== 0;
    if (hasFinancialAdjustment && !auth.permissions.includes("expenses:manage")) throw new Error("لا تملك صلاحية تعديل القيمة المالية المعتمدة للمرتجع.");
    const result = await purchaseReceivingService.recordSupplierReturn(auth.shop.id, auth.user.id, parsed.purchaseId, { ...parsed, allowFinancialAdjustment: hasFinancialAdjustment && auth.permissions.includes("expenses:manage") });
    revalidatePurchasePaths(parsed.purchaseId);
    return { ok: true as const, id: result.id, alreadyApplied: result.alreadyApplied, totalValue: result.totalValue?.toString() ?? null };
  } catch (error) {
    return failure(error);
  }
}

export async function settleSupplierReturnAction(input: {
  purchaseId: string;
  supplierReturnId: string;
  requestKey: string;
  type: "PAYABLE_REDUCTION" | "SUPPLIER_CREDIT" | "REFUND";
  amount: string;
  settledAt: string;
  accountType?: "DRAWER" | "WALLET" | "BANK" | "OTHER" | null;
  walletId?: string | null;
  bankAccountId?: string | null;
  sourceName?: string | null;
  reference?: string | null;
  note?: string | null;
}) {
  try {
    const auth = await requirePermission("inventory:manage");
    const parsed = z.object({
      purchaseId: uuid,
      supplierReturnId: uuid,
      requestKey: z.string().trim().min(12).max(120),
      type: z.enum(["PAYABLE_REDUCTION", "SUPPLIER_CREDIT", "REFUND"]),
      amount: moneyString,
      settledAt: operationDateSchema,
      accountType: accountTypeSchema.nullable().optional(),
      walletId: z.string().uuid().nullable().optional(),
      bankAccountId: z.string().uuid().nullable().optional(),
      sourceName: z.string().trim().max(180).nullable().optional(),
      reference: z.string().trim().max(180).nullable().optional(),
      note: z.string().trim().max(1000).nullable().optional(),
    }).parse(input);
    const result = await purchaseReceivingService.settleSupplierReturn(auth.shop.id, auth.user.id, parsed.supplierReturnId, parsed);
    revalidatePurchasePaths(parsed.purchaseId);
    return { ok: true as const, id: result.id, alreadyApplied: result.alreadyApplied };
  } catch (error) {
    return failure(error);
  }
}

export async function clonePurchaseToDraftAction(purchaseId: string) {
  try {
    const auth = await requirePermission("inventory:manage");
    const sourceId = uuid.parse(purchaseId);
    const result = await purchaseReceivingService.clonePurchaseToDraft(auth.shop.id, auth.user.id, auth.shop.currency, sourceId);
    revalidatePath("/inventory/purchases");
    return { ok: true as const, id: result.id };
  } catch (error) {
    return failure(error);
  }
}


export async function createPurchaseTextImportSourceAction(input: { purchaseId: string; text: string }) {
  try {
    const auth = await requirePermission("inventory:manage");
    const parsed = z.object({ purchaseId: uuid, text: z.string().trim().min(1).max(200_000) }).parse(input);
    const result = await purchaseDocumentImportService.createTextSource(auth.shop.id, auth.user.id, parsed.purchaseId, parsed.text);
    return { ok: true as const, sourceId: result.source.id, status: result.source.status, reused: result.reused };
  } catch (error) {
    return failure(error);
  }
}

export async function getPurchaseAiQuotaStatusAction() {
  try {
    const auth = await requirePermission("inventory:read");
    const quota = await purchaseDocumentImportService.getAiQuotaStatus(auth.shop.id, auth.user.id);
    return { ok: true as const, quota };
  } catch (error) {
    return failure(error);
  }
}

export async function extractPurchaseImportSourceAction(input: { sourceId: string; requestKey: string; forceReread?: boolean }) {
  try {
    const auth = await requirePermission("inventory:manage");
    const parsed = z.object({
      sourceId: uuid,
      requestKey: z.string().trim().min(12).max(120),
      forceReread: z.boolean().optional(),
    }).parse(input);
    const result = await purchaseDocumentImportService.extractSource(auth.shop.id, auth.user.id, parsed.sourceId, parsed.requestKey, { forceReread: parsed.forceReread });
    return { ok: true as const, sourceId: result.source.id, status: result.source.status, reused: result.reused };
  } catch (error) {
    return failure(error);
  }
}

export async function reviewPurchaseImportSourceAction(sourceId: string) {
  try {
    const auth = await requirePermission("inventory:read");
    const id = uuid.parse(sourceId);
    const review = await purchaseDocumentImportService.reviewSource(auth.shop.id, id);
    return {
      ok: true as const,
      review: {
        ...review,
        source: {
          ...review.source,
          lastAttemptAt: review.source.lastAttemptAt?.toISOString() ?? null,
          createdAt: review.source.createdAt.toISOString(),
          updatedAt: review.source.updatedAt.toISOString(),
        },
        lines: review.lines.map((line) => ({
          ...line,
          item: line.item ? serializeInventoryItem(line.item) : null,
          candidates: line.candidates.map(serializeInventoryItem),
        })),
      },
    };
  } catch (error) {
    return failure(error);
  }
}

export async function confirmPurchaseSupplierAliasAction(input: {
  supplierId: string;
  inventoryItemId: string;
  aliasText: string;
  sourceBarcode?: string | null;
}) {
  try {
    const auth = await requirePermission("inventory:manage");
    const parsed = z.object({
      supplierId: uuid,
      inventoryItemId: uuid,
      aliasText: z.string().trim().min(2).max(500),
      sourceBarcode: z.string().trim().max(160).nullable().optional(),
    }).parse(input);
    const alias = await purchaseDocumentImportService.confirmSupplierItemAlias({ shopId: auth.shop.id, userId: auth.user.id, ...parsed });
    return { ok: true as const, id: alias?.id ?? null };
  } catch (error) {
    return failure(error);
  }
}

export async function removePurchaseSupplierAliasAction(input: { supplierId: string; aliasId: string }) {
  try {
    const auth = await requirePermission("inventory:manage");
    const parsed = z.object({ supplierId: uuid, aliasId: uuid }).parse(input);
    await purchaseDocumentImportService.removeSupplierItemAlias(auth.shop.id, parsed.supplierId, parsed.aliasId);
    return { ok: true as const };
  } catch (error) {
    return failure(error);
  }
}
