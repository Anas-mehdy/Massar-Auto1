"use client";

import { Loader2, PackageSearch, Search, X } from "lucide-react";
import { useEffect, useRef, useState, useTransition } from "react";
import { cn } from "@/lib/utils";
import { searchInventoryForSaleAction } from "./actions";

export type SaleInventoryOption = {
  id: string;
  name: string;
  sku: string | null;
  category?: string | null;
  warehouseId: string;
  warehouseName: string;
  quantity: number;
  onHandQuantity: number;
  reservedQuantity: number;
  unitPrice: string;
};

export function InventorySearchCombobox({
  value,
  selectedLabel,
  warehouseId,
  initialOptions,
  onSelect,
  placeholder = "ابحث بالاسم، SKU أو التصنيف...",
  showManualOption = true,
  autoFocus = false,
  refocusAfterSelect = false,
}: {
  value: string;
  selectedLabel: string;
  warehouseId: string;
  initialOptions: SaleInventoryOption[];
  onSelect: (item: SaleInventoryOption | null) => void;
  placeholder?: string;
  showManualOption?: boolean;
  autoFocus?: boolean;
  refocusAfterSelect?: boolean;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [results, setResults] = useState<SaleInventoryOption[]>(initialOptions.slice(0, 20));
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const [isPending, startTransition] = useTransition();
  const requestId = useRef(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setQuery("");
    setOpen(false);
    setResults(initialOptions.slice(0, 20));
    setHighlightedIndex(0);
  }, [warehouseId, initialOptions]);

  useEffect(() => {
    function onPointerDown(event: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, []);

  useEffect(() => {
    const trimmed = query.trim();
    if (!trimmed || !warehouseId) {
      requestId.current += 1;
      setResults(initialOptions.slice(0, 20));
      setHighlightedIndex(0);
      return;
    }

    const currentRequest = ++requestId.current;
    const timer = window.setTimeout(() => {
      startTransition(async () => {
        try {
          const matches = await searchInventoryForSaleAction(trimmed, warehouseId);
          if (requestId.current === currentRequest) {
            setResults(matches);
            setHighlightedIndex(0);
          }
        } catch {
          if (requestId.current === currentRequest) {
            setResults([]);
            setHighlightedIndex(0);
          }
        }
      });
    }, 140);

    return () => window.clearTimeout(timer);
  }, [query, initialOptions, warehouseId]);

  function finishSelection(item: SaleInventoryOption | null) {
    onSelect(item);
    setQuery("");
    setOpen(false);
    setHighlightedIndex(0);
    if (refocusAfterSelect) {
      window.requestAnimationFrame(() => inputRef.current?.focus());
    }
  }

  const displayValue = open ? query : value ? selectedLabel : "";

  return (
    <div ref={rootRef} className="relative">
      <div className="relative">
        <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input
          ref={inputRef}
          className="h-10 w-full rounded-md border bg-background pr-9 pl-9 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400"
          value={displayValue}
          placeholder={warehouseId ? placeholder : "اختر مستودع البيع أولاً..."}
          disabled={!warehouseId}
          autoComplete="off"
          autoFocus={autoFocus}
          onFocus={() => {
            setOpen(true);
            setQuery("");
            setHighlightedIndex(0);
          }}
          onChange={(event) => {
            setQuery(event.target.value);
            setOpen(true);
            setHighlightedIndex(0);
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              event.stopPropagation();
              if (open && results.length > 0) finishSelection(results[highlightedIndex] ?? results[0]);
              return;
            }
            if (event.key === "ArrowDown") {
              event.preventDefault();
              setOpen(true);
              setHighlightedIndex((current) => results.length ? (current + 1) % results.length : 0);
              return;
            }
            if (event.key === "ArrowUp") {
              event.preventDefault();
              setOpen(true);
              setHighlightedIndex((current) => results.length ? (current - 1 + results.length) % results.length : 0);
              return;
            }
            if (event.key === "Escape") {
              event.preventDefault();
              setOpen(false);
            }
          }}
        />
        {isPending ? (
          <Loader2 className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-primary" />
        ) : value ? (
          <button
            type="button"
            aria-label="إلغاء اختيار قطعة المخزون"
            className="absolute left-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
            onClick={() => finishSelection(null)}
          >
            <X className="h-3.5 w-3.5" />
          </button>
        ) : null}
      </div>

      {open && warehouseId ? (
        <div className="absolute z-50 mt-1.5 max-h-80 w-full overflow-y-auto rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl shadow-slate-200/60">
          {showManualOption ? (
            <>
              <button
                type="button"
                className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-right text-xs font-bold text-slate-600 hover:bg-slate-50"
                onClick={() => finishSelection(null)}
              >
                <PackageSearch className="h-4 w-4 text-slate-400" />
                بند يدوي / خدمة خارجية
              </button>
              <div className="my-1 border-t border-slate-100" />
            </>
          ) : null}

          {results.length === 0 && !isPending ? (
            <div className="px-3 py-6 text-center text-xs font-semibold text-slate-400">
              لا توجد قطعة مطابقة في هذا المستودع.
            </div>
          ) : (
            results.map((item, index) => (
              <button
                key={`${item.warehouseId}:${item.id}`}
                type="button"
                className={cn(
                  "flex w-full items-start justify-between gap-3 rounded-lg px-3 py-2.5 text-right",
                  index === highlightedIndex ? "bg-primary/5 ring-1 ring-primary/10" : "hover:bg-primary/5",
                  item.id === value && "bg-primary/5",
                )}
                onMouseEnter={() => setHighlightedIndex(index)}
                onClick={() => finishSelection(item)}
              >
                <div className="min-w-0">
                  <div className="truncate text-xs font-black text-slate-800">{item.name}</div>
                  <div className="mt-1 flex flex-wrap gap-x-2 gap-y-1 text-[10px] font-semibold text-slate-400">
                    {item.sku ? <span className="font-numeric">SKU: {item.sku}</span> : null}
                    {item.category ? <span>{item.category}</span> : null}
                    <span>{item.warehouseName}</span>
                    {item.reservedQuantity > 0 ? <span className="text-amber-600">محجوز: {item.reservedQuantity}</span> : null}
                  </div>
                </div>
                <span className={cn(
                  "shrink-0 rounded-full px-2 py-1 text-[10px] font-black font-numeric",
                  item.quantity > 0 ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700",
                )}>
                  المتاح للبيع: {item.quantity}
                </span>
              </button>
            ))
          )}
        </div>
      ) : null}
    </div>
  );
}
