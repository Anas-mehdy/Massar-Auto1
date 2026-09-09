"use client";

import { Banknote, Landmark, Plus, WalletCards } from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/format";
import { createExpenseAction } from "./actions";

type FundingSource = "DRAWER" | "WALLET" | "BANK";
type WalletOption = { id: string; name: string; balance: number };
type BankAccountOption = { id: string; name: string; bankName: string | null; balance: number };
type CategoryOption = { value: string; label: string };

export function ExpenseForm({ categories, wallets, bankAccounts, currency, todayInput, drawerBalance }: {
  categories: CategoryOption[];
  wallets: WalletOption[];
  bankAccounts: BankAccountOption[];
  currency: string;
  todayInput: string;
  drawerBalance?: number | null;
}) {
  const [fundingSource, setFundingSource] = useState<FundingSource>("DRAWER");
  const [walletId, setWalletId] = useState("");
  const [bankAccountId, setBankAccountId] = useState("");
  const selectedWallet = useMemo(() => wallets.find((wallet) => wallet.id === walletId) ?? null, [walletId, wallets]);
  const selectedBank = useMemo(() => bankAccounts.find((account) => account.id === bankAccountId) ?? null, [bankAccountId, bankAccounts]);

  function choose(source: FundingSource) {
    setFundingSource(source);
    if (source !== "WALLET") setWalletId("");
    if (source !== "BANK") setBankAccountId("");
  }

  return (
    <form action={createExpenseAction} className="erp-section h-fit space-y-4 xl:sticky xl:top-6">
      <div className="border-b border-slate-100 pb-3 dark:border-slate-800">
        <h3 className="flex items-center gap-2 text-sm font-black text-slate-900 dark:text-slate-100"><Plus className="h-4 w-4 text-primary" />تسجيل مصروف</h3>
        <p className="mt-1 text-[10px] font-bold text-slate-400">يُطرح من صافي الربح ومن الرصيد الفعلي الذي تختاره أدناه.</p>
      </div>

      <label className="grid gap-1.5 text-xs font-bold text-slate-700 dark:text-slate-300">اسم المصروف<input name="title" className="erp-input" placeholder="مثال: إيجار المحل" required /></label>
      <label className="grid gap-1.5 text-xs font-bold text-slate-700 dark:text-slate-300">الفئة<select name="category" className="erp-input" defaultValue="OTHER">{categories.map((category) => <option key={category.value} value={category.value}>{category.label}</option>)}</select></label>

      <div className="space-y-2">
        <span className="block text-xs font-black text-slate-700 dark:text-slate-300">السحب من</span>
        <input type="hidden" name="fundingSource" value={fundingSource} />
        <div className="grid gap-2 sm:grid-cols-3">
          <button type="button" onClick={() => choose("DRAWER")} className={`rounded-xl border p-3 text-right transition ${fundingSource === "DRAWER" ? "border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/35 dark:text-emerald-200" : "border-slate-200 bg-white text-slate-600 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300"}`}>
            <div className="flex items-center gap-2"><Banknote className="h-4 w-4" /><span className="text-[11px] font-black">الدرج النقدي</span></div>
            <p className="mt-1 text-[9px] font-semibold opacity-70">{drawerBalance == null ? "يُخصم مباشرة من الكاش." : `الرصيد: ${formatCurrency(drawerBalance, currency)}`}</p>
          </button>
          <button type="button" disabled={wallets.length === 0} onClick={() => choose("WALLET")} className={`rounded-xl border p-3 text-right transition disabled:cursor-not-allowed disabled:opacity-50 ${fundingSource === "WALLET" ? "border-indigo-300 bg-indigo-50 text-indigo-800 dark:border-indigo-800 dark:bg-indigo-950/35 dark:text-indigo-200" : "border-slate-200 bg-white text-slate-600 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300"}`}>
            <div className="flex items-center gap-2"><WalletCards className="h-4 w-4" /><span className="text-[11px] font-black">محفظة إلكترونية</span></div>
            <p className="mt-1 text-[9px] font-semibold opacity-70">{wallets.length ? "اختر المحفظة." : "لا توجد محافظ."}</p>
          </button>
          <button type="button" disabled={bankAccounts.length === 0} onClick={() => choose("BANK")} className={`rounded-xl border p-3 text-right transition disabled:cursor-not-allowed disabled:opacity-50 ${fundingSource === "BANK" ? "border-sky-300 bg-sky-50 text-sky-800 dark:border-sky-800 dark:bg-sky-950/35 dark:text-sky-200" : "border-slate-200 bg-white text-slate-600 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300"}`}>
            <div className="flex items-center gap-2"><Landmark className="h-4 w-4" /><span className="text-[11px] font-black">حساب بنكي</span></div>
            <p className="mt-1 text-[9px] font-semibold opacity-70">{bankAccounts.length ? "اختر الحساب البنكي." : "لا توجد حسابات بنكية."}</p>
          </button>
        </div>
      </div>

      {fundingSource === "WALLET" ? (
        <label className="grid gap-1.5 text-xs font-bold text-slate-700 dark:text-slate-300">
          المحفظة التي سُحب منها المصروف
          <select name="fundingWalletId" className="erp-input" required value={walletId} onChange={(event) => setWalletId(event.target.value)}>
            <option value="">اختر المحفظة</option>
            {wallets.map((wallet) => <option key={wallet.id} value={wallet.id}>{wallet.name} — {formatCurrency(wallet.balance, currency)}</option>)}
          </select>
          {selectedWallet ? <span className="text-[10px] font-bold text-indigo-600 dark:text-indigo-300">الرصيد الحالي: {formatCurrency(selectedWallet.balance, currency)}</span> : null}
        </label>
      ) : <input type="hidden" name="fundingWalletId" value="" />}

      {fundingSource === "BANK" ? (
        <label className="grid gap-1.5 text-xs font-bold text-slate-700 dark:text-slate-300">
          الحساب البنكي الذي سُحب منه المصروف
          <select name="fundingBankAccountId" className="erp-input" required value={bankAccountId} onChange={(event) => setBankAccountId(event.target.value)}>
            <option value="">اختر الحساب البنكي</option>
            {bankAccounts.map((account) => <option key={account.id} value={account.id}>{account.name}{account.bankName ? ` — ${account.bankName}` : ""} — {formatCurrency(account.balance, currency)}</option>)}
          </select>
          {selectedBank ? <span className="text-[10px] font-bold text-sky-700 dark:text-sky-300">الرصيد الحالي: {formatCurrency(selectedBank.balance, currency)}</span> : null}
        </label>
      ) : <input type="hidden" name="fundingBankAccountId" value="" />}

      <div className="grid grid-cols-2 gap-3">
        <label className="grid gap-1.5 text-xs font-bold text-slate-700 dark:text-slate-300">المبلغ<input name="amount" className="erp-input font-numeric" type="number" min="0.01" step="0.01" required /></label>
        <label className="grid gap-1.5 text-xs font-bold text-slate-700 dark:text-slate-300">التاريخ<input name="spentAt" className="erp-input font-numeric" type="date" defaultValue={todayInput} required /></label>
      </div>
      <label className="grid gap-1.5 text-xs font-bold text-slate-700 dark:text-slate-300">ملاحظات<textarea name="notes" className="erp-textarea" rows={3} placeholder="مثال: دفعة إيجار شهر سبتمبر / اسم الجهة المستلمة / رقم الإيصال" /></label>
      <Button type="submit" className="h-11 w-full rounded-xl font-black"><Plus className="h-4 w-4 ml-1.5" />حفظ المصروف وسحب المبلغ</Button>
    </form>
  );
}
