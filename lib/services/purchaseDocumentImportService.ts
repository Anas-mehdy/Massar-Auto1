import { createHash, randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  PURCHASE_DOCUMENT_SCHEMA_VERSION,
  compareExtractedTotals,
  extractPurchaseFromPastedText,
  normalizeSupplierAlias,
  purchaseExtractedDocumentSchema,
  isPurchaseExtractedItemIncomplete,
  sourceRowIdentityFingerprint,
  validatePurchaseImportFile,
  type PurchaseExtractedDocument,
} from "@/lib/purchase-document-import";
import { purchaseReceivingService, type PurchaseInventorySearchItem } from "@/lib/services/purchaseReceivingService";
import { requestFingerprint } from "@/lib/idempotency";
import { dayUtcBoundsForTimeZone, localDateString, timeZoneForCountry } from "@/lib/timezone";
import {
  PurchaseAiProviderError,
  callOpenAiPurchaseExtractor,
  estimatePurchaseAiReservationUsd,
  getPurchaseAiModelName,
  getPurchaseOpenAiConfig,
  purchaseAiPricingForConfiguredModel,
} from "@/lib/purchase-openai";

export type PurchaseImportSourceType = "IMAGE" | "PDF" | "TEXT";
export type PurchaseImportSourceStatus = "UPLOADED" | "EXTRACTING" | "REVIEW_READY" | "FAILED";

