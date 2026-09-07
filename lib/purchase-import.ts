export type PurchaseImportColumnKey = "name" | "barcode" | "quantity" | "unitCost" | "salePrice";

export type PurchaseImportColumnMapping = Record<PurchaseImportColumnKey, number | null>;

export type ParsedTable = {
  rows: string[][];
  columnCount: number;
  delimiter: "tab" | "semicolon" | "comma" | "single";
};

export type NumberParseResult = {
  raw: string;
  normalized: string;
  value: number | null;
  ambiguous: boolean;
  candidates: number[];
  warning?: string;
  error?: string;
};

export type ImportedPurchaseRowDraft = {
  rowIndex: number;
  sourceText: string;
  name: string;
  barcode: string;
  quantity: string;
  unitCost: string;
  salePrice: string;
  errors: string[];
  warnings: string[];
};

export type PurchaseMatchCandidateLike = {
  id: string;
  name: string;
  barcode?: string | null;
  sku?: string | null;
  category?: string | null;
  description?: string | null;
};

export type PurchaseMatchResolution =
  | { state: "existing"; item: PurchaseMatchCandidateLike; reason: "barcode" | "sku" }
  | { state: "review"; candidates: PurchaseMatchCandidateLike[]; reason: "name" | "identifier-duplicate" }
  | { state: "new"; candidates: []; reason: "no-match" };

const ARABIC_DIGITS: Record<string, string> = {
  "٠": "0", "١": "1", "٢": "2", "٣": "3", "٤": "4",
  "٥": "5", "٦": "6", "٧": "7", "٨": "8", "٩": "9",
  "۰": "0", "۱": "1", "۲": "2", "۳": "3", "۴": "4",
  "۵": "5", "۶": "6", "۷": "7", "۸": "8", "۹": "9",
};

const HEADER_ALIASES: Record<PurchaseImportColumnKey, string[]> = {
  name: ["name", "item", "product", "description", "اسم", "اسم الصنف", "اسم المنتج", "اسم القطعة", "الصنف", "المنتج", "القطعة", "الوصف"],
  barcode: ["barcode", "bar code", "ean", "upc", "code", "sku", "identifier", "باركود", "الباركود", "كود", "الكود", "رمز", "المعرف", "معرف"],
  quantity: ["qty", "quantity", "count", "كمية", "الكمية", "عدد", "العدد"],
  unitCost: ["cost", "unit cost", "purchase price", "buy price", "التكلفة", "تكلفة", "تكلفة الوحدة", "سعر الشراء", "شراء"],
  salePrice: ["sale", "sale price", "selling price", "retail", "سعر البيع", "بيع"],
};

function normalizeHeader(value: string) {
  return value
    .trim()
    .toLocaleLowerCase()
    .replace(/[\s_\-–—]+/g, " ")
    .replace(/[\u064B-\u065F\u0670]/g, "");
}

export function normalizeArabicDigits(value: string) {
  return value.replace(/[٠-٩۰-۹]/g, (digit) => ARABIC_DIGITS[digit] ?? digit);
}

function uniqueFinite(values: number[]) {
  return [...new Set(values.filter((value) => Number.isFinite(value)))];
}

function parseCanonical(value: string) {
  if (!/^[+-]?\d+(?:\.\d+)?$/.test(value)) return null;
  const result = Number(value);
  return Number.isFinite(result) ? result : null;
}

/**
 * Parses monetary/quantity values pasted from Arabic or English spreadsheets.
 * Ambiguous formats are deliberately surfaced instead of silently choosing a locale.
 */
