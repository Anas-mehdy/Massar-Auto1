"use client";

import { AlertTriangle, Check, ClipboardPaste, Loader2, Table2, X } from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  autoDetectColumnMapping,
  buildImportedPurchaseRows,
  detectHeaderRow,
  parseFlexibleNumber,
  parsePastedTable,
  normalizeArabicDigits,
  type ImportedPurchaseRowDraft,
  type PurchaseImportColumnKey,
  type PurchaseImportColumnMapping,
} from "@/lib/purchase-import";
import { matchImportedPurchaseRowsAction, searchPurchaseInventoryAction } from "./actions";

type InventoryCandidate = Awaited<ReturnType<typeof searchPurchaseInventoryAction>>[number];

export type ResolvedImportedPurchaseRow = {
  rowIndex: number;
  sourceText: string;
  name: string;
  barcode: string;
  quantity: string;
  unitCost: string;
  salePrice: string;
  state: "existing" | "new" | "review";
  item: InventoryCandidate | null;
  candidates: InventoryCandidate[];
};

const COLUMN_LABELS: Record<PurchaseImportColumnKey, string> = {
  name: "اسم الصنف",
  barcode: "الباركود / المعرف",
  quantity: "الكمية",
  unitCost: "تكلفة الوحدة",
  salePrice: "سعر البيع (اختياري)",
};


function withDuplicateBarcodeWarnings(rows: ImportedPurchaseRowDraft[]) {
  const seen = new Map<string, number>();
  return rows.map((row) => {
    const barcode = normalizeArabicDigits(row.barcode).replace(/\s+/g, "");
    const warnings = row.warnings.filter((warning) => !warning.includes("الباركود مكرر"));
    if (barcode) {
      const previous = seen.get(barcode);
      if (previous !== undefined) warnings.push(`الباركود مكرر أيضاً في صف ${previous}. لن يتم دمج الصفين تلقائياً.`);
      else seen.set(barcode, row.rowIndex);
    }
    return { ...row, barcode, warnings };
  });
}

function validateEditableRow(row: ImportedPurchaseRowDraft): ImportedPurchaseRowDraft {
  const quantity = parseFlexibleNumber(row.quantity || "1", { integer: true, required: true });
  const unitCost = parseFlexibleNumber(row.unitCost, { required: true });
  const salePrice = parseFlexibleNumber(row.salePrice, { required: false });
  const errors: string[] = [];
  const warnings = row.warnings.filter((warning) => warning.includes("الباركود مكرر"));
  if (!row.name.trim() && !row.barcode.trim()) errors.push("أدخل اسم الصنف أو الباركود على الأقل.");
  if (quantity.error || quantity.value === null || quantity.value <= 0) errors.push(quantity.error || "الكمية يجب أن تكون أكبر من صفر.");
  if (unitCost.error || unitCost.value === null) errors.push(unitCost.error || "تكلفة الوحدة مطلوبة.");
  if (row.salePrice.trim() && (salePrice.error || salePrice.value === null)) errors.push(salePrice.error || "سعر البيع غير صالح.");
  if (quantity.warning) warnings.push(`الكمية: ${quantity.warning}`);
  if (unitCost.warning) warnings.push(`التكلفة: ${unitCost.warning}`);
  if (salePrice.warning) warnings.push(`سعر البيع: ${salePrice.warning}`);
  return {
    ...row,
    quantity: quantity.value === null ? row.quantity : String(quantity.value),
    unitCost: unitCost.value === null ? row.unitCost : String(unitCost.value),
    salePrice: salePrice.value === null ? row.salePrice : String(salePrice.value),
    errors,
    warnings,
  };
}