export type PurchaseImportSourceRow = {
  id: string;
  purchaseInvoiceId: string;
  sourceType: PurchaseImportSourceType;
  fileName: string | null;
  mimeType: string | null;
  fileSize: number | null;
  pageCount: number | null;
  textContent: string | null;
  contentSha256: string;
  status: PurchaseImportSourceStatus;
  extractionProvider: string | null;
  extractedData: unknown;
  safeErrorCode: string | null;
  safeErrorMessage: string | null;
  attemptCount: number;
  lastAttemptAt: Date | null;
  activeExtractionAttemptId?: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type PurchaseDocumentReviewLine = {
  rowKey: string;
  originalText: string;
  name: string | null;
  barcode: string | null;
  quantity: number | null;
  purchaseUnit: string | null;
  unitCost: number | null;
  lineTotal: number | null;
  salePrice: number | null;
  unitAmbiguous: boolean;
  priceAmbiguous: boolean;
  quantityAmbiguous: boolean;
  notes: string[];
  reviewState: "existing" | "review" | "new" | "incomplete";
  matchReason: "barcode" | "sku" | "supplier-alias" | "name" | "identifier-duplicate" | "no-match" | "incomplete";
  item: PurchaseInventorySearchItem | null;
  candidates: PurchaseInventorySearchItem[];
  supplierAliasApplied: boolean;
};

export type PurchaseDocumentReview = {
  source: Omit<PurchaseImportSourceRow, "extractedData" | "textContent"> & { sourceText: string | null };
  document: PurchaseExtractedDocument;
  lines: PurchaseDocumentReviewLine[];
  totals: ReturnType<typeof compareExtractedTotals>;
  currentSupplierId: string | null;
  aliases: Array<{ id: string; aliasText: string; inventoryItemId: string; inventoryItemName: string; barcodeSnapshot: string | null }>;
};

function envInteger(name: string, fallback: number, min: number, max: number) {
  const parsed = Number.parseInt(process.env[name] ?? "", 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

export function getPurchaseImportLimits() {
  const maxFileMb = envInteger("PURCHASE_IMPORT_MAX_FILE_MB", 4, 1, 16);
  return {
    maxFileBytes: maxFileMb * 1024 * 1024,
    maxFileMb,
    maxPdfPages: envInteger("PURCHASE_IMPORT_MAX_PDF_PAGES", 3, 1, 3),
    maxTextChars: envInteger("PURCHASE_IMPORT_MAX_TEXT_CHARS", 40_000, 2_000, 200_000),
    extractingStaleMinutes: envInteger("PURCHASE_IMPORT_EXTRACTING_STALE_MINUTES", 5, 2, 30),
  };
}

function cleanFileName(value: string) {
  const cleaned = value.replace(/[\r\n\0]/g, " ").replace(/[\\/]+/g, "-").trim();
  return (cleaned || "invoice-source").slice(0, 240);
}

function sha256(bytes: Uint8Array | string) {
  return createHash("sha256").update(bytes).digest("hex");
}

async function assertDraft(shopId: string, purchaseInvoiceId: string) {
  const rows = await prisma.$queryRaw<Array<{ id: string; status: string; supplierId: string | null }>>(Prisma.sql`
    SELECT "id", "status", "supplierId"
    FROM "PurchaseInvoice"
    WHERE "id" = ${purchaseInvoiceId}::uuid AND "shopId" = ${shopId}::uuid AND "deletedAt" IS NULL
    LIMIT 1
  `);
  const draft = rows[0];
  if (!draft) throw new Error("مسودة فاتورة الشراء غير موجودة.");
  if (draft.status !== "DRAFT") throw new Error("لا يمكن إضافة أو قراءة مصدر لفاتورة معتمدة.");
  return draft;
}

async function findSourceByHash(shopId: string, purchaseInvoiceId: string, digest: string) {
  const rows = await prisma.$queryRaw<PurchaseImportSourceRow[]>(Prisma.sql`
    SELECT "id", "purchaseInvoiceId", "sourceType", "fileName", "mimeType", "fileSize", "pageCount", "textContent",
      "contentSha256", "status", "extractionProvider", "extractedData", "safeErrorCode", "safeErrorMessage",
      "attemptCount", "lastAttemptAt", "activeExtractionAttemptId", "createdAt", "updatedAt"
    FROM "PurchaseImportSource"
    WHERE "shopId" = ${shopId}::uuid AND "purchaseInvoiceId" = ${purchaseInvoiceId}::uuid
      AND "contentSha256" = ${digest} AND "extractionVersion" = ${PURCHASE_DOCUMENT_SCHEMA_VERSION}
    LIMIT 1
  `);
  return rows[0] ?? null;
}

export async function createTextSource(shopId: string, userId: string, purchaseInvoiceId: string, rawText: string) {
  await assertDraft(shopId, purchaseInvoiceId);
  const limits = getPurchaseImportLimits();
  const text = rawText.replace(/\r\n?/g, "\n").trim();
  if (!text) throw new Error("ألصق نص الفاتورة أو رسالة المورد أولاً.");
  if (text.length > limits.maxTextChars) throw new Error(`النص أطول من الحد المسموح (${limits.maxTextChars.toLocaleString("ar")} حرف).`);
  const digest = sha256(text);
  const existing = await findSourceByHash(shopId, purchaseInvoiceId, digest);
  if (existing) return { source: existing, reused: true };

  const extracted = purchaseExtractedDocumentSchema.parse(extractPurchaseFromPastedText(text));
  const rows = await prisma.$queryRaw<PurchaseImportSourceRow[]>(Prisma.sql`
    INSERT INTO "PurchaseImportSource" (
      "shopId", "purchaseInvoiceId", "createdByUserId", "sourceType", "textContent", "contentSha256",
      "status", "extractionVersion", "extractionProvider", "extractedData", "attemptCount", "lastAttemptAt"
    ) VALUES (
      ${shopId}::uuid, ${purchaseInvoiceId}::uuid, ${userId}::uuid, 'TEXT', ${text}, ${digest},
      'REVIEW_READY', ${PURCHASE_DOCUMENT_SCHEMA_VERSION}, 'deterministic-text-v1', ${JSON.stringify(extracted)}::jsonb, 1, NOW()
    )
    RETURNING "id", "purchaseInvoiceId", "sourceType", "fileName", "mimeType", "fileSize", "pageCount", "textContent",
      "contentSha256", "status", "extractionProvider", "extractedData", "safeErrorCode", "safeErrorMessage",
      "attemptCount", "lastAttemptAt", "activeExtractionAttemptId", "createdAt", "updatedAt"
  `);
  return { source: rows[0], reused: false };
}

export async function createFileSource(input: {
  shopId: string;
  userId: string;
  purchaseInvoiceId: string;
  fileName: string;
  declaredMimeType: string;
  bytes: Uint8Array;
}) {
  await assertDraft(input.shopId, input.purchaseInvoiceId);
  const limits = getPurchaseImportLimits();
  const validation = await validatePurchaseImportFile(input.bytes, input.declaredMimeType, {
    maxBytes: limits.maxFileBytes,
    maxPdfPages: limits.maxPdfPages,
  });
  if (!validation.ok || !validation.sourceType || !validation.mimeType || !validation.pageCount) {
    throw new Error(validation.error || "الملف غير صالح.");
  }
  const digest = sha256(input.bytes);
  const existing = await findSourceByHash(input.shopId, input.purchaseInvoiceId, digest);
  if (existing) return { source: existing, reused: true };

  const rows = await prisma.$queryRaw<PurchaseImportSourceRow[]>(Prisma.sql`
    INSERT INTO "PurchaseImportSource" (
      "shopId", "purchaseInvoiceId", "createdByUserId", "sourceType", "fileName", "mimeType", "fileSize", "pageCount",
      "fileData", "contentSha256", "status", "extractionVersion"
    ) VALUES (
      ${input.shopId}::uuid, ${input.purchaseInvoiceId}::uuid, ${input.userId}::uuid, ${validation.sourceType},
      ${cleanFileName(input.fileName)}, ${validation.mimeType}, ${input.bytes.byteLength}, ${validation.pageCount},
      ${Buffer.from(input.bytes)}, ${digest}, 'UPLOADED', ${PURCHASE_DOCUMENT_SCHEMA_VERSION}
    )
    RETURNING "id", "purchaseInvoiceId", "sourceType", "fileName", "mimeType", "fileSize", "pageCount", "textContent",
      "contentSha256", "status", "extractionProvider", "extractedData", "safeErrorCode", "safeErrorMessage",
      "attemptCount", "lastAttemptAt", "activeExtractionAttemptId", "createdAt", "updatedAt"
  `);
  return { source: rows[0], reused: false };
}

export async function getSource(shopId: string, sourceId: string) {
  const rows = await prisma.$queryRaw<PurchaseImportSourceRow[]>(Prisma.sql`
    SELECT "id", "purchaseInvoiceId", "sourceType", "fileName", "mimeType", "fileSize", "pageCount", "textContent",
      "contentSha256", "status", "extractionProvider", "extractedData", "safeErrorCode", "safeErrorMessage",
      "attemptCount", "lastAttemptAt", "activeExtractionAttemptId", "createdAt", "updatedAt"
    FROM "PurchaseImportSource"
    WHERE "id" = ${sourceId}::uuid AND "shopId" = ${shopId}::uuid
    LIMIT 1
  `);
  return rows[0] ?? null;
}

export async function getSourceFile(shopId: string, sourceId: string) {
  const rows = await prisma.$queryRaw<Array<{ id: string; sourceType: string; fileName: string | null; mimeType: string | null; fileData: Buffer }>>(Prisma.sql`
    SELECT "id", "sourceType", "fileName", "mimeType", "fileData"
    FROM "PurchaseImportSource"
    WHERE "id" = ${sourceId}::uuid AND "shopId" = ${shopId}::uuid AND "sourceType" IN ('IMAGE','PDF')
    LIMIT 1
  `);
  return rows[0] ?? null;
}

const OPENAI_ATTEMPT_PROVIDER = "openai-responses";
const PURCHASE_AI_USER_DAILY_LIMIT = 3;
const PURCHASE_AI_BUDGET_LOCK_A = 684221;
const PURCHASE_AI_BUDGET_LOCK_B = 41;

type PurchaseAiDayContext = {
  timeZone: string;
  usageDay: string;
  resetAt: Date;
};

export type PurchaseAiQuotaStatus = {
  configured: boolean;
  configError: string | null;
  model: string;
  timeZone: string;
  resetAt: string;
  user: { limit: number; used: number; remaining: number };
  shop: { limit: number; used: number; remaining: number };
  failedAttempts: {
    userLimit: number;
    userUsed: number;
    userRemaining: number;
    shopLimit: number;
    shopUsed: number;
    shopRemaining: number;
  };
  budget: { limitUsd: number; committedUsd: number; remainingUsd: number };
};

function envNonNegativeNumber(name: string, fallback: number, max: number) {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 0) return fallback;
  return Math.min(max, parsed);
}

function getAiGuardConfig() {
  return {
    userDailyLimit: PURCHASE_AI_USER_DAILY_LIMIT,
    shopDailyLimit: envInteger("PURCHASE_AI_SHOP_DAILY_LIMIT", 6, 1, 500),
    failedUserDailyLimit: envInteger("PURCHASE_AI_FAILED_ATTEMPTS_PER_USER_DAY", 3, 1, 50),
    failedShopDailyLimit: envInteger("PURCHASE_AI_FAILED_ATTEMPTS_PER_SHOP_DAY", 12, 1, 500),
    featureBudgetUsd: envNonNegativeNumber("PURCHASE_AI_FEATURE_BUDGET_USD", 5, 10_000),
  };
}

async function purchaseAiDayContext(shopId: string, now = new Date()): Promise<PurchaseAiDayContext> {
  const rows = await prisma.$queryRaw<Array<{ countryCode: string | null }>>(Prisma.sql`
    SELECT "countryCode" FROM "Shop"
    WHERE "id"=${shopId}::uuid AND "deletedAt" IS NULL
    LIMIT 1
  `);
  if (!rows[0]) throw new Error("المتجر غير موجود.");
  const timeZone = timeZoneForCountry(rows[0].countryCode?.trim().toUpperCase() || null) || "UTC";
  return {
    timeZone,
    usageDay: localDateString(now, timeZone),
    resetAt: dayUtcBoundsForTimeZone(now, timeZone).end,
  };
}

function numberFromDb(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

async function aiUsageSnapshot(shopId: string, userId: string, day: PurchaseAiDayContext) {
  const rows = await prisma.$queryRaw<Array<{
    userUsed: bigint | number;
    shopUsed: bigint | number;
    userFailed: bigint | number;
    shopFailed: bigint | number;
    budgetCommittedUsd: Prisma.Decimal | number | string | null;
  }>>(Prisma.sql`
    SELECT
      (SELECT COUNT(*)::bigint FROM "PurchaseImportExtractionAttempt" a
        WHERE a."createdByUserId"=${userId}::uuid AND a."usageDay"=${day.usageDay}::date
          AND a."provider"=${OPENAI_ATTEMPT_PROVIDER} AND a."quotaCharged"=TRUE) AS "userUsed",
      (SELECT COUNT(*)::bigint FROM "PurchaseImportExtractionAttempt" a
        WHERE a."shopId"=${shopId}::uuid AND a."usageDay"=${day.usageDay}::date
          AND a."provider"=${OPENAI_ATTEMPT_PROVIDER} AND a."quotaCharged"=TRUE) AS "shopUsed",
      (SELECT COUNT(*)::bigint FROM "PurchaseImportExtractionAttempt" a
        WHERE a."createdByUserId"=${userId}::uuid AND a."usageDay"=${day.usageDay}::date
          AND a."provider"=${OPENAI_ATTEMPT_PROVIDER} AND a."status"='FAILED' AND a."providerContactedAt" IS NOT NULL) AS "userFailed",
      (SELECT COUNT(*)::bigint FROM "PurchaseImportExtractionAttempt" a
        WHERE a."shopId"=${shopId}::uuid AND a."usageDay"=${day.usageDay}::date
          AND a."provider"=${OPENAI_ATTEMPT_PROVIDER} AND a."status"='FAILED' AND a."providerContactedAt" IS NOT NULL) AS "shopFailed",
      COALESCE((SELECT SUM(COALESCE(a."actualCostUsd", a."budgetReservedUsd"))
        FROM "PurchaseImportExtractionAttempt" a WHERE a."provider"=${OPENAI_ATTEMPT_PROVIDER}), 0) AS "budgetCommittedUsd"
  `);
  const row = rows[0];
  return {
    userUsed: Number(row?.userUsed ?? 0),
    shopUsed: Number(row?.shopUsed ?? 0),
    userFailed: Number(row?.userFailed ?? 0),
    shopFailed: Number(row?.shopFailed ?? 0),
    budgetCommittedUsd: numberFromDb(row?.budgetCommittedUsd),
  };
}

export async function getAiQuotaStatus(shopId: string, userId: string): Promise<PurchaseAiQuotaStatus> {
  const day = await purchaseAiDayContext(shopId);
  const config = getAiGuardConfig();
  const usage = await aiUsageSnapshot(shopId, userId, day);
  const model = getPurchaseAiModelName();
  let configError: string | null = null;
  let configured = false;
  try {
    configured = Boolean(getPurchaseOpenAiConfig());
    if (configured && !purchaseAiPricingForConfiguredModel()) configError = "تسعير نموذج القراءة غير مضبوط على الخادم.";
  } catch (error) {
    configError = error instanceof Error ? error.message : "إعداد OpenAI غير صالح.";
  }
  const remaining = (limit: number, used: number) => Math.max(0, limit - used);
  return {
    configured: configured && !configError,
    configError,
    model,
    timeZone: day.timeZone,
    resetAt: day.resetAt.toISOString(),
    user: { limit: config.userDailyLimit, used: usage.userUsed, remaining: remaining(config.userDailyLimit, usage.userUsed) },
    shop: { limit: config.shopDailyLimit, used: usage.shopUsed, remaining: remaining(config.shopDailyLimit, usage.shopUsed) },
    failedAttempts: {
      userLimit: config.failedUserDailyLimit,
      userUsed: usage.userFailed,
      userRemaining: remaining(config.failedUserDailyLimit, usage.userFailed),
      shopLimit: config.failedShopDailyLimit,
      shopUsed: usage.shopFailed,
      shopRemaining: remaining(config.failedShopDailyLimit, usage.shopFailed),
    },
    budget: {
      limitUsd: config.featureBudgetUsd,
      committedUsd: Math.round(usage.budgetCommittedUsd * 1_000_000) / 1_000_000,
      remainingUsd: Math.max(0, Math.round((config.featureBudgetUsd - usage.budgetCommittedUsd) * 1_000_000) / 1_000_000),
    },
  };
}

function safeExtractionError(error: unknown) {
  const code = error && typeof error === "object" && "code" in error ? String((error as { code?: unknown }).code || "EXTRACTION_FAILED") : "EXTRACTION_FAILED";
  if (code === "OPENAI_NOT_CONFIGURED") return { code, message: "قراءة AI غير مفعّلة على هذا الخادم. أضف OPENAI_API_KEY في بيئة الخادم، أو استخدم النص/Excel/الإدخال اليدوي." };
  if (code === "AI_USER_DAILY_LIMIT") return { code, message: "استهلكت حصتك اليومية من قراءات AI. يبقى الإدخال اليدوي ولصق Excel وتحليل النص المحلي متاحاً." };
  if (code === "AI_SHOP_DAILY_LIMIT") return { code, message: "وصل المتجر إلى سقف قراءات AI اليوم. يبقى الإدخال اليدوي ولصق Excel وتحليل النص المحلي متاحاً." };
  if (code === "AI_FAILED_ATTEMPT_LIMIT") return { code, message: "تم إيقاف محاولات AI الجديدة مؤقتاً بسبب تكرار المحاولات الفاشلة اليوم. أكمل يدوياً أو جرّب بعد تجدد الحصة." };
  if (code === "AI_FEATURE_BUDGET") return { code, message: "ميزانية قراءة الفواتير داخل مسار لا تكفي لطلب جديد حالياً. هذا لا يعطل الإدخال اليدوي." };
  if (code === "OPENAI_RATE_LIMIT") return { code, message: "OpenAI وصل إلى حد استخدام مؤقت. لا توجد إعادة محاولة تلقائية؛ جرّب لاحقاً أو أكمل يدوياً." };
  if (code === "OPENAI_TIMEOUT_UNKNOWN" || code === "OPENAI_NETWORK_UNKNOWN") return { code, message: "انقطع طلب OpenAI أو انتهت مهلته. لم يُعد إرسال الطلب تلقائياً، ويمكنك المتابعة يدوياً." };
  if (code === "OPENAI_INCOMPLETE") return { code, message: "انتهت قراءة OpenAI بنتيجة غير مكتملة، لذلك لم تُعرض كفاتورة مكتملة." };
  if (code === "EXTRACTION_SUPERSEDED") return { code, message: "تم تجاهل نتيجة محاولة قراءة قديمة لأن محاولة أحدث بدأت لهذا الملف." };
  return { code: code.slice(0, 40), message: error instanceof PurchaseAiProviderError ? error.message : "تعذر استخراج بيانات الفاتورة. يمكنك إعادة المحاولة المقصودة أو متابعة الإدخال يدوياً." };
}

async function recoverStaleExtraction(shopId: string, sourceId: string) {
  const staleMinutes = getPurchaseImportLimits().extractingStaleMinutes;
  return prisma.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<Array<{
      status: string;
      lastAttemptAt: Date | null;
      activeExtractionAttemptId: string | null;
      hasStoredReview: boolean;
    }>>(Prisma.sql`
      SELECT "status", "lastAttemptAt", "activeExtractionAttemptId", ("extractedData" IS NOT NULL) AS "hasStoredReview"
      FROM "PurchaseImportSource"
      WHERE "id"=${sourceId}::uuid AND "shopId"=${shopId}::uuid
      FOR UPDATE
    `);
    const current = rows[0];
    if (!current || current.status !== "EXTRACTING") return false;
    const cutoff = Date.now() - staleMinutes * 60_000;
    if (current.lastAttemptAt && current.lastAttemptAt.getTime() > cutoff) return false;

    const attemptId = current.activeExtractionAttemptId;
    if (attemptId) {
      await tx.$executeRaw(Prisma.sql`
        UPDATE "PurchaseImportExtractionAttempt"
        SET "status"='FAILED', "finishedAt"=COALESCE("finishedAt", NOW()), "failureKind"='STALE_EXTRACTION',
            "quotaCharged"=("providerContactedAt" IS NOT NULL), "quotaReleasedAt"=CASE WHEN "providerContactedAt" IS NULL THEN COALESCE("quotaReleasedAt", NOW()) ELSE NULL END,
            "actualCostUsd"=CASE WHEN "providerContactedAt" IS NULL THEN 0 ELSE "actualCostUsd" END
        WHERE "id"=${attemptId}::uuid AND "shopId"=${shopId}::uuid AND "status"='STARTED'
      `);
    }
    await tx.$executeRaw(Prisma.sql`
      UPDATE "PurchaseImportSource"
      SET "status"=${current.hasStoredReview ? "REVIEW_READY" : "FAILED"}, "safeErrorCode"='STALE_EXTRACTION',
          "safeErrorMessage"='انقطعت محاولة القراءة السابقة. لم تُعد تلقائياً؛ يمكنك إنشاء محاولة جديدة أو متابعة الإدخال يدوياً.',
          "activeExtractionAttemptId"=NULL, "updatedAt"=NOW()
      WHERE "id"=${sourceId}::uuid AND "shopId"=${shopId}::uuid
    `);
    return true;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 10_000 });
}

type ReservedExtraction = {
  kind: "started";
  attemptId: string;
  reservationUsd: number;
  model: string;
  day: PurchaseAiDayContext;
  hadStoredReview: boolean;
} | {
  kind: "existing";
  status: string;
  requestFingerprint: string | null;
  sourceId: string;
} | {
  kind: "stored-review";
};

export async function extractSource(shopId: string, userId: string, sourceId: string, requestKey: string, options: { forceReread?: boolean } = {}) {
  const key = requestKey.trim();
  if (key.length < 12 || key.length > 120) throw new Error("مفتاح طلب القراءة غير صالح.");
  let source = await getSource(shopId, sourceId);
  if (!source) throw new Error("مصدر الفاتورة غير موجود.");
  await assertDraft(shopId, source.purchaseInvoiceId);

  if (source.sourceType === "TEXT") {
    // Local text parsing is deliberately outside AI quota/budget accounting.
    if (source.status === "REVIEW_READY" && source.extractedData) {
      return { source, document: purchaseExtractedDocumentSchema.parse(source.extractedData), reused: true };
    }
    if (!source.textContent) throw new Error("النص الأصلي غير متاح.");
    const document = purchaseExtractedDocumentSchema.parse(extractPurchaseFromPastedText(source.textContent));
    await prisma.$executeRaw(Prisma.sql`
      UPDATE "PurchaseImportSource" SET "status"='REVIEW_READY', "extractionProvider"='deterministic-text-v1',
        "extractedData"=${JSON.stringify(document)}::jsonb, "safeErrorCode"=NULL, "safeErrorMessage"=NULL,
        "attemptCount"="attemptCount"+1, "lastAttemptAt"=NOW(), "updatedAt"=NOW()
      WHERE "id"=${sourceId}::uuid AND "shopId"=${shopId}::uuid
    `);
    return { source: { ...source, status: "REVIEW_READY" as const, extractedData: document }, document, reused: false };
  }

  if (source.status === "REVIEW_READY" && source.extractedData && !options.forceReread) {
    return { source, document: purchaseExtractedDocumentSchema.parse(source.extractedData), reused: true };
  }
  if (source.status === "EXTRACTING") {
    const recovered = await recoverStaleExtraction(shopId, sourceId);
    if (!recovered) throw new Error("تجري قراءة هذا الملف بالفعل. انتظر النتيجة قبل إعادة المحاولة.");
    source = await getSource(shopId, sourceId);
    if (!source) throw new Error("مصدر الفاتورة غير موجود.");
    if (source.status === "REVIEW_READY" && source.extractedData && !options.forceReread) {
      return { source, document: purchaseExtractedDocumentSchema.parse(source.extractedData), reused: true };
    }
  }

  // Validate provider configuration and source bytes before consuming an AI quota.
  if (!getPurchaseOpenAiConfig()) throw Object.assign(new Error("قراءة AI غير مفعّلة على هذا الخادم."), { code: "OPENAI_NOT_CONFIGURED" });
  if (!purchaseAiPricingForConfiguredModel()) throw new Error("تسعير نموذج قراءة AI غير مضبوط على الخادم.");
  if (source.sourceType !== "IMAGE" && source.sourceType !== "PDF") throw new Error("نوع مصدر الفاتورة غير مدعوم لقراءة AI.");
  const aiSourceType = source.sourceType;
  const fileRows = await prisma.$queryRaw<Array<{ sourceType: PurchaseImportSourceType; fileName: string | null; mimeType: string | null; fileData: Buffer | null }>>(Prisma.sql`
    SELECT "sourceType", "fileName", "mimeType", "fileData" FROM "PurchaseImportSource"
    WHERE "id"=${sourceId}::uuid AND "shopId"=${shopId}::uuid LIMIT 1
  `);
  const fileSource = fileRows[0];
  if (!fileSource?.fileData || !fileSource.mimeType) throw new Error("ملف المصدر غير متاح للقراءة.");

  const day = await purchaseAiDayContext(shopId);
  const model = getPurchaseAiModelName();
  const providerName = OPENAI_ATTEMPT_PROVIDER;
  const reservationUsd = estimatePurchaseAiReservationUsd({ sourceType: aiSourceType, pageCount: source.pageCount });
  const fingerprint = requestFingerprint({
    sourceId,
    contentSha256: source.contentSha256,
    schemaVersion: PURCHASE_DOCUMENT_SCHEMA_VERSION,
    provider: providerName,
    model,
  });
  const guard = getAiGuardConfig();

  const reservation: ReservedExtraction = await prisma.$transaction(async (tx) => {
    // One short advisory lock serializes quota/budget reservation only, not the outbound provider call.
    // Prisma binds JavaScript integers as int8. PostgreSQL's two-key advisory
    // lock overload accepts int4,int4, so cast both constants explicitly.
    await tx.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(${PURCHASE_AI_BUDGET_LOCK_A}::integer, ${PURCHASE_AI_BUDGET_LOCK_B}::integer)`);
    const locked = await tx.$queryRaw<Array<{ status: string; extractedData: unknown; activeExtractionAttemptId: string | null }>>(Prisma.sql`
      SELECT "status", "extractedData", "activeExtractionAttemptId"
      FROM "PurchaseImportSource"
      WHERE "id"=${sourceId}::uuid AND "shopId"=${shopId}::uuid
      FOR UPDATE
    `);
    const current = locked[0];
    if (!current) throw new Error("مصدر الفاتورة غير موجود.");

    // Re-check under the source row lock. Two different request keys can race
    // before the first extraction flips the source to REVIEW_READY; the second
    // request must reuse the stored review unless the user explicitly requested
    // a new read. This prevents accidental duplicate provider calls.
    if (current.status === "REVIEW_READY" && current.extractedData && !options.forceReread) {
      return { kind: "stored-review" as const };
    }

    const prior = await tx.$queryRaw<Array<{ sourceId: string; requestFingerprint: string | null; status: string }>>(Prisma.sql`
      SELECT "sourceId", "requestFingerprint", "status"
      FROM "PurchaseImportExtractionAttempt"
      WHERE "shopId"=${shopId}::uuid AND "requestKey"=${key}
      LIMIT 1
    `);
    if (prior[0]) {
      if (prior[0].sourceId !== sourceId || prior[0].requestFingerprint !== fingerprint) {
        throw new Error("مفتاح إعادة المحاولة مستخدم مسبقاً لطلب قراءة مختلف.");
      }
      return { kind: "existing" as const, ...prior[0] };
    }
    if (current.status === "EXTRACTING") throw new Error("تجري قراءة هذا الملف بالفعل.");

    const counters = await tx.$queryRaw<Array<{
      userUsed: bigint | number;
      shopUsed: bigint | number;
      userFailed: bigint | number;
      shopFailed: bigint | number;
      budgetCommittedUsd: Prisma.Decimal | number | string | null;
    }>>(Prisma.sql`
      SELECT
        (SELECT COUNT(*)::bigint FROM "PurchaseImportExtractionAttempt" a
          WHERE a."createdByUserId"=${userId}::uuid AND a."usageDay"=${day.usageDay}::date AND a."provider"=${providerName} AND a."quotaCharged"=TRUE) AS "userUsed",
        (SELECT COUNT(*)::bigint FROM "PurchaseImportExtractionAttempt" a
          WHERE a."shopId"=${shopId}::uuid AND a."usageDay"=${day.usageDay}::date AND a."provider"=${providerName} AND a."quotaCharged"=TRUE) AS "shopUsed",
        (SELECT COUNT(*)::bigint FROM "PurchaseImportExtractionAttempt" a
          WHERE a."createdByUserId"=${userId}::uuid AND a."usageDay"=${day.usageDay}::date AND a."provider"=${providerName} AND a."status"='FAILED' AND a."providerContactedAt" IS NOT NULL) AS "userFailed",
        (SELECT COUNT(*)::bigint FROM "PurchaseImportExtractionAttempt" a
          WHERE a."shopId"=${shopId}::uuid AND a."usageDay"=${day.usageDay}::date AND a."provider"=${providerName} AND a."status"='FAILED' AND a."providerContactedAt" IS NOT NULL) AS "shopFailed",
        COALESCE((SELECT SUM(COALESCE(a."actualCostUsd", a."budgetReservedUsd")) FROM "PurchaseImportExtractionAttempt" a WHERE a."provider"=${providerName}), 0) AS "budgetCommittedUsd"
    `);
    const counter = counters[0];
    if (Number(counter?.userUsed ?? 0) >= guard.userDailyLimit) throw Object.assign(new Error("انتهت حصة المستخدم اليومية لقراءة AI."), { code: "AI_USER_DAILY_LIMIT" });
    if (Number(counter?.shopUsed ?? 0) >= guard.shopDailyLimit) throw Object.assign(new Error("انتهت حصة المتجر اليومية لقراءة AI."), { code: "AI_SHOP_DAILY_LIMIT" });
    if (Number(counter?.userFailed ?? 0) >= guard.failedUserDailyLimit || Number(counter?.shopFailed ?? 0) >= guard.failedShopDailyLimit) {
      throw Object.assign(new Error("تم بلوغ حد المحاولات الفاشلة لقراءة AI اليوم."), { code: "AI_FAILED_ATTEMPT_LIMIT" });
    }
    const committedUsd = numberFromDb(counter?.budgetCommittedUsd);
    if (committedUsd + reservationUsd > guard.featureBudgetUsd + 1e-9) {
      throw Object.assign(new Error("ميزانية ميزة قراءة الفواتير لا تكفي لحجز هذا الطلب."), { code: "AI_FEATURE_BUDGET" });
    }

    const inserted = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      INSERT INTO "PurchaseImportExtractionAttempt" (
        "shopId", "sourceId", "requestKey", "requestFingerprint", "provider", "status", "createdByUserId",
        "usageDay", "usageTimezone", "quotaCharged", "model", "budgetReservedUsd"
      ) VALUES (
        ${shopId}::uuid, ${sourceId}::uuid, ${key}, ${fingerprint}, ${providerName}, 'STARTED', ${userId}::uuid,
        ${day.usageDay}::date, ${day.timeZone}, TRUE, ${model}, ${reservationUsd}
      ) RETURNING "id"
    `);
    const attemptId = inserted[0]?.id;
    if (!attemptId) throw new Error("تعذر حجز محاولة قراءة AI.");
    await tx.$executeRaw(Prisma.sql`
      UPDATE "PurchaseImportSource"
      SET "status"='EXTRACTING', "safeErrorCode"=NULL, "safeErrorMessage"=NULL,
          "attemptCount"="attemptCount"+1, "lastAttemptAt"=NOW(), "activeExtractionAttemptId"=${attemptId}::uuid, "updatedAt"=NOW()
      WHERE "id"=${sourceId}::uuid AND "shopId"=${shopId}::uuid
    `);
    return {
      kind: "started" as const,
      attemptId,
      reservationUsd,
      model,
      day,
      hadStoredReview: current.extractedData !== null,
    };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 15_000 });

  if (reservation.kind === "stored-review") {
    const current = await getSource(shopId, sourceId);
    if (!current?.extractedData) throw new Error("تعذر استعادة نتيجة القراءة المحفوظة.");
    return { source: current, document: purchaseExtractedDocumentSchema.parse(current.extractedData), reused: true };
  }

  if (reservation.kind === "existing") {
    if (reservation.status === "SUCCEEDED") {
      const current = await getSource(shopId, sourceId);
      if (current?.extractedData) return { source: current, document: purchaseExtractedDocumentSchema.parse(current.extractedData), reused: true };
    }
    if (reservation.status === "FAILED") throw new Error("طلب القراءة السابق بهذا المفتاح فشل. أنشئ إعادة قراءة مقصودة بمفتاح جديد.");
    throw new Error("تم إرسال طلب القراءة نفسه مسبقاً. انتظر النتيجة ولا تعاود الإرسال.");
  }

  const started = reservation.attemptId;
  try {
    const contactMarked = await prisma.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      UPDATE "PurchaseImportExtractionAttempt"
      SET "providerContactedAt"=COALESCE("providerContactedAt", NOW())
      WHERE "id"=${started}::uuid AND "shopId"=${shopId}::uuid AND "status"='STARTED'
      RETURNING "id"
    `);
    if (!contactMarked[0]) throw Object.assign(new Error("Extraction result superseded"), { code: "EXTRACTION_SUPERSEDED" });

    const extracted = await callOpenAiPurchaseExtractor({
      sourceType: aiSourceType,
      fileName: fileSource.fileName,
      mimeType: fileSource.mimeType,
      fileData: fileSource.fileData,
      pageCount: source.pageCount,
    });
    const document = purchaseExtractedDocumentSchema.parse(extracted.document);
    const committed = await prisma.$transaction(async (tx) => {
      const updated = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
        UPDATE "PurchaseImportSource"
        SET "status"='REVIEW_READY', "extractionProvider"=${extracted.provider}, "extractedData"=${JSON.stringify(document)}::jsonb,
            "safeErrorCode"=NULL, "safeErrorMessage"=NULL, "activeExtractionAttemptId"=NULL, "updatedAt"=NOW()
        WHERE "id"=${sourceId}::uuid AND "shopId"=${shopId}::uuid AND "activeExtractionAttemptId"=${started}::uuid
        RETURNING "id"
      `);
      if (!updated[0]) {
        await tx.$executeRaw(Prisma.sql`
          UPDATE "PurchaseImportExtractionAttempt"
          SET "status"='FAILED', "finishedAt"=NOW(), "failureKind"='EXTRACTION_SUPERSEDED', "quotaCharged"=("providerContactedAt" IS NOT NULL),
              "quotaReleasedAt"=CASE WHEN "providerContactedAt" IS NULL THEN NOW() ELSE NULL END, "actualCostUsd"=${extracted.actualCostUsd}, "inputTokens"=${extracted.usage.inputTokens},
              "cachedInputTokens"=${extracted.usage.cachedInputTokens}, "outputTokens"=${extracted.usage.outputTokens},
              "providerResponseId"=${extracted.responseId}
          WHERE "id"=${started}::uuid AND "shopId"=${shopId}::uuid AND "status"='STARTED'
        `);
        return false;
      }
      await tx.$executeRaw(Prisma.sql`
        UPDATE "PurchaseImportExtractionAttempt"
        SET "status"='SUCCEEDED', "finishedAt"=NOW(), "actualCostUsd"=${extracted.actualCostUsd},
            "inputTokens"=${extracted.usage.inputTokens}, "cachedInputTokens"=${extracted.usage.cachedInputTokens},
            "outputTokens"=${extracted.usage.outputTokens}, "providerResponseId"=${extracted.responseId}
        WHERE "id"=${started}::uuid AND "shopId"=${shopId}::uuid AND "status"='STARTED'
      `);
      return true;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 10_000 });
    if (!committed) throw Object.assign(new Error("Extraction result superseded"), { code: "EXTRACTION_SUPERSEDED", alreadyFinalized: true });
    return { source: { ...source, status: "REVIEW_READY" as const, extractedData: document }, document, reused: false };
  } catch (error) {
    const alreadyFinalized = Boolean(error && typeof error === "object" && "alreadyFinalized" in error && (error as { alreadyFinalized?: unknown }).alreadyFinalized);
    if (!alreadyFinalized) {
      const aiError = error instanceof PurchaseAiProviderError ? error : null;
      const safe = safeExtractionError(error);
      const providerContacted = aiError?.providerContacted ?? false;
      const chargeKnown = aiError?.chargeKnown ?? (!providerContacted);
      const actualCost = aiError?.actualCostUsd ?? (chargeKnown ? 0 : null);
      const usage = aiError?.usage;
      await prisma.$transaction(async (tx) => {
        await tx.$executeRaw(Prisma.sql`
          UPDATE "PurchaseImportExtractionAttempt"
          SET "status"='FAILED', "finishedAt"=COALESCE("finishedAt", NOW()), "failureKind"=${safe.code},
              "quotaCharged"=("providerContactedAt" IS NOT NULL), "quotaReleasedAt"=CASE WHEN "providerContactedAt" IS NULL THEN COALESCE("quotaReleasedAt", NOW()) ELSE NULL END,
              "actualCostUsd"=${actualCost}, "inputTokens"=${usage?.inputTokens ?? null},
              "cachedInputTokens"=${usage?.cachedInputTokens ?? null}, "outputTokens"=${usage?.outputTokens ?? null},
              "providerResponseId"=${aiError?.responseId ?? null}
          WHERE "id"=${started}::uuid AND "shopId"=${shopId}::uuid AND "status"='STARTED'
        `);
        await tx.$executeRaw(Prisma.sql`
          UPDATE "PurchaseImportSource"
          SET "status"=${reservation.hadStoredReview ? "REVIEW_READY" : "FAILED"}, "safeErrorCode"=${safe.code}, "safeErrorMessage"=${safe.message},
              "activeExtractionAttemptId"=NULL, "updatedAt"=NOW()
          WHERE "id"=${sourceId}::uuid AND "shopId"=${shopId}::uuid AND "activeExtractionAttemptId"=${started}::uuid
        `);
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 10_000 });
    }
    throw new Error(safeExtractionError(error).message);
  }
}

