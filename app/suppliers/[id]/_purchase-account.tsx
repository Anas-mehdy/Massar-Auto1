"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/format";
import { recordPurchasePaymentAction } from "@/app/inventory/purchases/actions";

type Invoice = { id: string; number: string | null; date: string; total: string; paid: string; due: string };
type Props = { invoices: Invoice[]; outstanding: string; credit: string; currency: string; canPay: boolean; wallets: {id: string; name: string; currentBalance: string}[]; drawerBalance: string };

export function SupplierPurchaseAccount({ invoices, outstanding, credit, currency, canPay, wallets, drawerBalance }: Props) {
  const router = useRouter();
  const [selectedId, setSelectedId] = useState("");
  const [amount, setAmount] = useState("");
  const [account, setAccount] = useState<"DRAWER" | "WALLET" | "OTHER">("DRAWER");
  const [walletId, setWalletId] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  // Preserve the same request after an ambiguous transport failure.
  const attempt = useRef<{signature: string; key: string; paidAt: string} | null>(null);
  const invoice = invoices.find(item => item.id === selectedId);
  const money = (value: string | number) => formatCurrency(Number(value), currency);

  async function pay() {
    if (busyRef.current || !invoice) return;
    if (!Number.isFinite(Number(amount)) || Number(amount) <= 0 || Number(amount) > Number(invoice.due)) { setError("أدخل مبلغاً أكبر من صفر ولا يتجاوز الدين المتبقي."); return; }
    if (account === "WALLET" && !walletId) { setError("اختر المحفظة."); return; }
    const signature = JSON.stringify([invoice.id, amount, account, account === "WALLET" ? walletId : null]);
    if (attempt.current?.signature !== signature) attempt.current = {signature, key: crypto.randomUUID(), paidAt: new Date().toISOString()};
    const request = attempt.current;
    busyRef.current = true; setBusy(true); setError(""); setSuccess("");
    try {
      const result = await recordPurchasePaymentAction({ purchaseId: invoice.id, requestKey: request.key, paidAt: request.paidAt, amount, accountType: account, walletId: account === "WALLET" ? walletId : null, method: account === "DRAWER" ? "CASH" : account === "WALLET" ? "BANK_TRANSFER" : "OTHER", sourceName: account === "DRAWER" ? "الدرج النقدي" : account === "WALLET" ? wallets.find(wallet => wallet.id === walletId)?.name : "دفع خارج النظام" });
      if (!result.ok) { setError(result.error); return; }
      attempt.current = null; setSelectedId(""); setAmount(""); setSuccess("تم تسجيل الدفعة وتحديث دين المورد."); router.refresh();
    } catch { setError("تعذر تأكيد النتيجة. أعد المحاولة بنفس البيانات للتحقق من الدفعة دون تكرارها."); }
    finally { busyRef.current = false; setBusy(false); }
  }

  return <section className="erp-section dark:border-slate-800 dark:bg-slate-900">
    <h2 className="text-lg font-black">حساب فواتير الشراء للمورد</h2>
    <div className="mt-4 grid gap-3 sm:grid-cols-2">
      <div className="rounded-xl bg-amber-50 p-4 text-amber-900 dark:bg-amber-950/30 dark:text-amber-200"><p className="text-xs">المتبقي من فواتير الشراء</p><p className="mt-1 font-numeric text-xl font-black">{money(outstanding)}</p></div>
      <div className="rounded-xl bg-emerald-50 p-4 text-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200"><p className="text-xs">رصيد مرتجعات لنا لدى المورد</p><p className="mt-1 font-numeric text-xl font-black">{money(credit)}</p><p className="mt-1 text-xs">يُعرض مستقلاً عن الدين ولا يُخصم منه تلقائياً.</p></div>
    </div>
    {success && <p role="status" className="mt-3 text-sm font-bold text-emerald-700 dark:text-emerald-300">{success}</p>}
    {invoices.length === 0 ? <p className="mt-4 text-sm text-slate-500">لا توجد فواتير مشتريات معتمدة لهذا المورد.</p> : <div className="mt-4 space-y-3">{invoices.map(item => <article key={item.id} className="rounded-xl border border-slate-200 p-3 dark:border-slate-700">
      <div className="flex flex-wrap items-center justify-between gap-3"><Link className="text-sm font-bold text-teal-700 dark:text-teal-300" href={`/inventory/purchases/${item.id}`}>فاتورة {item.number || item.id.slice(0, 8)} · {new Date(item.date).toLocaleDateString("ar")}</Link>{canPay && Number(item.due) > 0 && <Button type="button" variant="outline" disabled={busy} onClick={() => { setSelectedId(item.id); setAmount(item.due); setError(""); setSuccess(""); }}>تسديد دفعة</Button>}</div>
      <dl className="mt-3 grid grid-cols-3 gap-2 text-xs"><div><dt>الإجمالي</dt><dd className="mt-1 font-numeric font-bold">{money(item.total)}</dd></div><div><dt>المدفوع</dt><dd className="mt-1 font-numeric font-bold">{money(item.paid)}</dd></div><div><dt>المتبقي علينا</dt><dd className="mt-1 font-numeric font-bold text-amber-700 dark:text-amber-300">{money(item.due)}</dd></div></dl>
      {selectedId === item.id && <div className="mt-4 border-t border-slate-200 pt-4 dark:border-slate-700"><div className="grid gap-3 sm:grid-cols-2">
        <label className="grid gap-1 text-xs font-bold">المبلغ المدفوع<input disabled={busy} type="number" min="0.01" max={item.due} step="0.01" className="erp-input" value={amount} onChange={event => setAmount(event.target.value)} /></label>
        <label className="grid gap-1 text-xs font-bold">الدفع من<select disabled={busy} className="erp-input" value={account} onChange={event => setAccount(event.target.value as typeof account)}><option value="DRAWER">الدرج النقدي</option><option value="WALLET">محفظة</option><option value="OTHER">خارج النظام — بدون خصم</option></select></label>
        {account === "WALLET" && <label className="grid gap-1 text-xs font-bold">اختر المحفظة<select disabled={busy} className="erp-input" value={walletId} onChange={event => setWalletId(event.target.value)}><option value="">اختر المحفظة</option>{wallets.map(wallet => <option value={wallet.id} key={wallet.id}>{wallet.name} — {money(wallet.currentBalance)}</option>)}</select></label>}
      </div><p className="mt-2 text-xs text-slate-500">{account === "DRAWER" ? `رصيد الدرج: ${money(drawerBalance)}` : account === "OTHER" ? "هذه الدفعة تسدد الدين دون تغيير أرصدة الدرج أو المحافظ." : "تُسجّل حركة خصم من المحفظة المختارة."} · المتبقي بعد الدفعة: {money(Math.max(0, Number(item.due) - Number(amount || 0)))}</p>{error && <p role="alert" className="mt-2 text-sm text-rose-600">{error}</p>}<div className="mt-3 flex gap-2"><Button type="button" disabled={busy} onClick={() => void pay()}>{busy ? "جارٍ تسجيل الدفعة…" : "تأكيد الدفعة"}</Button><Button type="button" variant="ghost" disabled={busy} onClick={() => setSelectedId("")}>إلغاء</Button></div></div>}
    </article>)}</div>}
  </section>;
}