export function PurchaseImportPanel({ onImport }: { onImport: (rows: ResolvedImportedPurchaseRow[]) => void }) {
  const [open, setOpen] = useState(false);
  const [rawText, setRawText] = useState("");
  const [headerRow, setHeaderRow] = useState(false);
  const [mapping, setMapping] = useState<PurchaseImportColumnMapping>({ name: null, barcode: null, quantity: null, unitCost: null, salePrice: null });
  const [previewRows, setPreviewRows] = useState<ImportedPurchaseRowDraft[]>([]);
  const [columnCount, setColumnCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [ambiguityConfirmed, setAmbiguityConfirmed] = useState(false);

  const validRows = useMemo(() => previewRows.filter((row) => row.errors.length === 0), [previewRows]);
  const invalidRows = previewRows.length - validRows.length;
  const hasNumberAmbiguity = previewRows.some((row) => row.warnings.some((warning) => warning.includes("قد يعني")));

  function rebuild(text: string, nextHeader?: boolean, nextMapping?: PurchaseImportColumnMapping) {
    setRawText(text);
    setError("");
    setAmbiguityConfirmed(false);
    const table = parsePastedTable(text);
    setColumnCount(table.columnCount);
    if (!table.rows.length) {
      setPreviewRows([]);
      return;
    }
    const detectedHeader = nextHeader ?? detectHeaderRow(table.rows);
    const detectedMapping = nextMapping ?? autoDetectColumnMapping(table.rows, detectedHeader);
    setHeaderRow(detectedHeader);
    setMapping(detectedMapping);
    setPreviewRows(withDuplicateBarcodeWarnings(buildImportedPurchaseRows(table.rows, detectedMapping, { headerRow: detectedHeader })));
  }

  function changeHeader(value: boolean) {
    const table = parsePastedTable(rawText);
    const next = autoDetectColumnMapping(table.rows, value);
    rebuild(rawText, value, next);
  }

  function changeMapping(key: PurchaseImportColumnKey, value: string) {
    const next = { ...mapping, [key]: value === "" ? null : Number(value) };
    setMapping(next);
    rebuild(rawText, headerRow, next);
  }

  function patchPreview(rowIndex: number, field: "name" | "barcode" | "quantity" | "unitCost" | "salePrice", value: string) {
    setPreviewRows((current) => withDuplicateBarcodeWarnings(current.map((row) => row.rowIndex === rowIndex ? validateEditableRow({ ...row, [field]: value }) : row)));
  }

  async function importValidRows() {
    if (!validRows.length) return;
    if (hasNumberAmbiguity && !ambiguityConfirmed) {
      setError("راجع تنسيقات الأرقام الغامضة ثم فعّل تأكيد المراجعة قبل الاستيراد.");
      return;
    }
    setLoading(true);
    setError("");
    const matched = await matchImportedPurchaseRowsAction(validRows.map((row) => ({
      rowIndex: row.rowIndex,
      sourceText: row.sourceText,
      name: row.name || null,
      barcode: row.barcode || null,
    })));
    setLoading(false);
    if (!matched.ok) {
      setError("error" in matched ? matched.error : "تعذر مطابقة الصفوف مع المخزون.");
      return;
    }
    const byRow = new Map(matched.matches.map((match) => [match.rowIndex, match]));
    const resolved: ResolvedImportedPurchaseRow[] = validRows.map((row) => {
      const match = byRow.get(row.rowIndex);
      if (!match) return { ...row, state: "new", item: null, candidates: [] };
      if (match.resolution.state === "existing") {
        const matchedId = match.resolution.item.id;
        const item = match.candidates.find((candidate) => candidate.id === matchedId) ?? match.candidates[0] ?? null;
        return { ...row, state: "existing", item, candidates: item ? [item] : [] };
      }
      if (match.resolution.state === "review") return { ...row, state: "review", item: null, candidates: match.candidates };
      return { ...row, state: "new", item: null, candidates: [] };
    });
    onImport(resolved);
    const invalidOnly = previewRows.filter((row) => row.errors.length > 0);
    setPreviewRows(invalidOnly);
    if (!invalidOnly.length) {
      setRawText("");
      setOpen(false);
    }
  }

  if (!open) {
    return <Button type="button" variant="outline" onClick={() => setOpen(true)} className="font-black"><ClipboardPaste className="ml-1.5 h-4 w-4" />لصق من Excel</Button>;
  }

  return <section className="rounded-2xl border border-cyan-200 bg-cyan-50/40 p-4 dark:border-cyan-900/70 dark:bg-cyan-950/20">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><div className="flex items-center gap-2"><Table2 className="h-5 w-5 text-cyan-700 dark:text-cyan-300" /><h3 className="text-sm font-black text-slate-900 dark:text-slate-100">لصق عدة صفوف من Excel</h3></div><p className="mt-1 text-xs font-semibold leading-5 text-slate-500 dark:text-slate-400">اللصق يبني معاينة فقط. لا ينشئ مخزوناً ولا يعتمد الفاتورة.</p></div>
      <button type="button" onClick={() => setOpen(false)} className="rounded-lg p-2 text-slate-400 hover:bg-white hover:text-slate-700 dark:hover:bg-slate-900"><X className="h-4 w-4" /></button>
    </div>

    <div className="mt-4 rounded-xl bg-slate-50 p-3 text-xs leading-6 text-slate-600 dark:bg-slate-950/50 dark:text-slate-300">
      <p><strong>كيف تجهّز الجدول؟</strong> كل صف يمثل صنفاً. انسخ الخلايا من Excel والصقها هنا؛ ترتيب الأعمدة لا يهم، لأنك تختار وظيفة كل عمود في المعاينة.</p>
      <p>الأعمدة: اسم الصنف، الكمية، تكلفة الوحدة؛ والباركود وسعر البيع اختياريان. يفضّل نسخ صف العناوين أيضاً.</p>
      <div className="my-2 overflow-x-auto"><table className="w-full text-right"><thead><tr>{["اسم الصنف", "الكمية", "تكلفة الوحدة", "سعر البيع"].map(label => <th className="px-2" key={label}>{label}</th>)}</tr></thead><tbody><tr><td className="px-2">شاحن USB-C</td><td className="px-2">10</td><td className="px-2">5</td><td className="px-2">8</td></tr></tbody></table></div>
      <p>التصنيف والتوافقات: أكملهما بعد إضافة البنود؛ يمكنك تطبيق تصنيف واحد على عدة أصناف جديدة محددة.</p>
      <p className="mt-1 font-bold">هذه الأداة لا تستخدم AI ولا تستهلك قراءاتك. الجداول ذات الخلايا المدمجة والعناوين المتعددة تحتاج ترتيباً قبل اللصق. لقراءة مستند، استخدم استيراد صورة أو PDF.</p>
    </div>
    <textarea
      value={rawText}
      onChange={(event) => rebuild(event.target.value)}
      onPaste={(event) => {
        const pasted = event.clipboardData.getData("text/plain");
        if (pasted) { event.preventDefault(); rebuild(pasted); }
      }}
      className="erp-input mt-4 min-h-28 resize-y font-mono text-xs"
      placeholder={'الصق هنا صفوف Excel، مثال:\nشاشة A52\t1234567890123\t2\t14.5\t22'}
    />

    {columnCount > 0 && <div className="mt-4 space-y-4">
      <label className="flex items-center gap-2 text-xs font-bold text-slate-600 dark:text-slate-300"><input type="checkbox" checked={headerRow} onChange={(event) => changeHeader(event.target.checked)} />أول صف يحتوي على عناوين الأعمدة</label>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {(Object.keys(COLUMN_LABELS) as PurchaseImportColumnKey[]).map((key) => <label key={key} className="grid gap-1 text-[11px] font-black text-slate-600 dark:text-slate-300">{COLUMN_LABELS[key]}<select value={mapping[key] ?? ""} onChange={(event) => changeMapping(key, event.target.value)} className="erp-input h-10 text-xs"><option value="">غير مستخدم</option>{Array.from({ length: columnCount }, (_, index) => <option key={index} value={index}>العمود {index + 1}</option>)}</select></label>)}
      </div>
    </div>}

    {previewRows.length > 0 && <div className="mt-4 overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-950/40">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-3 py-2 dark:border-slate-800"><span className="text-xs font-black text-slate-700 dark:text-slate-200">المعاينة: {previewRows.length} صف</span><span className="text-[10px] font-bold text-slate-400">الصحيح {validRows.length} • يحتاج تصحيح {invalidRows}</span></div>
      <div className="max-h-[520px] overflow-auto">
        <table className="min-w-[920px] w-full text-xs"><thead className="sticky top-0 bg-slate-50 dark:bg-slate-900"><tr className="text-right text-[10px] font-black text-slate-500"><th className="p-2">صف</th><th className="p-2">الاسم</th><th className="p-2">الباركود</th><th className="p-2">الكمية</th><th className="p-2">التكلفة</th><th className="p-2">سعر البيع</th><th className="p-2">الحالة</th></tr></thead><tbody>{previewRows.map((row) => <tr key={row.rowIndex} className="border-t border-slate-100 align-top dark:border-slate-800"><td className="p-2 font-numeric font-black text-slate-400">{row.rowIndex}</td><td className="p-2"><input value={row.name} onChange={(event) => patchPreview(row.rowIndex, "name", event.target.value)} className="erp-input h-9 min-w-44 text-xs" /></td><td className="p-2"><input value={row.barcode} onChange={(event) => patchPreview(row.rowIndex, "barcode", event.target.value)} className="erp-input h-9 min-w-36 font-numeric text-xs" /></td><td className="p-2"><input value={row.quantity} onChange={(event) => patchPreview(row.rowIndex, "quantity", event.target.value)} className="erp-input h-9 w-24 font-numeric text-xs" /></td><td className="p-2"><input value={row.unitCost} onChange={(event) => patchPreview(row.rowIndex, "unitCost", event.target.value)} className="erp-input h-9 w-28 font-numeric text-xs" /></td><td className="p-2"><input value={row.salePrice} onChange={(event) => patchPreview(row.rowIndex, "salePrice", event.target.value)} className="erp-input h-9 w-28 font-numeric text-xs" /></td><td className="p-2 min-w-64">{row.errors.length ? <div className="space-y-1 text-[10px] font-bold text-rose-600 dark:text-rose-300">{row.errors.map((item) => <div key={item}>• {item}</div>)}</div> : <div className="flex items-center gap-1 text-[10px] font-black text-emerald-700 dark:text-emerald-300"><Check className="h-3.5 w-3.5" />صحيح</div>}{row.warnings.length > 0 && <div className="mt-1 space-y-1 text-[10px] font-bold text-amber-700 dark:text-amber-300">{row.warnings.map((item) => <div key={item}>⚠ {item}</div>)}</div>}</td></tr>)}</tbody></table>
      </div>
    </div>}

    {hasNumberAmbiguity && <label className="mt-3 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs font-bold text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200"><input className="mt-0.5" type="checkbox" checked={ambiguityConfirmed} onChange={(event) => setAmbiguityConfirmed(event.target.checked)} /><span>راجعت القيم ذات الفاصلة الغامضة واخترت/تأكدت من معناها قبل إدخالها في الفاتورة.</span></label>}
    {error && <div className="mt-3 flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs font-bold text-rose-700 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-200"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />{error}</div>}
    <div className="mt-4 flex flex-wrap items-center justify-between gap-3"><p className="text-[10px] font-semibold text-slate-500 dark:text-slate-400">الصفوف غير الصحيحة تبقى هنا للتصحيح، بينما يمكن إدخال الصفوف الصحيحة دون فقدانها.</p><Button type="button" onClick={() => void importValidRows()} disabled={loading || !validRows.length || (hasNumberAmbiguity && !ambiguityConfirmed)} className="font-black">{loading ? <><Loader2 className="ml-2 h-4 w-4 animate-spin" />جارٍ المطابقة…</> : `إدخال ${validRows.length} صف صحيح`}</Button></div>
  </section>;
}
