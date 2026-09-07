import { z } from "zod";
import { normalizeArabicDigits, normalizeMatchText, parseFlexibleNumber } from "@/lib/purchase-import";

export const PURCHASE_DOCUMENT_SCHEMA_VERSION = 1;

const nullableShortText = z.string().trim().max(500).nullable();
const nullableMoney = z.number().finite().nonnegative().nullable();

export const purchaseExtractedItemSchema = z.object({
  rowKey: z.string().trim().min(1).max(120),
  originalText: z.string().max(4000),
  name: nullableShortText,
  barcode: z.string().trim().max(160).nullable(),
  quantity: z.number().finite().positive().nullable(),
  purchaseUnit: z.string().trim().max(80).nullable(),
  unitCost: nullableMoney,
  lineTotal: nullableMoney,
  salePrice: nullableMoney.optional().default(null),
  unitAmbiguous: z.boolean().default(false),
  priceAmbiguous: z.boolean().default(false),
  quantityAmbiguous: z.boolean().default(false),
  notes: z.array(z.string().max(500)).max(12).default([]),
}).strict();

export const purchaseExtractedDocumentSchema = z.object({
  schemaVersion: z.literal(PURCHASE_DOCUMENT_SCHEMA_VERSION),
  supplierName: nullableShortText,
  invoiceDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  supplierInvoiceNumber: z.string().trim().max(160).nullable(),
  currency: z.string().trim().max(12).nullable(),
  subtotal: nullableMoney,
  discountTotal: nullableMoney,
  shippingTotal: nullableMoney,
  total: nullableMoney,
  items: z.array(purchaseExtractedItemSchema).max(250),
  warnings: z.array(z.string().max(500)).max(30).default([]),
}).strict().superRefine((document, ctx) => {
  if (document.invoiceDate) {
    const [year, month, day] = document.invoiceDate.split("-").map(Number);
    const parsed = new Date(Date.UTC(year, month - 1, day));
    if (parsed.getUTCFullYear() !== year || parsed.getUTCMonth() !== month - 1 || parsed.getUTCDate() !== day) {
      ctx.addIssue({ code: "custom", path: ["invoiceDate"], message: "تاريخ الفاتورة غير صالح." });
    }
  }
  const rowKeys = new Set<string>();
  document.items.forEach((item, index) => {
    if (rowKeys.has(item.rowKey)) ctx.addIssue({ code: "custom", path: ["items", index, "rowKey"], message: "معرّف سطر الاستخراج مكرر." });
    rowKeys.add(item.rowKey);
  });
});

export type PurchaseExtractedItem = z.infer<typeof purchaseExtractedItemSchema>;
export type PurchaseExtractedDocument = z.infer<typeof purchaseExtractedDocumentSchema>;

export type PurchaseImportFileValidation = {
  ok: boolean;
  sourceType?: "IMAGE" | "PDF";
  mimeType?: string;
  pageCount?: number;
  error?: string;
};

const CURRENCY_ALIASES: Array<[RegExp, string]> = [
  [/\b(?:SAR|ر\.?س|ريال(?:\s+سعودي)?)\b/i, "SAR"],
  [/\b(?:EGP|ج\.?م|جنيه(?:\s+مصري)?)\b/i, "EGP"],
  [/\b(?:USD|US\$|\$|دولار)\b/i, "USD"],
  [/\b(?:TRY|TL|₺|ليرة(?:\s+تركية)?)\b/i, "TRY"],
  [/\b(?:JOD|د\.?أ|دينار(?:\s+أردني)?)\b/i, "JOD"],
  [/\b(?:IQD|دينار(?:\s+عراقي)?)\b/i, "IQD"],
  [/\b(?:SYP|ل\.?س|ليرة(?:\s+سورية)?)\b/i, "SYP"],
  [/\b(?:AED|د\.?إ|درهم(?:\s+إماراتي)?)\b/i, "AED"],
];

const CARTON_UNIT_RE = /\b(cartons?|carton|boxes?|box|case|pack(?:age)?s?)\b|(?:كرتونة|كرتون|كراتين|صندوق|صناديق|باكيت|باك|علبة|علب)/i;
const PIECE_UNIT_RE = /\b(?:pcs?|pieces?|piece|unit|units)\b|(?:قطعة|قطع|حبة|حبات)/i;
const TOTAL_LABEL_RE = /(?:الإجمالي(?:\s*النهائي)?|المجموع(?:\s*النهائي)?|grand\s*total|invoice\s*total|total)/i;
const SUBTOTAL_LABEL_RE = /(?:المجموع\s*الفرعي|قبل\s*الخصم|sub\s*total|subtotal)/i;
const DISCOUNT_LABEL_RE = /(?:خصم|discount)/i;
const SHIPPING_LABEL_RE = /(?:شحن|توصيل|نقل|shipping|delivery|freight)/i;

