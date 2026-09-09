"use client";

import Link from "next/link";
import { Fragment, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  Banknote,
  CalendarDays,
  ExternalLink,
  Pencil,
  Printer,
  ReceiptText,
  Trash2,
} from "lucide-react";
import {
  parseSourceDebtReference,
  sourceDebtHref,
  sourceDebtKindLabel,
  sourceDebtLinkLabel,
} from "@/lib/debt-source-reference";
import {
  deleteDebtLedgerAction,
  recordDebtPaymentAction,
  updateDebtLedgerEntryAction,
} from "../actions";

interface Entry {
  id: string;
  type: "DEBT" | "PAYMENT" | "OPENING_BALANCE" | "ADJUSTMENT_DEBIT" | "ADJUSTMENT_CREDIT";
  amount: number;
  occurredAt: string;
  dueAt: string | null;
  description: string | null;
  reference: string | null;
  paymentMethod: string | null;
  sourceName: string | null;
  createdByName: string | null;
  isReversed: boolean;
}

type PaymentSourceOption = { id: string; name: string };
type WalletOption = { id: string; name: string; currentBalance: number };
type BankOption = { id: string; name: string; bankName: string | null; currentBalance: number };

function typeLabel(type: Entry["type"]) {
  if (type === "PAYMENT") return "تحصيل";
  if (type === "OPENING_BALANCE") return "رصيد افتتاحي";
  if (type === "ADJUSTMENT_DEBIT") return "تسوية مدينة";
  if (type === "ADJUSTMENT_CREDIT") return "تسوية دائنة";
  return "دين جديد";
}

function isDebit(type: Entry["type"]) {
  return ["DEBT", "OPENING_BALANCE", "ADJUSTMENT_DEBIT"].includes(type);
}

function dateInputValue(value: string | null) {
  return value ? new Date(value).toISOString().slice(0, 10) : "";
}

function linkedSource(entry: Entry) {
  return entry.type === "DEBT" ? parseSourceDebtReference(entry.reference) : null;
}

function entryTypeLabel(entry: Entry) {
  const source = linkedSource(entry);
  return source ? sourceDebtKindLabel(source) : typeLabel(entry.type);
}

function DebtReference({ entry }: { entry: Entry }) {
  const source = linkedSource(entry);
  if (!source) return <>{entry.reference || "—"}</>;

  return (
    <div className="flex min-w-[150px] flex-col gap-1.5">
      <span className="font-numeric font-bold text-slate-600">{source.displayReference || "مرجع العملية"}</span>
      <Link
        href={sourceDebtHref(source)}
        className="inline-flex w-fit items-center gap-1 rounded-lg border border-sky-200 bg-sky-50 px-2 py-1 text-[10px] font-black text-sky-700 hover:bg-sky-100"
      >
        <ExternalLink className="h-3 w-3" />
        {sourceDebtLinkLabel(source)}
      </Link>
    </div>
  );
}

