"use client";

import {
  AlertTriangle,
  Check,
  CircleDollarSign,
  Link2,
  Loader2,
  PackagePlus,
  Plus,
  Save,
  Search,
  Sparkles,
  Tags,
  Trash2,
  Truck,
  X,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { pricingSuggestion, suggestedCompatibilityDataset } from "@/lib/purchase-import";
import { PurchaseBarcodeScanner, type ResolvedBarcodeScan } from "./_barcode-scanner";
import { PurchaseImportPanel, type ResolvedImportedPurchaseRow } from "./_purchase-import-panel";
import { PurchaseDocumentImportPanel, type ResolvedDocumentPurchaseRow } from "./_document-import-panel";
import { quickCreatePurchaseCategoryAction } from "./category-actions";
import {
  deletePurchaseDraftAction,
  postPurchaseInvoiceAction,
  quickCreatePurchaseSupplierAction,
  savePurchaseDraftAction,
  searchPurchaseInventoryAction,
  suggestPurchaseItemMetadataAction,
} from "./actions";

type SupplierOption = { id: string; name: string; phone: string | null };
type CategoryOption = { id: string; name: string; itemCount: number };
type InventoryResult = Awaited<ReturnType<typeof searchPurchaseInventoryAction>>[number];
type PaymentMethodValue = "CASH" | "CARD" | "BANK_TRANSFER" | "OTHER";
type CompatibilitySelection = { groupId: string; deviceName: string; dataset: string };

type FormLine = {
  key: string;
  inventoryItemId: string | null;
  itemLabel: string;
  existingItem: InventoryResult | null;
  newItemName: string;
  newItemSku: string;
  newItemBarcode: string;
  newItemCategoryId: string;
  newItemCategory: string;
  newItemDescription: string;
  importedSourceText: string;
  importSourceId: string;
  importRowKey: string;
  importedPurchaseUnit: string;
  matchReviewRequired: boolean;
  matchCandidates: InventoryResult[];
  compatibilitySelections: CompatibilitySelection[];
  compatibilityReviewNeeded: boolean;
  updateSalePrice: boolean;
  quantity: string;
  unitCost: string;
  manualExtraCostAllocation: string;
  salePrice: string;
  mode: "existing" | "new";
  selected: boolean;
};

type InitialDraft = {
  id: string;
  version: number;
  supplierId: string | null;
  supplierNameSnapshot: string | null;
  supplierInvoiceNumber: string | null;
  invoiceDate: string;
  notes: string | null;
  discountTotal: string;
  extraCostsTotal: string;
  amountPaid: string;
  paymentMethod: PaymentMethodValue | null;
  paymentAccountType: "DRAWER" | "WALLET" | "OTHER" | null;
  paymentWalletId: string | null;
  paymentSourceName: string | null;
  paymentReference: string | null;
  lines: Array<{
    id: string;
    inventoryItemId: string | null;
    inventoryItemName: string | null;
    inventoryItemSku: string | null;
    inventoryItemBarcode: string | null;
    inventoryItemCategory: string | null;
    inventoryItemDescription: string | null;
    inventoryCurrentSalePrice: string | null;
    lastPurchaseCost: string | null;
    lastPurchaseAt: string | null;
    lastPurchaseSupplierName: string | null;
    newItemName: string | null;
    newItemSku: string | null;
    newItemBarcode: string | null;
    newItemCategoryId: string | null;
    newItemCategory: string | null;
    newItemDescription: string | null;
    importedSourceText: string | null;
    importSourceId: string | null;
    importRowKey: string | null;
    importedPurchaseUnit: string | null;
    matchReviewRequired: boolean;
    compatibilityGroupIds: string[];
    compatibilityReviewNeeded: boolean;
    updateSalePrice: boolean;
    orderedQuantity: number;
    unitCost: string;
    manualExtraCostAllocation: string | null;
    salePriceSnapshot: string | null;
  }>;
};

function freshKey() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
}
function blankLine(): FormLine {
  return {
    key: freshKey(), inventoryItemId: null, itemLabel: "", existingItem: null,
    newItemName: "", newItemSku: "", newItemBarcode: "", newItemCategoryId: "", newItemCategory: "", newItemDescription: "",
    importedSourceText: "", importSourceId: "", importRowKey: "", importedPurchaseUnit: "", matchReviewRequired: false, matchCandidates: [], compatibilitySelections: [], compatibilityReviewNeeded: true,
    updateSalePrice: false, quantity: "1", unitCost: "", manualExtraCostAllocation: "", salePrice: "", mode: "existing", selected: false,
  };
}
function num(value: string) {
  const result = Number(value.replace(",", "."));
  return Number.isFinite(result) ? result : 0;
}
function money(value: number, currency: string) {
  return new Intl.NumberFormat("ar", { style: "currency", currency, maximumFractionDigits: 2 }).format(value || 0);
}
function isoDateInput(value?: string) {
  const date = value ? new Date(value) : new Date();
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
}
function sameCost(a: string, b: string | null | undefined) {
  if (!a.trim() || !String(b ?? "").trim()) return false;
  return Math.abs(num(a) - num(String(b))) < 0.005;
}
function suggestedCost(item: InventoryResult) {
  return item.lastPurchaseCost ?? item.unitCost ?? "";
}
function existingPatch(item: InventoryResult, options: { unitCost?: string; salePrice?: string; importedSourceText?: string } = {}): Partial<FormLine> {
  return {
    inventoryItemId: item.id,
    itemLabel: [item.name, item.barcode ? `#${item.barcode}` : item.sku].filter(Boolean).join(" — "),
    existingItem: item,
    mode: "existing",
    newItemName: "", newItemSku: "", newItemBarcode: "", newItemCategoryId: "", newItemCategory: "", newItemDescription: "",
    matchReviewRequired: false,
    matchCandidates: [],
    compatibilitySelections: [],
    compatibilityReviewNeeded: false,
    unitCost: options.unitCost ?? suggestedCost(item),
    salePrice: options.salePrice || item.unitPrice,
    updateSalePrice: false,
    importedSourceText: options.importedSourceText ?? "",
  };
}