async function listAliases(shopId: string, supplierId: string | null) {
  if (!supplierId) return [];
  return prisma.$queryRaw<Array<{ id: string; aliasText: string; normalizedAlias: string; inventoryItemId: string; inventoryItemName: string; inventoryBarcode: string | null; inventorySku: string | null; barcodeSnapshot: string | null }>>(Prisma.sql`
    SELECT a."id", a."aliasText", a."normalizedAlias", a."inventoryItemId", i."name" AS "inventoryItemName",
      i."barcode" AS "inventoryBarcode", i."sku" AS "inventorySku", a."barcodeSnapshot"
    FROM "SupplierItemAlias" a
    INNER JOIN "InventoryItem" i ON i."id"=a."inventoryItemId" AND i."shopId"=${shopId}::uuid AND i."deletedAt" IS NULL
    WHERE a."shopId"=${shopId}::uuid AND a."supplierId"=${supplierId}::uuid AND a."deletedAt" IS NULL
    ORDER BY a."updatedAt" DESC
  `);
}

export async function reviewSource(shopId: string, sourceId: string): Promise<PurchaseDocumentReview> {
  const source = await getSource(shopId, sourceId);
  if (!source) throw new Error("مصدر الفاتورة غير موجود.");
  const draft = await assertDraft(shopId, source.purchaseInvoiceId);
  if (source.status !== "REVIEW_READY" || !source.extractedData) throw new Error(source.safeErrorMessage || "بيانات المصدر ليست جاهزة للمراجعة بعد.");
  const document = purchaseExtractedDocumentSchema.parse(source.extractedData);
  const aliases = await listAliases(shopId, draft.supplierId);
  const aliasByText = new Map(aliases.map((alias) => [alias.normalizedAlias, alias]));

  const matched = await purchaseReceivingService.matchImportedRows(shopId, document.items.map((item, index) => ({
    rowIndex: index + 1,
    sourceText: item.originalText,
    name: item.name,
    barcode: item.barcode,
  })));

  const neededInventoryIds = new Set<string>();
  for (const alias of aliases) neededInventoryIds.add(alias.inventoryItemId);
  for (const match of matched) for (const candidate of match.enrichedCandidates) neededInventoryIds.add(candidate.id);
  const inventoryById = new Map<string, PurchaseInventorySearchItem>();
  if (neededInventoryIds.size) {
    const rows = await purchaseReceivingService.getInventoryItemsByIds(shopId, [...neededInventoryIds]);
    for (const row of rows) inventoryById.set(row.id, row);
  }

  const lines = document.items.map((item, index): PurchaseDocumentReviewLine => {
    const incomplete = isPurchaseExtractedItemIncomplete(item);
    const match = matched[index];
    const matchedId = match?.resolution.state === "existing" ? match.resolution.item.id : null;
    const exactIdentifier = matchedId ? match.enrichedCandidates.find((candidate) => candidate.id === matchedId) ?? null : null;
    if (exactIdentifier) {
      return { ...item, reviewState: incomplete ? "incomplete" : "existing", matchReason: match.resolution.reason, item: exactIdentifier, candidates: [], supplierAliasApplied: false };
    }

    if (match?.resolution.state === "review" && match.resolution.reason === "identifier-duplicate") {
      return { ...item, reviewState: incomplete ? "incomplete" : "review", matchReason: "identifier-duplicate", item: null, candidates: match.enrichedCandidates, supplierAliasApplied: false };
    }

    const alias = item.name ? aliasByText.get(normalizeSupplierAlias(item.name)) : null;
    if (alias) {
      const mapped = inventoryById.get(alias.inventoryItemId) ?? null;
      const sourceBarcode = item.barcode?.trim() || null;
      const identifiers = mapped ? [mapped.barcode, mapped.sku].filter(Boolean).map((value) => String(value).trim()) : [];
      const barcodeConflict = Boolean(sourceBarcode && identifiers.length && !identifiers.includes(sourceBarcode));
      const fingerprintConflict = sourceRowIdentityFingerprint(alias.aliasText) !== sourceRowIdentityFingerprint(item.name || "");
      if (mapped && !barcodeConflict && !fingerprintConflict) {
        return { ...item, reviewState: incomplete ? "incomplete" : "existing", matchReason: "supplier-alias", item: mapped, candidates: match?.enrichedCandidates ?? [], supplierAliasApplied: true };
      }
    }

    const candidates = match?.enrichedCandidates ?? [];
    if (incomplete) return { ...item, reviewState: "incomplete", matchReason: "incomplete", item: null, candidates, supplierAliasApplied: false };
    if (match?.resolution.state === "review") return { ...item, reviewState: "review", matchReason: match.resolution.reason, item: null, candidates, supplierAliasApplied: false };
    return { ...item, reviewState: "new", matchReason: "no-match", item: null, candidates: [], supplierAliasApplied: false };
  });

  return {
    source: {
      id: source.id,
      purchaseInvoiceId: source.purchaseInvoiceId,
      sourceType: source.sourceType,
      fileName: source.fileName,
      mimeType: source.mimeType,
      fileSize: source.fileSize,
      pageCount: source.pageCount,
      contentSha256: source.contentSha256,
      status: source.status,
      extractionProvider: source.extractionProvider,
      safeErrorCode: source.safeErrorCode,
      safeErrorMessage: source.safeErrorMessage,
      attemptCount: source.attemptCount,
      lastAttemptAt: source.lastAttemptAt,
      createdAt: source.createdAt,
      updatedAt: source.updatedAt,
      sourceText: source.sourceType === "TEXT" ? source.textContent : null,
    },
    document,
    lines,
    totals: compareExtractedTotals(document),
    currentSupplierId: draft.supplierId,
    aliases: aliases.map((alias) => ({ id: alias.id, aliasText: alias.aliasText, inventoryItemId: alias.inventoryItemId, inventoryItemName: alias.inventoryItemName, barcodeSnapshot: alias.barcodeSnapshot })),
  };
}