export function parseFlexibleNumber(rawValue: string, options: { integer?: boolean; required?: boolean } = {}): NumberParseResult {
  const raw = rawValue ?? "";
  let value = normalizeArabicDigits(raw)
    .replace(/\u00A0|\u202F/g, " ")
    .trim()
    .replace(/\s+/g, "")
    .replace(/٫/g, ".")
    .replace(/٬/g, ",")
    .replace(/[ـ]/g, "");

  if (!value) {
    return options.required
      ? { raw, normalized: "", value: null, ambiguous: false, candidates: [], error: "القيمة مطلوبة." }
      : { raw, normalized: "", value: null, ambiguous: false, candidates: [] };
  }

  value = value.replace(/[^0-9.,+\-]/g, "");
  if (!value || !/[0-9]/.test(value)) {
    return { raw, normalized: value, value: null, ambiguous: false, candidates: [], error: "صيغة الرقم غير صالحة." };
  }

  const commaCount = (value.match(/,/g) ?? []).length;
  const dotCount = (value.match(/\./g) ?? []).length;
  const candidates: number[] = [];
  let ambiguous = false;
  let warning: string | undefined;

  if (commaCount > 0 && dotCount > 0) {
    const lastComma = value.lastIndexOf(",");
    const lastDot = value.lastIndexOf(".");
    const decimalSeparator = lastComma > lastDot ? "," : ".";
    const thousandsSeparator = decimalSeparator === "," ? "." : ",";
    const normalized = value.split(thousandsSeparator).join("").replace(decimalSeparator, ".");
    const parsed = parseCanonical(normalized);
    if (parsed !== null) candidates.push(parsed);
  } else if (commaCount > 0 || dotCount > 0) {
    const separator = commaCount > 0 ? "," : ".";
    const count = commaCount > 0 ? commaCount : dotCount;
    const parts = value.split(separator);

    if (count > 1) {
      const allThousands = parts.slice(1).every((part) => /^\d{3}$/.test(part));
      if (allThousands) {
        const parsed = parseCanonical(parts.join(""));
        if (parsed !== null) candidates.push(parsed);
      } else {
        const decimalPart = parts.pop() ?? "";
        const integerPart = parts.join("");
        const parsed = parseCanonical(`${integerPart}.${decimalPart}`);
        if (parsed !== null) candidates.push(parsed);
      }
    } else {
      const [left, right = ""] = parts;
      const asDecimal = parseCanonical(`${left}.${right}`);
      const asThousands = /^\d{1,3}$/.test(left.replace(/^[+\-]/, "")) && /^\d{3}$/.test(right)
        ? parseCanonical(`${left}${right}`)
        : null;
      if (asDecimal !== null) candidates.push(asDecimal);
      if (asThousands !== null) candidates.push(asThousands);
      if (asDecimal !== null && asThousands !== null && asDecimal !== asThousands) {
        ambiguous = true;
        warning = `التنسيق “${raw.trim()}” قد يعني ${asThousands} أو ${asDecimal}. راجع القيمة.`;
      }
    }
  } else {
    const parsed = parseCanonical(value);
    if (parsed !== null) candidates.push(parsed);
  }

  let resolved = uniqueFinite(candidates);
  if (options.integer) resolved = resolved.filter((candidate) => Number.isInteger(candidate));
  if (!resolved.length) {
    return {
      raw,
      normalized: value,
      value: null,
      ambiguous,
      candidates: uniqueFinite(candidates),
      warning,
      error: options.integer ? "الكمية يجب أن تكون عدداً صحيحاً." : "صيغة الرقم غير صالحة.",
    };
  }

  const selected = resolved[0];
  if (selected < 0) {
    return { raw, normalized: String(selected), value: selected, ambiguous, candidates: resolved, warning, error: "القيمة لا يمكن أن تكون سالبة." };
  }

  return { raw, normalized: String(selected), value: selected, ambiguous, candidates: resolved, warning };
}

function chooseDelimiter(text: string): ParsedTable["delimiter"] {
  const firstNonEmpty = text.split(/\r?\n/).find((line) => line.trim()) ?? "";
  if (firstNonEmpty.includes("\t")) return "tab";
  const semicolons = (firstNonEmpty.match(/;/g) ?? []).length;
  const commas = (firstNonEmpty.match(/,/g) ?? []).length;
  if (semicolons >= 1 && semicolons >= commas) return "semicolon";
  // Commas are only treated as a row delimiter when there are several of them;
  // a single comma is commonly a decimal/thousands separator.
  if (commas >= 2) return "comma";
  return "single";
}

function splitDelimitedLine(line: string, delimiter: "\t" | ";" | "," | null) {
  if (!delimiter) return [line.trim()];
  const cells: string[] = [];
  let current = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"') {
      if (quoted && line[index + 1] === '"') { current += '"'; index += 1; }
      else quoted = !quoted;
      continue;
    }
    if (char === delimiter && !quoted) { cells.push(current.trim()); current = ""; continue; }
    current += char;
  }
  cells.push(current.trim());
  return cells;
}

export function parsePastedTable(text: string): ParsedTable {
  const normalized = text.replace(/\r\n?/g, "\n").trimEnd();
  if (!normalized.trim()) return { rows: [], columnCount: 0, delimiter: "single" };
  const kind = chooseDelimiter(normalized);
  const delimiter = kind === "tab" ? "\t" : kind === "semicolon" ? ";" : kind === "comma" ? "," : null;
  const rows = normalized
    .split("\n")
    .filter((line) => line.trim().length > 0)
    .map((line) => splitDelimitedLine(line, delimiter));
  const columnCount = rows.reduce((max, row) => Math.max(max, row.length), 0);
  return { rows, columnCount, delimiter: kind };
}

