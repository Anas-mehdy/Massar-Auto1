"use client";

import { Banknote, BookOpenCheck, Landmark, WalletCards } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { formatCurrency } from "@/lib/format";

export type SaleWalletOption = { id: string; name: string; balance: number };
export type SaleBankAccountOption = { id: string; name: string; bankName?: string | null; balance: number };
type Destination = "DRAWER" | "WALLET" | "BANK";
type PaymentDestination = Destination | "DEBT";

export function SalePaymentFields({
  total,
  wallets,
  bankAccounts,
  currency,
  debtEligible = false,
}: {
  total: number;
  wallets: SaleWalletOption[];
  bankAccounts: SaleBankAccountOption[];
  currency: string;
  debtEligible?: boolean;
}) {
  const [paymentDestination, setPaymentDestination] = useState<PaymentDestination>("DRAWER");
  const [walletId, setWalletId] = useState("");
  const [bankAccountId, setBankAccountId] = useState("");
  const [amountReceived, setAmountReceived] = useState("");
  const [changeDestination, setChangeDestination] = useState<Destination>("DRAWER");
  const [changeWalletId, setChangeWalletId] = useState("");
  const [changeBankAccountId, setChangeBankAccountId] = useState("");
  const received = amountReceived.trim() === "" ? total : Math.max(0, Number(amountReceived) || 0);
  const change = useMemo(() => paymentDestination === "DEBT" ? 0 : Math.max(0, received - total), [paymentDestination, received, total]);

  useEffect(() => {
    if (!debtEligible && paymentDestination === "DEBT") setPaymentDestination("DRAWER");
  }, [debtEligible, paymentDestination]);

  return <div className="mt-5 space-y-4 border-t border-slate-100 pt-4">
    <div>
      <div className="mb-2 text-xs font-black text-slate-700">طريقة تسوية المبلغ</div>
      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        <label className={`flex cursor-pointer items-center gap-2 rounded-xl border p-3 text-xs font-black transition ${paymentDestination === "DRAWER" ? "border-teal-300 bg-teal-50 text-teal-800" : "border-slate-200 text-slate-500"}`}>
          <input className="sr-only" type="radio" name="paymentDestination" value="DRAWER" checked={paymentDestination === "DRAWER"} onChange={() => setPaymentDestination("DRAWER")} />
          <Banknote className="h-4 w-4" /> الدرج النقدي
        </label>
        <label className={`flex cursor-pointer items-center gap-2 rounded-xl border p-3 text-xs font-black transition ${paymentDestination === "WALLET" ? "border-indigo-300 bg-indigo-50 text-indigo-800" : "border-slate-200 text-slate-500"}`}>
          <input className="sr-only" type="radio" name="paymentDestination" value="WALLET" checked={paymentDestination === "WALLET"} onChange={() => setPaymentDestination("WALLET")} />
          <WalletCards className="h-4 w-4" /> محفظة إلكترونية
        </label>
        <label className={`flex cursor-pointer items-center gap-2 rounded-xl border p-3 text-xs font-black transition ${paymentDestination === "BANK" ? "border-cyan-300 bg-cyan-50 text-cyan-900" : "border-slate-200 text-slate-500"}`}>
          <input className="sr-only" type="radio" name="paymentDestination" value="BANK" checked={paymentDestination === "BANK"} onChange={() => setPaymentDestination("BANK")} />
          <Landmark className="h-4 w-4" /> حساب بنكي
        </label>
        <label className={`flex items-center gap-2 rounded-xl border p-3 text-xs font-black transition ${!debtEligible ? "cursor-not-allowed border-slate-100 bg-slate-50 text-slate-300" : paymentDestination === "DEBT" ? "cursor-pointer border-amber-300 bg-amber-50 text-amber-900" : "cursor-pointer border-slate-200 text-slate-500"}`}>
          <input className="sr-only" type="radio" name="paymentDestination" value="DEBT" disabled={!debtEligible} checked={paymentDestination === "DEBT"} onChange={() => setPaymentDestination("DEBT")} />
          <BookOpenCheck className="h-4 w-4" /> دفتر الديون
        </label>
      </div>
      {!debtEligible ? <p className="mt-2 text-[10px] font-semibold leading-5 text-slate-400">لترحيل المبلغ إلى دفتر الديون، اختر عميلاً مسجلاً أو أضف عميلاً جديداً أولاً.</p> : null}
      {paymentDestination === "WALLET" ? <select name="walletId" required value={walletId} onChange={(e) => setWalletId(e.target.value)} className="erp-input mt-2"><option value="">اختر المحفظة</option>{wallets.map((wallet) => <option key={wallet.id} value={wallet.id}>{wallet.name} — {formatCurrency(wallet.balance, currency)}</option>)}</select> : <input type="hidden" name="walletId" value="" />}
      {paymentDestination === "BANK" ? <><select name="bankAccountId" required value={bankAccountId} onChange={(e) => setBankAccountId(e.target.value)} className="erp-input mt-2"><option value="">اختر الحساب البنكي</option>{bankAccounts.map((account) => <option key={account.id} value={account.id}>{account.name}{account.bankName ? ` — ${account.bankName}` : ""} — {formatCurrency(account.balance, currency)}</option>)}</select>{bankAccounts.length === 0 ? <p className="mt-2 text-[10px] font-bold text-amber-700">لا توجد حسابات بنكية نشطة. أضف حساباً من قسم الحسابات البنكية أولاً.</p> : null}</> : <input type="hidden" name="bankAccountId" value="" />}
    </div>

    {paymentDestination === "DEBT" ? <>
      <input type="hidden" name="amountReceived" value="" />
      <input type="hidden" name="changeDestination" value="DRAWER" />
      <input type="hidden" name="changeWalletId" value="" />
      <input type="hidden" name="changeBankAccountId" value="" />
      <div className="rounded-2xl border border-amber-200 bg-gradient-to-l from-amber-50 to-orange-50/60 p-4">
        <div className="flex items-start gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white text-amber-700 shadow-sm"><BookOpenCheck className="h-4.5 w-4.5" /></span>
          <div><div className="text-xs font-black text-amber-900">ترحيل كامل المبلغ إلى دفتر الديون</div><div className="mt-1 font-numeric text-lg font-black text-amber-800">{formatCurrency(total, currency)}</div><p className="mt-1 text-[10px] font-semibold leading-5 text-amber-700">لن يدخل أي مبلغ إلى الدرج أو المحافظ أو الحسابات البنكية الآن. تُضاف حركة دين مستقلة للعميل مع رابط مباشر إلى العملية الأصلية.</p></div>
        </div>
      </div>
    </> : <>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="grid gap-1.5 text-xs font-black text-slate-700">المبلغ المستلم<input name="amountReceived" type="number" min={Math.max(0, total)} step="0.01" value={amountReceived} onChange={(e) => setAmountReceived(e.target.value)} className="erp-input font-numeric" placeholder={total.toFixed(2)} /></label>
        <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3"><div className="text-[10px] font-black text-slate-400">الباقي للعميل</div><div className={`mt-1 font-numeric text-lg font-black ${change > 0 ? "text-amber-700" : "text-slate-800"}`}>{formatCurrency(change, currency)}</div></div>
      </div>

      {change > 0 ? <div className="rounded-2xl border border-amber-200 bg-amber-50/60 p-3.5">
        <div className="mb-2 text-xs font-black text-amber-900">مصدر إرجاع الباقي</div>
        <div className="grid grid-cols-3 gap-2">
          <label className={`cursor-pointer rounded-xl border p-2.5 text-center text-[11px] font-black ${changeDestination === "DRAWER" ? "border-amber-300 bg-white text-amber-800" : "border-amber-100 text-amber-600"}`}><input className="sr-only" type="radio" name="changeDestination" value="DRAWER" checked={changeDestination === "DRAWER"} onChange={() => setChangeDestination("DRAWER")} />الدرج النقدي</label>
          <label className={`cursor-pointer rounded-xl border p-2.5 text-center text-[11px] font-black ${changeDestination === "WALLET" ? "border-indigo-300 bg-white text-indigo-800" : "border-amber-100 text-amber-600"}`}><input className="sr-only" type="radio" name="changeDestination" value="WALLET" checked={changeDestination === "WALLET"} onChange={() => setChangeDestination("WALLET")} />محفظة</label>
          <label className={`cursor-pointer rounded-xl border p-2.5 text-center text-[11px] font-black ${changeDestination === "BANK" ? "border-cyan-300 bg-white text-cyan-800" : "border-amber-100 text-amber-600"}`}><input className="sr-only" type="radio" name="changeDestination" value="BANK" checked={changeDestination === "BANK"} onChange={() => setChangeDestination("BANK")} />حساب بنكي</label>
        </div>
        {changeDestination === "WALLET" ? <select name="changeWalletId" required value={changeWalletId} onChange={(e) => setChangeWalletId(e.target.value)} className="erp-input mt-2"><option value="">اختر محفظة إرجاع الباقي</option>{wallets.map((wallet) => <option key={wallet.id} value={wallet.id}>{wallet.name} — {formatCurrency(wallet.balance, currency)}</option>)}</select> : <input type="hidden" name="changeWalletId" value="" />}
        {changeDestination === "BANK" ? <select name="changeBankAccountId" required value={changeBankAccountId} onChange={(e) => setChangeBankAccountId(e.target.value)} className="erp-input mt-2"><option value="">اختر الحساب البنكي</option>{bankAccounts.map((account) => <option key={account.id} value={account.id}>{account.name} — {formatCurrency(account.balance, currency)}</option>)}</select> : <input type="hidden" name="changeBankAccountId" value="" />}
      </div> : <><input type="hidden" name="changeDestination" value="DRAWER" /><input type="hidden" name="changeWalletId" value="" /><input type="hidden" name="changeBankAccountId" value="" /></>}
    </>}
    <p className="text-[10px] font-semibold leading-5 text-slate-400">يُسجل البيع كإيراد مرة واحدة فقط. طريقة التسوية تحدد هل دخل المال فعلياً إلى الدرج أو المحفظة أو الحساب البنكي، أم تم ترحيله كدين على العميل.</p>
  </div>;
}
