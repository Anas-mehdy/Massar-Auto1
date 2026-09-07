"use client";

import { useMemo, useState } from "react";
import {
  ArrowDownLeft,
  ArrowLeftRight,
  ArrowUpRight,
  Banknote,
  Check,
  Landmark,
  Search,
  Sparkles,
  WalletCards,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { createTransferAction } from "./actions";

type WalletOption = { id: string; name: string; balance: number; depositCommission: number; withdrawalCommission: number };
type CustomerOption = { id: string; name: string; phone: string | null };
type OperationType = "CUSTOMER_DEPOSIT" | "CUSTOMER_WITHDRAWAL" | "WALLET_TOPUP" | "WALLET_WITHDRAWAL";
type CommissionMode = "DEDUCTED" | "ADDED" | "NONE";
type SettlementType = "CASH_DRAWER" | "WALLET";

const operationOptions = [
  { value: "CUSTOMER_DEPOSIT" as const, label: "إيداع للعميل", helper: "تحويل رصيد للعميل", icon: ArrowDownLeft, active: "border-cyan-300 bg-cyan-50 text-cyan-800", iconClass: "bg-cyan-100 text-cyan-700" },
  { value: "CUSTOMER_WITHDRAWAL" as const, label: "سحب للعميل", helper: "استلام رصيد من العميل", icon: ArrowUpRight, active: "border-indigo-300 bg-indigo-50 text-indigo-800", iconClass: "bg-indigo-100 text-indigo-700" },
  { value: "WALLET_TOPUP" as const, label: "شحن المحفظة", helper: "إضافة رصيد داخلي", icon: Banknote, active: "border-teal-300 bg-teal-50 text-teal-800", iconClass: "bg-teal-100 text-teal-700" },
  { value: "WALLET_WITHDRAWAL" as const, label: "سحب من المحفظة", helper: "حركة داخلية من الرصيد", icon: Landmark, active: "border-slate-300 bg-slate-50 text-slate-800", iconClass: "bg-slate-100 text-slate-600" },
];

export function TransferForm({ wallets, customers, currency, returnTo }: { wallets: WalletOption[]; customers: CustomerOption[]; currency: string; returnTo?: string }) {
  const [operationType, setOperationType] = useState<OperationType>("CUSTOMER_DEPOSIT");
  const [walletId, setWalletId] = useState(wallets[0]?.id ?? "");
  const [amount, setAmount] = useState("");
  const [commission, setCommission] = useState("");
  const [commissionMode, setCommissionMode] = useState<CommissionMode>("ADDED");
  const [isDeferred, setIsDeferred] = useState(false);
  const [settlementType, setSettlementType] = useState<SettlementType>("CASH_DRAWER");
  const [settlementWalletId, setSettlementWalletId] = useState(wallets[0]?.id ?? "");
  const [customerId, setCustomerId] = useState("");
  const [customerSearch, setCustomerSearch] = useState("");
  const [customerSearchOpen, setCustomerSearchOpen] = useState(false);

  const wallet = wallets.find((item) => item.id === walletId);
  const settlementWallet = wallets.find((item) => item.id === settlementWalletId);
  const isCustomerOperation = operationType === "CUSTOMER_DEPOSIT" || operationType === "CUSTOMER_WITHDRAWAL";
  const isCustomerDeposit = operationType === "CUSTOMER_DEPOSIT";
  const amountValue = Math.max(0, Number(amount) || 0);
  const defaultRate = operationType === "CUSTOMER_DEPOSIT" ? wallet?.depositCommission ?? 0 : wallet?.withdrawalCommission ?? 0;
  const commissionValue = commissionMode === "NONE" || !isCustomerOperation
    ? 0
    : commission.trim() !== ""
      ? Math.max(0, Number(commission) || 0)
      : amountValue * defaultRate / 100;

  const filteredCustomers = useMemo(() => {
    const term = customerSearch.trim().toLocaleLowerCase("ar");
    if (!term) return [];
    return customers
      .filter((customer) => customer.name.toLocaleLowerCase("ar").includes(term) || (customer.phone ?? "").includes(term))
      .slice(0, 10);
  }, [customerSearch, customers]);

  const summary = useMemo(() => {
    let walletEffect = amountValue;
    let customerNet = amountValue;
    let customerCharge = amountValue;
    if (operationType === "CUSTOMER_DEPOSIT") {
      if (commissionMode === "DEDUCTED") {
        walletEffect = Math.max(0, amountValue - commissionValue);
        customerNet = walletEffect;
      } else if (commissionMode === "ADDED") {
        customerCharge = amountValue + commissionValue;
      }
    } else if (operationType === "CUSTOMER_WITHDRAWAL") {
      if (commissionMode === "DEDUCTED") {
        customerNet = Math.max(0, amountValue - commissionValue);
      } else if (commissionMode === "ADDED") {
        walletEffect = amountValue + commissionValue;
        customerCharge = amountValue + commissionValue;
      }
    }
    const settlementAmount = operationType === "CUSTOMER_DEPOSIT" ? customerCharge : customerNet;
    return { walletEffect, customerNet, customerCharge, settlementAmount };
  }, [amountValue, commissionValue, commissionMode, operationType]);

  function selectOperation(value: OperationType) {
    setOperationType(value);
    if (value !== "CUSTOMER_DEPOSIT") setIsDeferred(false);
    if (value === "WALLET_TOPUP" || value === "WALLET_WITHDRAWAL") setCommissionMode("NONE");
    else if (commissionMode === "NONE") setCommissionMode("ADDED");
  }
  function money(value: number) {
    try { return new Intl.NumberFormat("ar", { style: "currency", currency, maximumFractionDigits: 2 }).format(value); }
    catch { return value.toFixed(2); }
  }
  function selectCustomer(customer: CustomerOption) {
    setCustomerId(customer.id);
    setCustomerSearch(`${customer.name}${customer.phone ? ` — ${customer.phone}` : ""}`);
    setCustomerSearchOpen(false);
  }
  function clearCustomer() {
    setCustomerId("");
    setCustomerSearch("");
    setCustomerSearchOpen(false);
  }

  const settlementReady = !isCustomerOperation || isDeferred || settlementType === "CASH_DRAWER" || Boolean(settlementWalletId);
  const canSubmit = settlementReady && (!isDeferred || Boolean(customerId));
  const settlementTitle = isCustomerDeposit ? "كيف استلمنا المقابل من العميل؟" : "كيف سلّمنا المقابل للعميل؟";
  const settlementDirection = isCustomerDeposit ? "دخول" : "خروج";

  return <form action={createTransferAction} className="space-y-5">
    {returnTo ? <input type="hidden" name="returnTo" value={returnTo} /> : null}

    <div>
      <Label>نوع العملية</Label>
      <input type="hidden" name="operationType" value={operationType} />
      <div className="grid grid-cols-2 gap-2">
        {operationOptions.map((option) => {
          const Icon = option.icon;
          const selected = operationType === option.value;
          return <button key={option.value} type="button" onClick={() => selectOperation(option.value)} className={`relative rounded-xl border p-3 text-right transition ${selected ? option.active : "border-slate-200 bg-white text-slate-600 hover:border-teal-200 hover:bg-teal-50/30"}`}>
            <div className="flex items-start gap-2.5">
              <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${selected ? option.iconClass : "bg-slate-100 text-slate-500"}`}><Icon className="h-4 w-4" /></span>
              <div><div className="text-[10px] font-black">{option.label}</div><div className="mt-0.5 text-[9px] font-semibold opacity-65">{option.helper}</div></div>
            </div>
            {selected ? <span className="absolute left-2 top-2 flex h-4 w-4 items-center justify-center rounded-full bg-white text-teal-700 shadow-sm"><Check className="h-2.5 w-2.5" /></span> : null}
          </button>;
        })}
      </div>
    </div>

    <div className="grid gap-3 sm:grid-cols-2">
      <div><Label>المحفظة *</Label><select name="walletId" required className={inputClass} value={walletId} onChange={(event) => setWalletId(event.target.value)}><option value="">اختر المحفظة</option>{wallets.map((item) => <option key={item.id} value={item.id}>{item.name} — {money(item.balance)}</option>)}</select></div>
      <div><Label>المبلغ *</Label><input name="amount" type="number" min="0.01" step="0.01" required className={`${inputClass} font-numeric`} placeholder="0.00" value={amount} onChange={(event) => setAmount(event.target.value)} /></div>
    </div>

    {isCustomerOperation ? <div className="rounded-2xl border border-slate-200 bg-slate-50/60 p-3.5">
      <div className="grid gap-3 sm:grid-cols-2">
        <div><Label>العمولة</Label><input name="commission" type="number" min="0" step="0.01" className={`${inputClass} font-numeric`} placeholder={`تلقائي ${defaultRate}%`} value={commission} onChange={(event) => setCommission(event.target.value)} disabled={commissionMode === "NONE"} /></div>
        <div><Label>طريقة احتساب العمولة</Label><div className="grid h-11 grid-cols-3 gap-1 rounded-xl border border-slate-200 bg-white p-1">{([["ADDED","مضافة"],["DEDUCTED","مخصومة"],["NONE","بدون"]] as Array<[CommissionMode,string]>).map(([value,label]) => <label key={value} className={`flex cursor-pointer items-center justify-center rounded-lg text-[9px] font-black transition ${commissionMode === value ? "bg-teal-600 text-white shadow-sm" : "text-slate-500 hover:bg-slate-50"}`}><input type="radio" name="commissionMode" value={value} checked={commissionMode === value} onChange={() => setCommissionMode(value)} className="sr-only" />{label}</label>)}</div></div>
      </div>
      <p className="mt-2 text-[9px] font-bold leading-4 text-slate-400">المضافة تُحصّل فوق المبلغ، والمخصومة تقلل صافي ما يستلمه العميل.</p>
    </div> : <input type="hidden" name="commissionMode" value="NONE" />}

    {isCustomerOperation && !isDeferred ? <div className="rounded-2xl border border-indigo-100 bg-gradient-to-br from-indigo-50/70 via-white to-cyan-50/50 p-3.5 dark:border-slate-700 dark:from-slate-950 dark:via-slate-950 dark:to-indigo-950/40">
      <div className="mb-3 flex items-start gap-2.5">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-indigo-100 text-indigo-700 dark:bg-indigo-950/70 dark:text-indigo-300"><ArrowLeftRight className="h-4 w-4" /></span>
        <div><div className="text-[11px] font-black text-slate-800 dark:text-slate-100">{settlementTitle}</div><div className="mt-0.5 text-[9px] font-bold leading-4 text-slate-400 dark:text-slate-400">سيُسجّل الطرف المقابل من العملية آلياً حتى تتطابق أرصدة الدرج والمحافظ.</div></div>
      </div>
      <input type="hidden" name="settlementType" value={settlementType} />
      <div className="grid grid-cols-2 gap-2">
        <button type="button" onClick={() => setSettlementType("CASH_DRAWER")} className={`rounded-xl border p-3 text-right transition ${settlementType === "CASH_DRAWER" ? "border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-700/80 dark:bg-emerald-950/50 dark:text-emerald-200" : "border-slate-200 bg-white text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"}`}>
          <div className="flex items-center gap-2"><Banknote className="h-4 w-4" /><span className="text-[10px] font-black">نقدي — الدرج</span></div>
          <p className="mt-1 text-[9px] font-semibold opacity-65">{isCustomerDeposit ? "إضافة المبلغ المستلم إلى الدرج" : "خصم المبلغ المسلّم من الدرج"}</p>
        </button>
        <button type="button" onClick={() => setSettlementType("WALLET")} className={`rounded-xl border p-3 text-right transition ${settlementType === "WALLET" ? "border-indigo-300 bg-indigo-50 text-indigo-800 dark:border-indigo-700/80 dark:bg-indigo-950/55 dark:text-indigo-200" : "border-slate-200 bg-white text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"}`}>
          <div className="flex items-center gap-2"><WalletCards className="h-4 w-4" /><span className="text-[10px] font-black">محفظة أخرى</span></div>
          <p className="mt-1 text-[9px] font-semibold opacity-65">مثل InstaPay أو أي محفظة مسجلة</p>
        </button>
      </div>
      {settlementType === "WALLET" ? <div className="mt-3">
        <Label>{isCustomerDeposit ? "المحفظة التي استلمنا عليها" : "المحفظة التي دفعنا منها"} *</Label>
        <select name="settlementWalletId" required className={inputClass} value={settlementWalletId} onChange={(event) => setSettlementWalletId(event.target.value)}>
          <option value="">اختر محفظة التسوية</option>
          {wallets.filter((item) => item.id !== walletId).map((item) => <option key={item.id} value={item.id}>{item.name} — {money(item.balance)}</option>)}
        </select>
      </div> : <input type="hidden" name="settlementWalletId" value="" />}
      <div className="mt-3 rounded-xl border border-indigo-100 bg-white/80 px-3 py-2 text-[9px] font-bold text-indigo-700 dark:border-indigo-900/80 dark:bg-slate-900/90 dark:text-indigo-200">أثر التسوية المتوقع: {settlementDirection} {money(summary.settlementAmount)} {settlementType === "CASH_DRAWER" ? (isCustomerDeposit ? "إلى الدرج" : "من الدرج") : `${isCustomerDeposit ? "إلى" : "من"} ${settlementWallet?.name || "المحفظة المختارة"}`}.</div>
    </div> : null}

    <div>
      <Label>العميل</Label>
      <input type="hidden" name="customerId" value={customerId} />
      <div className="relative">
        <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input value={customerSearch} onChange={(event) => { setCustomerSearch(event.target.value); setCustomerId(""); setCustomerSearchOpen(true); }} onFocus={() => customerSearch.trim() && setCustomerSearchOpen(true)} className={`${inputClass} pr-9 ${customerSearch ? "pl-9" : ""}`} placeholder="ابدأ بكتابة اسم العميل أو رقم الهاتف" autoComplete="off" />
        {customerSearch ? <button type="button" onClick={clearCustomer} className="absolute left-2 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-700" aria-label="مسح العميل"><X className="h-3.5 w-3.5" /></button> : null}
        {customerSearchOpen && customerSearch.trim() ? <div className="absolute z-30 mt-1 max-h-60 w-full overflow-y-auto rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl shadow-slate-200/60">
          {filteredCustomers.length > 0 ? filteredCustomers.map((customer) => <button key={customer.id} type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => selectCustomer(customer)} className="flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2.5 text-right transition hover:bg-teal-50"><span className="min-w-0"><span className="block truncate text-xs font-black text-slate-800">{customer.name}</span>{customer.phone ? <span className="mt-0.5 block font-numeric text-[10px] font-bold text-slate-400">{customer.phone}</span> : null}</span>{customer.id === customerId ? <Check className="h-4 w-4 shrink-0 text-teal-600" /> : null}</button>) : <div className="px-3 py-3 text-center text-[10px] font-bold text-slate-400">لا يوجد عميل مطابق</div>}
        </div> : null}
      </div>
    </div>

    {operationType === "CUSTOMER_DEPOSIT" ? <label className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition ${isDeferred ? "border-amber-200 bg-amber-50/80" : "border-slate-200 bg-white"}`}><input type="checkbox" name="isDeferred" checked={isDeferred} onChange={(event) => setIsDeferred(event.target.checked)} className="mt-0.5 h-4 w-4 rounded border-slate-300" /><span><span className="block text-[10px] font-black text-slate-700">تسجيلها كعملية آجلة</span><span className="mt-0.5 block text-[9px] font-semibold text-slate-400">لن يدخل شيء إلى الدرج أو محفظة أخرى الآن؛ يُسجّل كامل المطلوب على العميل في دفتر الديون.</span></span></label> : null}
    {isDeferred && !customerId ? <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[10px] font-black text-amber-800">اختر عميلاً مسجلاً حتى يمكن تسجيل العملية كدين.</div> : null}

    <details className="rounded-xl border border-slate-200 bg-white"><summary className="cursor-pointer px-3.5 py-3 text-[10px] font-black text-slate-500">بيانات إضافية للعميل والملاحظات</summary><div className="grid gap-3 border-t border-slate-100 p-3.5 sm:grid-cols-2"><div><Label>اسم العميل</Label><input name="customerName" className={inputClass} placeholder="اختياري" /></div><div><Label>رقم الهاتف</Label><input name="customerPhone" className={`${inputClass} font-numeric`} placeholder="اختياري" /></div><div className="sm:col-span-2"><Label>ملاحظات</Label><textarea name="notes" className="min-h-20 w-full rounded-xl border border-slate-200 bg-slate-50/60 p-3 text-xs font-medium outline-none focus:border-teal-300 focus:bg-white focus:ring-4 focus:ring-teal-100/70" placeholder="أي ملاحظة عن العملية" /></div></div></details>

    <div className="overflow-hidden rounded-2xl border border-teal-100 bg-gradient-to-br from-teal-50 via-white to-cyan-50">
      <div className="flex items-center gap-2 border-b border-teal-100/70 px-3.5 py-2.5"><Sparkles className="h-3.5 w-3.5 text-teal-600" /><p className="text-[10px] font-black text-teal-800">ملخص العملية قبل التسجيل</p></div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-2.5 p-3.5 text-[10px] font-bold text-slate-500">
        <span>المبلغ الأساسي</span><span className="font-numeric text-left font-black text-slate-900">{money(amountValue)}</span>
        <span>العمولة</span><span className="font-numeric text-left font-black text-amber-700">{money(commissionValue)}</span>
        {isCustomerOperation ? <>
          <span>{isCustomerDeposit ? "صافي ما يصل للعميل" : "ما يستلمه العميل"}</span><span className="font-numeric text-left font-black text-slate-900">{money(summary.customerNet)}</span>
          <span>{isCustomerDeposit ? "المطلوب من العميل" : "ما يدخل إلى محفظتنا"}</span><span className="font-numeric text-left font-black text-slate-900">{money(summary.customerCharge)}</span>
        </> : null}
        <span>أثر المحفظة الرئيسية</span><span className={`font-numeric text-left font-black ${operationType === "CUSTOMER_DEPOSIT" || operationType === "WALLET_WITHDRAWAL" ? "text-indigo-700" : "text-teal-700"}`}>{operationType === "CUSTOMER_DEPOSIT" || operationType === "WALLET_WITHDRAWAL" ? "− " : "+ "}{money(summary.walletEffect)}</span>
        {isCustomerOperation && !isDeferred ? <><span>التسوية المقابلة</span><span className="font-numeric text-left font-black text-indigo-700">{isCustomerDeposit ? "+ " : "− "}{money(summary.settlementAmount)} — {settlementType === "CASH_DRAWER" ? "الدرج" : settlementWallet?.name || "محفظة"}</span></> : null}
        {isDeferred ? <><span>الدين المسجل</span><span className="font-numeric text-left font-black text-amber-700">{money(summary.customerCharge)}</span></> : null}
      </div>
    </div>

    <Button type="submit" disabled={!canSubmit} className="h-12 w-full rounded-xl bg-gradient-to-l from-teal-600 to-cyan-600 text-xs font-black text-white shadow-lg shadow-teal-600/15 hover:from-teal-700 hover:to-cyan-700"><ArrowLeftRight className="ml-1.5 h-4 w-4" />تسجيل العملية</Button>
  </form>;
}

const inputClass = "h-11 w-full rounded-xl border border-slate-200 bg-white px-3.5 text-xs font-bold text-slate-800 outline-none transition focus:border-teal-300 focus:ring-4 focus:ring-teal-100/70 disabled:bg-slate-100 disabled:text-slate-400";
function Label({ children }: { children: React.ReactNode }) { return <label className="mb-1.5 block text-[10px] font-black text-slate-600">{children}</label>; }
