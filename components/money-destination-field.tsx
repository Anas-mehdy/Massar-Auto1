"use client";

import { useState } from "react";
import { formatCurrency } from "@/lib/format";

export type MoneyDestinationValue = "DRAWER" | "WALLET" | "BANK" | "OTHER";
export type MoneyWalletOption = { id: string; name: string; balance: number };
export type MoneyBankAccountOption = { id: string; name: string; bankName?: string | null; balance: number };

export function MoneyDestinationField({
  wallets,
  bankAccounts,
  currency,
  disabled = false,
  allowOther = true,
  destinationName = "moneyDestination",
  walletName = "walletId",
  bankAccountName = "bankAccountId",
  title = "مكان وصول المال",
  incoming = true,
}: {
  wallets: MoneyWalletOption[];
  bankAccounts: MoneyBankAccountOption[];
  currency: string;
  disabled?: boolean;
  allowOther?: boolean;
  destinationName?: string;
  walletName?: string;
  bankAccountName?: string;
  title?: string;
  incoming?: boolean;
}) {
  const [destination, setDestination] = useState<MoneyDestinationValue>("DRAWER");

  return (
    <div className="grid gap-3 rounded-xl border border-teal-100 bg-teal-50/40 p-3">
      <label className="grid gap-2">
        <span className="text-xs font-bold text-slate-700">{title}</span>
        <select
          className="erp-input"
          name={destinationName}
          value={destination}
          disabled={disabled}
          onChange={(event) => setDestination(event.target.value as MoneyDestinationValue)}
        >
          <option value="DRAWER">الدرج النقدي</option>
          <option value="WALLET">محفظة إلكترونية</option>
          <option value="BANK">حساب بنكي</option>
          {allowOther ? <option value="OTHER">بدون تحديث رصيد</option> : null}
        </select>
      </label>

      {destination === "WALLET" ? (
        <label className="grid gap-2">
          <span className="text-xs font-bold text-slate-700">المحفظة</span>
          <select className="erp-input" name={walletName} defaultValue="" required disabled={disabled}>
            <option value="">اختر المحفظة</option>
            {wallets.map((wallet) => (
              <option key={wallet.id} value={wallet.id}>{wallet.name} — {formatCurrency(wallet.balance, currency)}</option>
            ))}
          </select>
          {wallets.length === 0 ? <span className="text-[10px] font-bold text-amber-700">لا توجد محافظ نشطة.</span> : null}
        </label>
      ) : <input type="hidden" name={walletName} value="" />}

      {destination === "BANK" ? (
        <label className="grid gap-2">
          <span className="text-xs font-bold text-slate-700">الحساب البنكي</span>
          <select className="erp-input" name={bankAccountName} defaultValue="" required disabled={disabled}>
            <option value="">اختر الحساب البنكي</option>
            {bankAccounts.map((account) => (
              <option key={account.id} value={account.id}>
                {account.name}{account.bankName ? ` — ${account.bankName}` : ""} — {formatCurrency(account.balance, currency)}
              </option>
            ))}
          </select>
          {bankAccounts.length === 0 ? <span className="text-[10px] font-bold text-amber-700">لا توجد حسابات بنكية نشطة. أضف حساباً من قسم الحسابات البنكية.</span> : null}
        </label>
      ) : <input type="hidden" name={bankAccountName} value="" />}

      <p className="text-[10px] font-semibold leading-5 text-teal-700">
        {incoming
          ? "العملية تبقى حركة مالية واحدة؛ هذا الاختيار يحدد أين أصبح المال فعلياً."
          : "المصروف أو الدفع يُسجل مرة واحدة؛ هذا الاختيار يحدد من أي رصيد خرج المال فعلياً."}
      </p>
    </div>
  );
}
