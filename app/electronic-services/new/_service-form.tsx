"use client";

import { Banknote, Calculator, CheckCircle2, CreditCard, Landmark, Layers3, ReceiptText, Sparkles, UserRound, WalletCards, Zap } from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/format";
import { createElectronicServiceTransactionAction } from "../service-actions";

type Provider = { id: string; name: string; currentBalance: number; currencyCode: string };
type Template = { id: string; providerId: string; providerName: string; currencyCode: string; providerBalance: number; name: string; category: string; faceValue: number | null; providerCost: number; customerCharge: number };
type Customer = { id: string; name: string; phone: string | null };
type Wallet = { id: string; name: string; currentBalance: number };
type BankAccount = { id: string; name: string; bankName: string | null; currentBalance: number };
type ProfitMode = "AUTO_DIFFERENCE" | "FIXED" | "PERCENTAGE" | "NONE";
type PaymentDestination = "DRAWER" | "WALLET" | "BANK" | "OTHER" | "DEBT";

const inputClass = "h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold text-slate-800 outline-none transition focus:border-teal-400 focus:ring-4 focus:ring-teal-100/60 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:focus:border-teal-700 dark:focus:ring-teal-950/50";
const categories = ["شحن رصيد", "إنترنت وباقات", "دفع فاتورة", "بطاقة / قسيمة", "رسوم ومدفوعات", "خدمة حكومية", "محفظة", "أخرى"];
function numberValue(value: string) { const number = Number(value.replace(",", ".")); return Number.isFinite(number) ? Math.max(0, number) : 0; }