export function detectHeaderRow(rows: string[][]) {
  if (!rows.length) return false;
  const first = rows[0].map(normalizeHeader);
  let hits = 0;
  for (const aliases of Object.values(HEADER_ALIASES)) {
    if (first.some((cell) => aliases.some((alias) => cell === normalizeHeader(alias)))) hits += 1;
  }
  return hits >= 2;
}

export function autoDetectColumnMapping(rows: string[][], headerRow: boolean): PurchaseImportColumnMapping {
  const mapping: PurchaseImportColumnMapping = { name: null, barcode: null, quantity: null, unitCost: null, salePrice: null };
  if (!rows.length) return mapping;
  const sample = rows[0];
  if (headerRow) {
    const headers = sample.map(normalizeHeader);
    (Object.keys(mapping) as PurchaseImportColumnKey[]).forEach((key) => {
      const aliases = HEADER_ALIASES[key].map(normalizeHeader);
      const index = headers.findIndex((header) => aliases.includes(header));
      if (index >= 0) mapping[key] = index;
    });
    return mapping;
  }
  // A conservative fallback for common Excel order: name, barcode, qty, cost, sale.
  if (sample.length >= 1) mapping.name = 0;
  if (sample.length >= 2) mapping.barcode = 1;
  if (sample.length >= 3) mapping.quantity = 2;
  if (sample.length >= 4) mapping.unitCost = 3;
  if (sample.length >= 5) mapping.salePrice = 4;
  return mapping;
}

function mappedCell(row: string[], mapping: PurchaseImportColumnMapping, key: PurchaseImportColumnKey) {
  const index = mapping[key];
  return index === null || index < 0 ? "" : (row[index] ?? "").trim();
}

export function buildImportedPurchaseRows(
  rows: string[][],
  mapping: PurchaseImportColumnMapping,
  options: { headerRow?: boolean } = {},
): ImportedPurchaseRowDraft[] {
  const dataRows = options.headerRow ? rows.slice(1) : rows;
  const seenBarcodes = new Map<string, number>();
  const drafts = dataRows.map((row, offset) => {
    const rowIndex = offset + (options.headerRow ? 2 : 1);
    const name = mappedCell(row, mapping, "name");
    const barcode = normalizeArabicDigits(mappedCell(row, mapping, "barcode")).replace(/\s+/g, "");
    const quantityRaw = mappedCell(row, mapping, "quantity");
    const unitCostRaw = mappedCell(row, mapping, "unitCost");
    const salePriceRaw = mappedCell(row, mapping, "salePrice");
    const quantity = parseFlexibleNumber(quantityRaw || "1", { integer: true, required: true });
    const unitCost = parseFlexibleNumber(unitCostRaw, { required: true });
    const salePrice = parseFlexibleNumber(salePriceRaw, { required: false });
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!name && !barcode) errors.push("أدخل اسم الصنف أو الباركود على الأقل.");
    if (quantity.error || quantity.value === null || quantity.value <= 0) errors.push(quantity.error || "الكمية يجب أن تكون أكبر من صفر.");
    if (unitCost.error || unitCost.value === null) errors.push(unitCost.error || "تكلفة الوحدة مطلوبة.");
    if (salePriceRaw && (salePrice.error || salePrice.value === null)) errors.push(salePrice.error || "سعر البيع غير صالح.");
    if (quantity.warning) warnings.push(`الكمية: ${quantity.warning}`);
    if (unitCost.warning) warnings.push(`التكلفة: ${unitCost.warning}`);
    if (salePrice.warning) warnings.push(`سعر البيع: ${salePrice.warning}`);

    return {
      rowIndex,
      sourceText: row.join("\t"),
      name,
      barcode,
      quantity: quantity.value === null ? quantityRaw : String(quantity.value),
      unitCost: unitCost.value === null ? unitCostRaw : String(unitCost.value),
      salePrice: salePrice.value === null ? salePriceRaw : String(salePrice.value),
      errors,
      warnings,
    } satisfies ImportedPurchaseRowDraft;
  });

  for (const draft of drafts) {
    if (!draft.barcode) continue;
    const previous = seenBarcodes.get(draft.barcode);
    if (previous !== undefined) {
      draft.warnings.push(`الباركود مكرر أيضاً في صف ${previous}. لن يتم دمج الصفين تلقائياً.`);
    } else {
      seenBarcodes.set(draft.barcode, draft.rowIndex);
    }
  }
  return drafts;
}

