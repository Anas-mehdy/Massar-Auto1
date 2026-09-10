"use client";

import { useMemo, useState } from "react";
import { ArrowLeftRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/format";
import { transferCashWalletAction } from "./actions";

type Direction = "DRAWER_TO_WALLET" | "WALLET_TO_DRAWER" | "DRAWER_TO_BANK" | "BANK_TO_DRAWER";
type WalletOption = { id: string; name: string; balance: number };
type BankOption = { id: string; name: string; bankName: string | null; balance: number };

type Props = {
  wallets: WalletOption[];
  bankAccounts: BankOption[];
  currency: string;
  canManageBank: boolean;
};

export function CashLiquidityTransferForm({ wallets, bankAccounts, currency, canManageBank }: Props) {
  const hasWallets = wallets.length > 0;
  const hasBanks = canManageBank && bankAccounts.length > 0;
  const [direction, setDirection] = useState<Direction>(() => hasWallets ? "DRAWER_TO_WALLET" : "DRAWER_TO_BANK");
  const [walletId, setWalletId] = useState(wallets[0]?.id ?? "");
  const [bankAccountId, setBankAccountId] = useState(bankAccounts[0]?.id ?? "");

  const usesWallet = direction === "DRAWER_TO_WALLET" || direction === "WALLET_TO_DRAWER";
  const usesBank = direction === "DRAWER_TO_BANK" || direction === "BANK_TO_DRAWER";
  const helper = useMemo(() => {
    if (usesBank) return "التحويل البنكي يُسجل على الطرفين كحركة سيولة ولا يدخل في الإيرادات أو المصروفات.";
    return "نقل سيولة فقط؛ لا يُحسب كدخل أو مصروف.";
  }, [usesBank]);

  return <form action={transferCashWalletAction} className="rounded-[22px] border border-cyan-100 bg-gradient-to-b from-cyan-50/60 to-white p-5 shadow-sm">
    <div className="mb-5 flex items-center gap-3">
      <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-cyan-100 text-cyan-700"><ArrowLeftRight className="h-5 w-5" /></span>
      <div><h2 className="text-base font-black text-slate-900">تحويل سيولة</h2><p className="mt-0.5 text-sm font-semibold text-slate-400">الدرج ↔ محفظة / حساب بنكي.</p></div>
    </div>

    {!hasWallets && !hasBanks ? <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm font-bold text-amber-800">لا توجد محفظة أو حساب بنكي متاح للتحويل حالياً.</div> : <>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="grid gap-1.5 text-sm font-bold text-slate-700">اتجاه التحويل
          <select name="direction" value={direction} onChange={(event) => setDirection(event.target.value as Direction)} className="erp-input">
            {hasWallets && <option value="DRAWER_TO_WALLET">من الدرج إلى المحفظة</option>}
            {hasWallets && <option value="WALLET_TO_DRAWER">من المحفظة إلى الدرج</option>}
            {hasBanks && <option value="DRAWER_TO_BANK">من الدرج إلى الحساب البنكي</option>}
            {hasBanks && <option value="BANK_TO_DRAWER">من الحساب البنكي إلى الدرج</option>}
          </select>
        </label>

        {usesWallet ? <label className="grid gap-1.5 text-sm font-bold text-slate-700">المحفظة
          <select name="walletId" value={walletId} onChange={(event) => setWalletId(event.target.value)} className="erp-input" required>
            <option value="" disabled>اختر المحفظة</option>
            {wallets.map((wallet) => <option key={wallet.id} value={wallet.id}>{wallet.name} — {formatCurrency(wallet.balance, currency)}</option>)}
          </select>
        </label> : <input type="hidden" name="walletId" value="" />}

        {usesBank ? <label className="grid gap-1.5 text-sm font-bold text-slate-700">الحساب البنكي
          <select name="bankAccountId" value={bankAccountId} onChange={(event) => setBankAccountId(event.target.value)} className="erp-input" required>
            <option value="" disabled>اختر الحساب البنكي</option>
            {bankAccounts.map((account) => <option key={account.id} value={account.id}>{account.name}{account.bankName ? ` — ${account.bankName}` : ""} — {formatCurrency(account.balance, currency)}</option>)}
          </select>
        </label> : <input type="hidden" name="bankAccountId" value="" />}

        <label className="grid gap-1.5 text-sm font-bold text-slate-700">المبلغ<input name="amount" type="number" min="0.01" step="0.01" required className="erp-input font-numeric" /></label>
        <label className="grid gap-1.5 text-sm font-bold text-slate-700">ملاحظة<input name="notes" className="erp-input" placeholder="اختياري" /></label>
      </div>
      <p className="mt-3 text-[11px] font-bold text-cyan-800">{helper}</p>
      <Button type="submit" className="mt-4 h-11 w-full rounded-xl bg-cyan-700 font-black hover:bg-cyan-800">تنفيذ التحويل</Button>
    </>}
  </form>;
}
