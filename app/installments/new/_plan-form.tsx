"use client";

import { InstallmentFrequency, PaymentMethod } from "@prisma/client";
import { Calculator, CalendarDays, Receipt, UserPlus } from "lucide-react";
import { useMemo, useState } from "react";

import { SubmitButton } from "@/components/submit-button";
import { createInstallmentPlanAction } from "../actions";

type CustomerOption = { id: string; name: string; phone: string | null };
type InvoiceOption = {
  id: string;
  invoiceNumber: string;
  balanceDue: string;
  customer: { id: string; name: string; phone: string | null } | null;
};
type WalletOption = { id: string; name: string; currentBalance: number };
type BankAccountOption = { id: string; name: string; bankName: string | null; currentBalance: number };

export function InstallmentPlanForm({
  customers,
  invoices,
  wallets,
  bankAccounts,
  requestId,
  initialInvoiceId,
  currency,
}: {
  customers: CustomerOption[];
  invoices: InvoiceOption[];
  wallets: WalletOption[];
  bankAccounts: BankAccountOption[];
  requestId: string;
  initialInvoiceId?: string;
  currency: string;
}) {
  const [mode, setMode] = useState<"MANUAL" | "INVOICE">(initialInvoiceId ? "INVOICE" : "MANUAL");
  const [invoiceId, setInvoiceId] = useState(initialInvoiceId || "");
  const [customerId, setCustomerId] = useState(customers[0]?.id || "NEW");
  const [total, setTotal] = useState("");
  const [down, setDown] = useState("0");
  const [downDestination, setDownDestination] = useState<"DRAWER" | "WALLET" | "BANK" | "OTHER">("DRAWER");
  const [downWalletId, setDownWalletId] = useState("");
  const [downBankAccountId, setDownBankAccountId] = useState("");
  const [count, setCount] = useState(4);
  const [title, setTitle] = useState(() => {
    const invoice = invoices.find((item) => item.id === initialInvoiceId);
    return invoice ? `تقسيط الفاتورة ${invoice.invoiceNumber}` : "";
  });

  const selectedInvoice = invoices.find((invoice) => invoice.id === invoiceId);
  const effectiveTotal = mode === "INVOICE" ? Number(selectedInvoice?.balanceDue || 0) : Number(total || 0);
  const effectiveDown = mode === "INVOICE" ? 0 : Number(down || 0);
  const financed = Math.max(0, effectiveTotal - effectiveDown);
  const installment = count > 0 ? financed / count : 0;
  const validPreview = Number.isFinite(installment) && installment > 0;
  const downLocationValid = effectiveDown <= 0
    || downDestination === "DRAWER"
    || downDestination === "OTHER"
    || (downDestination === "WALLET" && Boolean(downWalletId))
    || (downDestination === "BANK" && Boolean(downBankAccountId));
  const today = useMemo(() => {
    const value = new Date();
    value.setDate(value.getDate() + 30);
    return value.toISOString().slice(0, 10);
  }, []);

  return (
    <form action={createInstallmentPlanAction} className="space-y-6">
      <input type="hidden" name="clientGeneratedId" value={requestId} />

      <div className="grid gap-3 sm:grid-cols-2">
        <button type="button" onClick={() => setMode("MANUAL")} className={`rounded-2xl border p-4 text-right ${mode === "MANUAL" ? "border-teal-500 bg-teal-50 ring-1 ring-teal-100" : "border-slate-200 bg-white"}`}>
          <UserPlus className="mb-3 h-5 w-5 text-teal-600" />
          <div className="text-sm font-black text-slate-900">اتفاق مستقل</div>
          <div className="mt-1 text-xs text-slate-500">بيع أو دين خارج تذاكر الصيانة</div>
        </button>
        <button type="button" onClick={() => setMode("INVOICE")} className={`rounded-2xl border p-4 text-right ${mode === "INVOICE" ? "border-teal-500 bg-teal-50 ring-1 ring-teal-100" : "border-slate-200 bg-white"}`}>
          <Receipt className="mb-3 h-5 w-5 text-teal-600" />
          <div className="text-sm font-black text-slate-900">تقسيط فاتورة</div>
          <div className="mt-1 text-xs text-slate-500">تقسيم الرصيد المتبقي على فاتورة موجودة</div>
        </button>
      </div>

      <section className="erp-section grid gap-5 md:grid-cols-2">
        {mode === "INVOICE" ? (
          <label className="grid gap-2 md:col-span-2">
            <span className="text-xs font-extrabold text-slate-800">الفاتورة</span>
            <select
              name="invoiceId"
              value={invoiceId}
              onChange={(event) => {
                const nextInvoiceId = event.target.value;
                const nextInvoice = invoices.find((invoice) => invoice.id === nextInvoiceId);
                setInvoiceId(nextInvoiceId);
                setTitle(nextInvoice ? `تقسيط الفاتورة ${nextInvoice.invoiceNumber}` : "");
              }}
              className="erp-input"
              required
            >
              <option value="">اختر فاتورة لها رصيد متبقٍ</option>
              {invoices.map((invoice) => <option key={invoice.id} value={invoice.id}>{invoice.invoiceNumber} — {invoice.customer?.name} — {invoice.balanceDue} {currency}</option>)}
            </select>
            <input type="hidden" name="totalAmount" value={selectedInvoice?.balanceDue || "0"} />
            <input type="hidden" name="downPayment" value="0" />
          </label>
        ) : (
          <>
            <label className="grid gap-2 md:col-span-2">
              <span className="text-xs font-extrabold text-slate-800">العميل</span>
              <select name="customerId" value={customerId} onChange={(event) => setCustomerId(event.target.value)} className="erp-input">
                <option value="NEW">إضافة عميل جديد</option>
                {customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.name}{customer.phone ? ` — ${customer.phone}` : ""}</option>)}
              </select>
            </label>
            {customerId === "NEW" && <>
              <label className="grid gap-2"><span className="text-xs font-extrabold text-slate-800">اسم العميل</span><input name="customerName" className="erp-input" required /></label>
              <label className="grid gap-2"><span className="text-xs font-extrabold text-slate-800">رقم الهاتف</span><input name="customerPhone" className="erp-input" inputMode="tel" /></label>
            </>}
            <label className="grid gap-2"><span className="text-xs font-extrabold text-slate-800">المبلغ الإجمالي</span><input name="totalAmount" className="erp-input" type="number" min="0.01" step="0.01" required value={total} onChange={(event) => setTotal(event.target.value)} /></label>
            <label className="grid gap-2"><span className="text-xs font-extrabold text-slate-800">الدفعة الأولى</span><input name="downPayment" className="erp-input" type="number" min="0" step="0.01" value={down} onChange={(event) => setDown(event.target.value)} /></label>
            {effectiveDown > 0 && <>
              <label className="grid gap-2"><span className="text-xs font-extrabold text-slate-800">طريقة دفع الدفعة الأولى</span><select name="downPaymentMethod" className="erp-input" defaultValue={PaymentMethod.CASH}><option value="CASH">نقدي</option><option value="CARD">بطاقة</option><option value="BANK_TRANSFER">تحويل بنكي</option><option value="OTHER">أخرى</option></select></label>
              <label className="grid gap-2"><span className="text-xs font-extrabold text-slate-800">مكان وصول الدفعة الأولى</span><select name="downPaymentDestination" value={downDestination} onChange={(event) => setDownDestination(event.target.value as "DRAWER" | "WALLET" | "BANK" | "OTHER")} className="erp-input"><option value="DRAWER">الدرج النقدي</option><option value="WALLET">محفظة إلكترونية</option><option value="BANK">حساب بنكي</option><option value="OTHER">بدون تحديث رصيد</option></select></label>
              {downDestination === "WALLET" ? <label className="grid gap-2 md:col-span-2"><span className="text-xs font-extrabold text-slate-800">المحفظة</span><select name="downPaymentWalletId" value={downWalletId} onChange={(event) => setDownWalletId(event.target.value)} className="erp-input"><option value="">اختر المحفظة</option>{wallets.map((wallet) => <option key={wallet.id} value={wallet.id}>{wallet.name} — {wallet.currentBalance.toFixed(2)} {currency}</option>)}</select></label> : <input type="hidden" name="downPaymentWalletId" value="" />}
              {downDestination === "BANK" ? <label className="grid gap-2 md:col-span-2"><span className="text-xs font-extrabold text-slate-800">الحساب البنكي</span><select name="downPaymentBankAccountId" value={downBankAccountId} onChange={(event) => setDownBankAccountId(event.target.value)} className="erp-input"><option value="">اختر الحساب البنكي</option>{bankAccounts.map((account) => <option key={account.id} value={account.id}>{account.name}{account.bankName ? ` — ${account.bankName}` : ""} — {account.currentBalance.toFixed(2)} {currency}</option>)}</select></label> : <input type="hidden" name="downPaymentBankAccountId" value="" />}
              <p className="text-[11px] font-semibold leading-5 text-teal-700 md:col-span-2">الدفعة الأولى تُحتسب مرة واحدة في الخطة؛ هذا الاختيار يحدد فقط مكان وجود المال فعلياً.</p>
            </>}
          </>
        )}

        <label className="grid gap-2 md:col-span-2"><span className="text-xs font-extrabold text-slate-800">وصف الاتفاق أو الشيء المباع</span><input name="title" className="erp-input" required placeholder="مثال: iPhone 15 مستعمل مع كفالة شهر" value={title} onChange={(event) => setTitle(event.target.value)} /></label>
        <label className="grid gap-2"><span className="text-xs font-extrabold text-slate-800">عدد الأقساط</span><input name="installmentCount" className="erp-input" type="number" min="1" max="120" required value={count} onChange={(event) => setCount(Number(event.target.value))} /></label>
        <label className="grid gap-2"><span className="text-xs font-extrabold text-slate-800">التكرار</span><select name="frequency" className="erp-input" defaultValue={InstallmentFrequency.MONTHLY}><option value="MONTHLY">شهري</option><option value="WEEKLY">أسبوعي</option></select></label>
        <label className="grid gap-2"><span className="text-xs font-extrabold text-slate-800">تاريخ أول قسط</span><input name="firstDueAt" className="erp-input" type="date" required defaultValue={today} /></label>
        <label className="grid gap-2"><span className="text-xs font-extrabold text-slate-800">ملاحظات</span><input name="notes" className="erp-input" placeholder="اختياري" /></label>
      </section>

      <div className="rounded-2xl border border-teal-200 bg-gradient-to-l from-teal-50 to-cyan-50 p-5">
        <div className="flex items-center gap-2 text-sm font-black text-teal-950"><Calculator className="h-5 w-5" />الحساب التلقائي</div>
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Preview label="الإجمالي" value={effectiveTotal} currency={currency} />
          <Preview label="الدفعة الأولى" value={effectiveDown} currency={currency} />
          <Preview label="المبلغ المقسّط" value={financed} currency={currency} />
          <Preview label="قيمة القسط تقريباً" value={validPreview ? installment : 0} currency={currency} prominent />
        </div>
        <p className="mt-3 flex items-center gap-1 text-[11px] font-medium text-teal-700"><CalendarDays className="h-3.5 w-3.5" />يعالج النظام فرق التقريب تلقائياً في القسط الأخير.</p>
      </div>

      <SubmitButton className="h-12 w-full rounded-xl font-black" loadingText="جاري إنشاء خطة الأقساط..." disabled={!validPreview || !downLocationValid || (mode === "INVOICE" && !invoiceId)}>إنشاء الخطة والجدول</SubmitButton>
    </form>
  );
}

function Preview({ label, value, currency, prominent = false }: { label: string; value: number; currency: string; prominent?: boolean }) {
  return <div className={`rounded-xl border bg-white p-3 ${prominent ? "border-teal-400 shadow-sm" : "border-teal-100"}`}><div className="text-[10px] font-bold text-slate-500">{label}</div><div className={`mt-1 font-numeric text-sm font-black ${prominent ? "text-teal-700" : "text-slate-900"}`}>{Number.isFinite(value) ? value.toFixed(2) : "0.00"} {currency}</div></div>;
}