export function CustomerDebtLedger({
  customer,
  entries,
  paymentSources,
  wallets,
  bankAccounts,
  balance,
  currency,
}: {
  customer: { id: string; name: string; phone: string | null; email: string | null };
  entries: Entry[];
  paymentSources: PaymentSourceOption[];
  wallets: WalletOption[];
  bankAccounts: BankOption[];
  balance: number;
  currency: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [deleting, startDeleteTransition] = useTransition();
  const [editingPending, startEditTransition] = useTransition();
  const [amount, setAmount] = useState("");
  const [sourceChoice, setSourceChoice] = useState("");
  const [customSourceName, setCustomSourceName] = useState("");
  const [saveCustomSource, setSaveCustomSource] = useState(true);
  const [reference, setReference] = useState("");
  const [description, setDescription] = useState("");
  const [moneyDestination, setMoneyDestination] = useState<"DRAWER" | "WALLET" | "BANK" | "OTHER">("DRAWER");
  const [walletId, setWalletId] = useState("");
  const [bankAccountId, setBankAccountId] = useState("");
  const [message, setMessage] = useState<string | null>(null);

  const [editingEntryId, setEditingEntryId] = useState<string | null>(null);
  const [editAmount, setEditAmount] = useState("");
  const [editOccurredAt, setEditOccurredAt] = useState("");
  const [editDueAt, setEditDueAt] = useState("");
  const [editReference, setEditReference] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editSourceChoice, setEditSourceChoice] = useState("");
  const [editCustomSourceName, setEditCustomSourceName] = useState("");
  const [saveEditSource, setSaveEditSource] = useState(false);

  const money = (value: number) => `${value.toFixed(2)} ${currency}`;

  function paymentSourcePayload(choice: string, custom: string, save: boolean) {
    if (choice === "__CUSTOM__") {
      return { customSourceName: custom, saveCustomSource: save };
    }
    if (choice) return { sourceOptionId: choice };
    return { customSourceName: "" };
  }

  function submitPayment() {
    setMessage(null);
    const numeric = Number(amount);
    if (!Number.isFinite(numeric) || numeric <= 0) {
      setMessage("أدخل مبلغ تحصيل صحيحاً أكبر من صفر.");
      return;
    }
    if (sourceChoice === "__CUSTOM__" && !customSourceName.trim()) {
      setMessage("اكتب اسم مصدر الدفع الجديد.");
      return;
    }
    if (moneyDestination === "WALLET" && !walletId) {
      setMessage("اختر المحفظة التي استلمت التحصيل.");
      return;
    }
    if (moneyDestination === "BANK" && !bankAccountId) {
      setMessage("اختر الحساب البنكي الذي استلم التحصيل.");
      return;
    }

    startTransition(async () => {
      const result = await recordDebtPaymentAction({
        customerId: customer.id,
        amount: numeric,
        ...paymentSourcePayload(sourceChoice, customSourceName, saveCustomSource),
        reference: reference || null,
        description: description || null,
        moneyDestination,
        walletId: moneyDestination === "WALLET" ? walletId : undefined,
        bankAccountId: moneyDestination === "BANK" ? bankAccountId : undefined,
      });
      if (!result.success) {
        setMessage(result.error);
        return;
      }
      setAmount("");
      setSourceChoice("");
      setCustomSourceName("");
      setSaveCustomSource(true);
      setReference("");
      setDescription("");
      setMoneyDestination("DRAWER");
      setWalletId("");
      setBankAccountId("");
      setMessage("تم تسجيل التحصيل وتحديث رصيد المال بنجاح.");
      router.refresh();
    });
  }

  function beginEdit(entry: Entry) {
    if (linkedSource(entry)) {
      setMessage("هذه الحركة مرتبطة بعملية أصلية. افتح المبيعة أو خدمة السوفتوير لإدارتها.");
      return;
    }
    setMessage(null);
    setEditingEntryId(entry.id);
    setEditAmount(String(entry.amount));
    setEditOccurredAt(dateInputValue(entry.occurredAt));
    setEditDueAt(dateInputValue(entry.dueAt));
    setEditReference(entry.reference ?? "");
    setEditDescription(entry.description ?? "");

    const source = entry.sourceName ?? entry.paymentMethod ?? "";
    const saved = paymentSources.find((option) => option.name === source);
    if (entry.type === "PAYMENT" && source) {
      setEditSourceChoice(saved?.id ?? "__CUSTOM__");
      setEditCustomSourceName(saved ? "" : source);
    } else {
      setEditSourceChoice("");
      setEditCustomSourceName("");
    }
    setSaveEditSource(false);
  }

  function submitEdit(entry: Entry) {
    const numeric = Number(editAmount);
    if (!Number.isFinite(numeric) || numeric <= 0) {
      setMessage("أدخل مبلغاً صحيحاً أكبر من صفر.");
      return;
    }
    if (entry.type === "PAYMENT" && editSourceChoice === "__CUSTOM__" && !editCustomSourceName.trim()) {
      setMessage("اكتب اسم مصدر الدفع.");
      return;
    }

    startEditTransition(async () => {
      const result = await updateDebtLedgerEntryAction({
        customerId: customer.id,
        entryId: entry.id,
        amount: numeric,
        occurredAt: editOccurredAt || null,
        dueAt: isDebit(entry.type) ? editDueAt || null : null,
        ...(entry.type === "PAYMENT"
          ? paymentSourcePayload(editSourceChoice, editCustomSourceName, saveEditSource)
          : {}),
        reference: editReference || null,
        description: editDescription || null,
      });
      if (!result.success) {
        setMessage(result.error);
        return;
      }
      setEditingEntryId(null);
      setMessage("تم تعديل حركة دفتر الدين وتحديث أثرها المالي بنجاح.");
      router.refresh();
    });
  }

  function deleteLedger() {
    setMessage(null);
    const confirmed = window.confirm(
      `هل أنت متأكد من حذف دفتر دين العميل «${customer.name}»؟\n\nسيتم حذف جميع حركات الدين والتحصيل المرتبطة بهذا الدفتر نهائياً، ولا يمكن التراجع عن هذه العملية.`,
    );
    if (!confirmed) return;

    startDeleteTransition(async () => {
      const result = await deleteDebtLedgerAction(customer.id);
      if (!result.success) {
        setMessage(result.error);
        return;
      }
      router.push("/debts");
      router.refresh();
    });
  }

  return (
    <div className="space-y-6" dir="rtl">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <Link href="/debts" className="inline-flex items-center gap-1 text-xs font-black text-sky-700 hover:underline"><ArrowRight className="h-3.5 w-3.5" /> العودة إلى دفتر الديون</Link>
          <h1 className="mt-2 text-2xl font-black text-slate-900">كشف حساب: {customer.name}</h1>
          <p className="mt-1 text-xs font-semibold text-slate-500">{customer.phone || "بدون رقم هاتف"}{customer.email ? ` · ${customer.email}` : ""}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Link href={`/debts/${customer.id}/print`} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-700 shadow-sm hover:bg-slate-50">
              <Printer className="h-4 w-4" /> طباعة كشف الحساب / PDF
            </Link>
            <button type="button" disabled={deleting} onClick={deleteLedger} className="inline-flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-black text-rose-700 shadow-sm hover:bg-rose-100 disabled:opacity-50">
              <Trash2 className="h-4 w-4" /> {deleting ? "جارٍ الحذف..." : "حذف دفتر الدين"}
            </button>
          </div>
        </div>
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-5 py-4">
          <div className="text-[11px] font-black text-rose-600">الرصيد المستحق حالياً</div>
          <div className="mt-1 text-2xl font-black text-rose-700">{money(balance)}</div>
        </div>
      </div>

      {message ? <div className="rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-xs font-bold text-sky-800">{message}</div> : null}

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-center gap-2"><Banknote className="h-5 w-5 text-emerald-600" /><h2 className="text-sm font-black text-slate-900">تسجيل تحصيل من العميل</h2></div>
        <p className="mt-1 text-[11px] font-semibold text-slate-500">سجّل التحصيل وحدد أين وصلت الفلوس فعلياً: الدرج النقدي أو محفظة أو حساب بنكي.</p>
        <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <label className="space-y-1.5 text-xs font-bold text-slate-700"><span>المبلغ المدفوع</span><input type="number" min="0.01" step="0.01" max={balance || undefined} value={amount} onChange={(e) => setAmount(e.target.value)} className="w-full rounded-xl border border-slate-200 px-3 py-2.5 outline-none focus:border-emerald-400" placeholder={`0.00 ${currency}`} /></label>
          <label className="space-y-1.5 text-xs font-bold text-slate-700">
            <span>مصدر الدفع</span>
            <select value={sourceChoice} onChange={(e) => setSourceChoice(e.target.value)} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 outline-none focus:border-emerald-400">
              <option value="">غير محدد</option>
              {paymentSources.map((source) => <option key={source.id} value={source.id}>{source.name}</option>)}
              <option value="__CUSTOM__">+ إضافة مصدر دفع جديد</option>
            </select>
          </label>
          <label className="space-y-1.5 text-xs font-bold text-slate-700"><span>مرجع (اختياري)</span><input value={reference} onChange={(e) => setReference(e.target.value)} className="w-full rounded-xl border border-slate-200 px-3 py-2.5 outline-none focus:border-emerald-400" placeholder="رقم حوالة أو إيصال" /></label>
          <label className="space-y-1.5 text-xs font-bold text-slate-700"><span>ملاحظة</span><input value={description} onChange={(e) => setDescription(e.target.value)} className="w-full rounded-xl border border-slate-200 px-3 py-2.5 outline-none focus:border-emerald-400" placeholder="دفعة على الحساب" /></label>
        </div>

        <div className="mt-4 grid gap-3 rounded-2xl border border-teal-100 bg-teal-50/50 p-4 md:grid-cols-3">
          <label className="space-y-1.5 text-xs font-bold text-slate-700">
            <span>مكان وصول المال</span>
            <select value={moneyDestination} onChange={(e) => setMoneyDestination(e.target.value as "DRAWER" | "WALLET" | "BANK" | "OTHER")} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 outline-none focus:border-teal-400">
              <option value="DRAWER">الدرج النقدي</option>
              <option value="WALLET">محفظة إلكترونية</option>
              <option value="BANK">حساب بنكي</option>
              <option value="OTHER">بدون تحديث رصيد</option>
            </select>
          </label>
          <label className="space-y-1.5 text-xs font-bold text-slate-700">
            <span>المحفظة</span>
            <select value={walletId} onChange={(e) => setWalletId(e.target.value)} disabled={moneyDestination !== "WALLET"} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 outline-none disabled:bg-slate-100 disabled:text-slate-400 focus:border-teal-400">
              <option value="">اختر المحفظة عند الحاجة</option>
              {wallets.map((wallet) => <option key={wallet.id} value={wallet.id}>{wallet.name} — {money(wallet.currentBalance)}</option>)}
            </select>
          </label>
          <label className="space-y-1.5 text-xs font-bold text-slate-700">
            <span>الحساب البنكي</span>
            <select value={bankAccountId} onChange={(e) => setBankAccountId(e.target.value)} disabled={moneyDestination !== "BANK"} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 outline-none disabled:bg-slate-100 disabled:text-slate-400 focus:border-teal-400">
              <option value="">اختر الحساب عند الحاجة</option>
              {bankAccounts.map((account) => <option key={account.id} value={account.id}>{account.name}{account.bankName ? ` — ${account.bankName}` : ""} — {money(account.currentBalance)}</option>)}
            </select>
          </label>
          <p className="text-[11px] font-semibold leading-5 text-teal-700 md:col-span-3">التحصيل ينقص دين العميل مرة واحدة فقط، وهذا الاختيار يحدد مكان المال حتى يظهر صحيحاً في الدرج والمحافظ والحسابات البنكية والتقارير.</p>
        </div>

        {sourceChoice === "__CUSTOM__" ? (
          <div className="mt-4 grid gap-3 rounded-xl border border-emerald-100 bg-emerald-50/40 p-3 md:grid-cols-[1fr_auto] md:items-end">
            <label className="space-y-1.5 text-xs font-bold text-slate-700"><span>اسم مصدر الدفع الجديد</span><input value={customSourceName} onChange={(e) => setCustomSourceName(e.target.value)} maxLength={80} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 outline-none focus:border-emerald-400" placeholder="مثال: Vodafone Cash، InstaPay، شام كاش" /></label>
            <label className="flex items-center gap-2 pb-2 text-xs font-bold text-slate-600"><input type="checkbox" checked={saveCustomSource} onChange={(e) => setSaveCustomSource(e.target.checked)} className="h-4 w-4 accent-emerald-600" /> حفظه للاستخدام لاحقاً</label>
          </div>
        ) : null}
        <button type="button" disabled={pending || balance <= 0 || deleting} onClick={submitPayment} className="mt-4 rounded-xl bg-emerald-600 px-5 py-2.5 text-xs font-black text-white disabled:opacity-50">{pending ? "جارٍ التسجيل..." : "تسجيل التحصيل"}</button>
      </section>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 p-4"><div className="flex items-center gap-2"><ReceiptText className="h-5 w-5 text-sky-600" /><h2 className="text-sm font-black text-slate-900">حركات كشف الحساب</h2></div><p className="mt-1 text-[11px] font-semibold text-slate-500">كل دين ناتج عن مبيعة أو خدمة يظهر كحركة مستقلة مع رابط لمصدره، ولا يمكن تعديل الحركة المرتبطة من دفتر الدين مباشرة.</p></div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1040px] text-right text-xs">
            <thead className="bg-slate-50 text-slate-500"><tr><th className="p-3">التاريخ</th><th className="p-3">الحركة</th><th className="p-3">مدين</th><th className="p-3">دائن / تحصيل</th><th className="p-3">مصدر الدفع</th><th className="p-3">البيان</th><th className="p-3">المرجع / المصدر</th><th className="p-3">المستخدم</th><th className="p-3"></th></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {entries.map((entry) => (
                <Fragment key={entry.id}>
                  <tr className={entry.isReversed ? "opacity-40 line-through" : ""}>
                    <td className="p-3 text-slate-500"><span className="inline-flex items-center gap-1"><CalendarDays className="h-3.5 w-3.5" />{new Date(entry.occurredAt).toLocaleDateString("ar")}</span></td>
                    <td className="p-3 font-black text-slate-800">{entryTypeLabel(entry)}</td>
                    <td className="p-3 font-black text-rose-600">{isDebit(entry.type) ? money(entry.amount) : "—"}</td>
                    <td className="p-3 font-black text-emerald-600">{!isDebit(entry.type) ? money(entry.amount) : "—"}</td>
                    <td className="p-3 font-bold text-indigo-700">{entry.type === "PAYMENT" ? (entry.sourceName || entry.paymentMethod || "—") : "—"}</td>
                    <td className="p-3 text-slate-600">{entry.description || "—"}</td>
                    <td className="p-3 text-slate-500"><DebtReference entry={entry} /></td>
                    <td className="p-3 text-slate-500">{entry.createdByName || "—"}</td>
                    <td className="p-3">{!entry.isReversed && !linkedSource(entry) ? <button type="button" onClick={() => beginEdit(entry)} className="inline-flex items-center gap-1 font-black text-sky-700 hover:underline"><Pencil className="h-3.5 w-3.5" /> تعديل</button> : linkedSource(entry) ? <span className="text-[10px] font-bold text-slate-400">يُدار من المصدر</span> : null}</td>
                  </tr>
                  {editingEntryId === entry.id ? (
                    <tr className="bg-sky-50/40">
                      <td colSpan={9} className="p-4">
                        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                          <label className="space-y-1 text-xs font-bold text-slate-700"><span>المبلغ</span><input type="number" min="0.01" step="0.01" value={editAmount} onChange={(e) => setEditAmount(e.target.value)} className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2" /></label>
                          <label className="space-y-1 text-xs font-bold text-slate-700"><span>تاريخ الحركة</span><input type="date" value={editOccurredAt} onChange={(e) => setEditOccurredAt(e.target.value)} className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2" /></label>
                          {isDebit(entry.type) ? <label className="space-y-1 text-xs font-bold text-slate-700"><span>تاريخ الاستحقاق</span><input type="date" value={editDueAt} onChange={(e) => setEditDueAt(e.target.value)} className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2" /></label> : null}
                          {entry.type === "PAYMENT" ? (
                            <label className="space-y-1 text-xs font-bold text-slate-700"><span>مصدر الدفع</span><select value={editSourceChoice} onChange={(e) => setEditSourceChoice(e.target.value)} className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2"><option value="">غير محدد</option>{paymentSources.map((source) => <option key={source.id} value={source.id}>{source.name}</option>)}<option value="__CUSTOM__">+ مصدر مخصص</option></select></label>
                          ) : null}
                          <label className="space-y-1 text-xs font-bold text-slate-700"><span>المرجع</span><input value={editReference} onChange={(e) => setEditReference(e.target.value)} className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2" /></label>
                          <label className="space-y-1 text-xs font-bold text-slate-700"><span>البيان / الملاحظة</span><input value={editDescription} onChange={(e) => setEditDescription(e.target.value)} className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2" /></label>
                        </div>
                        {entry.type === "PAYMENT" && editSourceChoice === "__CUSTOM__" ? <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-end"><label className="flex-1 space-y-1 text-xs font-bold text-slate-700"><span>اسم مصدر الدفع</span><input value={editCustomSourceName} onChange={(e) => setEditCustomSourceName(e.target.value)} maxLength={80} className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2" /></label><label className="flex items-center gap-2 pb-2 text-xs font-bold text-slate-600"><input type="checkbox" checked={saveEditSource} onChange={(e) => setSaveEditSource(e.target.checked)} /> حفظه كخيار ثابت</label></div> : null}
                        <div className="mt-3 flex gap-2"><button type="button" disabled={editingPending} onClick={() => submitEdit(entry)} className="rounded-lg bg-sky-600 px-4 py-2 text-xs font-black text-white disabled:opacity-50">{editingPending ? "جارٍ الحفظ..." : "حفظ التعديل"}</button><button type="button" onClick={() => setEditingEntryId(null)} className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-xs font-black text-slate-600">إلغاء</button></div>
                      </td>
                    </tr>
                  ) : null}
                </Fragment>
              ))}
              {entries.length === 0 ? <tr><td colSpan={9} className="p-8 text-center font-bold text-slate-400">لا توجد حركات لهذا العميل بعد.</td></tr> : null}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