export function ElectronicServiceExecutionForm({
  providers,
  templates,
  customers,
  wallets,
  bankAccounts,
  defaultCurrency,
  defaultProviderId,
  returnTo,
}: {
  providers: Provider[];
  templates: Template[];
  customers: Customer[];
  wallets: Wallet[];
  bankAccounts: BankAccount[];
  defaultCurrency: string;
  defaultProviderId?: string;
  returnTo?: string;
}) {
  const [mode, setMode] = useState<"TEMPLATE" | "FREE">(templates.length ? "TEMPLATE" : "FREE");
  const [templateId, setTemplateId] = useState(templates[0]?.id ?? "");
  const [providerId, setProviderId] = useState(defaultProviderId && providers.some((provider) => provider.id === defaultProviderId) ? defaultProviderId : providers[0]?.id ?? "");
  const [providerCost, setProviderCost] = useState("");
  const [profitMode, setProfitMode] = useState<ProfitMode>("AUTO_DIFFERENCE");
  const [profitValue, setProfitValue] = useState("");
  const [customerCharge, setCustomerCharge] = useState("");
  const [paymentDestination, setPaymentDestination] = useState<PaymentDestination>("DRAWER");
  const [customerId, setCustomerId] = useState("");
  const [walletId, setWalletId] = useState(wallets[0]?.id ?? "");
  const [bankAccountId, setBankAccountId] = useState(bankAccounts[0]?.id ?? "");

  const selectedTemplate = useMemo(() => templates.find((template) => template.id === templateId) ?? null, [templateId, templates]);
  const selectedProvider = useMemo(() => providers.find((provider) => provider.id === providerId) ?? null, [providerId, providers]);
  const freeSummary = useMemo(() => { const cost = numberValue(providerCost); const value = numberValue(profitValue); let charge = numberValue(customerCharge); if (profitMode === "NONE") charge = cost; if (profitMode === "FIXED") charge = cost + value; if (profitMode === "PERCENTAGE") charge = cost + (cost * value) / 100; return { face: cost, cost, charge, profit: charge - cost }; }, [customerCharge, profitMode, profitValue, providerCost]);
  const currency = mode === "TEMPLATE" ? selectedTemplate?.currencyCode ?? defaultCurrency : selectedProvider?.currencyCode ?? defaultCurrency;
  const summary = mode === "TEMPLATE" && selectedTemplate ? { face: selectedTemplate.faceValue ?? selectedTemplate.customerCharge, cost: selectedTemplate.providerCost, charge: selectedTemplate.customerCharge, profit: selectedTemplate.customerCharge - selectedTemplate.providerCost, balance: selectedTemplate.providerBalance } : { ...freeSummary, balance: selectedProvider?.currentBalance ?? 0 };
  const insufficient = summary.cost > summary.balance;
  const missingDebtCustomer = paymentDestination === "DEBT" && !customerId;
  const missingWallet = paymentDestination === "WALLET" && !walletId;

  return <form action={createElectronicServiceTransactionAction} className="space-y-5">
    <input type="hidden" name="mode" value={mode} />
    {returnTo ? <input type="hidden" name="returnTo" value={returnTo} /> : null}

    <div className="grid grid-cols-2 gap-2 rounded-2xl border border-slate-200 bg-slate-50 p-1.5 dark:border-slate-800 dark:bg-slate-900/70">
      <button type="button" onClick={() => setMode("TEMPLATE")} disabled={!templates.length} className={`flex min-h-11 items-center justify-center gap-2 rounded-xl px-3 text-xs font-black transition ${mode === "TEMPLATE" ? "bg-white text-teal-700 shadow-sm ring-1 ring-slate-200 dark:bg-slate-950 dark:text-teal-300 dark:ring-slate-700" : "text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200"} disabled:cursor-not-allowed disabled:opacity-40`}><Layers3 className="h-4 w-4" />خدمة محفوظة</button>
      <button type="button" onClick={() => setMode("FREE")} className={`flex min-h-11 items-center justify-center gap-2 rounded-xl px-3 text-xs font-black transition ${mode === "FREE" ? "bg-white text-teal-700 shadow-sm ring-1 ring-slate-200 dark:bg-slate-950 dark:text-teal-300 dark:ring-slate-700" : "text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200"}`}><Zap className="h-4 w-4" />مبلغ حر</button>
    </div>

    {mode === "TEMPLATE" ? <div className="space-y-3">
      <label className="block"><span className="mb-1.5 block text-[10px] font-black text-slate-600 dark:text-slate-300">اختر الخدمة المحفوظة *</span><select name="templateId" value={templateId} onChange={(event) => setTemplateId(event.target.value)} className={inputClass} required>{templates.map((template) => <option key={template.id} value={template.id}>{template.name} — {template.providerName}</option>)}</select></label>
      {selectedTemplate ? <div className="rounded-2xl border border-indigo-100 bg-indigo-50/60 p-3 text-[10px] font-semibold text-indigo-800 dark:border-indigo-900/60 dark:bg-indigo-950/25 dark:text-indigo-200"><div className="flex flex-wrap gap-x-4 gap-y-1"><span>الفئة: <strong>{selectedTemplate.category}</strong></span><span>المزود: <strong>{selectedTemplate.providerName}</strong></span>{selectedTemplate.faceValue != null ? <span>القيمة: <strong>{formatCurrency(selectedTemplate.faceValue, selectedTemplate.currencyCode)}</strong></span> : null}</div></div> : null}
    </div> : <div className="space-y-3">
      <label className="block"><span className="mb-1.5 block text-[10px] font-black text-slate-600 dark:text-slate-300">مزود الخدمة *</span><select name="providerId" value={providerId} onChange={(event) => setProviderId(event.target.value)} className={inputClass} required><option value="" disabled>اختر المزود</option>{providers.map((provider) => <option key={provider.id} value={provider.id}>{provider.name} — رصيد {formatCurrency(provider.currentBalance, provider.currencyCode)}</option>)}</select></label>
      <div className="grid gap-3 sm:grid-cols-2"><label className="block"><span className="mb-1.5 block text-[10px] font-black text-slate-600 dark:text-slate-300">نوع الخدمة *</span><input name="category" list="electronic-service-categories" defaultValue="شحن رصيد" maxLength={120} className={inputClass} required /><datalist id="electronic-service-categories">{categories.map((category) => <option key={category} value={category} />)}</datalist></label><label className="block"><span className="mb-1.5 block text-[10px] font-black text-slate-600 dark:text-slate-300">اسم الخدمة *</span><input name="serviceName" maxLength={160} className={inputClass} placeholder="مثال: شحن هاتف / دفع فاتورة" required /></label></div>
      <input type="hidden" name="faceValue" value={providerCost} />
      <label className="block"><span className="mb-1.5 block text-[10px] font-black text-slate-600 dark:text-slate-300">تكلفة التنفيذ من رصيد المزود *</span><input name="providerCost" type="number" min="0" step="0.01" value={providerCost} onChange={(event) => setProviderCost(event.target.value)} className={inputClass} placeholder="مثال: 97" required /></label>
      <label className="block"><span className="mb-1.5 block text-[10px] font-black text-slate-600 dark:text-slate-300">طريقة احتساب الربح</span><select name="profitMode" value={profitMode} onChange={(event) => setProfitMode(event.target.value as ProfitMode)} className={inputClass}><option value="AUTO_DIFFERENCE">فرق يدوي بين التكلفة والمبلغ على العميل</option><option value="FIXED">ربح ثابت</option><option value="PERCENTAGE">نسبة من تكلفة التنفيذ</option><option value="NONE">بدون ربح</option></select></label>
      {profitMode === "AUTO_DIFFERENCE" ? <label className="block"><span className="mb-1.5 block text-[10px] font-black text-slate-600 dark:text-slate-300">المبلغ النهائي على العميل *</span><input name="customerCharge" type="number" min="0" step="0.01" value={customerCharge} onChange={(event) => setCustomerCharge(event.target.value)} className={inputClass} required /></label> : null}
      {profitMode === "FIXED" || profitMode === "PERCENTAGE" ? <label className="block"><span className="mb-1.5 block text-[10px] font-black text-slate-600 dark:text-slate-300">{profitMode === "FIXED" ? "الربح الثابت" : "النسبة المئوية"} *</span><input name="profitValue" type="number" min="0" step="0.01" value={profitValue} onChange={(event) => setProfitValue(event.target.value)} className={inputClass} required /></label> : null}
    </div>}

    <div className="grid gap-3 sm:grid-cols-3"><SummaryCard title="تكلفة المزود" value={formatCurrency(summary.cost, currency)} tone="amber" /><SummaryCard title="على العميل" value={formatCurrency(summary.charge, currency)} tone="teal" /><SummaryCard title="الربح المتوقع" value={formatCurrency(summary.profit, currency)} tone={summary.profit < 0 ? "rose" : "emerald"} /></div>
    <div className={`rounded-2xl border px-4 py-3 text-[11px] font-bold leading-5 ${insufficient ? "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900/70 dark:bg-rose-950/30 dark:text-rose-200" : "border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300"}`}><div className="flex items-center gap-2"><Calculator className="h-4 w-4" /><span>رصيد المزود الحالي: {formatCurrency(summary.balance, currency)}</span></div>{insufficient ? <p className="mt-1">الرصيد غير كافٍ لتغطية تكلفة العملية. أضف رصيداً للمزود أولاً.</p> : <p className="mt-1">بعد التنفيذ سيصبح رصيد المزود تقريباً {formatCurrency(summary.balance - summary.cost, currency)}.</p>}</div>

    <section className="rounded-[20px] border border-teal-100 bg-teal-50/45 p-4 dark:border-teal-900/60 dark:bg-teal-950/20">
      <div className="mb-3 flex items-center gap-2"><ReceiptText className="h-4 w-4 text-teal-700 dark:text-teal-300" /><div><h3 className="text-xs font-black text-slate-900 dark:text-slate-100">تحصيل المبلغ من العميل</h3><p className="mt-0.5 text-[9px] font-semibold text-slate-400">اختر أين دخل المبلغ فعلياً أو سجله على الدين.</p></div></div>
      <div className="grid gap-2 sm:grid-cols-5">
        <PaymentChoice active={paymentDestination === "DRAWER"} icon={Banknote} label="نقدي" helper="الدرج" onClick={() => setPaymentDestination("DRAWER")} />
        <PaymentChoice active={paymentDestination === "WALLET"} icon={WalletCards} label="محفظة" helper="رصيد إلكتروني" onClick={() => setPaymentDestination("WALLET")} />
        <PaymentChoice active={paymentDestination === "BANK"} icon={Landmark} label="بنك" helper="حساب بنكي" onClick={() => setPaymentDestination("BANK")} />
        <PaymentChoice active={paymentDestination === "DEBT"} icon={UserRound} label="على الدين" helper="ذمة العميل" onClick={() => setPaymentDestination("DEBT")} />
        <PaymentChoice active={paymentDestination === "OTHER"} icon={CreditCard} label="مصدر آخر" helper="بدون حركة مالية" onClick={() => setPaymentDestination("OTHER")} />
      </div>
      <input type="hidden" name="paymentDestination" value={paymentDestination} />
      {paymentDestination === "WALLET" ? <label className="mt-3 block"><span className="mb-1.5 block text-[10px] font-black text-slate-600 dark:text-slate-300">المحفظة التي استلمت المبلغ *</span><select name="walletId" value={walletId} onChange={(event) => setWalletId(event.target.value)} className={inputClass} required><option value="" disabled>اختر المحفظة</option>{wallets.map((wallet) => <option key={wallet.id} value={wallet.id}>{wallet.name} — {formatCurrency(wallet.currentBalance, defaultCurrency)}</option>)}</select>{wallets.length === 0 ? <p className="mt-1 text-[9px] font-bold text-rose-600 dark:text-rose-300">لا توجد محفظة نشطة. أضف محفظة أولاً أو اختر طريقة دفع أخرى.</p> : null}</label> : <input type="hidden" name="walletId" value="" />}
      {paymentDestination === "BANK" ? <label className="mt-3 block"><span className="mb-1.5 block text-[10px] font-black text-slate-600 dark:text-slate-300">الحساب البنكي الذي استلم المبلغ *</span><select name="bankAccountId" value={bankAccountId} onChange={(event) => setBankAccountId(event.target.value)} className={inputClass} required><option value="" disabled>اختر الحساب البنكي</option>{bankAccounts.map((account) => <option key={account.id} value={account.id}>{account.name}{account.bankName ? ` — ${account.bankName}` : ""} — {formatCurrency(account.currentBalance, defaultCurrency)}</option>)}</select>{bankAccounts.length === 0 ? <p className="mt-1 text-[9px] font-bold text-rose-600 dark:text-rose-300">لا توجد حسابات بنكية نشطة.</p> : null}</label> : <input type="hidden" name="bankAccountId" value="" />}
      <label className="mt-3 block"><span className="mb-1.5 block text-[10px] font-black text-slate-600 dark:text-slate-300">العميل {paymentDestination === "DEBT" ? "*" : "(اختياري)"}</span><select name="customerId" value={customerId} onChange={(event) => setCustomerId(event.target.value)} className={inputClass} required={paymentDestination === "DEBT"}><option value="">بدون ربط بعميل</option>{customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.name}{customer.phone ? ` — ${customer.phone}` : ""}</option>)}</select>{paymentDestination === "DEBT" ? <p className="mt-1 text-[9px] font-semibold text-amber-700 dark:text-amber-300">سيُضاف المبلغ كاملًا إلى دفتر دين هذا العميل، ويمنع مسار إلغاء العملية بعد تحصيل جزء من الدين.</p> : null}</label>
    </section>

    <div className="grid gap-3 sm:grid-cols-2"><label className="block"><span className="mb-1.5 block text-[10px] font-black text-slate-600 dark:text-slate-300">رقم الهاتف / الحساب</span><input name="customerPhone" maxLength={80} className={inputClass} placeholder="اختياري" /></label><label className="block"><span className="mb-1.5 block text-[10px] font-black text-slate-600 dark:text-slate-300">مرجع العملية</span><input name="reference" maxLength={160} className={inputClass} placeholder="رقم فاتورة أو مرجع خارجي" /></label></div>
    <label className="block"><span className="mb-1.5 block text-[10px] font-black text-slate-600 dark:text-slate-300">ملاحظات</span><textarea name="notes" maxLength={1000} rows={3} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs font-semibold text-slate-800 outline-none transition focus:border-teal-400 focus:ring-4 focus:ring-teal-100/60 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100" placeholder="اختياري" /></label>
    <Button type="submit" disabled={insufficient || missingDebtCustomer || missingWallet || (mode === "TEMPLATE" && !selectedTemplate) || (mode === "FREE" && !selectedProvider)} className="h-12 w-full rounded-xl bg-gradient-to-l from-teal-600 to-cyan-600 text-sm font-black text-white shadow-lg shadow-teal-600/20 disabled:cursor-not-allowed disabled:opacity-50"><CheckCircle2 className="ml-2 h-5 w-5" />تنفيذ الخدمة وتسجيل الحركة المالية</Button>
    <p className="flex items-center justify-center gap-1.5 text-center text-[10px] font-semibold leading-5 text-slate-400"><Sparkles className="h-3 w-3" />مسار سيخصم تكلفة الخدمة من رصيد المزود ويسجل التحصيل أو الدين في نفس العملية.</p>
  </form>;
}