export function PurchaseReceivingForm({
  suppliers: initialSuppliers,
  wallets,
  drawerBalance,
  categories,
  currency,
  initialDraft,
}: {
  suppliers: SupplierOption[];
  wallets: { id: string; name: string; currentBalance: string }[];
  drawerBalance: string;
  categories: CategoryOption[];
  currency: string;
  initialDraft?: InitialDraft | null;
}) {
  const router = useRouter();
  const [suppliers, setSuppliers] = useState(initialSuppliers);
  const [categoryOptions, setCategoryOptions] = useState<CategoryOption[]>(categories);
  const [draftId, setDraftId] = useState<string | null>(initialDraft?.id ?? null);
  const draftIdRef = useRef<string | null>(initialDraft?.id ?? null);
  const [supplierId, setSupplierId] = useState(initialDraft?.supplierId ?? "");
  const [supplierInvoiceNumber, setSupplierInvoiceNumber] = useState(initialDraft?.supplierInvoiceNumber ?? "");
  const [invoiceDate, setInvoiceDate] = useState(isoDateInput(initialDraft?.invoiceDate));
  const [notes, setNotes] = useState(initialDraft?.notes ?? "");
  const [discountTotal, setDiscountTotal] = useState(initialDraft?.discountTotal ?? "0");
  const [extraCostsTotal, setExtraCostsTotal] = useState(initialDraft?.extraCostsTotal ?? "0");
  const [amountPaid, setAmountPaid] = useState(initialDraft?.amountPaid ?? "0");
  const [paymentAccountType, setPaymentAccountType] = useState<"DRAWER" | "WALLET" | "OTHER">(initialDraft?.paymentAccountType ?? (initialDraft?.paymentMethod && initialDraft.paymentMethod !== "CASH" ? "OTHER" : "DRAWER"));
  const [paymentWalletId, setPaymentWalletId] = useState(initialDraft?.paymentWalletId ?? "");
  const paymentMethod: PaymentMethodValue = paymentAccountType === "DRAWER" ? "CASH" : paymentAccountType === "WALLET" ? "BANK_TRANSFER" : "OTHER";
  const paymentSourceName = paymentAccountType === "DRAWER" ? "الدرج النقدي" : paymentAccountType === "WALLET" ? wallets.find(wallet => wallet.id === paymentWalletId)?.name ?? "" : "دفع خارج النظام";
  const [paymentReference, setPaymentReference] = useState(initialDraft?.paymentReference ?? "");
  const [lines, setLines] = useState<FormLine[]>(() => {
    const loaded = (initialDraft?.lines ?? []).map((line) => {
      const existingItem: InventoryResult | null = line.inventoryItemId ? {
        id: line.inventoryItemId,
        name: line.inventoryItemName ?? "صنف مخزون",
        sku: line.inventoryItemSku,
        barcode: line.inventoryItemBarcode,
        category: line.inventoryItemCategory,
        description: line.inventoryItemDescription,
        quantity: 0,
        unitCost: line.lastPurchaseCost,
        unitPrice: line.inventoryCurrentSalePrice ?? line.salePriceSnapshot ?? "0",
        compatibilityCount: 0,
        lastPurchaseCost: line.lastPurchaseCost,
        lastPurchaseAt: line.lastPurchaseAt,
        lastPurchaseSupplierName: line.lastPurchaseSupplierName,
      } : null;
      return {
        key: line.id || freshKey(),
        inventoryItemId: line.inventoryItemId,
        itemLabel: line.inventoryItemId ? [line.inventoryItemName, line.inventoryItemBarcode ? `#${line.inventoryItemBarcode}` : line.inventoryItemSku].filter(Boolean).join(" — ") : "",
        existingItem,
        newItemName: line.newItemName ?? "",
        newItemSku: line.newItemSku ?? "",
        newItemBarcode: line.newItemBarcode ?? "",
        newItemCategoryId: line.newItemCategoryId ?? "",
        newItemCategory: line.newItemCategory ?? "",
        newItemDescription: line.newItemDescription ?? "",
        importedSourceText: line.importedSourceText ?? "",
        importSourceId: line.importSourceId ?? "",
        importRowKey: line.importRowKey ?? "",
        importedPurchaseUnit: line.importedPurchaseUnit ?? "",
        matchReviewRequired: line.matchReviewRequired,
        matchCandidates: [],
        compatibilitySelections: (line.compatibilityGroupIds ?? []).map((groupId) => ({ groupId, deviceName: "توافق محفوظ في المسودة", dataset: "" })),
        compatibilityReviewNeeded: line.compatibilityReviewNeeded,
        updateSalePrice: line.updateSalePrice,
        quantity: String(line.orderedQuantity),
        unitCost: line.unitCost,
        manualExtraCostAllocation: line.manualExtraCostAllocation ?? "",
        salePrice: line.salePriceSnapshot ?? line.inventoryCurrentSalePrice ?? "",
        mode: line.inventoryItemId ? "existing" as const : "new" as const,
        selected: false,
      };
    });
    return [...loaded, blankLine()];
  });
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">(initialDraft ? "saved" : "idle");
  const [saveError, setSaveError] = useState("");
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(initialDraft ? new Date().toISOString() : null);
  const [duplicate, setDuplicate] = useState<{ id: string; status: string; invoiceDate: string } | null>(null);
  const [dirtyVersion, setDirtyVersion] = useState(0);
  const dirtyRevisionRef = useRef(0);
  const persistedRevisionRef = useRef(0);
  const serverVersionRef = useRef<number | null>(initialDraft?.version ?? null);
  const savePromiseRef = useRef<Promise<string | null> | null>(null);
  const payloadRef = useRef<(() => Parameters<typeof savePurchaseDraftAction>[0]) | null>(null);
  const postingBarrierRef = useRef(false);
  const postedRef = useRef(false);
  const mountedRef = useRef(false);
  const approvalErrorRef = useRef<HTMLDivElement | null>(null);
  const [posting, setPosting] = useState(false);
  const [postError, setPostError] = useState("");
  const [approvalError, setApprovalError] = useState("");
  const [supplierCreatorOpen, setSupplierCreatorOpen] = useState(false);
  const [supplierCreator, setSupplierCreator] = useState({ name: "", phone: "" });
  const [supplierCreating, setSupplierCreating] = useState(false);
  const [scanConflict, setScanConflict] = useState<{ code: string; item: InventoryResult; lineKeys: string[] } | null>(null);
  const [bulkCategoryId, setBulkCategoryId] = useState("");
  const [bulkCategoryCreatorOpen, setBulkCategoryCreatorOpen] = useState(false);
  const [bulkCategoryName, setBulkCategoryName] = useState("");
  const [bulkCategoryCreating, setBulkCategoryCreating] = useState(false);
  const [bulkCategoryError, setBulkCategoryError] = useState("");
  const [priceIncrease, setPriceIncrease] = useState("30");
  const [priceRounding, setPriceRounding] = useState<"none" | "0.5" | "1" | "5">("1");
  const [partialReceipt, setPartialReceipt] = useState(false);
  const [initialReceiptQuantities, setInitialReceiptQuantities] = useState<Record<string, string>>({});

  const activeLines = useMemo(() => lines.filter((line) => line.inventoryItemId || line.newItemName.trim() || line.newItemBarcode.trim()), [lines]);
  const selectedLines = useMemo(() => activeLines.filter((line) => line.selected), [activeLines]);
  const subtotal = useMemo(() => activeLines.reduce((sum, line) => sum + Math.max(0, Math.trunc(num(line.quantity))) * Math.max(0, num(line.unitCost)), 0), [activeLines]);
  const finalTotal = Math.max(0, subtotal - Math.max(0, num(discountTotal)) + Math.max(0, num(extraCostsTotal)));
  const remaining = Math.max(0, finalTotal - Math.max(0, num(amountPaid)));
  const supplierRequired = remaining > 0.009 || (num(amountPaid) > 0.009 && paymentAccountType !== "DRAWER");
  const partialReceiptError = useMemo(() => {
    if (!partialReceipt) return "";
    for (const line of activeLines) {
      const raw = initialReceiptQuantities[line.key] ?? "0";
      const quantity = Number(raw || 0);
      const ordered = Math.max(1, Math.trunc(num(line.quantity) || 1));
      if (!Number.isInteger(quantity) || quantity < 0 || quantity > ordered) return "كمية الاستلام الآن يجب أن تكون عدداً صحيحاً بين صفر وكمية الفاتورة لكل بند.";
    }
    return "";
  }, [partialReceipt, initialReceiptQuantities, activeLines]);
  const validation = useMemo(() => {
    const errors: { supplier?: string; discount?: string; amountPaid?: string; lines?: string; matching?: string } = {};
    if (num(discountTotal) > subtotal + 0.009) errors.discount = "الخصم لا يمكن أن يتجاوز مجموع البنود.";
    if (num(amountPaid) > finalTotal + 0.009) errors.amountPaid = "المدفوع لا يمكن أن يتجاوز إجمالي الفاتورة.";
    if (supplierRequired && !supplierId) errors.supplier = "اختر المورد أو أضفه من زر + عند وجود دين أو دفع غير نقدي.";
    const invalidLine = activeLines.find((line) => Math.trunc(num(line.quantity)) <= 0 || num(line.unitCost) < 0 || (!line.inventoryItemId && !line.newItemName.trim()));
    if (invalidLine) errors.lines = "تحقق من الاسم والكمية وتكلفة الوحدة في البنود.";
    if (activeLines.some((line) => line.matchReviewRequired)) errors.matching = "يوجد بند مستورد يحتاج مراجعة المطابقة قبل الاعتماد.";
    if (subtotal <= 0.009 && num(extraCostsTotal) > 0) {
      const manualTotal = activeLines.reduce((sum, line) => sum + Math.max(0, num(line.manualExtraCostAllocation)), 0);
      if (activeLines.some((line) => !line.manualExtraCostAllocation.trim()) || Math.abs(manualTotal - num(extraCostsTotal)) > 0.009) {
        errors.lines = "عندما تكون قيم البنود صفراً، وزّع كامل الشحن/مصاريف الشراء يدوياً على البنود قبل الاعتماد.";
      }
    }
    return errors;
  }, [discountTotal, subtotal, extraCostsTotal, amountPaid, finalTotal, supplierRequired, supplierId, activeLines]);

  const markDirty = useCallback(() => {
    if (!mountedRef.current) return;
    dirtyRevisionRef.current += 1;
    setDirtyVersion(dirtyRevisionRef.current);
  }, []);
  useEffect(() => { mountedRef.current = true; }, []);

  const payload = useCallback(() => ({
    id: draftIdRef.current,
    expectedVersion: draftIdRef.current ? serverVersionRef.current : null,
    supplierId: supplierId || null,
    supplierNameSnapshot: null,
    supplierInvoiceNumber: supplierInvoiceNumber || null,
    invoiceDate,
    notes: notes || null,
    discountTotal: discountTotal || "0",
    extraCostsTotal: extraCostsTotal || "0",
    amountPaid: amountPaid || "0",
    paymentMethod,
    paymentAccountType,
    paymentWalletId: paymentAccountType === "WALLET" ? paymentWalletId || null : null,
    paymentSourceName: paymentSourceName || null,
    paymentReference: paymentReference || null,
    lines: activeLines.map((line) => ({
      inventoryItemId: line.mode === "existing" ? line.inventoryItemId : null,
      newItemName: line.mode === "new" ? line.newItemName : null,
      newItemSku: line.mode === "new" ? line.newItemSku : null,
      newItemBarcode: line.mode === "new" ? line.newItemBarcode : null,
      newItemCategoryId: line.mode === "new" ? (line.newItemCategoryId || null) : null,
      newItemCategory: line.mode === "new" ? line.newItemCategory : null,
      newItemDescription: line.mode === "new" ? line.newItemDescription : null,
      importedSourceText: line.importedSourceText || null,
      importSourceId: line.importSourceId || null,
      importRowKey: line.importRowKey || null,
      importedPurchaseUnit: line.importedPurchaseUnit || null,
      matchReviewRequired: line.matchReviewRequired,
      compatibilityGroupIds: line.mode === "new" ? line.compatibilitySelections.map((selection) => selection.groupId) : [],
      compatibilityReviewNeeded: line.mode === "new" ? line.compatibilityReviewNeeded : false,
      updateSalePrice: line.mode === "existing" ? line.updateSalePrice : false,
      quantity: Math.max(1, Math.trunc(num(line.quantity) || 1)),
      unitCost: line.unitCost || "0",
      manualExtraCostAllocation: line.manualExtraCostAllocation.trim() ? line.manualExtraCostAllocation : null,
      salePrice: line.salePrice.trim() ? line.salePrice : null,
    })),
  }), [supplierId, supplierInvoiceNumber, invoiceDate, notes, discountTotal, extraCostsTotal, amountPaid, paymentMethod, paymentAccountType, paymentWalletId, paymentSourceName, paymentReference, activeLines]);

  payloadRef.current = payload;

  const save = useCallback(async (forPosting = false): Promise<string | null> => {
    if (postedRef.current) return draftIdRef.current;
    if (postingBarrierRef.current && !forPosting) return draftIdRef.current;
    if (draftIdRef.current && dirtyRevisionRef.current <= persistedRevisionRef.current && serverVersionRef.current !== null) {
      return draftIdRef.current;
    }
    if (savePromiseRef.current) {
      await savePromiseRef.current;
      if (postedRef.current || (postingBarrierRef.current && !forPosting)) return draftIdRef.current;
      if (dirtyRevisionRef.current > persistedRevisionRef.current) return save(forPosting);
      return draftIdRef.current;
    }

    const run = (async () => {
      setSaveState("saving");
      setSaveError("");
      try {
        while (!postedRef.current) {
          const revisionBeingSaved = dirtyRevisionRef.current;
          const currentPayload = payloadRef.current;
          if (!currentPayload) throw new Error("تعذر تجهيز بيانات المسودة.");
          const result = await savePurchaseDraftAction(currentPayload());
          if (!result.ok) {
            setSaveState("error");
            setSaveError("error" in result ? result.error : "تعذر حفظ المسودة.");
            return null;
          }
          draftIdRef.current = result.id;
          setDraftId(result.id);
          serverVersionRef.current = result.version;
          persistedRevisionRef.current = revisionBeingSaved;
          setDuplicate(result.duplicate);
          setLastSavedAt(result.updatedAt);
          setSaveState("saved");
          if (dirtyRevisionRef.current <= persistedRevisionRef.current) return result.id;
          setSaveState("saving");
        }
        return draftIdRef.current;
      } finally {
        savePromiseRef.current = null;
      }
    })();
    savePromiseRef.current = run;
    return run;
  }, []);

  useEffect(() => {
    if (!mountedRef.current || dirtyVersion === 0) return;
    setSaveState("idle");
    if (postingBarrierRef.current || postedRef.current) return;
    const timer = setTimeout(() => void save(false), 900);
    return () => clearTimeout(timer);
  }, [dirtyVersion, save]);

  function patchLine(key: string, patch: Partial<FormLine>) {
    setLines((current) => {
      const next = current.map((line) => line.key === key ? { ...line, ...patch } : line);
      const last = next[next.length - 1];
      if (last && (last.inventoryItemId || last.newItemName.trim() || last.newItemBarcode.trim())) next.push(blankLine());
      return next;
    });
    markDirty();
  }

  function insertLine(line: FormLine) {
    setLines((current) => {
      const withoutTrailingBlank = current.length && !current[current.length - 1].inventoryItemId && !current[current.length - 1].newItemName.trim() && !current[current.length - 1].newItemBarcode.trim()
        ? current.slice(0, -1)
        : current;
      return [...withoutTrailingBlank, line, blankLine()];
    });
    markDirty();
  }

  function removeLine(key: string) {
    setLines((current) => {
      const next = current.filter((line) => line.key !== key);
      return next.length ? next : [blankLine()];
    });
    markDirty();
  }

  const duplicateInventoryIds = useMemo(() => {
    const counts = new Map<string, number>();
    for (const line of activeLines) if (line.inventoryItemId) counts.set(line.inventoryItemId, (counts.get(line.inventoryItemId) ?? 0) + 1);
    return new Set([...counts.entries()].filter(([, count]) => count > 1).map(([id]) => id));
  }, [activeLines]);

  const existingDocumentImportKeys = useMemo(() => activeLines.filter((line) => line.importSourceId && line.importRowKey).map((line) => `${line.importSourceId}:${line.importRowKey}`), [activeLines]);

  const duplicateNewBarcodes = useMemo(() => {
    const counts = new Map<string, number>();
    for (const line of activeLines) if (line.mode === "new" && line.newItemBarcode.trim()) counts.set(line.newItemBarcode.trim(), (counts.get(line.newItemBarcode.trim()) ?? 0) + 1);
    return new Set([...counts.entries()].filter(([, count]) => count > 1).map(([barcode]) => barcode));
  }, [activeLines]);

  async function createSupplier() {
    if (!supplierCreator.name.trim()) return;
    setSupplierCreating(true);
    const result = await quickCreatePurchaseSupplierAction(supplierCreator);
    setSupplierCreating(false);
    if (!result.ok) { setSaveError("error" in result ? result.error : "تعذر إنشاء المورد."); return; }
    setSuppliers((current) => [result.supplier, ...current]);
    setSupplierId(result.supplier.id);

    setSupplierCreator({ name: "", phone: "" });
    setSupplierCreatorOpen(false);
    markDirty();
  }

  function handleImportedRows(imported: ResolvedImportedPurchaseRow[]) {
    if (activeLines.length + imported.length > 250) { setPostError("الحد 250 بنداً في الفاتورة الواحدة. قلّل البنود أو أنشئ فاتورة أخرى."); return false; }
    const newLines = imported.map((row): FormLine => {
      if (row.state === "existing" && row.item) {
        return {
          ...blankLine(),
          ...existingPatch(row.item, { unitCost: row.unitCost, salePrice: row.salePrice || row.item.unitPrice, importedSourceText: row.sourceText }),
          key: freshKey(), quantity: row.quantity, selected: false,
        } as FormLine;
      }
      return {
        ...blankLine(), key: freshKey(), mode: "new", newItemName: row.name, newItemBarcode: row.barcode,
        newItemCategoryId: categoryOptions.find(category => category.name.trim() === row.category?.trim())?.id ?? "",
        newItemCategory: row.category ?? "",
        importedSourceText: row.sourceText, quantity: row.quantity, unitCost: row.unitCost, salePrice: row.salePrice,
        matchReviewRequired: row.state === "review", matchCandidates: row.candidates, selected: false, compatibilityReviewNeeded: true,
      };
    });
    setLines((current) => {
      const trimmed = current.length && !current[current.length - 1].inventoryItemId && !current[current.length - 1].newItemName.trim() && !current[current.length - 1].newItemBarcode.trim() ? current.slice(0, -1) : current;
      return [...trimmed, ...newLines, blankLine()];
    });
    markDirty();
  }

  function handleDocumentImportedRows(imported: ResolvedDocumentPurchaseRow[]) {
    const currentKeys = new Set(activeLines.filter((line) => line.importSourceId && line.importRowKey).map((line) => `${line.importSourceId}:${line.importRowKey}`));
    const unique = imported.filter((row) => !currentKeys.has(`${row.importSourceId}:${row.importRowKey}`));
    if (!unique.length) {
      setPostError("هذه البنود منقولة إلى المسودة مسبقاً؛ لم تتم إضافة نسخة ثانية.");
      return;
    }
    const newLines = unique.map((row): FormLine => {
      if (row.state === "existing" && row.item) {
        return {
          ...blankLine(),
          ...existingPatch(row.item, { unitCost: row.unitCost, salePrice: row.salePrice || row.item.unitPrice, importedSourceText: row.sourceText }),
          key: freshKey(), quantity: row.quantity, importSourceId: row.importSourceId, importRowKey: row.importRowKey,
          importedPurchaseUnit: row.purchaseUnit, selected: false,
        } as FormLine;
      }
      return {
        ...blankLine(), key: freshKey(), mode: "new", newItemName: row.name, newItemBarcode: row.barcode,
        importedSourceText: row.sourceText, importSourceId: row.importSourceId, importRowKey: row.importRowKey,
        importedPurchaseUnit: row.purchaseUnit, quantity: row.quantity, unitCost: row.unitCost, salePrice: row.salePrice,
        matchReviewRequired: false, matchCandidates: [], selected: false, compatibilityReviewNeeded: true,
      };
    });
    setLines((current) => {
      const trimmed = current.length && !current[current.length - 1].inventoryItemId && !current[current.length - 1].newItemName.trim() && !current[current.length - 1].newItemBarcode.trim() ? current.slice(0, -1) : current;
      return [...trimmed, ...newLines, blankLine()];
    });
    markDirty();
  }

  function applyDocumentHeader(header: { supplierName: string | null; invoiceDate: string | null; supplierInvoiceNumber: string | null; currency: string | null; discountTotal: number | null; shippingTotal: number | null }) {
    const applied: string[] = [];
    if (!supplierInvoiceNumber.trim() && header.supplierInvoiceNumber) { setSupplierInvoiceNumber(header.supplierInvoiceNumber); applied.push("رقم الفاتورة"); }
    if (header.invoiceDate && invoiceDate === isoDateInput()) { setInvoiceDate(header.invoiceDate); applied.push("التاريخ"); }
    if (num(discountTotal) === 0 && header.discountTotal !== null) { setDiscountTotal(String(header.discountTotal)); applied.push("الخصم"); }
    if (num(extraCostsTotal) === 0 && header.shippingTotal !== null) { setExtraCostsTotal(String(header.shippingTotal)); applied.push("الشحن/المصاريف"); }
    if (!supplierId && header.supplierName) {
      const exact = suppliers.find((supplier) => supplier.name.trim().toLocaleLowerCase() === header.supplierName!.trim().toLocaleLowerCase());
      if (exact) { setSupplierId(exact.id); applied.push("المورد"); }
    }
    if (header.currency && header.currency !== currency) setPostError(`عملة المصدر ${header.currency} تختلف عن عملة المتجر ${currency}. لم يتم تغيير العملة تلقائياً.`);
    if (applied.length) { markDirty(); setSaveError(`تم تطبيق ${applied.join("، ")} على الحقول التي لم يكن فيها إدخال. راجعها قبل الاعتماد.`); }
    else setSaveError("لم يتم استبدال أي إدخال موجود. راجع بيانات المصدر وانسخ ما تحتاجه يدوياً.");
  }

  function handleBarcodeScan(result: ResolvedBarcodeScan) {
    setPostError("");
    if (result.state === "existing" && result.item) {
      const item = result.item;
      const cost = suggestedCost(item);
      const sameItemLines = activeLines.filter((line) => line.inventoryItemId === item.id);
      const mergeable = sameItemLines.find((line) => sameCost(line.unitCost, cost) && !line.matchReviewRequired);
      if (mergeable) {
        patchLine(mergeable.key, { quantity: String(Math.max(1, Math.trunc(num(mergeable.quantity))) + 1) });
        return;
      }
      if (sameItemLines.length) {
        setScanConflict({ code: result.code, item, lineKeys: sameItemLines.map((line) => line.key) });
        return;
      }
      insertLine({ ...blankLine(), ...existingPatch(item), key: freshKey(), quantity: "1" } as FormLine);
      return;
    }
    if (result.state === "review") {
      insertLine({ ...blankLine(), key: freshKey(), mode: "new", newItemBarcode: result.code, matchReviewRequired: true, matchCandidates: result.candidates, compatibilityReviewNeeded: true });
      return;
    }
    insertLine({ ...blankLine(), key: freshKey(), mode: "new", newItemBarcode: result.code, newItemName: "", matchReviewRequired: false, compatibilityReviewNeeded: true });
  }

  function resolveScanConflict(lineKey?: string) {
    if (!scanConflict) return;
    if (lineKey) {
      const line = lines.find((candidate) => candidate.key === lineKey);
      if (line) patchLine(lineKey, { quantity: String(Math.max(1, Math.trunc(num(line.quantity))) + 1) });
    } else {
      insertLine({ ...blankLine(), ...existingPatch(scanConflict.item), key: freshKey(), quantity: "1" } as FormLine);
    }
    setScanConflict(null);
  }

  function toggleAllSelected() {
    const shouldSelect = selectedLines.length !== activeLines.length;
    setLines((current) => current.map((line) => line.inventoryItemId || line.newItemName.trim() || line.newItemBarcode.trim() ? { ...line, selected: shouldSelect } : line));
  }

  async function createBulkCategory() {
    const name = bulkCategoryName.trim();
    if (!name) return;
    setBulkCategoryCreating(true);
    setBulkCategoryError("");
    const result = await quickCreatePurchaseCategoryAction({ name });
    setBulkCategoryCreating(false);
    if (!result.ok) {
      setBulkCategoryError(result.error);
      return;
    }
    setCategoryOptions((current) => [result.category, ...current.filter((category) => category.id !== result.category.id)]);
    setBulkCategoryId(result.category.id);
    setBulkCategoryName("");
    setBulkCategoryCreatorOpen(false);
  }

  function applyBulkCategory() {
    const category = categoryOptions.find((item) => item.id === bulkCategoryId);
    if (!category) return;
    setLines((current) => current.map((line) => line.selected && line.mode === "new" ? { ...line, newItemCategoryId: category.id, newItemCategory: category.name } : line));
    markDirty();
  }

  const pricingPreview = useMemo(() => selectedLines.map((line) => ({
    key: line.key,
    label: line.mode === "existing" ? line.existingItem?.name ?? line.itemLabel : line.newItemName || line.newItemBarcode || "صنف جديد",
    current: line.salePrice,
    suggested: pricingSuggestion(num(line.unitCost), num(priceIncrease), priceRounding),
  })), [selectedLines, priceIncrease, priceRounding]);

  function applyPricingSuggestions() {
    const byKey = new Map(pricingPreview.map((item) => [item.key, item.suggested]));
    setLines((current) => current.map((line) => {
      const suggested = byKey.get(line.key);
      if (suggested === undefined) return line;
      return { ...line, salePrice: String(suggested), updateSalePrice: line.mode === "existing" ? true : false };
    }));
    markDirty();
  }

  function showApprovalError(message: string) {
    setApprovalError(message);
    window.requestAnimationFrame(() => approvalErrorRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }));
  }

  async function postInvoice() {
    setPostError("");
    setApprovalError("");
    postingBarrierRef.current = true;
    setPosting(true);
    const savedId = await save(true);
    const id = savedId || draftIdRef.current;
    if (!id) { postingBarrierRef.current = false; setPosting(false); showApprovalError("تعذر حفظ المسودة قبل الاعتماد."); return; }
    if (!activeLines.length) { postingBarrierRef.current = false; setPosting(false); showApprovalError("أضف بنداً واحداً على الأقل."); return; }
    if (validation.supplier || validation.discount || validation.amountPaid || validation.lines || validation.matching || partialReceiptError) { postingBarrierRef.current = false; setPosting(false); showApprovalError(validation.supplier || validation.discount || validation.amountPaid || validation.lines || validation.matching || partialReceiptError || "تحقق من البيانات."); return; }
    if (duplicateNewBarcodes.size) { postingBarrierRef.current = false; setPosting(false); showApprovalError("يوجد باركود مكرر بين أصناف جديدة. راجع البنود قبل الاعتماد."); return; }
    if (num(amountPaid) > 0 && paymentAccountType === "WALLET" && !paymentWalletId) { postingBarrierRef.current = false; setPosting(false); showApprovalError("اختر المحفظة التي خرجت منها الدفعة."); return; }

    if (duplicate && !window.confirm("يوجد رقم فاتورة مشابه لنفس المورد. هل راجعت الفاتورة وتريد المتابعة بالاعتماد؟")) { postingBarrierRef.current = false; setPosting(false); return; }
    const result = await postPurchaseInvoiceAction({
      purchaseId: id,
      postingKey: freshKey(),
      receiptMode: partialReceipt ? "PARTIAL" : "FULL",
      initialReceipt: partialReceipt ? activeLines.map((line, sortOrder) => ({
        sortOrder,
        quantity: Number(initialReceiptQuantities[line.key] ?? "0"),
      })) : undefined,
    });
    setPosting(false);
    if (!result.ok) { postingBarrierRef.current = false; showApprovalError("error" in result ? result.error : "تعذر اعتماد الفاتورة."); return; }
    postedRef.current = true;
    router.push(`/inventory/purchases/${result.id}?posted=${partialReceipt ? "partial" : "full"}`);
    router.refresh();
  }

  async function deleteDraft() {
    const id = draftIdRef.current;
    if (!id) { router.push("/inventory/purchases"); return; }
    if (!window.confirm("حذف هذه المسودة؟ لن يتأثر المخزون أو أي رصيد مالي.")) return;
    const result = await deletePurchaseDraftAction(id);
    if (!result.ok) { setSaveError("error" in result ? result.error : "تعذر حذف المسودة."); return; }
    router.push("/inventory/purchases?deleted=1");
    router.refresh();
  }

  function enterToNext(event: KeyboardEvent<HTMLElement>) {
    if (event.key !== "Enter" || event.shiftKey || event.currentTarget.tagName === "TEXTAREA") return;
    if ((event.target as HTMLElement).getAttribute("role") === "combobox") return;
    event.preventDefault();
    const fields = Array.from(document.querySelectorAll<HTMLElement>("[data-purchase-field]:not([disabled])"));
    const current = fields.indexOf(event.currentTarget);
    fields[current + 1]?.focus();
  }

  return <div className="space-y-5">
    <div className="sticky top-16 z-20 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white/95 px-4 py-3 shadow-sm backdrop-blur dark:border-slate-800 dark:bg-slate-950/95">
      <div className="flex items-center gap-2 text-xs font-bold">
        {saveState === "saving" && <><Loader2 className="h-4 w-4 animate-spin text-cyan-600" /><span className="text-slate-500 dark:text-slate-400">جارٍ حفظ المسودة…</span></>}
        {saveState === "saved" && <><Check className="h-4 w-4 text-emerald-600" /><span className="text-emerald-700 dark:text-emerald-300">تم الحفظ تلقائياً{lastSavedAt ? ` ${new Date(lastSavedAt).toLocaleTimeString("ar", { hour: "2-digit", minute: "2-digit" })}` : ""}</span></>}
        {saveState === "idle" && <><Save className="h-4 w-4 text-slate-400" /><span className="text-slate-500 dark:text-slate-400">تغييرات غير محفوظة بعد</span></>}
        {saveState === "error" && <><AlertTriangle className="h-4 w-4 text-rose-600" /><span className="text-rose-700 dark:text-rose-300">تعذر الحفظ</span></>}
      </div>
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" onClick={() => void save()} disabled={saveState === "saving"} className="font-bold"><Save className="ml-1.5 h-4 w-4" />حفظ المسودة</Button>
        <Button type="button" variant="outline" onClick={() => void deleteDraft()} className="border-rose-200 font-bold text-rose-700 dark:border-rose-900 dark:text-rose-300"><Trash2 className="ml-1.5 h-4 w-4" />حذف المسودة</Button>
      </div>
    </div>

    {(saveError || postError) && <div role="alert" className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm font-bold text-rose-800 dark:border-rose-900/70 dark:bg-rose-950/35 dark:text-rose-200">{postError || saveError}</div>}
    {duplicate && <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm font-bold text-amber-900 dark:border-amber-900/70 dark:bg-amber-950/35 dark:text-amber-200"><span>تنبيه: يوجد رقم فاتورة مماثل لهذا المورد. راجعه قبل الاعتماد حتى لا تسجل شراءً مكرراً.</span><Link className="underline" href={`/inventory/purchases/${duplicate.id}`} target="_blank">فتح الفاتورة المشابهة</Link></div>}

    <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div className="mb-5 flex items-center gap-3"><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-cyan-50 text-cyan-700 dark:bg-cyan-950/50 dark:text-cyan-300"><Truck className="h-5 w-5" /></span><div><h2 className="font-black text-slate-900 dark:text-slate-100">بيانات فاتورة المورد</h2><p className="text-xs font-semibold text-slate-500 dark:text-slate-400">المورد يحدد مرة واحدة لكل الاستلام.</p></div></div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <label className="grid gap-1.5 text-xs font-black text-slate-600 dark:text-slate-300">المورد<div className="flex gap-2"><select data-purchase-field value={supplierId} onKeyDown={enterToNext} onChange={(e) => { setSupplierId(e.target.value); markDirty(); }} className="erp-input min-w-0 flex-1"><option value="">اختر المورد</option>{suppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.name}{supplier.phone ? ` — ${supplier.phone}` : ""}</option>)}</select><Button type="button" variant="outline" onClick={() => setSupplierCreatorOpen((v) => !v)} className="shrink-0"><Plus className="h-4 w-4" /></Button></div>{validation.supplier && <span className="text-[10px] font-bold text-rose-600 dark:text-rose-300">{validation.supplier}</span>}</label>
        <label className="grid gap-1.5 text-xs font-black text-slate-600 dark:text-slate-300">تاريخ الفاتورة<input data-purchase-field type="date" value={invoiceDate} onKeyDown={enterToNext} onChange={(e) => { setInvoiceDate(e.target.value); markDirty(); }} className="erp-input" /></label>
        <label className="grid gap-1.5 text-xs font-black text-slate-600 dark:text-slate-300">رقم فاتورة المورد <span className="font-semibold text-slate-400">اختياري</span><input data-purchase-field value={supplierInvoiceNumber} onKeyDown={enterToNext} onChange={(e) => { setSupplierInvoiceNumber(e.target.value); markDirty(); }} className="erp-input" placeholder="مثال INV-2451" /></label>
        <label className="grid gap-1.5 text-xs font-black text-slate-600 dark:text-slate-300">العملة<input className="erp-input bg-slate-50 font-numeric dark:bg-slate-950" value={currency} disabled /></label>
      </div>
      {supplierCreatorOpen && <div className="mt-4 grid gap-3 rounded-2xl border border-cyan-200 bg-cyan-50/60 p-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end dark:border-cyan-900 dark:bg-cyan-950/20"><label className="grid gap-1 text-xs font-bold">اسم المورد<input className="erp-input" value={supplierCreator.name} onChange={(e) => setSupplierCreator((v) => ({ ...v, name: e.target.value }))} /></label><label className="grid gap-1 text-xs font-bold">الهاتف <span className="text-slate-400">اختياري</span><input className="erp-input" value={supplierCreator.phone} onChange={(e) => setSupplierCreator((v) => ({ ...v, phone: e.target.value }))} /></label><Button type="button" disabled={supplierCreating || !supplierCreator.name.trim()} onClick={() => void createSupplier()}>{supplierCreating ? <Loader2 className="h-4 w-4 animate-spin" /> : "إنشاء واختيار"}</Button></div>}
      <label className="mt-4 grid gap-1.5 text-xs font-black text-slate-600 dark:text-slate-300"><span>ملاحظات الفاتورة <span className="font-semibold text-slate-400">(اختياري)</span></span><textarea rows={2} value={notes} onChange={(e) => { setNotes(e.target.value); markDirty(); }} className="erp-input min-h-14 resize-y" /></label>
    </section>

    <PurchaseBarcodeScanner onScan={handleBarcodeScan} />
    <PurchaseDocumentImportPanel
      currency={currency}
      purchaseId={draftId}
      ensureDraft={save}
      existingImportKeys={existingDocumentImportKeys}
      hasExistingLines={activeLines.length > 0}
      onImport={handleDocumentImportedRows}
      onApplyHeader={applyDocumentHeader}
    />
    <PurchaseImportPanel onImport={handleImportedRows} />

    {scanConflict && <section className="rounded-2xl border border-amber-300 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-950/30"><div className="flex items-start gap-2"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" /><div><h3 className="text-sm font-black text-amber-900 dark:text-amber-100">الصنف موجود في الفاتورة بتكلفة مختلفة</h3><p className="mt-1 text-xs font-semibold text-amber-800 dark:text-amber-200">مسحت {scanConflict.item.name}. لن ندمج الكمية بصمت. اختر السطر الذي تريد زيادة كميته، أو أضف سطراً جديداً لمراجعة تكلفة هذه الدفعة.</p></div></div><div className="mt-3 flex flex-wrap gap-2">{scanConflict.lineKeys.map((key) => { const line = lines.find((item) => item.key === key); return line ? <Button key={key} type="button" variant="outline" onClick={() => resolveScanConflict(key)} className="font-bold">زيادة سطر تكلفة {money(num(line.unitCost), currency)}</Button> : null; })}<Button type="button" onClick={() => resolveScanConflict()} className="font-black">إضافة سطر جديد</Button><Button type="button" variant="ghost" onClick={() => setScanConflict(null)}>إلغاء</Button></div></section>}

    <section className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5 dark:border-slate-800 dark:bg-slate-900">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-black text-slate-900 dark:text-slate-100">بنود الاستلام</h2><p className="mt-1 text-xs font-semibold leading-6 text-slate-500 dark:text-slate-400">السطر التالي يظهر تلقائياً. المطابقة الدقيقة بالباركود/SKU فقط يمكن اعتمادها تلقائياً؛ اقتراحات الاسم تبقى للمراجعة.</p></div><div className="flex items-center gap-2"><Button type="button" size="sm" variant="outline" onClick={toggleAllSelected} className="font-bold">{selectedLines.length === activeLines.length && activeLines.length ? "إلغاء تحديد الكل" : "تحديد الكل"}</Button><span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-black text-slate-600 dark:bg-slate-800 dark:text-slate-300">{activeLines.length} بند</span></div></div>
      {(validation.lines || validation.matching) && <div className="mb-3 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs font-bold text-rose-700 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-200">{validation.lines || validation.matching}</div>}
      <div className="space-y-3">{lines.map((line, index) => <PurchaseLineCard key={line.key} line={line} index={index} currency={currency} categories={categoryOptions} showManualExtraAllocation={subtotal <= 0.009 && num(extraCostsTotal) > 0} duplicate={Boolean(line.inventoryItemId && duplicateInventoryIds.has(line.inventoryItemId))} duplicateBarcode={Boolean(line.mode === "new" && line.newItemBarcode && duplicateNewBarcodes.has(line.newItemBarcode))} onPatch={(patch) => patchLine(line.key, patch)} onRemove={() => removeLine(line.key)} onEnterNext={enterToNext} />)}</div>
      <div className="mt-4 rounded-xl border border-indigo-100 bg-indigo-50/60 p-3 text-xs font-semibold leading-6 text-indigo-800 dark:border-indigo-900/70 dark:bg-indigo-950/25 dark:text-indigo-200">الصنف الموجود لا تتغير توافقاته بسبب فاتورة شراء. الصنف الجديد لا يُنشأ قبل الاعتماد. التوافقات المقترحة تأتي من دليل مسار الموجود ولا تُربط إلا بتأكيدك.</div>
    </section>

    <section className="rounded-3xl border border-cyan-200 bg-cyan-50/40 p-5 shadow-sm dark:border-cyan-900/70 dark:bg-cyan-950/20">
      <label className="flex cursor-pointer items-start gap-3">
        <input type="checkbox" className="mt-1" checked={partialReceipt} onChange={(event) => {
          setPartialReceipt(event.target.checked);
          if (event.target.checked) setInitialReceiptQuantities((current) => Object.fromEntries(activeLines.map((line) => [line.key, current[line.key] ?? "0"])));
        }} />
        <span><strong className="block text-sm font-black text-slate-900 dark:text-slate-100">استلمت جزءاً من البضاعة</strong><span className="mt-1 block text-xs font-semibold leading-6 text-slate-500 dark:text-slate-400">اتركها غير مفعلة للمسار السريع: اعتماد الفاتورة واستلام كل الكميات. فعّلها إذا وصل جزء فقط أو لم تصل بعض البنود بعد.</span></span>
      </label>
      {partialReceipt && <div className="mt-4 space-y-2">
        {activeLines.map((line, index) => {
          const ordered = Math.max(1, Math.trunc(num(line.quantity) || 1));
          const label = line.mode === "existing" ? line.existingItem?.name ?? line.itemLabel : line.newItemName || line.newItemBarcode || `البند ${index + 1}`;
          const receivedNow = Number(initialReceiptQuantities[line.key] ?? "0") || 0;
          return <div key={line.key} className="grid gap-2 rounded-xl border border-cyan-100 bg-white p-3 sm:grid-cols-[minmax(0,1fr)_100px_130px_110px] sm:items-center dark:border-cyan-900/60 dark:bg-slate-950/45">
            <div className="min-w-0"><div className="truncate text-xs font-black text-slate-800 dark:text-slate-100">{label}</div><div className="mt-1 text-[10px] font-semibold text-slate-400">كمية الفاتورة: {ordered}</div></div>
            <div className="text-xs font-bold text-slate-500">المطلوب <span className="font-numeric font-black text-slate-800 dark:text-slate-100">{ordered}</span></div>
            <label className="grid gap-1 text-[10px] font-black text-cyan-800 dark:text-cyan-200">المستلم الآن<input type="number" min="0" max={ordered} step="1" value={initialReceiptQuantities[line.key] ?? "0"} onChange={(event) => setInitialReceiptQuantities((current) => ({ ...current, [line.key]: event.target.value }))} className="erp-input h-9 font-numeric" /></label>
            <div className="text-xs font-bold text-slate-500">يبقى <span className="font-numeric font-black text-amber-700 dark:text-amber-300">{Math.max(0, ordered - receivedNow)}</span></div>
          </div>;
        })}
        {partialReceiptError && <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs font-bold text-rose-700 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-200">{partialReceiptError}</div>}
        <p className="text-[11px] font-semibold leading-5 text-slate-500 dark:text-slate-400">الفاتورة والمبلغ المستحق سيُعتمدان كاملين، لكن المخزون سيزداد فقط بالكميات التي تسجلها كمستلمة الآن. يمكن استلام الباقي لاحقاً من صفحة الفاتورة نفسها.</p>
      </div>}
    </section>

    <section className="grid gap-4 xl:grid-cols-2">
      <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-center gap-2"><Tags className="h-5 w-5 text-indigo-600" /><div><h2 className="font-black text-slate-900 dark:text-slate-100">تصنيف جماعي للأصناف الجديدة</h2><p className="text-xs font-semibold text-slate-400">يطبق فقط على البنود الجديدة المحددة، ولا يغيّر تصنيف صنف موجود.</p></div></div>
        <div className="mt-4 grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto_auto]"><select value={bulkCategoryId} onChange={(event) => setBulkCategoryId(event.target.value)} className="erp-input"><option value="">اختر التصنيف</option>{categoryOptions.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select><Button type="button" variant="outline" onClick={() => { setBulkCategoryCreatorOpen((value) => !value); setBulkCategoryError(""); }} className="shrink-0 px-3" aria-label="إضافة تصنيف جديد"><Plus className="h-4 w-4" /></Button><Button type="button" onClick={applyBulkCategory} disabled={!bulkCategoryId || !selectedLines.some((line) => line.mode === "new")} className="font-black">تطبيق على المحدد</Button></div>
        {bulkCategoryCreatorOpen && <div className="mt-3 grid gap-2 rounded-xl border border-indigo-200 bg-indigo-50/60 p-3 sm:grid-cols-[1fr_auto] sm:items-end dark:border-indigo-900 dark:bg-indigo-950/20"><label className="grid gap-1 text-xs font-black text-slate-600 dark:text-slate-300">اسم التصنيف الجديد<input value={bulkCategoryName} maxLength={120} onChange={(event) => setBulkCategoryName(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); void createBulkCategory(); } }} className="erp-input" placeholder="مثال: شاشات، بطاريات، كابلات..." /></label><Button type="button" disabled={bulkCategoryCreating || !bulkCategoryName.trim()} onClick={() => void createBulkCategory()} className="font-black">{bulkCategoryCreating ? <Loader2 className="h-4 w-4 animate-spin" /> : "إنشاء واختيار"}</Button>{bulkCategoryError && <div className="text-xs font-bold text-rose-600 sm:col-span-2 dark:text-rose-300">{bulkCategoryError}</div>}</div>}
        <p className="mt-3 text-[10px] font-semibold text-slate-400"><Link href="/inventory/purchases/pending-compatibility" className="font-black text-indigo-700 underline dark:text-indigo-300">الأصناف التي تحتاج إكمال توافقات</Link> تبقى قابلة للوصول بعد الاعتماد.</p>
      </div>

      <div className="rounded-3xl border border-emerald-200 bg-emerald-50/45 p-5 shadow-sm dark:border-emerald-900/70 dark:bg-emerald-950/20">
        <div className="flex items-center gap-2"><CircleDollarSign className="h-5 w-5 text-emerald-700" /><div><h2 className="font-black text-slate-900 dark:text-slate-100">مساعد التسعير الجماعي</h2><p className="text-xs font-semibold text-slate-500 dark:text-slate-400">حدد الأصناف، ثم اختر نسبة زيادة على التكلفة لمعاينة أسعارها دفعة واحدة. مثال: تكلفة 10 وزيادة 30% تعطي سعر بيع 13. لا تُطبّق المقترحات إلا باختيارك.</p></div></div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2"><label className="grid gap-1 text-xs font-black text-slate-600 dark:text-slate-300">زيادة على التكلفة %<input type="number" min="0" step="0.1" value={priceIncrease} onChange={(event) => setPriceIncrease(event.target.value)} className="erp-input font-numeric" /></label><label className="grid gap-1 text-xs font-black text-slate-600 dark:text-slate-300">التقريب<select value={priceRounding} onChange={(event) => setPriceRounding(event.target.value as typeof priceRounding)} className="erp-input"><option value="none">بدون تقريب إضافي</option><option value="0.5">لأقرب 0.5</option><option value="1">لأقرب 1</option><option value="5">لأقرب 5</option></select></label></div>
        {pricingPreview.length ? <div className="mt-3 max-h-40 space-y-1 overflow-auto rounded-xl border border-emerald-100 bg-white/80 p-3 text-xs dark:border-emerald-900 dark:bg-slate-950/35">{pricingPreview.map((item) => <div key={item.key} className="flex items-center justify-between gap-3"><span className="truncate font-bold text-slate-600 dark:text-slate-300">{item.label}</span><span className="font-numeric font-black text-emerald-700 dark:text-emerald-300">{money(item.suggested, currency)}</span></div>)}</div> : <p className="mt-3 text-xs font-semibold text-slate-400">حدد بنداً واحداً أو أكثر لمعاينة الأسعار المقترحة.</p>}
        <Button type="button" onClick={applyPricingSuggestions} disabled={!pricingPreview.length} className="mt-3 w-full bg-emerald-700 font-black hover:bg-emerald-800">تطبيق المقترحات على البنود المحددة</Button>
        <p className="mt-3 text-[10px] font-semibold leading-5 text-slate-500 dark:text-slate-400">أساس الاقتراح هو <strong>تكلفة الوحدة في كل سطر</strong> فقط. هذا الاقتراح يستخدم تكلفة الشراء المدخلة قبل التوزيع. عند الاعتماد يوزع مسار الخصم على البنود بنسبة قيمتها، ثم يوزع الشحن/مصاريف الشراء المباشرة على صافي البنود لحساب تكلفة المخزون.</p>
      </div>
    </section>

    <section className="grid gap-5 xl:grid-cols-[1fr_390px]">
      <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <h2 className="font-black text-slate-900 dark:text-slate-100">الدفع والمصدر</h2>
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">ادفع كامل الفاتورة أو جزءاً منها، ويُسجّل الباقي ديناً علينا للمورد.</p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button type="button" variant="outline" onClick={() => { setAmountPaid(finalTotal.toFixed(2)); markDirty(); }}>دفع كامل المبلغ</Button>
          <Button type="button" variant="outline" onClick={() => { setAmountPaid("0"); markDirty(); }}>كامل المبلغ دين للمورد</Button>
        </div>
        <div className="mt-4 grid items-start gap-4 sm:grid-cols-2">
          <label className="grid gap-1.5 text-xs font-bold">المدفوع الآن<input data-purchase-field type="number" min="0" max={finalTotal} step="0.01" value={amountPaid} onKeyDown={enterToNext} onChange={(e) => { setAmountPaid(e.target.value); markDirty(); }} className="erp-input font-numeric" /><span className="text-slate-500">لدفع جزء من الفاتورة، اكتب المبلغ هنا.</span>{validation.amountPaid && <span className="text-rose-600">{validation.amountPaid}</span>}</label>
          {num(amountPaid) > 0 && <>
            <label className="grid gap-1.5 text-xs font-bold">من أين تم الدفع؟<select data-purchase-field value={paymentAccountType} onChange={(e) => { setPaymentAccountType(e.target.value as typeof paymentAccountType); markDirty(); }} className="erp-input"><option value="DRAWER">من الدرج النقدي</option><option value="WALLET">من محفظة</option><option value="OTHER">دفع خارج النظام — بدون خصم</option></select></label>
            {paymentAccountType === "WALLET" && <label className="grid gap-1.5 text-xs font-bold">المحفظة<select data-purchase-field value={paymentWalletId} onChange={(e) => { setPaymentWalletId(e.target.value); markDirty(); }} className="erp-input"><option value="">اختر المحفظة</option>{wallets.map(wallet => <option key={wallet.id} value={wallet.id}>{wallet.name} — {money(num(wallet.currentBalance), currency)}</option>)}</select>{wallets.length === 0 && <span className="text-amber-700">لا توجد محافظ نشطة. أضف محفظة من صفحة التحويلات.</span>}</label>}
            <label className="grid gap-1.5 text-xs font-bold">مرجع الدفع (اختياري)<input data-purchase-field value={paymentReference} onChange={(e) => { setPaymentReference(e.target.value); markDirty(); }} className="erp-input" /></label>
          </>}
        </div>
        {num(amountPaid) > 0 && <p className="mt-3 text-xs leading-6 text-slate-500 dark:text-slate-400">{paymentAccountType === "DRAWER" ? `رصيد الدرج الحالي: ${money(num(drawerBalance), currency)}. يُخصم المدفوع وتسجّل الحركة عند الاعتماد.` : paymentAccountType === "WALLET" ? "يُخصم المدفوع من المحفظة المختارة وتسجّل الحركة عند الاعتماد." : "تُسجّل الدفعة وتسدد من الفاتورة، دون تغيير رصيد الدرج أو المحافظ."}</p>}
        <div aria-live="polite" className="mt-4 rounded-xl bg-amber-50 p-3 text-sm font-bold text-amber-900 dark:bg-amber-950/30 dark:text-amber-200">الدين المتبقي للمورد: {money(remaining, currency)}<p className="mt-1 text-xs font-normal">{remaining > 0 ? "يظهر في صفحة المورد بعد الاعتماد، ويمكن تسديده لاحقاً بالكامل أو على دفعات." : "لا يتبقى دين على هذه الفاتورة."}</p></div>
      </section>
      <div className="rounded-3xl border border-slate-200 bg-slate-950 p-5 text-white shadow-sm dark:border-slate-700"><h2 className="font-black">ملخص الفاتورة</h2><div className="mt-4 space-y-3 text-sm"><Summary label="مجموع البنود" value={money(subtotal, currency)} /><div><label className="flex items-center justify-between gap-4"><span className="text-slate-300">الخصم</span><input data-purchase-field type="number" min="0" step="0.01" value={discountTotal} onKeyDown={enterToNext} onChange={(e) => { setDiscountTotal(e.target.value); markDirty(); }} className="h-9 w-32 rounded-lg border border-slate-700 bg-slate-900 px-2 text-left font-numeric" /></label>{validation.discount && <div className="mt-1 text-[10px] font-bold text-rose-300">{validation.discount}</div>}</div><label className="flex items-center justify-between gap-4"><span className="text-slate-300">الشحن / مصاريف إضافية</span><input data-purchase-field type="number" min="0" step="0.01" value={extraCostsTotal} onKeyDown={enterToNext} onChange={(e) => { setExtraCostsTotal(e.target.value); markDirty(); }} className="h-9 w-32 rounded-lg border border-slate-700 bg-slate-900 px-2 text-left font-numeric" /></label><div className="border-t border-slate-700 pt-3"><Summary label="الإجمالي النهائي" value={money(finalTotal, currency)} strong /><Summary label="المدفوع" value={money(num(amountPaid), currency)} /><Summary label="المتبقي" value={money(remaining, currency)} strong tone={remaining > 0 ? "amber" : "green"} /></div></div><p className="mt-4 text-[11px] font-semibold leading-5 text-slate-400">عند الاعتماد يُثبت توزيع الخصم والشحن/مصاريف الشراء المباشرة على البنود. متوسط تكلفة المخزون لا يتغير عند الاعتماد، بل فقط عند الاستلام الفعلي وبحسب الكمية المستلمة. الشحن غير مسترد تلقائياً في مرتجع المورد.</p>{approvalError && <div ref={approvalErrorRef} role="alert" className="mt-4 rounded-xl border border-rose-500/50 bg-rose-950/70 p-3 text-xs font-bold leading-5 text-rose-100">{approvalError}</div>}<Button type="button" onClick={() => void postInvoice()} disabled={posting || !activeLines.length} className="mt-5 h-12 w-full rounded-xl bg-emerald-600 font-black hover:bg-emerald-700">{posting ? <><Loader2 className="ml-2 h-4 w-4 animate-spin" />جارٍ الاعتماد…</> : <><Check className="ml-2 h-4 w-4" />{partialReceipt ? "اعتماد وتسجيل الاستلام الجزئي" : "اعتماد واستلام كل البضاعة"}</>}</Button></div>
    </section>
  </div>;
}

function Summary({ label, value, strong = false, tone }: { label: string; value: string; strong?: boolean; tone?: "amber" | "green" }) {
  return <div className={`flex items-center justify-between gap-4 ${strong ? "py-1 text-base font-black" : "text-sm"}`}><span className="text-slate-300">{label}</span><span className={`font-numeric ${tone === "amber" ? "text-amber-300" : tone === "green" ? "text-emerald-300" : "text-white"}`}>{value}</span></div>;
}

function PurchaseLineCard({ line, index, currency, categories, showManualExtraAllocation, duplicate, duplicateBarcode, onPatch, onRemove, onEnterNext }: {
  line: FormLine; index: number; currency: string; categories: CategoryOption[]; showManualExtraAllocation: boolean; duplicate: boolean; duplicateBarcode: boolean;
  onPatch: (patch: Partial<FormLine>) => void; onRemove: () => void; onEnterNext: (event: KeyboardEvent<HTMLElement>) => void;
}) {
  const isBlank = !line.inventoryItemId && !line.newItemName.trim() && !line.newItemBarcode.trim();
  const total = Math.max(1, Math.trunc(num(line.quantity) || 1)) * Math.max(0, num(line.unitCost));
  const stateLabel = line.matchReviewRequired ? "يحتاج مراجعة" : line.mode === "new" ? "صنف جديد" : "صنف موجود";
  const stateTone = line.matchReviewRequired ? "bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-200" : line.mode === "new" ? "bg-cyan-100 text-cyan-800 dark:bg-cyan-950/50 dark:text-cyan-200" : "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-200";
  return <article className={`purchase-line-card rounded-2xl border p-3 sm:p-4 ${line.matchReviewRequired ? "border-amber-300 bg-amber-50/40 dark:border-amber-800 dark:bg-amber-950/20" : isBlank ? "border-dashed border-slate-300 bg-slate-50/50 dark:border-slate-700 dark:bg-slate-950/30" : "border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-950/35"}`}>
    <div className="mb-3 flex items-center justify-between gap-3"><div className="flex min-w-0 items-center gap-2"><input type="checkbox" checked={line.selected} disabled={isBlank} onChange={(event) => onPatch({ selected: event.target.checked })} /><span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-xs font-black text-slate-600 dark:bg-slate-800 dark:text-slate-300">{index + 1}</span><span className={`rounded-full px-2 py-0.5 text-[10px] font-black ${isBlank ? "bg-slate-100 text-slate-500 dark:bg-slate-800" : stateTone}`}>{isBlank ? "السطر التالي جاهز" : stateLabel}</span>{line.importedSourceText && <span className="truncate text-[10px] font-bold text-slate-400">مستورد</span>}</div>{!isBlank && <button type="button" onClick={onRemove} className="rounded-lg p-2 text-slate-400 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950/40"><Trash2 className="h-4 w-4" /></button>}</div>
    <div className="grid gap-3 lg:grid-cols-[minmax(260px,2fr)_100px_135px_155px_145px] lg:items-start">
      <div><div className="mb-1.5 flex items-center justify-between"><span className="text-xs font-black text-slate-600 dark:text-slate-300">الصنف</span>{!isBlank && !line.matchReviewRequired && <button type="button" onClick={() => onPatch({
          ...blankLine(),
          key: line.key,
          mode: line.mode === "new" ? "existing" : "new",
          newItemName: line.mode === "existing" ? line.existingItem?.name ?? "" : "",
          quantity: line.quantity,
          unitCost: line.unitCost,
          salePrice: line.salePrice,
          importedSourceText: line.importedSourceText,
          selected: line.selected,
        })} className="text-[10px] font-black text-cyan-700 dark:text-cyan-300">{line.mode === "new" ? "البحث في المخزون" : "إنشاء صنف جديد"}</button>}</div>
        {line.matchReviewRequired ? <MatchReview line={line} onPatch={onPatch} /> : line.mode === "existing" ? <InventoryLookup value={line.itemLabel} onClear={() => onPatch({ inventoryItemId: null, itemLabel: "", existingItem: null })} onSelect={(item) => onPatch(existingPatch(item, { unitCost: line.unitCost || undefined, importedSourceText: line.importedSourceText }))} onNew={(name) => onPatch({ mode: "new", inventoryItemId: null, existingItem: null, itemLabel: "", newItemName: name, compatibilityReviewNeeded: true })} /> : <NewItemFields line={line} categories={categories} onPatch={onPatch} onEnterNext={onEnterNext} />}
        {duplicate && <div className="mt-2 rounded-lg bg-amber-50 px-2 py-1.5 text-[10px] font-bold text-amber-800 dark:bg-amber-950/30 dark:text-amber-200">هذا الصنف مكرر. السطور تبقى منفصلة، خصوصاً عند اختلاف التكلفة.</div>}{duplicateBarcode && <div className="mt-2 rounded-lg bg-rose-50 px-2 py-1.5 text-[10px] font-bold text-rose-700 dark:bg-rose-950/30 dark:text-rose-200">الباركود مكرر بين أصناف جديدة. يجب حل المطابقة قبل الاعتماد.</div>}
      </div>
      <label className="grid gap-1.5 text-xs font-black text-slate-600 dark:text-slate-300">الكمية<input data-purchase-field type="number" min="1" step="1" value={line.quantity} onKeyDown={onEnterNext} onChange={(e) => onPatch({ quantity: e.target.value })} className="erp-input font-numeric" /></label>
      <label className="grid gap-1.5 text-xs font-black text-slate-600 dark:text-slate-300">تكلفة الوحدة<input data-purchase-field type="number" min="0" step="0.01" value={line.unitCost} onKeyDown={onEnterNext} onChange={(e) => onPatch({ unitCost: e.target.value })} className="erp-input font-numeric" /></label>
      <div className="grid gap-1.5"><label className="grid gap-1 text-xs font-black text-slate-600 dark:text-slate-300"><span>سعر البيع <span className="font-semibold text-slate-400">(اختياري)</span></span><input data-purchase-field type="number" min="0" step="0.01" value={line.salePrice} onKeyDown={onEnterNext} onChange={(e) => onPatch({ salePrice: e.target.value })} className="erp-input font-numeric" /></label>{line.mode === "existing" && !line.matchReviewRequired && <label className="flex items-start gap-1.5 text-[9px] font-bold text-slate-500 dark:text-slate-400"><input className="mt-0.5" type="checkbox" checked={line.updateSalePrice} onChange={(event) => onPatch({ updateSalePrice: event.target.checked })} /><span>تحديث سعر بيع الصنف عند الاعتماد</span></label>}</div>
      <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 dark:border-slate-700 dark:bg-slate-900"><div className="text-[10px] font-bold text-slate-400">إجمالي السطر</div><div className="mt-1 font-numeric text-sm font-black text-slate-900 dark:text-slate-100">{money(total, currency)}</div></div>
    </div>
    {showManualExtraAllocation && !isBlank && <label className="mt-3 grid max-w-xs gap-1 text-[10px] font-black text-amber-800 dark:text-amber-200">توزيع الشحن/مصاريف الشراء على هذا البند<input type="number" min="0" step="0.01" value={line.manualExtraCostAllocation} onChange={(e) => onPatch({ manualExtraCostAllocation: e.target.value })} className="erp-input h-9 font-numeric" /><span className="font-semibold text-amber-600 dark:text-amber-300">مطلوب لأن أساس التوزيع النسبي يساوي صفراً.</span></label>}
    {line.mode === "existing" && line.existingItem && !line.matchReviewRequired && <PricingContext item={line.existingItem} newCost={line.unitCost} currency={currency} updateSalePrice={line.updateSalePrice} />}
    {line.importedSourceText && <details className="mt-3 rounded-xl border border-slate-200 bg-slate-50/60 px-3 py-2 text-[10px] dark:border-slate-700 dark:bg-slate-900/60"><summary className="cursor-pointer font-black text-slate-500">النص الأصلي المستورد</summary><div dir="auto" className="mt-2 whitespace-pre-wrap break-words font-mono text-slate-600 dark:text-slate-300">{line.importedSourceText}</div></details>}
  </article>;
}

function PricingContext({ item, newCost, currency, updateSalePrice }: { item: InventoryResult; newCost: string; currency: string; updateSalePrice: boolean }) {
  const last = item.lastPurchaseCost ? num(item.lastPurchaseCost) : null;
  const difference = last === null ? null : num(newCost) - last;
  return <div className="mt-3 grid gap-2 rounded-xl border border-emerald-100 bg-emerald-50/50 p-3 text-[10px] sm:grid-cols-2 lg:grid-cols-4 dark:border-emerald-900/60 dark:bg-emerald-950/20"><Info label="آخر تكلفة شراء" value={last === null ? "غير متاحة" : money(last, currency)} /><Info label="تاريخ / المورد" value={item.lastPurchaseAt ? `${new Date(item.lastPurchaseAt).toLocaleDateString("ar")}${item.lastPurchaseSupplierName ? ` • ${item.lastPurchaseSupplierName}` : ""}` : "غير متاح"} /><Info label="سعر البيع الحالي" value={money(num(item.unitPrice), currency)} /><Info label="فرق التكلفة الجديدة" value={difference === null ? "—" : `${difference >= 0 ? "+" : ""}${money(difference, currency)}`} />{updateSalePrice && <div className="sm:col-span-2 lg:col-span-4 rounded-lg bg-emerald-100 px-2 py-1.5 font-black text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-200">تم اختيار تحديث سعر البيع صراحةً؛ سيتم التغيير فقط عند الاعتماد بصلاحية إدارة المخزون.</div>}</div>;
}
function Info({ label, value }: { label: string; value: string }) { return <div><div className="font-bold text-slate-400">{label}</div><div className="mt-0.5 font-black text-slate-700 dark:text-slate-200">{value}</div></div>; }

function MatchReview({ line, onPatch }: { line: FormLine; onPatch: (patch: Partial<FormLine>) => void }) {
  return <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 dark:border-amber-800 dark:bg-amber-950/30"><div className="text-xs font-black text-amber-900 dark:text-amber-100">راجع المطابقة قبل المتابعة</div><div className="mt-1 text-[10px] font-semibold text-amber-700 dark:text-amber-300">لم نعتمد اقتراح الاسم تلقائياً حتى لا نخلط موديلات أو ألواناً أو درجات جودة متشابهة.</div>{line.matchCandidates.length ? <div className="mt-2 space-y-1.5">{line.matchCandidates.map((candidate) => <button key={candidate.id} type="button" onClick={() => onPatch(existingPatch(candidate, { unitCost: line.unitCost, salePrice: line.salePrice || candidate.unitPrice, importedSourceText: line.importedSourceText }))} className="block w-full rounded-lg border border-amber-200 bg-white px-3 py-2 text-right hover:border-emerald-300 dark:border-amber-800 dark:bg-slate-900"><div className="text-xs font-black text-slate-900 dark:text-slate-100">{candidate.name}</div><div className="mt-0.5 text-[9px] font-semibold text-slate-500">{[candidate.barcode && `باركود ${candidate.barcode}`, candidate.sku && `SKU ${candidate.sku}`, candidate.category, candidate.description].filter(Boolean).join(" • ")}</div></button>)}</div> : <div className="mt-2 text-[10px] font-semibold text-amber-700">أعد البحث في المخزون أو أكد أنه صنف جديد.</div>}<Button type="button" variant="outline" size="sm" onClick={() => onPatch({ matchReviewRequired: false, matchCandidates: [], mode: "new", inventoryItemId: null, existingItem: null, itemLabel: "", compatibilityReviewNeeded: true })} className="mt-2 border-cyan-200 font-black text-cyan-700">تأكيد إنشاء صنف جديد</Button></div>;
}

function NewItemFields({ line, categories, onPatch, onEnterNext }: { line: FormLine; categories: CategoryOption[]; onPatch: (patch: Partial<FormLine>) => void; onEnterNext: (event: KeyboardEvent<HTMLElement>) => void }) {
  const [suggesting, setSuggesting] = useState(false);
  const [suggestions, setSuggestions] = useState<Array<{ id: string; name: string; score: number }>>([]);
  async function suggestCategory() {
    if (line.newItemName.trim().length < 2) return;
    setSuggesting(true);
    const result = await suggestPurchaseItemMetadataAction(`${line.newItemName} ${line.newItemDescription}`.trim());
    setSuggesting(false);
    if (result.ok) setSuggestions(result.categories);
  }
  const selectedCategory = categories.find((category) => category.id === line.newItemCategoryId);
  return <div className="space-y-2"><div className="grid gap-2 sm:grid-cols-2"><input data-purchase-field value={line.newItemName} onKeyDown={onEnterNext} onChange={(e) => onPatch({ newItemName: e.target.value })} className="erp-input sm:col-span-2" placeholder="اسم الصنف الجديد *" /><input data-purchase-field value={line.newItemBarcode} onKeyDown={onEnterNext} onChange={(e) => onPatch({ newItemBarcode: e.target.value.replace(/\s+/g, "") })} className="erp-input font-numeric" placeholder="الباركود اختياري" /><input data-purchase-field value={line.newItemSku} onKeyDown={onEnterNext} onChange={(e) => onPatch({ newItemSku: e.target.value })} className="erp-input" placeholder="SKU اختياري" /><div className="sm:col-span-2 grid gap-2 sm:grid-cols-[1fr_auto]"><select data-purchase-field value={line.newItemCategoryId} onKeyDown={onEnterNext} onChange={(event) => { const category = categories.find((item) => item.id === event.target.value); onPatch({ newItemCategoryId: event.target.value, newItemCategory: category?.name ?? "" }); }} className="erp-input"><option value="">بدون تصنيف حالياً</option>{categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select><Button type="button" variant="outline" disabled={suggesting || line.newItemName.trim().length < 2} onClick={() => void suggestCategory()} className="font-bold">{suggesting ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Sparkles className="ml-1 h-4 w-4" />اقتراح</>}</Button></div><input data-purchase-field value={line.newItemDescription} onKeyDown={onEnterNext} onChange={(e) => onPatch({ newItemDescription: e.target.value })} className="erp-input sm:col-span-2" placeholder="الموديل / الجودة / اللون أو وصف مختصر" /></div>{suggestions.length > 0 && <div className="flex flex-wrap gap-1.5">{suggestions.map((suggestion) => <button key={suggestion.id} type="button" onClick={() => { onPatch({ newItemCategoryId: suggestion.id, newItemCategory: suggestion.name }); setSuggestions([]); }} className="rounded-full border border-indigo-200 bg-indigo-50 px-2.5 py-1 text-[10px] font-black text-indigo-700 dark:border-indigo-800 dark:bg-indigo-950/30 dark:text-indigo-200">{suggestion.name}</button>)}</div>}<details className="rounded-xl border border-violet-100 bg-violet-50/40 px-3 py-2 dark:border-violet-900/60 dark:bg-violet-950/20"><summary className="cursor-pointer text-[10px] font-black text-violet-700 dark:text-violet-300"><span className="inline-flex items-center gap-1"><Link2 className="h-3.5 w-3.5" />اقتراح الموديل والتوافقات من دليل مسار</span></summary><div className="mt-3"><CompatibilityGuidePicker querySeed={`${line.newItemName} ${line.newItemDescription}`.trim()} categoryName={selectedCategory?.name ?? line.newItemCategory} selected={line.compatibilitySelections} onChange={(selections) => onPatch({ compatibilitySelections: selections, compatibilityReviewNeeded: selections.length ? false : line.compatibilityReviewNeeded })} /></div></details><label className="flex items-start gap-2 text-[10px] font-bold text-slate-500 dark:text-slate-400"><input className="mt-0.5" type="checkbox" checked={line.compatibilityReviewNeeded} onChange={(event) => onPatch({ compatibilityReviewNeeded: event.target.checked })} /><span>إكمال التوافقات لاحقاً بعد الاعتماد. يمكن الوصول للصنف من قائمة «تحتاج إكمال توافقات».</span></label></div>;
}

function CompatibilityGuidePicker({ querySeed, categoryName, selected, onChange }: { querySeed: string; categoryName: string; selected: CompatibilitySelection[]; onChange: (value: CompatibilitySelection[]) => void }) {
  const [query, setQuery] = useState(querySeed);
  const [dataset, setDataset] = useState(() => suggestedCompatibilityDataset(`${categoryName} ${querySeed}`));
  const [results, setResults] = useState<Array<{ groupId: string; deviceName: string; brandSection: string; matchType: string; compatibleDevices: Array<{ id: string; name: string }> }>>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => { if (!query.trim() && querySeed.trim()) setQuery(querySeed); }, [querySeed, query]);
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) { setResults([]); return; }
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setLoading(true); setError("");
      try {
        const response = await fetch(`/api/compatibility/directory?q=${encodeURIComponent(q)}&dataset=${encodeURIComponent(dataset)}&limit=8`, { signal: controller.signal });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || "تعذر البحث في دليل التوافقات.");
        setResults(Array.isArray(payload.results) ? payload.results : []);
      } catch (searchError) {
        if ((searchError as Error).name !== "AbortError") setError((searchError as Error).message || "تعذر البحث.");
      } finally { setLoading(false); }
    }, 280);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [query, dataset]);
  const datasets = [{ value: "SCREEN", label: "شاشة" }, { value: "BATTERY", label: "بطارية" }, { value: "CHARGING_PORT", label: "منفذ شحن" }, { value: "DISPLAY_CONNECTOR", label: "كونكتر شاشة" }, { value: "POWER_FLEX", label: "فلاتة" }, { value: "FRAME", label: "فريم" }, { value: "BACK_COVER", label: "غطاء خلفي" }, { value: "TEMPERED_GLASS", label: "حماية" }, { value: "TOUCH_GLASS", label: "زجاج لمس" }];
  function add(result: (typeof results)[number]) { if (selected.some((item) => item.groupId === result.groupId) || selected.length >= 5) return; onChange([...selected, { groupId: result.groupId, deviceName: result.deviceName, dataset }]); }
  return <div className="space-y-2"><div className="grid gap-2 sm:grid-cols-[150px_1fr]"><select value={dataset} onChange={(event) => setDataset(event.target.value as ReturnType<typeof suggestedCompatibilityDataset>)} className="erp-input h-10 text-xs">{datasets.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select><div className="relative"><Search className="absolute right-3 top-3 h-4 w-4 text-violet-500" /><input value={query} onChange={(event) => setQuery(event.target.value)} className="erp-input h-10 pr-9 text-xs" placeholder="ابحث عن الموديل" />{loading && <Loader2 className="absolute left-3 top-3 h-4 w-4 animate-spin text-violet-500" />}</div></div><p className="text-[9px] font-semibold leading-4 text-slate-400">هذه نتائج من دليل التوافقات الموجود فقط. تشابه الاسم لا ينشئ توافقاً؛ يجب الضغط على النتيجة لتأكيد الربط.</p>{selected.length > 0 && <div className="flex flex-wrap gap-1.5">{selected.map((item) => <span key={item.groupId} className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-1 text-[9px] font-black text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-200">{item.deviceName}<button type="button" onClick={() => onChange(selected.filter((selection) => selection.groupId !== item.groupId))}><X className="h-3 w-3" /></button></span>)}</div>}{error && <div className="text-[10px] font-bold text-rose-600">{error}</div>}{results.length > 0 && <div className="max-h-48 space-y-1 overflow-auto">{results.map((result) => <button key={`${result.groupId}:${result.deviceName}`} type="button" onClick={() => add(result)} disabled={selected.some((item) => item.groupId === result.groupId)} className="flex w-full items-center justify-between gap-2 rounded-lg border border-violet-100 bg-white px-2.5 py-2 text-right text-[10px] hover:border-violet-300 disabled:opacity-50 dark:border-violet-900 dark:bg-slate-900"><span><strong className="block text-slate-800 dark:text-slate-100">{result.deviceName}</strong><span className="text-slate-400">{result.brandSection}</span></span><span className="rounded-full bg-violet-50 px-2 py-0.5 font-black text-violet-700 dark:bg-violet-950/40 dark:text-violet-200">{result.matchType === "EXACT" ? "مطابقة مباشرة" : "اقتراح من الدليل"}</span></button>)}</div>}</div>;
}

function InventoryLookup({ value, onClear, onSelect, onNew }: { value: string; onClear: () => void; onSelect: (item: InventoryResult) => void; onNew: (name: string) => void }) {
  const [query, setQuery] = useState(value);
  const [results, setResults] = useState<InventoryResult[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [highlighted, setHighlighted] = useState(0);
  const requestRef = useRef(0);
  useEffect(() => { if (value) setQuery(value); }, [value]);
  useEffect(() => {
    const q = query.trim();
    if (!q || q === value) { setResults([]); return; }
    const requestId = ++requestRef.current;
    const timer = setTimeout(async () => {
      setLoading(true);
      const rows = await searchPurchaseInventoryAction(q);
      if (requestRef.current === requestId) { setResults(rows); setHighlighted(0); setOpen(true); setLoading(false); }
    }, 220);
    return () => clearTimeout(timer);
  }, [query, value]);
  function choose(item: InventoryResult) { setQuery([item.name, item.barcode ? `#${item.barcode}` : item.sku].filter(Boolean).join(" — ")); setOpen(false); onSelect(item); }
  return <div className="relative"><Search className="pointer-events-none absolute right-3 top-3.5 h-4 w-4 text-slate-400" /><input data-purchase-field role="combobox" aria-expanded={open} value={query} onFocus={() => query.trim() && setOpen(true)} onChange={(e) => { if (value) onClear(); setQuery(e.target.value); setOpen(true); }} onKeyDown={(e) => { if (e.key === "ArrowDown") { e.preventDefault(); setHighlighted((v) => Math.min(v + 1, Math.max(0, results.length - 1))); } else if (e.key === "ArrowUp") { e.preventDefault(); setHighlighted((v) => Math.max(v - 1, 0)); } else if (e.key === "Enter") { e.preventDefault(); if (results[highlighted]) choose(results[highlighted]); else if (query.trim()) { setOpen(false); onNew(query.trim()); } } else if (e.key === "Escape") setOpen(false); }} className="erp-input pr-10" placeholder="ابحث بالاسم، الباركود، SKU، الموديل، الجودة أو اللون…" />{loading && <Loader2 className="absolute left-3 top-3.5 h-4 w-4 animate-spin text-cyan-600" />}{open && query.trim() && <div className="absolute z-40 mt-1 max-h-80 w-full overflow-y-auto rounded-xl border border-slate-200 bg-white p-1 shadow-xl dark:border-slate-700 dark:bg-slate-900">{results.map((item, idx) => <button key={item.id} type="button" onMouseEnter={() => setHighlighted(idx)} onMouseDown={(e) => e.preventDefault()} onClick={() => choose(item)} className={`w-full rounded-lg px-3 py-2 text-right ${idx === highlighted ? "bg-cyan-50 dark:bg-cyan-950/40" : "hover:bg-slate-50 dark:hover:bg-slate-800"}`}><div className="flex items-center justify-between gap-3"><span className="text-xs font-black text-slate-900 dark:text-slate-100">{item.name}</span><span className="font-numeric text-[10px] text-slate-400">مخزون {item.quantity}</span></div><div className="mt-1 flex flex-wrap gap-1 text-[10px] font-semibold text-slate-500 dark:text-slate-400">{item.barcode && <span>باركود: {item.barcode}</span>}{item.sku && <span>• SKU: {item.sku}</span>}{item.category && <span>• {item.category}</span>}{item.description && <span className="truncate">• {item.description}</span>}{item.compatibilityCount > 0 && <span>• {item.compatibilityCount} توافق</span>}</div></button>)}<button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => { setOpen(false); onNew(query.trim()); }} className="mt-1 flex w-full items-center gap-2 rounded-lg border border-dashed border-cyan-300 px-3 py-2 text-xs font-black text-cyan-700 hover:bg-cyan-50 dark:border-cyan-800 dark:text-cyan-300 dark:hover:bg-cyan-950/30"><PackagePlus className="h-4 w-4" />إنشاء “{query.trim()}” كصنف جديد داخل المسودة</button></div>}</div>;
}
