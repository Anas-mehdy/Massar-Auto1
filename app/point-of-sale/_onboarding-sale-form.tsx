"use client";

import Link from "next/link";
import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, Banknote, Boxes, Loader2, ShoppingCart, Sparkles, Warehouse } from "lucide-react";
import { ANALYTICS_EVENTS } from "@/lib/analytics/events";
import { captureClientEvent } from "@/lib/analytics/client";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/format";
import { createSaleAction, type SaleActionState } from "@/app/sales/actions";
import { InventorySearchCombobox, type SaleInventoryOption } from "@/app/sales/inventory-search-combobox";

const initialState: SaleActionState = {};

export function SaleOnboardingQuickForm({
  inventoryItems,
  warehouse,
  currency,
}: {
  inventoryItems: SaleInventoryOption[];
  warehouse: { id: string; name: string };
  currency: string;
}) {
  const [state, formAction, isPending] = useActionState(createSaleAction, initialState);
  const [selectedInventory, setSelectedInventory] = useState<SaleInventoryOption | null>(null);
  const [description, setDescription] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [unitPrice, setUnitPrice] = useState("");
  const startedRef = useRef(false);

  useEffect(() => {
    captureClientEvent(ANALYTICS_EVENTS.SALE_FORM_VIEWED, {
      source: "point_of_sale_onboarding",
      onboarding_mode: true,
      onboarding_flow: "sales_first_value",
      warehouse_id: warehouse.id,
    });
  }, [warehouse.id]);

  function markStarted() {
    if (startedRef.current) return;
    startedRef.current = true;
    captureClientEvent(ANALYTICS_EVENTS.SALE_FORM_STARTED, {
      source: "point_of_sale_onboarding",
      onboarding_mode: true,
      onboarding_flow: "sales_first_value",
      warehouse_id: warehouse.id,
    });
  }

  function selectInventory(item: SaleInventoryOption | null) {
    markStarted();
    if (item && item.warehouseId !== warehouse.id) return;
    setSelectedInventory(item);
    if (!item) return;
    setDescription(item.name);
    setUnitPrice(item.unitPrice);
    setQuantity(1);
  }

  const numericPrice = Number(unitPrice || 0);
  const total = Math.max(0, numericPrice * Math.max(0, quantity));
  const stockInsufficient = Boolean(selectedInventory && quantity > selectedInventory.quantity);
  const canSubmit = description.trim().length > 0 && quantity > 0 && numericPrice > 0 && !stockInsufficient;

  const serializedItems = useMemo(
    () => JSON.stringify([
      {
        inventoryItemId: selectedInventory?.id ?? null,
        description: description.trim(),
        quantity,
        unitPrice: unitPrice || "0",
        discountTotal: "0",
      },
    ]),
    [description, quantity, selectedInventory?.id, unitPrice],
  );

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <section className="overflow-hidden rounded-[26px] border border-indigo-200 bg-gradient-to-l from-indigo-50 via-white to-cyan-50/60 shadow-[0_24px_80px_-54px_rgba(79,70,229,0.65)] dark:border-indigo-900/70 dark:from-indigo-950/30 dark:via-slate-950 dark:to-cyan-950/20">
        <div className="flex items-start gap-3 border-b border-indigo-100 px-5 py-5 sm:px-6 dark:border-indigo-900/50">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-indigo-600 text-white shadow-md shadow-indigo-600/20">
            <ShoppingCart className="h-5 w-5" />
          </span>
          <div>
            <p className="text-[10px] font-black text-indigo-700 dark:text-indigo-300">أول قيمة من المبيعات</p>
            <h1 className="mt-0.5 text-[19px] font-black text-slate-950 dark:text-slate-50">سجّل أول عملية بيع</h1>
            <p className="mt-1 text-[11px] font-semibold leading-5 text-slate-500 dark:text-slate-400">
              لا تحتاج تجهيز كل نقطة البيع الآن. أضف بنداً واحداً وسعره، ومسار يتولى تسجيل العملية والإيصال.
            </p>
          </div>
        </div>

        <form action={formAction} className="space-y-5 px-5 py-5 sm:px-6">
          <input type="hidden" name="items" value={serializedItems} />
          <input type="hidden" name="warehouseId" value={warehouse.id} />
          <input type="hidden" name="customerMode" value="CASH" />
          <input type="hidden" name="customerId" value="" />
          <input type="hidden" name="paymentDestination" value="DRAWER" />
          <input type="hidden" name="walletId" value="" />
          <input type="hidden" name="amountReceived" value="" />
          <input type="hidden" name="changeDestination" value="DRAWER" />
          <input type="hidden" name="changeWalletId" value="" />
          <input type="hidden" name="onboarding" value="1" />

          {state.error ? (
            <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-[11px] font-bold leading-5 text-rose-700 dark:border-rose-900/70 dark:bg-rose-950/30 dark:text-rose-200">
              {state.error}
            </div>
          ) : null}

          <div className="flex items-center gap-2 rounded-xl border border-cyan-200 bg-cyan-50/70 px-3 py-2 text-[10px] font-black text-cyan-800 dark:border-cyan-900 dark:bg-cyan-950/25 dark:text-cyan-200">
            <Warehouse className="h-3.5 w-3.5" />
            البيع من: {warehouse.name} • الكمية المعروضة هي المتاح غير المحجوز
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white/85 p-4 dark:border-slate-800 dark:bg-slate-900/70">
            <div className="mb-3 flex items-center gap-2">
              <Boxes className="h-4 w-4 text-indigo-600" />
              <div>
                <p className="text-[12px] font-black text-slate-900 dark:text-slate-100">شو عم تبيع؟</p>
                <p className="mt-0.5 text-[9px] font-semibold text-slate-400">اختر من مخزون المستودع إن وجد، أو اكتب أي قطعة/خدمة يدوياً.</p>
              </div>
            </div>

            <div className="grid gap-4">
              <label className="grid gap-1.5 text-[11px] font-black text-slate-700 dark:text-slate-300">
                <span>قطعة من المخزون <span className="font-semibold text-slate-400">(اختياري)</span></span>
                <InventorySearchCombobox
                  value={selectedInventory?.id ?? ""}
                  selectedLabel={selectedInventory?.name ?? ""}
                  warehouseId={warehouse.id}
                  initialOptions={inventoryItems}
                  onSelect={selectInventory}
                />
              </label>

              <label className="grid gap-1.5 text-[11px] font-black text-slate-700 dark:text-slate-300">
                <span>اسم القطعة أو الخدمة *</span>
                <input
                  className="erp-input"
                  value={description}
                  onChange={(event) => {
                    markStarted();
                    setDescription(event.target.value);
                    if (selectedInventory && event.target.value !== selectedInventory.name) setSelectedInventory(null);
                  }}
                  placeholder="مثال: كفر آيفون، شاحن، خدمة تركيب..."
                  autoFocus
                />
              </label>

              <div className="grid gap-3 sm:grid-cols-2">
                <label className="grid gap-1.5 text-[11px] font-black text-slate-700 dark:text-slate-300">
                  <span>الكمية *</span>
                  <input
                    className="erp-input font-numeric"
                    type="number"
                    min="1"
                    step="1"
                    value={quantity}
                    onChange={(event) => {
                      markStarted();
                      setQuantity(Math.max(1, Number(event.target.value) || 1));
                    }}
                  />
                </label>
                <label className="grid gap-1.5 text-[11px] font-black text-slate-700 dark:text-slate-300">
                  <span>سعر الوحدة ({currency}) *</span>
                  <input
                    className="erp-input font-numeric"
                    type="number"
                    min="0.01"
                    step="0.01"
                    value={unitPrice}
                    onChange={(event) => {
                      markStarted();
                      setUnitPrice(event.target.value);
                    }}
                    placeholder="0.00"
                  />
                </label>
              </div>

              {selectedInventory ? (
                <div className={`rounded-xl border px-3 py-2 text-[10px] font-bold ${stockInsufficient ? "border-rose-200 bg-rose-50 text-rose-700" : "border-emerald-200 bg-emerald-50 text-emerald-700"}`}>
                  المتاح للبيع في {warehouse.name}: <span className="font-numeric font-black">{selectedInventory.quantity}</span>
                  {selectedInventory.reservedQuantity > 0 ? ` • محجوز للصيانة: ${selectedInventory.reservedQuantity}` : ""}
                  {stockInsufficient ? " — الكمية المطلوبة أكبر من المتاح." : " — سيتم الخصم من هذا المستودع تلقائياً."}
                </div>
              ) : null}
            </div>
          </div>

          <div className="rounded-2xl border border-teal-200 bg-teal-50/60 p-4 dark:border-teal-900/60 dark:bg-teal-950/20">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Banknote className="h-4 w-4 text-teal-700 dark:text-teal-300" />
                <div><p className="text-[11px] font-black text-teal-900 dark:text-teal-200">بيع نقدي سريع</p><p className="mt-0.5 text-[9px] font-semibold text-teal-700/70 dark:text-teal-300/70">سيُسجل المبلغ في الدرج النقدي تلقائياً.</p></div>
              </div>
              <div className="text-left"><p className="text-[9px] font-black text-slate-400">الإجمالي</p><p className="font-numeric text-lg font-black text-teal-800 dark:text-teal-200">{formatCurrency(total, currency)}</p></div>
            </div>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <Link href="/point-of-sale?tab=sale" className="inline-flex h-10 items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white px-4 text-[10px] font-black text-slate-500 transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
              <ArrowRight className="h-3.5 w-3.5" />
              استخدام نقطة البيع الكاملة
            </Link>
            <Button type="submit" disabled={isPending || !canSubmit} className="h-11 min-w-[190px] rounded-xl bg-indigo-600 px-5 text-[11px] font-black text-white shadow-md shadow-indigo-600/15 hover:bg-indigo-500 disabled:opacity-50">
              {isPending ? <><Loader2 className="ml-1.5 h-4 w-4 animate-spin" />جاري تسجيل البيع...</> : <><Sparkles className="ml-1.5 h-4 w-4" />إتمام أول عملية بيع</>}
            </Button>
          </div>
        </form>
      </section>

      <p className="text-center text-[10px] font-semibold text-slate-400">بعد الحفظ رح تشوف الإيصال مباشرة. ما في داعي تتعلم باقي خيارات نقطة البيع الآن.</p>
    </div>
  );
}