function PaymentChoice({ active, icon: Icon, label, helper, onClick }: { active: boolean; icon: typeof Banknote; label: string; helper: string; onClick: () => void }) {
  return <button type="button" onClick={onClick} className={`rounded-xl border p-2.5 text-right transition ${active ? "border-teal-300 bg-white text-teal-800 shadow-sm ring-2 ring-teal-100 dark:border-teal-700 dark:bg-slate-950 dark:text-teal-200 dark:ring-teal-950" : "border-slate-200 bg-white/70 text-slate-500 hover:border-teal-200 dark:border-slate-800 dark:bg-slate-900/60 dark:text-slate-400"}`}><Icon className="h-4 w-4" /><div className="mt-1.5 text-[10px] font-black">{label}</div><div className="mt-0.5 text-[8px] font-semibold opacity-70">{helper}</div></button>;
}

function SummaryCard({ title, value, tone }: { title: string; value: string; tone: "amber" | "teal" | "emerald" | "rose" }) {
  const tones = { amber: "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/70 dark:bg-amber-950/25 dark:text-amber-300", teal: "border-teal-200 bg-teal-50 text-teal-700 dark:border-teal-900/70 dark:bg-teal-950/25 dark:text-teal-300", emerald: "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/70 dark:bg-emerald-950/25 dark:text-emerald-300", rose: "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900/70 dark:bg-rose-950/25 dark:text-rose-300" } as const;
  return <div className={`rounded-xl border px-3 py-2.5 ${tones[tone]}`}><p className="text-[9px] font-black opacity-70">{title}</p><p className="mt-1 font-numeric text-sm font-black">{value}</p></div>;
}