"use client";

import { AlertTriangle, Check, FileImage, FileText, Loader2, RefreshCw, Save, ScanText, Sparkles, Upload, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import type { PurchaseExtractedDocument } from "@/lib/purchase-document-import";
import {
  confirmPurchaseSupplierAliasAction,
  createPurchaseTextImportSourceAction,
  extractPurchaseImportSourceAction,
  getPurchaseAiQuotaStatusAction,
  removePurchaseSupplierAliasAction,
  reviewPurchaseImportSourceAction,
} from "./actions";

type SuccessfulReviewResult = Extract<Awaited<ReturnType<typeof reviewPurchaseImportSourceAction>>, { ok: true }>;
type ReviewPayload = SuccessfulReviewResult["review"];
type SuccessfulQuotaResult = Extract<Awaited<ReturnType<typeof getPurchaseAiQuotaStatusAction>>, { ok: true }>;
type AiQuota = SuccessfulQuotaResult["quota"];
type ReviewLine = ReviewPayload["lines"][number];
type InventoryItem = NonNullable<ReviewLine["item"]>;

export type ResolvedDocumentPurchaseRow = {
  importSourceId: string;
  importRowKey: string;
  sourceText: string;
  purchaseUnit: string;
  state: "existing" | "new";
  item: InventoryItem | null;
  name: string;
  barcode: string;
  quantity: string;
  unitCost: string;
  salePrice: string;
};

type EditableLine = ReviewLine & {
  selectedItem: InventoryItem | null;
  resolvedState: "existing" | "new" | "review" | "incomplete";
  editedName: string;
  editedBarcode: string;
  editedQuantity: string;
  editedUnitCost: string;
  editedSalePrice: string;
  unitConfirmed: boolean;
  priceConfirmed: boolean;
};

function requestKey() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto ? `purchase-extract:${crypto.randomUUID()}` : `purchase-extract:${Date.now()}:${Math.random()}`;
}
function numberString(value: number | null | undefined) { return value === null || value === undefined ? "" : String(value); }
function money(value: number | null | undefined, currency: string) {
  if (value === null || value === undefined) return "—";
  return new Intl.NumberFormat("ar", { style: "currency", currency, maximumFractionDigits: 2 }).format(value);
}
function localLine(line: ReviewLine): EditableLine {
  return {
    ...line,
    selectedItem: line.item,
    resolvedState: line.reviewState,
    editedName: line.name ?? "",
    editedBarcode: line.barcode ?? "",
    editedQuantity: numberString(line.quantity),
    editedUnitCost: line.priceAmbiguous ? "" : numberString(line.unitCost),
    editedSalePrice: numberString(line.salePrice),
    unitConfirmed: !line.unitAmbiguous,
    priceConfirmed: !line.priceAmbiguous,
  };
}