export async function confirmSupplierItemAlias(input: {
  shopId: string;
  userId: string;
  supplierId: string;
  inventoryItemId: string;
  aliasText: string;
  sourceBarcode?: string | null;
}) {
  const aliasText = input.aliasText.trim();
  const normalizedAlias = normalizeSupplierAlias(aliasText);
  if (!normalizedAlias || normalizedAlias.length < 2) throw new Error("تسمية المورد غير صالحة للحفظ.");
  const rows = await prisma.$queryRaw<Array<{ supplierId: string; inventoryItemId: string; barcode: string | null; sku: string | null }>>(Prisma.sql`
    SELECT s."id" AS "supplierId", i."id" AS "inventoryItemId", i."barcode", i."sku"
    FROM "Supplier" s
    CROSS JOIN "InventoryItem" i
    WHERE s."id"=${input.supplierId}::uuid AND s."shopId"=${input.shopId}::uuid AND s."deletedAt" IS NULL
      AND i."id"=${input.inventoryItemId}::uuid AND i."shopId"=${input.shopId}::uuid AND i."deletedAt" IS NULL
    LIMIT 1
  `);
  const valid = rows[0];
  if (!valid) throw new Error("المورد أو الصنف غير موجود في هذا المتجر.");
  const sourceBarcode = input.sourceBarcode?.trim() || null;
  const identifiers = [valid.barcode, valid.sku].filter(Boolean).map((value) => String(value).trim());
  if (sourceBarcode && identifiers.length && !identifiers.includes(sourceBarcode)) {
    throw new Error("لا يمكن حفظ المطابقة لأن باركود/معرّف المصدر يتعارض مع الصنف المحدد.");
  }

  const result = await prisma.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    INSERT INTO "SupplierItemAlias" (
      "shopId", "supplierId", "inventoryItemId", "aliasText", "normalizedAlias", "barcodeSnapshot", "createdByUserId"
    ) VALUES (
      ${input.shopId}::uuid, ${input.supplierId}::uuid, ${input.inventoryItemId}::uuid, ${aliasText}, ${normalizedAlias}, ${sourceBarcode}, ${input.userId}::uuid
    )
    ON CONFLICT ("shopId", "supplierId", "normalizedAlias") WHERE "deletedAt" IS NULL
    DO UPDATE SET "inventoryItemId"=EXCLUDED."inventoryItemId", "aliasText"=EXCLUDED."aliasText",
      "barcodeSnapshot"=EXCLUDED."barcodeSnapshot", "createdByUserId"=EXCLUDED."createdByUserId", "updatedAt"=NOW()
    RETURNING "id"
  `);
  return result[0];
}

export async function removeSupplierItemAlias(shopId: string, supplierId: string, aliasId: string) {
  const updated = await prisma.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    UPDATE "SupplierItemAlias" SET "deletedAt"=NOW(), "updatedAt"=NOW()
    WHERE "id"=${aliasId}::uuid AND "shopId"=${shopId}::uuid AND "supplierId"=${supplierId}::uuid AND "deletedAt" IS NULL
    RETURNING "id"
  `);
  if (!updated[0]) throw new Error("المطابقة المحفوظة غير موجودة.");
  return updated[0];
}

export const purchaseDocumentImportService = {
  getPurchaseImportLimits,
  createTextSource,
  createFileSource,
  getSource,
  getSourceFile,
  getAiQuotaStatus,
  extractSource,
  reviewSource,
  confirmSupplierItemAlias,
  removeSupplierItemAlias,
};