export function normalizeMatchText(value: string) {
  return normalizeArabicDigits(value)
    .toLocaleLowerCase()
    .replace(/[\u064B-\u065F\u0670]/g, "")
    .replace(/[أإآ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي")
    .replace(/[^a-z0-9\u0600-\u06FF]+/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenize(value: string) {
  return normalizeMatchText(value).split(" ").filter((token) => token.length >= 2);
}

export function scoreNameCandidate(importedName: string, candidate: Pick<PurchaseMatchCandidateLike, "name" | "description" | "category">) {
  const source = normalizeMatchText(importedName);
  const targetName = normalizeMatchText(candidate.name);
  if (!source || !targetName) return 0;
  if (source === targetName) return 100;
  if (targetName.includes(source) || source.includes(targetName)) return 82;
  const sourceTokens = new Set(tokenize(source));
  const targetTokens = new Set(tokenize(`${candidate.name} ${candidate.description ?? ""} ${candidate.category ?? ""}`));
  if (!sourceTokens.size) return 0;
  let shared = 0;
  sourceTokens.forEach((token) => { if (targetTokens.has(token)) shared += 1; });
  return Math.round((shared / sourceTokens.size) * 75);
}

/**
 * Exact identifiers may resolve automatically. Name matches are suggestions only,
 * including exact-name matches, so quality/color/model variants are never merged silently.
 */
export function resolveImportedMatch(input: {
  barcode?: string;
  name?: string;
  exactBarcode: PurchaseMatchCandidateLike[];
  exactSku: PurchaseMatchCandidateLike[];
  nameCandidates: PurchaseMatchCandidateLike[];
}): PurchaseMatchResolution {
  if (input.exactBarcode.length === 1) return { state: "existing", item: input.exactBarcode[0], reason: "barcode" };
  if (input.exactBarcode.length > 1) return { state: "review", candidates: input.exactBarcode, reason: "identifier-duplicate" };
  if (input.exactSku.length === 1) return { state: "existing", item: input.exactSku[0], reason: "sku" };
  if (input.exactSku.length > 1) return { state: "review", candidates: input.exactSku, reason: "identifier-duplicate" };
  const ranked = [...input.nameCandidates]
    .map((candidate) => ({ candidate, score: scoreNameCandidate(input.name ?? "", candidate) }))
    .filter((entry) => entry.score >= 35)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)
    .map((entry) => entry.candidate);
  return ranked.length ? { state: "review", candidates: ranked, reason: "name" } : { state: "new", candidates: [], reason: "no-match" };
}

export function pricingSuggestion(unitCost: number, increasePercent: number, rounding: "none" | "0.5" | "1" | "5") {
  const cost = Number.isFinite(unitCost) ? Math.max(0, unitCost) : 0;
  const increase = Number.isFinite(increasePercent) ? Math.max(0, increasePercent) : 0;
  const raw = cost * (1 + increase / 100);
  const step = rounding === "0.5" ? 0.5 : rounding === "1" ? 1 : rounding === "5" ? 5 : 0;
  if (!step) return Math.round((raw + Number.EPSILON) * 100) / 100;
  return Math.round(raw / step) * step;
}

export function isLikelyScannerSequence(timestamps: number[], minimumLength = 4) {
  if (timestamps.length < minimumLength) return false;
  const elapsed = timestamps[timestamps.length - 1] - timestamps[0];
  const averageGap = elapsed / Math.max(1, timestamps.length - 1);
  return elapsed <= Math.max(650, timestamps.length * 85) && averageGap <= 95;
}

export function suggestedCompatibilityDataset(categoryOrName: string) {
  const text = normalizeMatchText(categoryOrName);
  if (/شاش|display|screen/.test(text)) return "SCREEN";
  if (/بطاري|battery/.test(text)) return "BATTERY";
  if (/شحن|charging|port/.test(text)) return "CHARGING_PORT";
  if (/كونكتر.*شاش|display connector|connector/.test(text)) return "DISPLAY_CONNECTOR";
  if (/فلات|flex|باور|power/.test(text)) return "POWER_FLEX";
  if (/فريم|frame/.test(text)) return "FRAME";
  if (/غطاء|cover/.test(text)) return "BACK_COVER";
  if (/حماي|tempered/.test(text)) return "TEMPERED_GLASS";
  if (/زجاج|touch glass|oca/.test(text)) return "TOUCH_GLASS";
  return "SCREEN";
}
