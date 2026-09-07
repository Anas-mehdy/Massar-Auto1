"use client";

import Link from "next/link";
import { useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { ArrowUpRight, Plus, ReceiptText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/format";
import { addSupplierOpeningDebtAction, paySupplierAccountAction } from "./ledger-actions";

type LedgerEvent = {
  id: string; kind: string; label: string; amount: number; signedAmount: number; balanceAfter: number;
  occurredAt: string; occurredLabel: string; dueLabel: string | null;
  description: string | null; reference: string | null; sourceName: string | null; href: string | null; createdByName: string | null;
};

type Props = {
  supplierId: string; currency: string; today: string; canManage: boolean;
  manualOutstanding: number; purchaseOutstanding: number; supplierCredit: number; totalPayable: number; netBalance: number;
  events: LedgerEvent[]; drawerBalance: number; wallets: Array<{ id: string; name: string; currentBalance: number }>;
};

type Attempt = { signature: string; key: string };

export function SupplierLedgerPanel(props: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const openingAttempt = useRef<Attempt | null>(null);
  const paymentAttempt = useRef<Attempt | null>(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [accountType, setAccountType] = useState<"DRAWER" | "WALLET">("DRAWER");
  const [walletId, setWalletId] = useState("");
  const money = (value: number) => formatCurrency(value, props.currency);
  const selectedWallet = props.wallets.find((wallet) => wallet.id === walletId);
  const visibleBalance = props.netBalance >= 0 ? props.netBalance : Math.abs(props.netBalance);
  const balanceLabel = props.netBalance >= 0 ? "الصافي المستحق علينا" : "صافي رصيد لنا لدى المورد";

  async function run(action: () => Promise<{ ok: boolean; error?: string }>, successText: string, onSuccess?: () => void) {
    if (busyRef.current) return;
    busyRef.current = true; setBusy(true); setError(""); setSuccess("");
    try {
      const result = await action();
      if (!result.ok) { setError(result.error || "تعذر تنفيذ العملية."); return; }
      onSuccess?.();
      setSuccess(successText);
      router.refresh();
    } catch {
      // Keep the same request key in the relevant Attempt ref. A retry with unchanged data is idempotent.
      setError("تعذر تأكيد نتيجة العملية. أعد المحاولة بنفس البيانات دون تغييرها.");
    } finally { busyRef.current = false; setBusy(false); }
  }

  return <section className="erp-section space-y-5 dark:border-slate-800 dark:bg-slate-900">
    <div className="flex flex-col gap-3 border-b border-slate-100 pb-4 dark:border-slate-800 sm:flex-row sm:items-center sm:justify-between">
      <div><h2 className="text-lg font-black text-slate-900 dark:text-slate-100">كشف حساب المورد</h2><p className="mt-1 text-xs font-bold text-slate-400">يفصل ذمم الموردين عن ديون العملاء، ويجمع الرصيد السابق وفواتير الشراء والدفعات والمرتجعات.</p></div>
      <div className={`rounded-xl border px-4 py-2 ${props.netBalance >= 0 ? "border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200" : "border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-200"}`}><p className="text-[10px] font-black">{balanceLabel}</p><p className="mt-0.5 font-numeric text-lg font-black">{money(visibleBalance)}</p></div>
    </div>

    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <Stat label="إجمالي مستحق علينا" value={money(props.totalPayable)} tone="amber" />
      <Stat label="دين سابق / يدوي" value={money(props.manualOutstanding)} tone="orange" />
      <Stat label="فواتير شراء مسار" value={money(props.purchaseOutstanding)} tone="indigo" />
      <Stat label="رصيد لنا لدى المورد" value={money(props.supplierCredit)} tone="emerald" />
    </div>
    {props.supplierCredit > 0 ? <p className="rounded-xl border border-emerald-100 bg-emerald-50/60 px-3 py-2 text-[10px] font-bold leading-5 text-emerald-800 dark:border-emerald-900/50 dark:bg-emerald-950/20 dark:text-emerald-300">رصيد المرتجعات لنا لدى المورد ظاهر في الصافي، لكنه لا يُخصم تلقائيًا عند دفع دفعة جديدة حتى يبقى سجل تسوية المرتجع واضحًا.</p> : null}

    {error && <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-bold text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/30 dark:text-rose-300">{error}</p>}
    {success && <p role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-300">{success}</p>}

    {props.canManage && <div className="grid gap-4 xl:grid-cols-2">
      <form className="rounded-2xl border border-slate-200 p-4 dark:border-slate-700" onSubmit={(event) => {
        event.preventDefault();
        const form = event.currentTarget;
        const data = new FormData(form);
        const payload = { amount: String(data.get("amount") || ""), occurredAt: String(data.get("occurredAt") || ""), dueAt: String(data.get("dueAt") || ""), description: String(data.get("description") || ""), reference: String(data.get("reference") || "") };
        const signature = JSON.stringify(payload);
        if (openingAttempt.current?.signature !== signature) openingAttempt.current = { signature, key: crypto.randomUUID() };
        const attempt = openingAttempt.current;
        void run(() => addSupplierOpeningDebtAction({ supplierId: props.supplierId, requestKey: attempt.key, ...payload }), "تمت إضافة الدين السابق إلى حساب المورد.", () => { openingAttempt.current = null; form.reset(); });
      }}>
        <div className="mb-4 flex items-start gap-3"><span className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-300"><Plus className="h-4 w-4" /></span><div><h3 className="text-sm font-black text-slate-900 dark:text-slate-100">إضافة دين سابق</h3><p className="mt-1 text-[10px] font-bold text-slate-400">لديون المورد الموجودة قبل بدء استخدام مسار. لا تؤثر على المخزون أو الأرباح.</p></div></div>
        <div className="grid gap-3 sm:grid-cols-2"><Field label="المبلغ"><input name="amount" required type="number" min="0.01" step="0.01" className="erp-input font-numeric" /></Field><Field label="تاريخ الدين"><input name="occurredAt" required type="date" defaultValue={props.today} className="erp-input font-numeric" /></Field><Field label="تاريخ الاستحقاق (اختياري)"><input name="dueAt" type="date" className="erp-input font-numeric" /></Field><Field label="مرجع (اختياري)"><input name="reference" className="erp-input" placeholder="فاتورة قديمة أو اتفاق" /></Field><div className="sm:col-span-2"><Field label="البيان"><input name="description" className="erp-input" placeholder="مثال: رصيد سابق قبل استخدام مسار" /></Field></div></div>
        <Button disabled={busy} type="submit" className="mt-4 h-11 w-full rounded-xl font-black">إضافة الدين السابق</Button>
      </form>

      <form className="rounded-2xl border border-teal-200 bg-teal-50/30 p-4 dark:border-teal-900/60 dark:bg-teal-950/10" onSubmit={(event) => {
        event.preventDefault();
        const form = event.currentTarget;
        const data = new FormData(form);
        const payload = { amount: String(data.get("amount") || ""), occurredAt: String(data.get("occurredAt") || ""), accountType, walletId: accountType === "WALLET" ? walletId : undefined, description: String(data.get("description") || ""), reference: String(data.get("reference") || "") };
        const signature = JSON.stringify(payload);
        if (paymentAttempt.current?.signature !== signature) paymentAttempt.current = { signature, key: crypto.randomUUID() };
        const attempt = paymentAttempt.current;
        void run(() => paySupplierAccountAction({ supplierId: props.supplierId, requestKey: attempt.key, ...payload }), "تم تسجيل دفعة المورد وخصمها من مصدر المال المختار.", () => { paymentAttempt.current = null; form.reset(); setAccountType("DRAWER"); setWalletId(""); });
      }}>
        <div className="mb-4 flex items-start gap-3"><span className="flex h-9 w-9 items-center justify-center rounded-xl bg-teal-100 text-teal-700 dark:bg-teal-950/40 dark:text-teal-300"><ArrowUpRight className="h-4 w-4" /></span><div><h3 className="text-sm font-black text-slate-900 dark:text-slate-100">دفع دفعة للمورد</h3><p className="mt-1 text-[10px] font-bold text-slate-400">تُوزّع على الدين السابق أولًا ثم أقدم فواتير الشراء، وتُسجّل حركة السحب بنفس اللحظة.</p></div></div>
        <div className="grid gap-3 sm:grid-cols-2"><Field label="المبلغ"><input name="amount" required type="number" min="0.01" max={Math.max(0, props.totalPayable)} step="0.01" className="erp-input font-numeric" /></Field><Field label="تاريخ الدفع"><input name="occurredAt" required type="date" defaultValue={props.today} className="erp-input font-numeric" /></Field>
          <Field label="الدفع من"><select className="erp-input" value={accountType} onChange={(event) => { setAccountType(event.target.value as "DRAWER" | "WALLET"); setWalletId(""); }}><option value="DRAWER">الدرج النقدي — {money(props.drawerBalance)}</option><option value="WALLET">محفظة إلكترونية</option></select></Field>
          {accountType === "WALLET" ? <Field label="المحفظة"><select required className="erp-input" value={walletId} onChange={(event) => setWalletId(event.target.value)}><option value="">اختر المحفظة</option>{props.wallets.map((wallet) => <option key={wallet.id} value={wallet.id}>{wallet.name} — {money(wallet.currentBalance)}</option>)}</select></Field> : <div className="rounded-xl border border-slate-200 bg-white/70 p-3 text-[10px] font-bold text-slate-500 dark:border-slate-700 dark:bg-slate-900/60 dark:text-slate-300">سيتم الخصم من الدرج النقدي وتسجيل حركة خروج مرتبطة بهذا المورد.</div>}
          <Field label="مرجع (اختياري)"><input name="reference" className="erp-input" placeholder="رقم سند أو حوالة" /></Field><Field label="البيان"><input name="description" className="erp-input" placeholder="مثال: دفعة حساب للمورد" /></Field>
        </div>
        {accountType === "WALLET" && selectedWallet ? <p className="mt-2 text-[10px] font-bold text-teal-700 dark:text-teal-300">سيتم السحب من {selectedWallet.name} — الرصيد الحالي {money(selectedWallet.currentBalance)}.</p> : null}
        <Button disabled={busy || props.totalPayable <= 0 || (accountType === "WALLET" && !walletId)} type="submit" className="mt-4 h-11 w-full rounded-xl font-black">تأكيد دفع المورد</Button>
      </form>
    </div>}

    <div className="overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-700">
      <div className="flex items-center gap-2 border-b border-slate-100 px-4 py-3 dark:border-slate-800"><ReceiptText className="h-4 w-4 text-primary" /><h3 className="text-sm font-black text-slate-900 dark:text-slate-100">حركات كشف حساب المورد</h3></div>
      {props.events.length === 0 ? <div className="p-8 text-center text-xs font-bold text-slate-400">لا توجد حركات مالية على حساب هذا المورد بعد.</div> : <div className="overflow-x-auto"><table className="erp-table min-w-[980px]"><thead><tr><th>الحركة</th><th>المرجع / البيان</th><th>المصدر</th><th>التاريخ</th><th>الاستحقاق</th><th>الحركة المالية</th><th>الرصيد بعدها</th><th>نفذها</th></tr></thead><tbody>{props.events.map((event) => <tr key={event.id}><td className="font-black text-slate-800 dark:text-slate-200">{event.href ? <Link className="text-teal-700 hover:underline dark:text-teal-300" href={event.href}>{event.label}</Link> : event.label}</td><td><div className="font-numeric text-xs font-bold text-slate-600 dark:text-slate-300">{event.reference || "—"}</div>{event.description ? <div className="mt-1 max-w-[260px] truncate text-[10px] text-slate-400">{event.description}</div> : null}</td><td className="text-slate-700 dark:text-slate-300">{event.sourceName || "—"}</td><td className="font-numeric">{event.occurredLabel}</td><td className="font-numeric">{event.dueLabel || "—"}</td><td className={`font-numeric font-black ${event.signedAmount >= 0 ? "text-amber-700 dark:text-amber-300" : "text-emerald-700 dark:text-emerald-300"}`}>{event.signedAmount >= 0 ? "+" : "−"} {money(Math.abs(event.signedAmount))}</td><td className={`font-numeric font-black ${event.balanceAfter > 0 ? "text-amber-700 dark:text-amber-300" : event.balanceAfter < 0 ? "text-emerald-700 dark:text-emerald-300" : "text-slate-600 dark:text-slate-300"}`}>{event.balanceAfter < 0 ? `لنا ${money(Math.abs(event.balanceAfter))}` : event.balanceAfter > 0 ? `علينا ${money(event.balanceAfter)}` : money(0)}</td><td className="text-slate-700 dark:text-slate-300">{event.createdByName || "—"}</td></tr>)}</tbody></table></div>}
    </div>
  </section>;
}

function Field({ label, children }: { label: string; children: ReactNode }) { return <label className="grid gap-1.5 text-xs font-bold text-slate-700 dark:text-slate-300">{label}{children}</label>; }
function Stat({ label, value, tone }: { label: string; value: string; tone: "amber" | "orange" | "indigo" | "emerald" }) {
  const classes = { amber: "bg-amber-50 text-amber-900 dark:bg-amber-950/30 dark:text-amber-200", orange: "bg-orange-50 text-orange-900 dark:bg-orange-950/30 dark:text-orange-200", indigo: "bg-indigo-50 text-indigo-900 dark:bg-indigo-950/30 dark:text-indigo-200", emerald: "bg-emerald-50 text-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200" }[tone];
  return <div className={`rounded-xl p-4 ${classes}`}><p className="text-[10px] font-black opacity-75">{label}</p><p className="mt-1 font-numeric text-lg font-black">{value}</p></div>;
}
