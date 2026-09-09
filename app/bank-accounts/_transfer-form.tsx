"use client";

import { useMemo, useState } from "react";
import { ArrowLeftRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/format";
import { transferBankMoneyAction } from "./actions";

type Account = { id: string; name: string; bankName: string | null; balance: number };
type Wallet = { id: string; name: string; balance: number };
type EndpointType = "BANK" | "DRAWER" | "WALLET";

export function BankTransferForm({ accounts, wallets, currency }: { accounts: Account[]; wallets: Wallet[]; currency: string }) {
  const [fromType, setFromType] = useState<EndpointType>("BANK");
  const [toType, setToType] = useState<EndpointType>("DRAWER");
  const [fromId, setFromId] = useState(accounts[0]?.id ?? "");
  const [toId, setToId] = useState("");
  const invalid = fromType !== "BANK" && toType !== "BANK";
  const sameBank = fromType === "BANK" && toType === "BANK" && Boolean(fromId) && fromId === toId;

  function changeType(side: "from" | "to", type: EndpointType) {
    if (side === "from") {
      setFromType(type);
      setFromId(type === "BANK" ? accounts[0]?.id ?? "" : type === "WALLET" ? wallets[0]?.id ?? "" : "");
    } else {
      setToType(type);
      setToId(type === "BANK" ? accounts[0]?.id ?? "" : type === "WALLET" ? wallets[0]?.id ?? "" : "");
    }
  }

  const helper = useMemo(() => {
    if (invalid) return "أحد طرفي التحويل يجب أن يكون حساباً بنكياً.";
    if (sameBank) return "اختر حسابين مختلفين.";
    return "هذه حركة نقل سيولة فقط ولا تُحسب دخلاً أو مصروفاً أو ربحاً.";
  }, [invalid, sameBank]);

  return <form action={transferBankMoneyAction} className="rounded-[22px] border border-cyan-100 bg-gradient-to-b from-cyan-50/60 to-white p-5 shadow-sm">
    <div className="mb-5 flex items-center gap-3"><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-cyan-100 text-cyan-700"><ArrowLeftRight className="h-5 w-5" /></span><div><h2 className="font-black text-slate-900">تحويل سيولة</h2><p className="mt-1 text-sm font-semibold text-slate-400">بنك ↔ بنك / درج / محفظة.</p></div></div>
    <div className="grid gap-3 sm:grid-cols-2">
      <Endpoint label="من" type={fromType} id={fromId} onType={(v) => changeType("from", v)} onId={setFromId} accounts={accounts} wallets={wallets} currency={currency} namePrefix="from" />
      <Endpoint label="إلى" type={toType} id={toId} onType={(v) => changeType("to", v)} onId={setToId} accounts={accounts} wallets={wallets} currency={currency} namePrefix="to" />
      <label className="grid gap-1.5 text-sm font-bold text-slate-700">المبلغ<input name="amount" type="number" min="0.01" step="0.01" required className="erp-input font-numeric" /></label>
      <label className="grid gap-1.5 text-sm font-bold text-slate-700">تاريخ الحركة<input name="occurredAt" type="date" className="erp-input" /></label>
      <label className="grid gap-1.5 text-sm font-bold text-slate-700 sm:col-span-2">ملاحظة<input name="note" maxLength={500} className="erp-input" placeholder="مثال: إيداع كاش في البنك" /></label>
      <label className="grid gap-1.5 text-sm font-bold text-slate-700 sm:col-span-2">مرجع <span className="font-semibold text-slate-400">(اختياري)</span><input name="reference" maxLength={120} className="erp-input" placeholder="رقم حوالة / إيصال" /></label>
    </div>
    <p className={`mt-3 text-[10px] font-bold ${invalid || sameBank ? "text-rose-600" : "text-cyan-800"}`}>{helper}</p>
    <Button type="submit" disabled={invalid || sameBank || accounts.length === 0} className="mt-4 h-11 w-full rounded-xl bg-cyan-700 font-black hover:bg-cyan-800">تنفيذ التحويل</Button>
  </form>;
}

function Endpoint({ label, type, id, onType, onId, accounts, wallets, currency, namePrefix }: { label: string; type: EndpointType; id: string; onType: (value: EndpointType) => void; onId: (value: string) => void; accounts: Account[]; wallets: Wallet[]; currency: string; namePrefix: "from" | "to" }) {
  return <div className="rounded-xl border border-slate-200 bg-white p-3">
    <label className="grid gap-1.5 text-xs font-black text-slate-700">{label}<select name={`${namePrefix}Type`} value={type} onChange={(e) => onType(e.target.value as EndpointType)} className="erp-input"><option value="BANK">حساب بنكي</option><option value="DRAWER">الدرج النقدي</option><option value="WALLET">محفظة</option></select></label>
    {type === "BANK" ? <select name={`${namePrefix}Id`} value={id} onChange={(e) => onId(e.target.value)} className="erp-input mt-2" required><option value="">اختر الحساب</option>{accounts.map((account) => <option key={account.id} value={account.id}>{account.name}{account.bankName ? ` — ${account.bankName}` : ""} — {formatCurrency(account.balance, currency)}</option>)}</select> : type === "WALLET" ? <select name={`${namePrefix}Id`} value={id} onChange={(e) => onId(e.target.value)} className="erp-input mt-2" required><option value="">اختر المحفظة</option>{wallets.map((wallet) => <option key={wallet.id} value={wallet.id}>{wallet.name} — {formatCurrency(wallet.balance, currency)}</option>)}</select> : <input type="hidden" name={`${namePrefix}Id`} value="" />}
  </div>;
}