function nullable(value: string | undefined | null) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function parseLooseMoney(text: string) {
  const result = parseFlexibleNumber(text, { required: false });
  return result.value !== null && !result.ambiguous && !result.error ? result.value : null;
}

function findLastMoney(text: string) {
  const normalized = normalizeArabicDigits(text).replace(/٫/g, ".").replace(/٬/g, ",");
  const matches = normalized.match(/[+\-]?\d[\d\s.,]*/g) ?? [];
  for (let index = matches.length - 1; index >= 0; index -= 1) {
    const parsed = parseLooseMoney(matches[index]);
    if (parsed !== null) return parsed;
  }
  return null;
}

function extractCurrency(text: string) {
  for (const [pattern, currency] of CURRENCY_ALIASES) if (pattern.test(text)) return currency;
  return null;
}

function normalizeDateParts(year: number, month: number, day: number) {
  if (year < 100) year += year >= 70 ? 1900 : 2000;
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function parseDocumentDate(text: string) {
  const clean = normalizeArabicDigits(text);
  const ymd = clean.match(/\b(20\d{2}|19\d{2})[\/-](\d{1,2})[\/-](\d{1,2})\b/);
  if (ymd) return normalizeDateParts(Number(ymd[1]), Number(ymd[2]), Number(ymd[3]));
  const dmy = clean.match(/\b(\d{1,2})[\/-](\d{1,2})[\/-](\d{2,4})\b/);
  if (dmy) return normalizeDateParts(Number(dmy[3]), Number(dmy[2]), Number(dmy[1]));
  return null;
}

function readLabeledValue(lines: string[], labels: RegExp) {
  for (const line of lines) {
    if (!labels.test(line)) continue;
    const after = line.split(/[:：]/).slice(1).join(":").trim();
    if (after) return after;
    const stripped = line.replace(labels, "").replace(/^\s*[-–—:]\s*/, "").trim();
    if (stripped) return stripped;
  }
  return null;
}

function lineLooksMetadata(line: string) {
  return /^\s*(?:رقم\s*)?(?:(?:ال)?فاتورة|invoice|المورد|اسم\s*المورد|supplier|vendor|التاريخ|date|الإجمالي(?:\s*النهائي)?|المجموع(?:\s*الفرعي|\s*النهائي)?|grand\s*total|invoice\s*total|total|(?:ال)?خصم|discount|(?:ال)?شحن|shipping|(?:ال)?توصيل|delivery|(?:ال)?عنوان|(?:ال)?هاتف|phone|(?:ال)?عملة|currency|tax|(?:ال)?ضريبة)(?:\s*[:：]|\s|$)/i.test(line);
}

function cleanItemName(text: string) {
  return text
    .replace(/^[\s\d#.)\-–—]+/, "")
    .replace(/\b(?:qty|quantity|عدد|كمية)\s*[:=]?\s*[٠-٩۰-۹\d.,٫٬]+/gi, " ")
    .replace(/\b(?:unit\s*cost|cost|price|سعر\s*الوحدة|تكلفة\s*الوحدة|تكلفة|سعر)\s*[:=]?\s*[٠-٩۰-۹\d.,٫٬]+/gi, " ")
    .replace(/\b(?:total|الإجمالي|المجموع)\s*[:=]?\s*[٠-٩۰-۹\d.,٫٬]+/gi, " ")
    .replace(/\s+/g, " ")
    .replace(/[|;،,\-–—:=]+$/g, "")
    .trim();
}

function parseExplicitNumber(line: string, labels: RegExp, integer = false) {
  const match = line.match(labels);
  if (!match?.[1]) return { value: null as number | null, ambiguous: false };
  const result = parseFlexibleNumber(match[1], { required: true, integer });
  return { value: result.value, ambiguous: result.ambiguous || Boolean(result.error) };
}

function extractBarcode(line: string) {
  const labeled = line.match(/(?:barcode|bar\s*code|ean|upc|sku|باركود|الباركود|كود|الكود|رمز)\s*[:=#]?\s*([A-Za-z0-9._\/-]{4,})/i);
  return labeled?.[1]?.trim() ?? null;
}

function parseWhatsAppItemLine(line: string, rowNumber: number): PurchaseExtractedItem | null {
  const originalText = line.trim();
  if (!originalText || lineLooksMetadata(originalText)) return null;

  const quantityExplicit = parseExplicitNumber(originalText, /(?:qty|quantity|عدد|كمية)\s*[:=x×]?\s*([٠-٩۰-۹\d.,٫٬]+)/i, true);
  const unitCostExplicit = parseExplicitNumber(originalText, /(?:unit\s*cost|unit\s*price|cost|buy\s*price|تكلفة\s*الوحدة|سعر\s*الوحدة|تكلفة|سعر\s*شراء)\s*[:=@]?\s*([٠-٩۰-۹\d.,٫٬]+)/i);
  const lineTotalExplicit = parseExplicitNumber(originalText, /(?:line\s*total|الإجمالي|المجموع)\s*[:=]?\s*([٠-٩۰-۹\d.,٫٬]+)/i);
  const multiplier = normalizeArabicDigits(originalText).match(/(?:^|\s)(\d+)\s*[x×*]\s*([\d.,٫٬]+)(?:\s|$)/i);

  let quantity = quantityExplicit.value;
  let unitCost = unitCostExplicit.value;
  let lineTotal = lineTotalExplicit.value;
  let quantityAmbiguous = quantityExplicit.ambiguous;
  let priceAmbiguous = unitCostExplicit.ambiguous || lineTotalExplicit.ambiguous;
  const notes: string[] = [];

  if (multiplier) {
    const q = parseFlexibleNumber(multiplier[1], { integer: true, required: true });
    const p = parseFlexibleNumber(multiplier[2], { required: true });
    if (quantity === null && q.value !== null && !q.ambiguous && !q.error) quantity = q.value;
    if (unitCost === null && p.value !== null && !p.ambiguous && !p.error) unitCost = p.value;
    quantityAmbiguous ||= q.ambiguous || Boolean(q.error);
    priceAmbiguous ||= p.ambiguous || Boolean(p.error);
  }

  const cells = originalText.split(/\t|\s*\|\s*|\s*;\s*/).map((cell) => cell.trim()).filter(Boolean);
  if (cells.length >= 3) {
    const q = parseFlexibleNumber(cells[cells.length - 2], { integer: true });
    const p = parseFlexibleNumber(cells[cells.length - 1]);
    if (quantity === null && q.value !== null && !q.ambiguous && !q.error) quantity = q.value;
    if (unitCost === null && p.value !== null && !p.ambiguous && !p.error) unitCost = p.value;
  }

  const purchaseUnitMatch = originalText.match(/\b(cartons?|carton|boxes?|box|case|pack(?:age)?s?|pcs?|pieces?|piece|units?)\b|(?:كرتونة|كرتون|كراتين|صندوق|صناديق|باكيت|باك|علبة|علب|قطعة|قطع|حبة|حبات)/i);
  const purchaseUnit = purchaseUnitMatch?.[0] ?? null;
  const unitAmbiguous = Boolean(purchaseUnit && CARTON_UNIT_RE.test(purchaseUnit) && !PIECE_UNIT_RE.test(purchaseUnit));
  if (unitAmbiguous) notes.push("وحدة الشراء ليست قطعة مفردة؛ يلزم تحديد عدد قطع المخزون المستلمة ولا يتم افتراض محتوى الكرتونة/العلبة.");

  const barcode = extractBarcode(originalText);
  const delimitedName = cells.length >= 3 ? cells[0] : null;
  const name = nullable(cleanItemName((delimitedName || originalText)
    .replace(/(?:barcode|bar\s*code|ean|upc|sku|باركود|الباركود|كود|الكود|رمز)\s*[:=#]?\s*[A-Za-z0-9._\/-]{4,}/gi, " ")
    .replace(/(?:^|\s)\d+\s*[x×*]\s*[\d.,٫٬]+(?:\s|$)/gi, " ")));

  // A lone monetary-looking number is never assumed to be unit cost. Preserve it as a possible line total and require review.
  if (unitCost === null && lineTotal === null) {
    const moneyCandidates = normalizeArabicDigits(originalText).match(/\b\d[\d.,]*\b/g) ?? [];
    const parsed = moneyCandidates.map((value) => parseFlexibleNumber(value)).filter((value) => value.value !== null && !value.error);
    const likelyPrices = parsed.filter((value) => value.value !== quantity);
    if (likelyPrices.length === 1) {
      lineTotal = likelyPrices[0].value;
      priceAmbiguous = true;
      notes.push("ظهر سعر واحد فقط ولم يتضح إن كان سعر الوحدة أم إجمالي السطر؛ لم يتم اعتباره تكلفة وحدة تلقائياً.");
    }
  }

  if (!name && !barcode) return null;
  if (quantity === null) notes.push("الكمية غير واضحة وتحتاج إدخالاً يدوياً.");
  if (unitCost === null) notes.push("تكلفة الوحدة غير واضحة وتحتاج إدخالاً يدوياً.");

  return {
    rowKey: `text-${rowNumber}`,
    originalText,
    name,
    barcode,
    quantity,
    purchaseUnit,
    unitCost,
    lineTotal,
    salePrice: null,
    unitAmbiguous,
    priceAmbiguous,
    quantityAmbiguous,
    notes,
  };
}

export function extractPurchaseFromPastedText(rawText: string): PurchaseExtractedDocument {
  const text = rawText.replace(/\r\n?/g, "\n").trim();
  const lines = text.split("\n").map((line) => line.trim()).filter(Boolean);
  const warnings: string[] = [];

  const supplierName = nullable(readLabeledValue(lines, /(?:المورد|اسم\s*المورد|supplier|vendor)/i));
  const supplierInvoiceNumber = nullable(readLabeledValue(lines, /(?:رقم\s*(?:الفاتورة|فاتورة)|invoice\s*(?:no|number|#)|bill\s*(?:no|number|#))/i));
  const dateLine = lines.find((line) => /(?:التاريخ|date)/i.test(line)) ?? lines.find((line) => parseDocumentDate(line));
  const invoiceDate = dateLine ? parseDocumentDate(dateLine) : null;
  const currency = extractCurrency(text);

  let subtotal: number | null = null;
  let discountTotal: number | null = null;
  let shippingTotal: number | null = null;
  let total: number | null = null;
  for (const line of lines) {
    if (!lineLooksMetadata(line)) continue;
    if (SUBTOTAL_LABEL_RE.test(line)) subtotal = findLastMoney(line);
    else if (DISCOUNT_LABEL_RE.test(line)) discountTotal = findLastMoney(line);
    else if (SHIPPING_LABEL_RE.test(line)) shippingTotal = findLastMoney(line);
    else if (TOTAL_LABEL_RE.test(line)) total = findLastMoney(line);
  }

  const items = lines.map((line, index) => parseWhatsAppItemLine(line, index + 1)).filter((item): item is PurchaseExtractedItem => Boolean(item));
  if (!items.length) warnings.push("لم يتم التعرف على بنود بصورة مؤكدة. يمكنك تعديل النص أو إدخال البنود يدوياً.");
  if (items.some((item) => item.unitAmbiguous)) warnings.push("يوجد بند بوحدة شراء غير مفردة؛ لا يتم تحويل الكرتونة/العلبة إلى قطع تلقائياً.");
  if (items.some((item) => item.priceAmbiguous)) warnings.push("يوجد سعر لم يتضح إن كان تكلفة وحدة أم إجمالي سطر؛ يلزم تأكيده.");

  return purchaseExtractedDocumentSchema.parse({
    schemaVersion: PURCHASE_DOCUMENT_SCHEMA_VERSION,
    supplierName,
    invoiceDate,
    supplierInvoiceNumber,
    currency,
    subtotal,
    discountTotal,
    shippingTotal,
    total,
    items,
    warnings,
  });
}

export function isPurchaseExtractedItemIncomplete(item: PurchaseExtractedItem) {
  return !item.name || item.quantity === null || item.unitCost === null || item.unitAmbiguous || item.priceAmbiguous || item.quantityAmbiguous;
}

export function extractedDocumentLineSubtotal(document: PurchaseExtractedDocument) {
  let subtotal = 0;
  let complete = true;
  for (const item of document.items) {
    if (item.quantity === null || item.unitCost === null || item.unitAmbiguous || item.priceAmbiguous || item.quantityAmbiguous) {
      complete = false;
      continue;
    }
    subtotal += item.quantity * item.unitCost;
  }
  return { subtotal: Math.round(subtotal * 100) / 100, complete };
}

export function compareExtractedTotals(document: PurchaseExtractedDocument) {
  const lineResult = extractedDocumentLineSubtotal(document);
  const calculated = lineResult.subtotal - (document.discountTotal ?? 0) + (document.shippingTotal ?? 0);
  const sourceReference = document.total ?? document.subtotal;
  if (sourceReference === null) return { ...lineResult, calculatedTotal: Math.round(calculated * 100) / 100, sourceTotal: null, difference: null };
  const difference = Math.round((sourceReference - calculated) * 100) / 100;
  return { ...lineResult, calculatedTotal: Math.round(calculated * 100) / 100, sourceTotal: sourceReference, difference };
}

export function normalizeSupplierAlias(value: string) {
  return normalizeMatchText(value).replace(/\s+/g, " ").trim();
}

export function sourceRowIdentityFingerprint(value: string) {
  return normalizeSupplierAlias(value)
    .replace(/[\u064B-\u065F\u0670]/g, "")
    .replace(/\b(?:qty|quantity|عدد|كمية|cost|price|سعر|تكلفة)\b/gi, " ")
    .replace(/[٠-٩۰-۹\d.,٫٬]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function startsWithBytes(bytes: Uint8Array, signature: number[]) {
  return signature.every((value, index) => bytes[index] === value);
}

/**
 * PDF validation deliberately uses a real PDF parser instead of scanning raw
 * bytes for `/Type /Page`. pdf-lib rejects malformed/encrypted documents by
 * default, and lets us read the authoritative page tree without OCR.
 */
export async function countPdfPages(bytes: Uint8Array): Promise<number> {
  try {
    const { PDFDocument } = await import("pdf-lib");
    const document = await PDFDocument.load(bytes, {
      updateMetadata: false,
      throwOnInvalidObject: true,
    });
    const count = document.getPageCount();
    if (!Number.isInteger(count) || count < 1) throw new Error("PDF_EMPTY");
    return count;
  } catch (error) {
    const message = error instanceof Error ? error.message.toLowerCase() : "";
    if (message.includes("encrypted") || message.includes("password")) {
      throw new Error("ملف PDF مشفّر أو محمي بكلمة مرور، وهذا النوع غير مدعوم للقراءة الآلية.");
    }
    if (message.includes("cannot find module") || message.includes("pdf-lib")) {
      throw new Error("مكتبة التحقق من PDF غير مثبتة على الخادم بعد.");
    }
    throw new Error("ملف PDF تالف أو لا يمكن تحليله بأمان. أعد حفظه كـ PDF عادي أو ارفع الصفحة كصورة.");
  }
}

export async function validatePurchaseImportFile(
  bytes: Uint8Array,
  declaredMimeType: string,
  limits: { maxBytes: number; maxPdfPages: number },
): Promise<PurchaseImportFileValidation> {
  if (bytes.byteLength === 0) return { ok: false, error: "الملف فارغ." };
  if (bytes.byteLength > limits.maxBytes) return { ok: false, error: `حجم الملف أكبر من الحد المسموح (${Math.ceil(limits.maxBytes / 1024 / 1024)} MB).` };

  const pdf = startsWithBytes(bytes, [0x25, 0x50, 0x44, 0x46, 0x2d]); // %PDF-
  const jpeg = startsWithBytes(bytes, [0xff, 0xd8, 0xff]);
  const png = startsWithBytes(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ascii = new TextDecoder("ascii");
  const webp = bytes.byteLength >= 12 && ascii.decode(bytes.subarray(0, 4)) === "RIFF" && ascii.decode(bytes.subarray(8, 12)) === "WEBP";

  if (pdf) {
    try {
      const pageCount = await countPdfPages(bytes);
      if (pageCount > limits.maxPdfPages) return { ok: false, error: `ملف PDF يحتوي ${pageCount} صفحة، والحد الحالي ${limits.maxPdfPages} صفحات.` };
      return { ok: true, sourceType: "PDF", mimeType: "application/pdf", pageCount };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : "تعذر تحليل ملف PDF." };
    }
  }
  if (jpeg) return { ok: true, sourceType: "IMAGE", mimeType: "image/jpeg", pageCount: 1 };
  if (png) return { ok: true, sourceType: "IMAGE", mimeType: "image/png", pageCount: 1 };
  if (webp) return { ok: true, sourceType: "IMAGE", mimeType: "image/webp", pageCount: 1 };

  if (/pdf|image/i.test(declaredMimeType)) return { ok: false, error: "امتداد أو نوع الملف لا يطابق محتواه الفعلي." };
  return { ok: false, error: "نوع الملف غير مدعوم. استخدم PDF أو JPG أو PNG أو WEBP." };
}
