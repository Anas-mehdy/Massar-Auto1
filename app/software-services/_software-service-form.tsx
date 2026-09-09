"use client";

import { Banknote, Code2, Save, Smartphone, UserPlus, Users } from "lucide-react";
import { useMemo, useState } from "react";
import { SubmitButton } from "@/components/submit-button";
import { formatCurrency } from "@/lib/format";
import { CustomerSearchCombobox, type SaleCustomerOption } from "@/app/sales/customer-search-combobox";
import { SalePaymentFields, type SaleBankAccountOption, type SaleWalletOption } from "@/app/sales/sale-payment-fields";
import { createSoftwareServiceSaleAction } from "./actions";

type CatalogOption = {
  id: string;
  name: string;
  defaultPrice: string | null;
  defaultCost: string | null;
};

type CustomerMode = "EXISTING" | "NEW" | "CASH";

const inputClass = "h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-bold text-slate-800 outline-none transition focus:border-teal-400 focus:ring-2 focus:ring-teal-100";
const labelClass = "mb-1.5 block text-xs font-black text-slate-700";

export function SoftwareServiceForm({
  catalog,
  wallets,
  bankAccounts,
  currency,
  returnTo,
}: {
  catalog: CatalogOption[];
  wallets: SaleWalletOption[];
  bankAccounts: SaleBankAccountOption[];
  currency: string;
  returnTo?: string;
}) {
  const [catalogId, setCatalogId] = useState("");
  const [serviceName, setServiceName] = useState("");
  const [salePrice, setSalePrice] = useState("");
  const [serviceCost, setServiceCost] = useState("");
  const [customerMode, setCustomerMode] = useState<CustomerMode>("CASH");
  const [selectedCustomer, setSelectedCustomer] = useState<SaleCustomerOption | null>(null);
  const [deviceKept, setDeviceKept] = useState(false);

  const selectedCatalog = useMemo(() => catalog.find((item) => item.id === catalogId), [catalog, catalogId]);
  const price = Math.max(0, Number(salePrice) || 0);
  const cost = Math.max(0, Number(serviceCost) || 0);
  const profit = price - cost;
  const debtEligible = customerMode === "NEW" || (customerMode === "EXISTING" && Boolean(selectedCustomer));

  function chooseCatalog(value: string) {
    setCatalogId(value);
    const item = catalog.find((entry) => entry.id === value);
    if (!item) return;
    setServiceName(item.name);
    if (item.defaultPrice != null) setSalePrice(item.defaultPrice);
    if (item.defaultCost != null) setServiceCost(item.defaultCost);
  }

  function changeCustomerMode(mode: CustomerMode) {
    setCustomerMode(mode);
    if (mode !== "EXISTING") setSelectedCustomer(null);
  }

  return (
    <form action={createSoftwareServiceSaleAction} className="space-y-6">
      <input type="hidden" name="customerMode" value={customerMode} />
      <input type="hidden" name="customerId" value={selectedCustomer?.id ?? ""} />
      {returnTo ? <input type="hidden" name="returnTo" value={returnTo} /> : null}

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-6">
          <section className="erp-section space-y-5">
            <div className="flex items-center gap-3 border-b border-slate-100 pb-4">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-50 text-indigo-700"><Code2 className="h-5 w-5" /></span>
              <div><h2 className="text-sm font-black text-slate-900">تفاصيل خدمة السوفتوير</h2><p className="mt-1 text-xs font-medium text-slate-500">خدمة غير مخزنية، لكن تكلفتها تعامل كتكلـفة مباشرة مثل تكلفة القطعة في المبيعات.</p></div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div><label className={labelClass}>خدمة محفوظة</label><select className={inputClass} name="catalogId" value={catalogId} onChange={(e) => chooseCatalog(e.target.value)}><option value="">خدمة مخصصة / اكتب الاسم</option>{catalog.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></div>
              <div><label className={labelClass}>اسم الخدمة *</label><input className={inputClass} name="serviceName" value={serviceName} onChange={(e) => setServiceName(e.target.value)} required placeholder="مثال: تفليش جهاز / FRP / تحديث نظام" /></div>
              <div><label className={labelClass}>سعر البيع للعميل *</label><input className={`${inputClass} font-numeric`} name="salePrice" value={salePrice} onChange={(e) => setSalePrice(e.target.value)} min="0.01" step="0.01" type="number" required placeholder="0.00" /></div>
              <div><label className={labelClass}>تكلفة الخدمة على المحل</label><input className={`${inputClass} font-numeric`} name="serviceCost" value={serviceCost} onChange={(e) => setServiceCost(e.target.value)} min="0" step="0.01" type="number" placeholder="0.00" /><p className="mt-1 text-[10px] font-bold text-slate-400">تُخصم من ربح الخدمة في التقارير مثل تكلفة قطعة المخزون.</p></div>
            </div>
            {selectedCatalog ? <p className="rounded-xl bg-slate-50 px-3 py-2 text-[11px] font-bold text-slate-500">تم تحميل السعر والتكلفة الافتراضيين من الكتالوج، ويمكن تعديلهما لهذه العملية فقط.</p> : null}
          </section>

          <section className="erp-section space-y-4">
            <div className="flex items-center gap-3 border-b border-slate-100 pb-4"><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-50 text-amber-700"><Smartphone className="h-5 w-5" /></span><div><h2 className="text-sm font-black text-slate-900">الجهاز والتفاصيل الإضافية</h2><p className="mt-1 text-xs font-medium text-slate-500">اختياري، لتتبع الجهاز أو طباعته كعهدة داخل المحل.</p></div></div>
            <div className="grid gap-4 sm:grid-cols-3"><div><label className={labelClass}>شركة الجهاز</label><input className={inputClass} name="deviceBrand" placeholder="Samsung / Xiaomi..." /></div><div><label className={labelClass}>موديل الجهاز</label><input className={inputClass} name="deviceModel" placeholder="اختياري" /></div><div><label className={labelClass}>IMEI / Serial</label><input className={`${inputClass} font-numeric`} name="deviceSerial" placeholder="اختياري" /></div></div>
            <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-slate-200 bg-slate-50/60 p-4"><input className="mt-1 h-4 w-4 accent-teal-600" type="checkbox" name="deviceKept" checked={deviceKept} onChange={(e) => setDeviceKept(e.target.checked)} /><span><span className="block text-xs font-black text-slate-800">الجهاز سيبقى في المحل</span><span className="mt-1 block text-[11px] font-medium text-slate-500">يفعّل ملصق الجهاز وتتبع «بانتظار التسليم» فقط.</span></span></label>
            <div><label className={labelClass}>ملاحظات</label><textarea className="min-h-24 w-full rounded-xl border border-slate-200 bg-white p-3 text-sm font-medium outline-none focus:border-teal-400 focus:ring-2 focus:ring-teal-100" name="notes" placeholder="أي تفاصيل إضافية عن الخدمة أو الجهاز" /></div>
          </section>
        </div>

        <div className="space-y-6">
          <section className="erp-section">
            <div className="mb-4 border-b border-slate-100 pb-3"><h3 className="text-sm font-black text-slate-800">بيانات العميل</h3><p className="mt-1 text-[11px] font-medium text-slate-400">الدين يحتاج عميلاً مسجلاً حتى تظهر الحركة في كشف حسابه.</p></div>
            <div className="mb-4 grid grid-cols-3 gap-2">
              <button type="button" onClick={() => changeCustomerMode("EXISTING")} className={`rounded-xl border p-2.5 text-[10px] font-black transition ${customerMode === "EXISTING" ? "border-primary bg-primary/5 text-primary" : "border-slate-200 text-slate-500 hover:bg-slate-50"}`}><Users className="mx-auto mb-1 h-4 w-4" />عميل موجود</button>
              <button type="button" onClick={() => changeCustomerMode("NEW")} className={`rounded-xl border p-2.5 text-[10px] font-black transition ${customerMode === "NEW" ? "border-primary bg-primary/5 text-primary" : "border-slate-200 text-slate-500 hover:bg-slate-50"}`}><UserPlus className="mx-auto mb-1 h-4 w-4" />عميل جديد</button>
              <button type="button" onClick={() => changeCustomerMode("CASH")} className={`rounded-xl border p-2.5 text-[10px] font-black transition ${customerMode === "CASH" ? "border-primary bg-primary/5 text-primary" : "border-slate-200 text-slate-500 hover:bg-slate-50"}`}><Banknote className="mx-auto mb-1 h-4 w-4" />عميل نقدي</button>
            </div>
            {customerMode === "EXISTING" ? <div className="grid gap-3"><label className={labelClass}>اختر العميل</label><CustomerSearchCombobox value={selectedCustomer?.id ?? ""} selectedCustomer={selectedCustomer} onSelect={setSelectedCustomer} />{selectedCustomer ? <div className="rounded-xl border border-emerald-200/60 bg-emerald-50/50 px-3 py-2.5 text-xs"><div className="font-black text-emerald-800">{selectedCustomer.name}</div>{selectedCustomer.phone ? <div className="mt-0.5 font-numeric text-[10px] font-bold text-emerald-600" dir="ltr">{selectedCustomer.phone}</div> : null}</div> : null}</div> : customerMode === "NEW" ? <div className="grid gap-4"><div><label className={labelClass}>اسم العميل الجديد</label><input className={inputClass} name="newCustomerName" required placeholder="اسم العميل" /></div><div><label className={labelClass}>رقم الهاتف</label><input className={`${inputClass} font-numeric`} name="newCustomerPhone" placeholder="اختياري" /></div></div> : <div className="rounded-xl border border-slate-200/70 bg-slate-50/60 px-3 py-3 text-[11px] font-semibold text-slate-500">لن يتم إنشاء سجل عميل لهذه الخدمة.</div>}
          </section>

          <section className="erp-section">
            <div className="mb-4 border-b border-slate-100 pb-3"><h3 className="text-sm font-black text-slate-800">الحسابات والملخص المالي</h3></div>
            <div className="space-y-3.5"><div className="flex justify-between text-xs font-medium text-slate-500"><span>سعر الخدمة:</span><span className="font-numeric font-bold">{formatCurrency(price, currency)}</span></div><div className="flex justify-between text-xs font-medium text-slate-500"><span>تكلفة الخدمة:</span><span className="font-numeric font-bold text-rose-600">{formatCurrency(cost, currency)}</span></div><div className="flex justify-between border-t border-slate-200 pt-3.5 text-sm font-bold text-slate-850"><span>الربح المتوقع:</span><span className={`font-numeric text-xl font-black ${profit >= 0 ? "text-emerald-700" : "text-rose-700"}`}>{formatCurrency(profit, currency)}</span></div></div>
            <SalePaymentFields total={price} wallets={wallets} bankAccounts={bankAccounts} currency={currency} debtEligible={debtEligible} />
            <div className="mt-6"><SubmitButton className="h-12 w-full rounded-xl font-black" loadingText="جاري تسجيل الخدمة والتسوية المالية..."><Save className="ml-1.5 h-4.5 w-4.5" />إتمام وإصدار عملية البيع</SubmitButton></div>
          </section>
        </div>
      </div>
    </form>
  );
}
