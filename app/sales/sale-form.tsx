"use client";

import { Banknote, ChevronDown, ChevronUp, PackagePlus, Plus, Save, Trash2, UserPlus, Users, Warehouse } from "lucide-react";
import { useActionState, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/format";
import { createSaleAction, type SaleActionState } from "./actions";
import { Field, inputClassName } from "./_components";
import { InventorySearchCombobox, type SaleInventoryOption } from "./inventory-search-combobox";
import { CustomerSearchCombobox, type SaleCustomerOption } from "./customer-search-combobox";
import { SalePaymentFields, type SaleBankAccountOption, type SaleWalletOption } from "./sale-payment-fields";

type InventoryOption = SaleInventoryOption;
type WarehouseOption = { id: string; name: string; code: string | null; isDefault: boolean };
type CustomerMode = "EXISTING" | "NEW" | "CASH";
type SaleLineDraft = {
  id: string;
  inventoryItemId: string;
  description: string;
  quantity: number;
  unitPrice: string;
  discountTotal: string;
  detailsOpen: boolean;
};

const initialState: SaleActionState = {};

function createLine(item?: InventoryOption): SaleLineDraft {
  return {
    id: crypto.randomUUID(),
    inventoryItemId: item?.id ?? "",
    description: item?.name ?? "",
    quantity: 1,
    unitPrice: item?.unitPrice ?? "0",
    discountTotal: "0",
    detailsOpen: !item,
  };
}

export function SaleForm({ inventoryItems, warehouses, wallets, bankAccounts, currency = "SAR", returnTo }: { inventoryItems: InventoryOption[]; warehouses: WarehouseOption[]; wallets: SaleWalletOption[]; bankAccounts: SaleBankAccountOption[]; currency?: string; returnTo?: string }) {
  const [state, formAction, isPending] = useActionState(createSaleAction, initialState);
  const defaultWarehouseId = warehouses.find((warehouse) => warehouse.isDefault)?.id ?? warehouses[0]?.id ?? "";
  const [warehouseId, setWarehouseId] = useState(defaultWarehouseId);
  const [lines, setLines] = useState<SaleLineDraft[]>([]);
  const [customerMode, setCustomerMode] = useState<CustomerMode>("CASH");
  const [selectedCustomer, setSelectedCustomer] = useState<SaleCustomerOption | null>(null);
  const [forceSeparateLine, setForceSeparateLine] = useState(false);

  const warehouseInventoryItems = useMemo(() => inventoryItems.filter((item) => item.warehouseId === warehouseId), [inventoryItems, warehouseId]);
  const inventoryById = useMemo(() => new Map(warehouseInventoryItems.map((item) => [item.id, item])), [warehouseInventoryItems]);
  const selectedWarehouse = warehouses.find((warehouse) => warehouse.id === warehouseId) ?? null;
  const serializedItems = useMemo(
    () => JSON.stringify(lines.map((line) => ({
      inventoryItemId: line.inventoryItemId || null,
      description: line.description,
      quantity: line.quantity,
      unitPrice: line.unitPrice,
      discountTotal: line.discountTotal || "0",
    }))),
    [lines],
  );
  const subtotal = lines.reduce((sum, line) => sum + Number(line.unitPrice || 0) * Number(line.quantity || 0), 0);
  const discountTotal = lines.reduce((sum, line) => sum + Number(line.discountTotal || 0), 0);
  const total = subtotal - discountTotal;

  function updateLine(id: string, updates: Partial<SaleLineDraft>) {
    setLines((currentLines) => currentLines.map((line) => line.id === id ? { ...line, ...updates } : line));
  }

  function changeWarehouse(nextWarehouseId: string) {
    if (nextWarehouseId === warehouseId) return;
    const inventoryLineCount = lines.filter((line) => line.inventoryItemId).length;
    if (inventoryLineCount > 0 && !window.confirm(`تغيير مستودع البيع سيزيل ${inventoryLineCount} بنداً مرتبطاً بالمخزون حتى لا تبقى كميات من مستودع سابق. البنود اليدوية ستبقى. هل تريد المتابعة؟`)) return;
    setLines((currentLines) => currentLines.filter((line) => !line.inventoryItemId));
    setWarehouseId(nextWarehouseId);
  }

  function addInventoryItem(item: InventoryOption | null) {
    if (!item || item.warehouseId !== warehouseId) return;
    setLines((currentLines) => {
      if (!forceSeparateLine) {
        const existingIndex = currentLines.findIndex((line) => line.inventoryItemId === item.id);
        if (existingIndex >= 0) {
          return currentLines.map((line, index) => index === existingIndex
            ? { ...line, quantity: Math.max(1, Number(line.quantity || 0)) + 1 }
            : line);
        }
      }
      return [...currentLines, createLine(item)];
    });
  }

  function handleInventorySelect(line: SaleLineDraft, item: InventoryOption | null) {
    if (item && item.warehouseId !== warehouseId) return;
    updateLine(line.id, {
      inventoryItemId: item?.id ?? "",
      description: item?.name ?? line.description,
      unitPrice: item?.unitPrice ?? line.unitPrice,
    });
  }

  function addManualLine() {
    setLines((currentLines) => [...currentLines, createLine()]);
  }

  function removeLine(id: string) {
    setLines((currentLines) => currentLines.filter((line) => line.id !== id));
  }

  function changeCustomerMode(mode: CustomerMode) {
    setCustomerMode(mode);
    if (mode !== "EXISTING") setSelectedCustomer(null);
  }

  return <form action={formAction} className="space-y-6">
    <input name="items" type="hidden" value={serializedItems} />
    <input name="warehouseId" type="hidden" value={warehouseId} />
    <input name="customerMode" type="hidden" value={customerMode} />
    <input name="customerId" type="hidden" value={selectedCustomer?.id ?? ""} />
    {returnTo ? <input name="returnTo" type="hidden" value={returnTo} /> : null}

    {state.error ? <div className="rounded-2xl border border-rose-250/30 bg-rose-50/40 p-4.5 text-xs font-extrabold text-rose-700">⚠️ {state.error}</div> : null}

    <section className="erp-section">
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-cyan-50 text-cyan-700"><Warehouse className="h-5 w-5" /></span>
        <div className="min-w-0 flex-1">
          <div className="font-black text-sm text-slate-800">مستودع البيع</div>
          <p className="mt-1 text-[11px] font-semibold leading-5 text-slate-400">كل قطع المخزون في هذه العملية ستُخصم من مستودع واحد. الكمية المعروضة هي المتاح للبيع بعد طرح الكمية المحجوزة لأوامر الصيانة.</p>
          <select className={`${inputClassName} mt-3`} value={warehouseId} onChange={(event) => changeWarehouse(event.target.value)}>
            <option value="">اختر مستودع البيع</option>
            {warehouses.map((warehouse) => <option key={warehouse.id} value={warehouse.id}>{warehouse.name}{warehouse.code ? ` — ${warehouse.code}` : ""}{warehouse.isDefault ? " (افتراضي)" : ""}</option>)}
          </select>
          {selectedWarehouse ? <div className="mt-2 text-[10px] font-black text-cyan-700">المستودع الحالي: {selectedWarehouse.name} • {warehouseInventoryItems.filter((item) => item.quantity > 0).length} صنف لديه رصيد متاح للبيع</div> : <div className="mt-2 text-[10px] font-black text-amber-700">لا يوجد مستودع محدد. لا يمكن بيع قطع مخزون قبل اختيار مستودع.</div>}
        </div>
      </div>
    </section>

    <div className="grid gap-6 lg:grid-cols-[1fr_360px] items-start">
      <div className="space-y-6">
        <section className="erp-section">
          <div className="border-b border-slate-100/60 pb-4 mb-5">
            <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <h3 className="font-bold text-slate-800 text-sm">سلة بنود البيع</h3>
                <p className="mt-0.5 text-xs text-slate-400 font-medium">ابحث داخل المستودع المختار ثم اضغط Enter لإضافة المنتج.</p>
              </div>
              <div className="mt-2 text-[10px] font-black text-slate-500 sm:mt-0">{lines.length} {lines.length === 1 ? "بند" : "بنود"}</div>
            </div>
          </div>

          <div className="rounded-2xl border border-primary/15 bg-primary/[0.025] p-4 sm:p-5">
            <div className="mb-2 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <PackagePlus className="h-4 w-4 text-primary" />
                <span className="text-xs font-black text-slate-700">إضافة سريعة من المخزون</span>
              </div>
              <span className="hidden text-[9px] font-bold text-slate-400 sm:inline">Enter للإضافة • ↑ ↓ للتنقل</span>
            </div>

            <InventorySearchCombobox
              value=""
              selectedLabel=""
              warehouseId={warehouseId}
              initialOptions={warehouseInventoryItems}
              onSelect={addInventoryItem}
              placeholder="اكتب اسم المنتج أو SKU ثم اضغط Enter..."
              showManualOption={false}
              autoFocus
              refocusAfterSelect
            />

            <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <label className="flex cursor-pointer items-center gap-2 text-[10px] font-bold text-slate-500">
                <input type="checkbox" checked={forceSeparateLine} onChange={(event) => setForceSeparateLine(event.target.checked)} className="h-3.5 w-3.5 rounded border-slate-300 text-primary focus:ring-primary/30" />
                عند اختيار نفس المنتج مرة أخرى أضفه كسطر منفصل
              </label>
              <Button type="button" variant="outline" size="sm" className="h-8 rounded-lg text-[10px] font-black" onClick={addManualLine}>
                <Plus className="ml-1 h-3.5 w-3.5" />بند يدوي / خدمة
              </Button>
            </div>
          </div>

          {lines.length === 0 ? (
            <div className="mt-5 rounded-2xl border border-dashed border-slate-200 bg-slate-50/40 px-4 py-10 text-center">
              <PackagePlus className="mx-auto mb-2 h-7 w-7 text-slate-300" />
              <div className="text-xs font-black text-slate-500">السلة فارغة</div>
              <div className="mt-1 text-[10px] font-semibold text-slate-400">ابدأ بالبحث أعلاه أو أضف بنداً يدوياً.</div>
            </div>
          ) : (
            <div className="mt-5 space-y-2.5">
              {lines.map((line, index) => {
                const inventoryItem = line.inventoryItemId ? inventoryById.get(line.inventoryItemId) : undefined;
                const isInventoryItem = Boolean(inventoryItem);
                const quantity = Math.max(0, Number(line.quantity || 0));
                const unitPrice = Math.max(0, Number(line.unitPrice || 0));
                const lineDiscount = Math.max(0, Number(line.discountTotal || 0));
                const lineTotal = Math.max(0, (quantity * unitPrice) - lineDiscount);
                const exceedsStock = Boolean(inventoryItem && quantity > inventoryItem.quantity);

                return <div key={line.id} className={`overflow-hidden rounded-2xl border bg-white transition ${exceedsStock ? "border-amber-300/80" : "border-slate-200/70"}`}>
                  <div className="grid gap-3 p-3.5 sm:grid-cols-[minmax(0,1.5fr)_90px_120px_120px_auto] sm:items-end">
                    <div className="min-w-0"><div className="flex items-center gap-2"><span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-[10px] font-black text-slate-500">{index + 1}</span><div className="min-w-0"><div className="truncate text-xs font-black text-slate-800">{line.description || "بند يدوي جديد"}</div><div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[9px] font-bold">{isInventoryItem ? <span className="text-teal-600">من {inventoryItem?.warehouseName}</span> : <span className="text-slate-400">بند يدوي / خدمة</span>}{inventoryItem ? <span className={exceedsStock ? "text-amber-700" : "text-slate-400"}>• المتاح للبيع: {inventoryItem.quantity}{inventoryItem.reservedQuantity > 0 ? ` • محجوز: ${inventoryItem.reservedQuantity}` : ""}</span> : null}</div></div></div></div>
                    <Field label="الكمية"><input className={`${inputClassName} h-9 font-numeric text-center`} min="1" step="1" type="number" value={line.quantity} onChange={(event) => updateLine(line.id, { quantity: Number(event.target.value) })} /></Field>
                    <Field label={`سعر الوحدة (${currency})`}><input className={`${inputClassName} h-9 font-numeric`} min="0" step="0.01" type="number" value={line.unitPrice} onChange={(event) => updateLine(line.id, { unitPrice: event.target.value })} /></Field>
                    <div className="sm:pb-0.5"><div className="mb-1.5 text-[10px] font-bold text-slate-500">إجمالي البند</div><div className="h-9 rounded-md bg-slate-50 px-3 py-2 text-left text-xs font-black font-numeric text-slate-800" dir="ltr">{formatCurrency(lineTotal, currency)}</div></div>
                    <div className="flex items-center justify-end gap-1 sm:pb-0.5"><Button type="button" variant="ghost" size="icon" className="h-9 w-9 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700" onClick={() => updateLine(line.id, { detailsOpen: !line.detailsOpen })} aria-label={line.detailsOpen ? "إخفاء تفاصيل البند" : "إظهار تفاصيل البند"}>{line.detailsOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}</Button><Button type="button" variant="ghost" size="icon" className="h-9 w-9 rounded-lg text-rose-600 hover:bg-rose-50 hover:text-rose-700" onClick={() => removeLine(line.id)} aria-label="حذف البند"><Trash2 className="h-4 w-4" /></Button></div>
                  </div>
                  {exceedsStock ? <div className="border-t border-amber-200/70 bg-amber-50/70 px-4 py-2 text-[10px] font-black text-amber-800">⚠️ الكمية المطلوبة ({quantity}) أكبر من الرصيد غير المحجوز المتاح للبيع في {inventoryItem?.warehouseName} ({inventoryItem?.quantity ?? 0}).</div> : null}
                  {line.detailsOpen ? <div className="grid gap-4 border-t border-slate-100 bg-slate-50/40 p-4 md:grid-cols-2 xl:grid-cols-[1.2fr_1.5fr_160px]"><Field label="قطعة المخزون"><InventorySearchCombobox value={line.inventoryItemId} selectedLabel={line.description} warehouseId={warehouseId} initialOptions={warehouseInventoryItems} onSelect={(item) => handleInventorySelect(line, item)} /></Field><Field label="الوصف / التفاصيل"><input className={inputClassName} value={line.description} onChange={(event) => updateLine(line.id, { description: event.target.value })} placeholder="وصف مخصص للبند..." /></Field><Field label="الخصم الكلي للبند"><input className={`${inputClassName} font-numeric`} min="0" step="0.01" type="number" value={line.discountTotal} onChange={(event) => updateLine(line.id, { discountTotal: event.target.value })} /></Field></div> : null}
                </div>;
              })}
            </div>
          )}
        </section>
      </div>

      <div className="space-y-6">
        <section className="erp-section">
          <div className="border-b border-slate-100/60 pb-3 mb-4"><h3 className="font-bold text-slate-800 text-sm">بيانات العميل</h3><p className="mt-1 text-[11px] font-medium text-slate-400">اربط المبيعة بعميل موجود أو سجل عميلاً جديداً للمرة الأولى.</p></div>
          <div className="grid grid-cols-3 gap-2 mb-4"><button type="button" onClick={() => changeCustomerMode("EXISTING")} className={`rounded-xl border p-2.5 text-[10px] font-black transition ${customerMode === "EXISTING" ? "border-primary bg-primary/5 text-primary" : "border-slate-200 text-slate-500 hover:bg-slate-50"}`}><Users className="mx-auto mb-1 h-4 w-4" />عميل موجود</button><button type="button" onClick={() => changeCustomerMode("NEW")} className={`rounded-xl border p-2.5 text-[10px] font-black transition ${customerMode === "NEW" ? "border-primary bg-primary/5 text-primary" : "border-slate-200 text-slate-500 hover:bg-slate-50"}`}><UserPlus className="mx-auto mb-1 h-4 w-4" />عميل جديد</button><button type="button" onClick={() => changeCustomerMode("CASH")} className={`rounded-xl border p-2.5 text-[10px] font-black transition ${customerMode === "CASH" ? "border-primary bg-primary/5 text-primary" : "border-slate-200 text-slate-500 hover:bg-slate-50"}`}><Banknote className="mx-auto mb-1 h-4 w-4" />عميل نقدي</button></div>
          {customerMode === "EXISTING" ? <div className="grid gap-3"><Field label="اختر العميل"><CustomerSearchCombobox value={selectedCustomer?.id ?? ""} selectedCustomer={selectedCustomer} onSelect={setSelectedCustomer} /></Field>{selectedCustomer ? <div className="rounded-xl border border-emerald-200/60 bg-emerald-50/50 px-3 py-2.5 text-xs"><div className="font-black text-emerald-800">{selectedCustomer.name}</div>{selectedCustomer.phone ? <div className="mt-0.5 font-numeric text-[10px] font-bold text-emerald-600" dir="ltr">{selectedCustomer.phone}</div> : null}</div> : null}</div> : customerMode === "NEW" ? <div className="grid gap-4"><Field label="اسم العميل الجديد"><input className={inputClassName} name="customerName" placeholder="مثال: محمود أحمد" required /></Field><Field label="رقم الهاتف"><input className={`${inputClassName} font-numeric`} name="customerPhone" inputMode="tel" placeholder="05xxxxxxxx" /></Field><p className="text-[10px] leading-5 font-semibold text-slate-400">سيتم حفظ العميل تلقائياً في إدارة العملاء. إذا كان رقم الهاتف مسجلاً مسبقاً، سيطلب منك النظام اختيار العميل الموجود بدلاً من إنشاء نسخة مكررة.</p></div> : <div className="rounded-xl border border-slate-200/70 bg-slate-50/60 px-3 py-3 text-[11px] font-semibold text-slate-500">لن يتم إنشاء سجل عميل لهذه المبيعة.</div>}
        </section>

        <section className="erp-section">
          <div className="border-b border-slate-100/60 pb-3 mb-4"><h3 className="font-bold text-slate-800 text-sm">الحسابات والملخص المالي</h3></div>
          <div className="space-y-3.5"><div className="flex justify-between text-xs text-slate-500 font-medium"><span>الإجمالي الفرعي:</span><span className="font-numeric font-bold">{formatCurrency(subtotal, currency)}</span></div><div className="flex justify-between text-xs text-slate-500 font-medium"><span>إجمالي الخصومات:</span><span className="font-numeric text-rose-600 font-bold">{discountTotal > 0 ? formatCurrency(-discountTotal, currency) : formatCurrency(0, currency)}</span></div><div className="flex justify-between text-sm font-bold text-slate-850 pt-3.5 border-t border-slate-200"><span>الإجمالي النهائي:</span><span className="font-numeric text-xl text-primary font-black">{formatCurrency(total, currency)}</span></div></div>
          <SalePaymentFields total={Math.max(0, total)} wallets={wallets} bankAccounts={bankAccounts} currency={currency} debtEligible={customerMode === "NEW" || (customerMode === "EXISTING" && Boolean(selectedCustomer))} />
          <div className="mt-6 pt-1"><Button type="submit" disabled={isPending || lines.length === 0 || !warehouseId} className="w-full font-bold shadow-md h-12 rounded-xl text-xs justify-center"><Save className="h-4.5 w-4.5 ml-1.5" />{isPending ? "جاري تسجيل عملية البيع..." : "إتمام وإصدار عملية البيع"}</Button></div>
        </section>
      </div>
    </div>
  </form>;
}