export function PurchaseDocumentImportPanel({
  currency,
  purchaseId,
  ensureDraft,
  existingImportKeys,
  hasExistingLines,
  onImport,
  onApplyHeader,
}: {
  currency: string;
  purchaseId: string | null;
  ensureDraft: () => Promise<string | null>;
  existingImportKeys: string[];
  hasExistingLines: boolean;
  onImport: (rows: ResolvedDocumentPurchaseRow[]) => void;
  onApplyHeader: (header: Pick<PurchaseExtractedDocument, "supplierName" | "invoiceDate" | "supplierInvoiceNumber" | "currency" | "discountTotal" | "shippingTotal">) => void;
}) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"file" | "text">("file");
  const [text, setText] = useState("");
  const [sourceId, setSourceId] = useState<string | null>(null);
  const [sourceType, setSourceType] = useState<"IMAGE" | "PDF" | "TEXT" | null>(null);
  const [review, setReview] = useState<ReviewPayload | null>(null);
  const [lines, setLines] = useState<EditableLine[]>([]);
  const [mobileTab, setMobileTab] = useState<"source" | "items">("items");
  const [busy, setBusy] = useState<"upload" | "extract" | "review" | "text" | "" >("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [quota, setQuota] = useState<AiQuota | null>(null);
  const [quotaLoading, setQuotaLoading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const existingKeys = useMemo(() => new Set(existingImportKeys), [existingImportKeys]);

  const [quotaError, setQuotaError] = useState("");
  const quotaRequest = useRef(0);
  const refreshQuota = useCallback(async () => {
    const request = ++quotaRequest.current;
    setQuotaLoading(true);
    try {
      const result = await getPurchaseAiQuotaStatusAction();
      if (request !== quotaRequest.current) return;
      if (result.ok) { setQuota(result.quota); setQuotaError(""); }
      else { setQuota(null); setQuotaError("تعذر تحميل حصة AI. أعد المحاولة؛ Excel والإدخال اليدوي متاحان."); }
    } catch {
      if (request === quotaRequest.current) { setQuota(null); setQuotaError("تعذر الاتصال للتحقق من حصة AI."); }
    } finally { if (request === quotaRequest.current) setQuotaLoading(false); }
  }, []);

  useEffect(() => {
    void refreshQuota();
    const refreshVisible = () => { if (document.visibilityState === "visible") void refreshQuota(); };
    window.addEventListener("focus", refreshVisible);
    document.addEventListener("visibilitychange", refreshVisible);
    const timer = window.setInterval(refreshVisible, 60_000);
    return () => { window.clearInterval(timer); window.removeEventListener("focus", refreshVisible); document.removeEventListener("visibilitychange", refreshVisible); quotaRequest.current++; };
  }, [refreshQuota]);

  const aiBlocked = !quota || Boolean(quotaError) || !quota.configured || quota.user.remaining <= 0 || quota.shop.remaining <= 0 ||
    quota.failedAttempts.userRemaining <= 0 || quota.failedAttempts.shopRemaining <= 0 || quota.budget.remainingUsd <= 0;

  async function ensurePurchase() {
    if (purchaseId) return purchaseId;
    setNotice("يتم حفظ المسودة أولاً حتى يبقى المصدر مرتبطاً بالفاتورة بأمان…");
    return ensureDraft();
  }

  async function loadReview(id: string) {
    setBusy("review"); setError("");
    const result = await reviewPurchaseImportSourceAction(id);
    setBusy("");
    if (!result.ok) { setError("error" in result ? result.error : "تعذر تحميل المراجعة."); return false; }
    setReview(result.review);
    setLines(result.review.lines.map(localLine));
    setSourceType(result.review.source.sourceType);
    setSourceId(id);
    setMobileTab("items");
    return true;
  }

  async function extract(id: string, forceReread = false) {
    setBusy("extract");
    setError("");
    setNotice(forceReread
      ? "إعادة القراءة المقصودة تُحسب قراءة AI جديدة. النتيجة لن تعدّل بنود المسودة قبل مراجعتك."
      : "تجري قراءة AI للمصدر. لن يتم اعتماد الفاتورة أو تغيير المخزون أو الحسابات في هذه الخطوة.");
    try {
      const result = await extractPurchaseImportSourceAction({ sourceId: id, requestKey: requestKey(), forceReread });
      if (!result.ok) { setError("error" in result ? result.error : "تعذر قراءة المصدر."); return; }
      await loadReview(id);
    } catch { setError("انقطع الاتصال أثناء القراءة. حدّث العداد وتحقق من النتيجة المحفوظة قبل إعادة القراءة."); }
    finally { setBusy(""); await refreshQuota(); }
  }

  async function uploadFile(file: File) {
    const id = await ensurePurchase();
    if (!id) { setError("تعذر حفظ المسودة قبل رفع الملف."); return; }
    setBusy("upload"); setError(""); setNotice("");
    try {
      const form = new FormData();
      form.set("purchaseId", id); form.set("file", file);
      const response = await fetch("/api/inventory/purchases/import-source", { method: "POST", body: form });
      const payload = await response.json();
      if (!response.ok || !payload.ok) throw new Error(payload.error || "تعذر رفع الملف.");
      setSourceId(payload.sourceId); setSourceType(payload.sourceType);
      setNotice(payload.reused
        ? "هذا الملف مرفوع مسبقاً لهذه المسودة؛ تم فتح نفس المصدر دون إنشاء نسخة أخرى أو استهلاك قراءة AI."
        : `تم حفظ المصدر بشكل خاص${payload.pageCount ? ` (${payload.pageCount} صفحة)` : ""}. الرفع وحده لا يستهلك حصة AI.`);
      setBusy("");
      await refreshQuota();
      if (payload.status === "REVIEW_READY") await loadReview(payload.sourceId);
    } catch (uploadError) {
      setBusy(""); setError((uploadError as Error).message || "تعذر رفع الملف.");
    }
  }

  async function submitText() {
    const id = await ensurePurchase();
    if (!id) { setError("تعذر حفظ المسودة قبل تحليل النص."); return; }
    setBusy("text"); setError(""); setNotice("");
    const result = await createPurchaseTextImportSourceAction({ purchaseId: id, text });
    setBusy("");
    if (!result.ok) { setError("error" in result ? result.error : "تعذر تحليل النص."); return; }
    setSourceId(result.sourceId); setSourceType("TEXT");
    setNotice(result.reused ? "هذا النص تمت مراجعته مسبقاً في المسودة؛ تم فتح نفس النتيجة." : "تم تحليل النص محلياً على الخادم وحفظ المصدر للمراجعة.");
    await loadReview(result.sourceId);
  }

  function patchLine(rowKey: string, patch: Partial<EditableLine>) {
    setLines((current) => current.map((line) => line.rowKey === rowKey ? { ...line, ...patch } : line));
  }

  function chooseCandidate(rowKey: string, item: InventoryItem) {
    patchLine(rowKey, { selectedItem: item, resolvedState: "existing" });
  }

  function chooseNew(rowKey: string) {
    patchLine(rowKey, { selectedItem: null, resolvedState: "new" });
  }

  function rowReady(line: EditableLine) {
    const quantity = Number(line.editedQuantity);
    const cost = Number(line.editedUnitCost);
    return Boolean(
      (line.resolvedState === "existing" ? line.selectedItem : line.editedName.trim()) &&
      Number.isInteger(quantity) && quantity > 0 && Number.isFinite(cost) && cost >= 0 &&
      line.unitConfirmed && line.priceConfirmed && line.resolvedState !== "review" && line.resolvedState !== "incomplete"
    );
  }

  function recomputeResolution(line: EditableLine, patch: Partial<EditableLine>) {
    const next = { ...line, ...patch };
    const quantity = Number(next.editedQuantity);
    const cost = Number(next.editedUnitCost);
    const basicComplete = Boolean((next.selectedItem || next.editedName.trim()) && Number.isInteger(quantity) && quantity > 0 && Number.isFinite(cost) && cost >= 0 && next.unitConfirmed && next.priceConfirmed);
    if (basicComplete && (next.selectedItem || next.resolvedState === "new")) next.resolvedState = next.selectedItem ? "existing" : "new";
    return next;
  }

  function patchAndResolve(rowKey: string, patch: Partial<EditableLine>) {
    setLines((current) => current.map((line) => line.rowKey === rowKey ? recomputeResolution(line, patch) : line));
  }

  async function rememberAlias(line: EditableLine) {
    if (!review?.currentSupplierId || !line.selectedItem || !line.editedName.trim()) return;
    setError("");
    const result = await confirmPurchaseSupplierAliasAction({
      supplierId: review.currentSupplierId,
      inventoryItemId: line.selectedItem.id,
      aliasText: line.editedName,
      sourceBarcode: line.editedBarcode || null,
    });
    if (!result.ok) { setError("error" in result ? result.error : "تعذر حفظ تسمية المورد."); return; }
    setNotice("تم حفظ تسمية المورد لهذا المتجر وهذا المورد فقط. ستستخدم عند التطابق النصي نفسه لاحقاً.");
    if (sourceId) await loadReview(sourceId);
  }

  async function removeAlias(aliasId: string) {
    if (!review?.currentSupplierId) return;
    const result = await removePurchaseSupplierAliasAction({ supplierId: review.currentSupplierId, aliasId });
    if (!result.ok) { setError("error" in result ? result.error : "تعذر إلغاء المطابقة."); return; }
    setNotice("تم إلغاء المطابقة المحفوظة.");
    if (sourceId) await loadReview(sourceId);
  }

  function transfer() {
    if (!sourceId) return;
    const ready = lines.filter(rowReady);
    const unique = ready.filter((line) => !existingKeys.has(`${sourceId}:${line.rowKey}`));
    if (!unique.length) { setError("لا توجد بنود جديدة جاهزة للنقل. راجع البنود الناقصة أو البنود المنقولة مسبقاً."); return; }
    onImport(unique.map((line) => ({
      importSourceId: sourceId,
      importRowKey: line.rowKey,
      sourceText: line.originalText,
      purchaseUnit: line.purchaseUnit ?? "",
      state: line.selectedItem ? "existing" : "new",
      item: line.selectedItem,
      name: line.editedName.trim(),
      barcode: line.editedBarcode.trim(),
      quantity: line.editedQuantity,
      unitCost: line.editedUnitCost,
      salePrice: line.editedSalePrice,
    })));
    setNotice(`تم نقل ${unique.length} بند إلى المسودة الحالية${ready.length > unique.length ? `، وتجاوز ${ready.length - unique.length} بنداً منقولاً سابقاً لمنع التكرار` : ""}. لم يتم اعتماد الفاتورة.`);
  }

  const readyCount = lines.filter(rowReady).length;
  const duplicateCount = sourceId ? lines.filter((line) => existingKeys.has(`${sourceId}:${line.rowKey}`)).length : 0;
  const sourceUrl = sourceId && sourceType !== "TEXT" ? `/api/inventory/purchases/source-files/${sourceId}` : null;

  return <section className="rounded-2xl border border-violet-200 bg-violet-50/30 p-4 dark:border-violet-900/70 dark:bg-violet-950/15">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><h3 className="flex items-center gap-2 text-sm font-black text-slate-900 dark:text-slate-100"><ScanText className="h-4 w-4 text-violet-600" />استيراد من صورة، PDF أو نص رسالة</h3><p className="mt-1 text-[11px] font-semibold text-slate-500 dark:text-slate-400">النتيجة تدخل مرحلة مراجعة فقط. الرفع والقراءة لا يغيران المخزون أو الحسابات ولا يعتمدان الفاتورة.</p></div>
      <Button type="button" variant="outline" size="sm" onClick={() => setOpen((value) => !value)}>{open ? <X className="ml-1 h-4 w-4" /> : <Upload className="ml-1 h-4 w-4" />}{open ? "إغلاق" : "استيراد فاتورة"}</Button>
    </div>
    <div className="mt-3"><AiQuotaCard quota={quota} loading={quotaLoading} error={quotaError} onRetry={() => void refreshQuota()} /></div>
    {open && <div className="mt-4 space-y-4">
      <div className="flex gap-2 rounded-xl border border-slate-200 bg-white p-1 dark:border-slate-800 dark:bg-slate-950"><button type="button" onClick={() => setMode("file")} className={`flex-1 rounded-lg px-3 py-2 text-xs font-black ${mode === "file" ? "bg-violet-600 text-white" : "text-slate-500"}`}><FileImage className="ml-1 inline h-4 w-4" />صورة أو PDF</button><button type="button" onClick={() => setMode("text")} className={`flex-1 rounded-lg px-3 py-2 text-xs font-black ${mode === "text" ? "bg-violet-600 text-white" : "text-slate-500"}`}><FileText className="ml-1 inline h-4 w-4" />نص منسوخ من واتساب</button></div>

      {!review && mode === "file" && <div className="space-y-3">
        <div className="rounded-xl border border-dashed border-violet-300 bg-white p-5 text-center dark:border-violet-800 dark:bg-slate-950"><input ref={fileRef} type="file" accept="application/pdf,image/jpeg,image/png,image/webp" className="hidden" onChange={(event) => { const file = event.target.files?.[0]; if (file) void uploadFile(file); event.currentTarget.value = ""; }} /><FileImage className="mx-auto h-7 w-7 text-violet-500" /><p className="mt-2 text-xs font-black text-slate-700 dark:text-slate-200">PDF حتى 3 صفحات / صورة واحدة</p><p className="mt-1 text-[10px] font-semibold text-slate-400">حد الملف 4MB. يتم التحقق من المحتوى الحقيقي وعدد الصفحات على الخادم. رفع الملف وحده لا يرسله إلى OpenAI.</p><Button type="button" className="mt-3" size="sm" disabled={Boolean(busy)} onClick={() => fileRef.current?.click()}>{busy === "upload" ? <Loader2 className="ml-1 h-4 w-4 animate-spin" /> : <Upload className="ml-1 h-4 w-4" />}اختيار الملف</Button></div>
        {sourceId && sourceType !== "TEXT" ? <div className="rounded-xl border border-cyan-200 bg-cyan-50/70 p-3 text-center dark:border-cyan-900 dark:bg-cyan-950/25"><p className="text-[10px] font-bold text-cyan-800 dark:text-cyan-200">المرفق محفوظ ولم تتم قراءته بالذكاء الاصطناعي بعد.</p><Button type="button" size="sm" className="mt-2" disabled={Boolean(busy) || aiBlocked} onClick={() => void extract(sourceId, false)}><Sparkles className="ml-1 h-4 w-4" />قراءة بالذكاء الاصطناعي <span className="mr-1 text-[9px] opacity-80">(تستهلك قراءة)</span></Button>{aiBlocked ? <p className="mt-2 text-[9px] font-semibold text-amber-700 dark:text-amber-300">قراءة AI غير متاحة حالياً، لكن يمكنك متابعة الإدخال اليدوي أو النص أو Excel.</p> : null}</div> : null}
      </div>}

      {!review && mode === "text" && <div className="space-y-2"><textarea value={text} onChange={(event) => setText(event.target.value)} rows={9} className="erp-input min-h-40 resize-y" placeholder={'مثال:\nالمورد: أحمد\nفاتورة: 125\nشاشة A10 | 2 | 10.50\nبطارية A12 qty: 3 cost: 7'} /><div className="flex items-center justify-between gap-3"><p className="text-[10px] font-semibold text-slate-400">هذا لصق يدوي فقط؛ لا توجد قراءة لحساب واتساب أو وصول للرسائل.</p><Button type="button" size="sm" disabled={Boolean(busy) || !text.trim()} onClick={() => void submitText()}>{busy === "text" ? <Loader2 className="ml-1 h-4 w-4 animate-spin" /> : <ScanText className="ml-1 h-4 w-4" />}تحليل النص</Button></div></div>}

      {notice && <div className="rounded-xl border border-cyan-200 bg-cyan-50 px-3 py-2 text-[11px] font-bold text-cyan-800 dark:border-cyan-900 dark:bg-cyan-950/30 dark:text-cyan-200">{notice}</div>}
      {error && <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-[11px] font-bold text-rose-700 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-200"><div>{error}</div>{sourceId && sourceType !== "TEXT" && <button type="button" disabled={Boolean(busy) || aiBlocked} onClick={() => void extract(sourceId, true)} className="mt-2 inline-flex items-center gap-1 underline"><RefreshCw className="h-3.5 w-3.5" />إعادة قراءة مقصودة (تُحسب قراءة جديدة)</button>}<p className="mt-1 font-semibold">يمكنك دائماً إغلاق الاستيراد وإكمال البنود يدوياً في نفس المسودة.</p></div>}
      {(busy === "extract" || busy === "review") && <div className="flex items-center gap-2 rounded-xl border border-violet-200 bg-white px-3 py-3 text-xs font-bold text-violet-700 dark:border-violet-900 dark:bg-slate-950 dark:text-violet-200"><Loader2 className="h-4 w-4 animate-spin" />{busy === "extract" ? "قراءة المصدر…" : "تجهيز المراجعة والمطابقة…"}</div>}

      {review && <>
        <div className="flex rounded-xl border border-slate-200 bg-white p-1 lg:hidden dark:border-slate-800 dark:bg-slate-950"><button type="button" onClick={() => setMobileTab("items")} className={`flex-1 rounded-lg px-3 py-2 text-xs font-black ${mobileTab === "items" ? "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900" : "text-slate-500"}`}>البنود</button><button type="button" onClick={() => setMobileTab("source")} className={`flex-1 rounded-lg px-3 py-2 text-xs font-black ${mobileTab === "source" ? "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900" : "text-slate-500"}`}>المصدر</button></div>
        <div className="grid gap-4 lg:grid-cols-[minmax(300px,.8fr)_minmax(0,1.4fr)]">
          <div className={`${mobileTab === "source" ? "block" : "hidden"} lg:block`}><SourcePreview review={review} sourceUrl={sourceUrl} /></div>
          <div className={`${mobileTab === "items" ? "block" : "hidden"} min-w-0 space-y-3 lg:block`}>
            <HeaderReview review={review} currency={currency} onApply={() => onApplyHeader(review.document)} />
            <TotalCheck review={review} currency={currency} />
            {lines.map((line, index) => <ReviewLineCard key={line.rowKey} line={line} index={index} currency={currency} duplicate={Boolean(sourceId && existingKeys.has(`${sourceId}:${line.rowKey}`))} canRememberAlias={Boolean(review.currentSupplierId && line.selectedItem && line.editedName.trim())} onPatch={(patch) => patchAndResolve(line.rowKey, patch)} onCandidate={(item) => chooseCandidate(line.rowKey, item)} onNew={() => chooseNew(line.rowKey)} onRememberAlias={() => void rememberAlias(line)} />)}
          </div>
        </div>
        {review.aliases.length > 0 && <details className="rounded-xl border border-slate-200 bg-white px-3 py-2 dark:border-slate-800 dark:bg-slate-950"><summary className="cursor-pointer text-[11px] font-black text-slate-600 dark:text-slate-300">مطابقات أسماء المورد المحفوظة ({review.aliases.length})</summary><div className="mt-2 space-y-1">{review.aliases.map((alias) => <div key={alias.id} className="flex items-center justify-between gap-3 rounded-lg bg-slate-50 px-2.5 py-2 text-[10px] dark:bg-slate-900"><span><strong>{alias.aliasText}</strong> ← {alias.inventoryItemName}</span><button type="button" onClick={() => void removeAlias(alias.id)} className="font-black text-rose-600">إلغاء</button></div>)}</div></details>}
        <div className="sticky bottom-20 z-20 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white/95 p-3 shadow-lg backdrop-blur lg:bottom-3 dark:border-slate-800 dark:bg-slate-950/95"><div className="text-[10px] font-bold text-slate-500"><span className="font-black text-emerald-600">{readyCount} جاهز</span>{duplicateCount > 0 && <span> • {duplicateCount} منقول سابقاً وسيُتجاوز</span>}{hasExistingLines && <span> • لن تُستبدل البنود الموجودة؛ ستُضاف البنود الجديدة فقط</span>}</div><div className="flex flex-wrap gap-2">{sourceId && sourceType !== "TEXT" ? <Button type="button" variant="outline" size="sm" disabled={Boolean(busy) || aiBlocked} onClick={() => void extract(sourceId, true)}><RefreshCw className="ml-1 h-3.5 w-3.5" />إعادة قراءة AI (قراءة جديدة)</Button> : null}<Button type="button" variant="outline" size="sm" onClick={() => onApplyHeader(review.document)}>تطبيق بيانات الرأس على الحقول الفارغة</Button><Button type="button" size="sm" disabled={!readyCount} onClick={transfer}><Save className="ml-1 h-4 w-4" />نقل البنود الجاهزة إلى المسودة</Button></div></div>
      </>}
    </div>}
  </section>;
}

function AiQuotaCard({ quota, loading, error, onRetry }: { quota: AiQuota | null; loading: boolean; error: string; onRetry: () => void }) {
  if (error) return <div role="alert" className="rounded-xl bg-amber-50 p-3 text-xs text-amber-800 dark:bg-amber-950/30 dark:text-amber-200">{error}<button type="button" disabled={loading} onClick={onRetry} className="mr-2 font-bold underline">تحديث العداد</button></div>;
  if (!quota) return <div role="status" className="flex items-center gap-2 p-3 text-xs text-slate-500"><Loader2 className="h-4 w-4 animate-spin" />تحميل العداد — 3 قراءات AI يومياً لكل مستخدم</div>;
  const reset = new Date(quota.resetAt).toLocaleString("ar", { timeZone: quota.timeZone, dateStyle: "short", timeStyle: "short" });
  return <div role="status" aria-live="polite" className="rounded-xl border border-violet-200 bg-white p-3 text-xs dark:border-violet-900 dark:bg-slate-950">
    <div className="flex flex-wrap items-center justify-between gap-2"><strong className="text-sm text-violet-800 dark:text-violet-200">متبقي لك اليوم: {quota.user.remaining} من {quota.user.limit} قراءات AI</strong><span className="text-slate-500">تتجدد: {reset}</span></div>
    <p className="mt-2 text-slate-600 dark:text-slate-300">للصور وPDF فقط. تنزيل ورفع Excel والإدخال اليدوي بلا حد يومي. فتح قراءة محفوظة لا يستهلك قراءة جديدة.</p>
    {quota.user.remaining <= 0 && <p className="mt-2 font-bold text-amber-700 dark:text-amber-300">استخدمت قراءاتك الثلاث اليوم. يمكنك المتابعة عبر قالب Excel أو الإدخال اليدوي.</p>}
    {!quota.configured && <p className="mt-2 font-bold text-amber-700 dark:text-amber-300">قراءة AI غير مفعّلة بعد. يمكنك استخدام قالب Excel أو الإدخال اليدوي.</p>}
    {quota.configured && quota.user.remaining > 0 && (quota.shop.remaining <= 0 || quota.budget.remainingUsd <= 0 || quota.failedAttempts.userRemaining <= 0 || quota.failedAttempts.shopRemaining <= 0) && <p className="mt-2 text-amber-700 dark:text-amber-300">قراءة AI غير متاحة مؤقتاً بسبب حد الاستخدام العام. Excel والإدخال اليدوي متاحان.</p>}
  </div>;
}

function SourcePreview({ review, sourceUrl }: { review: ReviewPayload; sourceUrl: string | null }) {
  return <div className="sticky top-20 overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950"><div className="border-b border-slate-100 px-3 py-2 text-[11px] font-black text-slate-700 dark:border-slate-800 dark:text-slate-200">المصدر الأصلي</div>{review.source.sourceType === "TEXT" ? <pre className="max-h-[70vh] overflow-auto whitespace-pre-wrap break-words p-3 text-[11px] leading-6 text-slate-600 dark:text-slate-300">{review.source.sourceText}</pre> : review.source.sourceType === "IMAGE" && sourceUrl ? <img src={sourceUrl} alt="صورة فاتورة المورد" className="max-h-[70vh] w-full object-contain" /> : sourceUrl ? <iframe title="PDF فاتورة المورد" src={sourceUrl} className="h-[68vh] w-full bg-white" /> : <div className="p-5 text-xs text-slate-400">المصدر غير متاح للعرض.</div>}</div>;
}

function HeaderReview({ review, currency, onApply }: { review: ReviewPayload; currency: string; onApply: () => void }) {
  const doc = review.document;
  return <div className="rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-950"><div className="flex items-start justify-between gap-3"><div><h4 className="text-xs font-black text-slate-800 dark:text-slate-100">بيانات مقروءة من المصدر</h4><div className="mt-2 grid gap-x-4 gap-y-1 text-[10px] font-semibold text-slate-500 sm:grid-cols-2"><span>المورد: <strong>{doc.supplierName || "غير معروف"}</strong></span><span>التاريخ: <strong>{doc.invoiceDate || "غير معروف"}</strong></span><span>رقم الفاتورة: <strong>{doc.supplierInvoiceNumber || "غير معروف"}</strong></span><span>العملة: <strong>{doc.currency || "غير معروفة"}</strong>{doc.currency && doc.currency !== currency && <em className="mr-1 text-amber-600">(تختلف عن عملة المتجر {currency})</em>}</span></div></div><Button type="button" variant="outline" size="sm" onClick={onApply}>تطبيق الآمن</Button></div></div>;
}

function TotalCheck({ review, currency }: { review: ReviewPayload; currency: string }) {
  const totals = review.totals;
  const diff = totals.difference;
  return <div className={`rounded-xl border p-3 text-[10px] font-semibold ${diff !== null && Math.abs(diff) > 0.009 ? "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950/25 dark:text-amber-200" : "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/25 dark:text-emerald-200"}`}><div className="flex flex-wrap gap-4"><span>مجموع البنود القابلة للحساب: <strong>{money(totals.subtotal, currency)}</strong></span><span>بعد الخصم/الشحن المعروف: <strong>{money(totals.calculatedTotal, currency)}</strong></span><span>إجمالي المصدر: <strong>{money(totals.sourceTotal, currency)}</strong></span>{diff !== null && <span>الفرق: <strong>{money(diff, currency)}</strong></span>}</div>{diff !== null && Math.abs(diff) > 0.009 && <p className="mt-1">الفرق قد ينتج عن بند ناقص، ضريبة غير مستخرجة، خصم/شحن، أو غموض في سعر الوحدة. لم يتم تعديل أي رقم تلقائياً.</p>}{!totals.complete && <p className="mt-1">المقارنة جزئية لأن بعض البنود تحتاج توضيحاً.</p>}</div>;
}

function ReviewLineCard({ line, index, currency, duplicate, canRememberAlias, onPatch, onCandidate, onNew, onRememberAlias }: { line: EditableLine; index: number; currency: string; duplicate: boolean; canRememberAlias: boolean; onPatch: (patch: Partial<EditableLine>) => void; onCandidate: (item: InventoryItem) => void; onNew: () => void; onRememberAlias: () => void }) {
  const tone = duplicate ? "slate" : line.resolvedState === "existing" ? "emerald" : line.resolvedState === "new" ? "cyan" : line.resolvedState === "review" ? "amber" : "rose";
  const label = duplicate ? "منقول مسبقاً" : line.resolvedState === "existing" ? "صنف موجود" : line.resolvedState === "new" ? "صنف جديد" : line.resolvedState === "review" ? "مقترح يحتاج تأكيداً" : "قراءة ناقصة";
  const toneClass = tone === "emerald" ? "border-emerald-200 bg-emerald-50 text-emerald-700" : tone === "cyan" ? "border-cyan-200 bg-cyan-50 text-cyan-700" : tone === "amber" ? "border-amber-200 bg-amber-50 text-amber-700" : tone === "rose" ? "border-rose-200 bg-rose-50 text-rose-700" : "border-slate-200 bg-slate-50 text-slate-600";
  return <div className={`rounded-xl border p-3 dark:border-slate-800 dark:bg-slate-950 ${duplicate ? "opacity-65" : "border-slate-200 bg-white"}`}><div className="flex items-start justify-between gap-3"><div className="min-w-0"><div className="text-[10px] font-black text-slate-400">السطر {index + 1}</div><div className="mt-1 break-words text-[10px] font-semibold text-slate-500 dark:text-slate-400">{line.originalText}</div></div><span className={`shrink-0 rounded-full border px-2 py-1 text-[9px] font-black ${toneClass}`}>{label}</span></div>
    <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4"><label className="text-[10px] font-bold text-slate-500">اسم الصنف<input value={line.editedName} onChange={(event) => onPatch({ editedName: event.target.value })} className="erp-input mt-1 h-10 text-xs" /></label><label className="text-[10px] font-bold text-slate-500">الباركود / المعرف<input value={line.editedBarcode} onChange={(event) => onPatch({ editedBarcode: event.target.value })} className="erp-input mt-1 h-10 font-numeric text-xs" /></label><label className="text-[10px] font-bold text-slate-500">كمية المخزون الفعلية<input value={line.editedQuantity} onChange={(event) => onPatch({ editedQuantity: event.target.value })} inputMode="numeric" className="erp-input mt-1 h-10 font-numeric text-xs" /></label><label className="text-[10px] font-bold text-slate-500">تكلفة الوحدة<input value={line.editedUnitCost} onChange={(event) => onPatch({ editedUnitCost: event.target.value })} inputMode="decimal" className="erp-input mt-1 h-10 font-numeric text-xs" /></label></div>
    {(line.purchaseUnit || line.unitAmbiguous || line.priceAmbiguous || line.quantityAmbiguous || line.notes.length > 0) && <div className="mt-2 rounded-lg border border-amber-100 bg-amber-50/60 p-2 text-[9px] font-semibold leading-5 text-amber-800 dark:border-amber-900 dark:bg-amber-950/20 dark:text-amber-200">{line.purchaseUnit && <div>وحدة المصدر: <strong>{line.purchaseUnit}</strong></div>}{line.unitAmbiguous && <label className="mt-1 flex gap-2"><input type="checkbox" checked={line.unitConfirmed} onChange={(event) => onPatch({ unitConfirmed: event.target.checked })} /><span>أؤكد أن «كمية المخزون الفعلية» أعلاه هي عدد القطع المستلمة، ولم أفترض عدد القطع داخل {line.purchaseUnit || "الوحدة"}.</span></label>}{line.priceAmbiguous && <label className="mt-1 flex gap-2"><input type="checkbox" checked={line.priceConfirmed} onChange={(event) => onPatch({ priceConfirmed: event.target.checked })} /><span>أؤكد أن القيمة التي أدخلتها في «تكلفة الوحدة» هي تكلفة القطعة الواحدة وليست إجمالي السطر.</span></label>}{line.quantityAmbiguous && <div><AlertTriangle className="ml-1 inline h-3 w-3" />صيغة الكمية كانت غامضة؛ راجع العدد.</div>}{line.notes.map((note, noteIndex) => <div key={noteIndex}>• {note}</div>)}</div>}
    {line.selectedItem && <div className="mt-2 flex flex-wrap items-center gap-2 rounded-lg border border-emerald-100 bg-emerald-50/60 px-2.5 py-2 text-[10px] font-bold text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/20 dark:text-emerald-200"><Check className="h-3.5 w-3.5" /><span>مطابق لـ: {line.selectedItem.name}</span>{line.supplierAliasApplied && <><span className="rounded-full bg-white px-2 py-0.5 text-[9px] dark:bg-slate-900">من ذاكرة اسم المورد</span><button type="button" onClick={() => onPatch({ selectedItem: null, resolvedState: "review", supplierAliasApplied: false })} className="underline">تغيير المطابقة</button></>}{canRememberAlias && !line.supplierAliasApplied && <button type="button" onClick={onRememberAlias} className="underline">تذكّر هذه التسمية لهذا المورد</button>}</div>}
    {line.candidates.length > 0 && !line.selectedItem && <div className="mt-2"><div className="text-[9px] font-black text-amber-700">اقتراحات فقط — اختر صراحةً، لن تعتمد المطابقة تلقائياً:</div><div className="mt-1 flex flex-wrap gap-1">{line.candidates.slice(0, 5).map((candidate) => <button key={candidate.id} type="button" onClick={() => onCandidate(candidate)} className="rounded-full border border-amber-200 bg-amber-50 px-2 py-1 text-[9px] font-black text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200">{candidate.name}{candidate.category ? ` — ${candidate.category}` : ""}</button>)}<button type="button" onClick={onNew} className="rounded-full border border-cyan-200 bg-cyan-50 px-2 py-1 text-[9px] font-black text-cyan-700 dark:border-cyan-900 dark:bg-cyan-950/30 dark:text-cyan-200">ليس واحداً منها — صنف جديد</button></div></div>}
    {!line.selectedItem && line.resolvedState !== "new" && line.candidates.length === 0 && line.editedName.trim() && <button type="button" onClick={onNew} className="mt-2 rounded-lg border border-cyan-200 bg-cyan-50 px-2.5 py-1.5 text-[10px] font-black text-cyan-700 dark:border-cyan-900 dark:bg-cyan-950/30 dark:text-cyan-200">تأكيد إنشاء صنف جديد</button>}
    {line.lineTotal !== null && <div className="mt-2 text-[9px] font-semibold text-slate-400">إجمالي السطر المقروء من المصدر: {money(line.lineTotal, currency)} — للمرجعية فقط، لا يحل محل تكلفة الوحدة.</div>}
  </div>;
}
