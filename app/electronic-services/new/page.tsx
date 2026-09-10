import { ArrowRight, BookOpenCheck, Clock3, Layers3, Sparkles, WalletCards, Zap } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ConfirmSubmitButton } from "@/components/confirm-submit-button";
import { Button } from "@/components/ui/button";
import { getCurrentShopContext } from "@/lib/current-shop";
import { formatCurrency, formatDateTime } from "@/lib/format";
import { electronicServiceTransactionService, type ElectronicServicePaymentDestination } from "@/lib/services/electronicServiceTransactionService";
import { ElectronicServiceExecutionForm } from "./_service-form";
import { OnboardingElectronicServiceForm } from "./_onboarding-service-form";
import { ElectronicServiceActivationSuccess } from "./_activation-success";
import { voidElectronicServiceTransactionAction } from "../service-actions";

export const dynamic = "force-dynamic";

type SearchParams = { saved?: string; voided?: string; transaction?: string; error?: string; provider?: string; onboarding?: string };

function paymentLabel(destination: ElectronicServicePaymentDestination, walletName?: string | null) {
  if (destination === "DRAWER") return "نقدي — الدرج";
  if (destination === "WALLET") return walletName ? `محفظة: ${walletName}` : "محفظة إلكترونية";
  if (destination === "DEBT") return "على الدين";
  return "مصدر آخر";
}

export default async function NewElectronicServicePage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const query = await searchParams;
  const context = await getCurrentShopContext();
  const data = await electronicServiceTransactionService.getExecutionData(context.shopId);
  const canCreate = context.permissions.includes("sales:create");
  const canCancel = context.permissions.includes("sales:cancel");

  const providers = data.providers.map((provider) => ({ id: provider.id, name: provider.name, currentBalance: Number(provider.currentBalance), currencyCode: provider.currencyCode }));
  const templates = data.templates.map((template) => ({ id: template.id, providerId: template.providerId, providerName: template.providerName, currencyCode: template.currencyCode, providerBalance: Number(template.providerBalance), name: template.name, category: template.category, faceValue: template.faceValue == null ? null : Number(template.faceValue), providerCost: Number(template.providerCost), customerCharge: Number(template.customerCharge) }));
  const customers = data.customers.map((customer) => ({ id: customer.id, name: customer.name, phone: customer.phone }));
  const wallets = data.wallets.map((wallet) => ({ id: wallet.id, name: wallet.name, currentBalance: Number(wallet.currentBalance) }));
  const bankAccounts = data.bankAccounts.map((account) => ({ id: account.id, name: account.name, bankName: account.bankName, currentBalance: Number(account.currentBalance) }));

  if (query.onboarding === "1") {
    if (providers.length === 0) redirect("/electronic-services?onboarding=1");
    if (!canCreate) {
      return <div className="mx-auto max-w-xl rounded-2xl border border-amber-200 bg-amber-50 p-5 text-center text-xs font-bold text-amber-800 dark:border-amber-900 dark:bg-amber-950/25 dark:text-amber-200">هذا الحساب لا يملك صلاحية تنفيذ خدمة إلكترونية. اطلب من مالك المتجر إكمال الإعداد.</div>;
    }
    const completed = query.transaction ? data.recentTransactions.find((transaction) => transaction.id === query.transaction && transaction.status === "ACTIVE") : null;
    const completedProvider = completed ? providers.find((provider) => provider.id === completed.providerId) : null;
    return (
      <div className="space-y-5 pb-8">
        {query.error ? <div className="mx-auto max-w-3xl rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs font-bold text-rose-700 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-200">{query.error}</div> : null}
        {query.saved && completed && completedProvider ? (
          <ElectronicServiceActivationSuccess
            transactionId={completed.id}
            providerId={completed.providerId}
            providerBalance={completedProvider.currentBalance}
            providerCost={Number(completed.providerCost)}
            customerCharge={Number(completed.customerCharge)}
            profit={Number(completed.profit)}
            currency={completedProvider.currencyCode}
            paymentDestination={completed.paymentDestination}
          />
        ) : (
          <OnboardingElectronicServiceForm providers={providers} defaultProviderId={query.provider} />
        )}
      </div>
    );
  }

  return <div className="space-y-6 pb-8">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <Button asChild variant="ghost" className="h-9 rounded-xl px-3 text-[11px] font-black text-slate-500 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-900"><Link href="/electronic-services"><ArrowRight className="ml-1.5 h-4 w-4" />الخدمات الإلكترونية</Link></Button>
      <Button asChild variant="outline" className="h-9 rounded-xl border-indigo-200 bg-white px-3 text-[11px] font-black text-indigo-700 hover:bg-indigo-50 dark:border-indigo-900 dark:bg-slate-900 dark:text-indigo-300 dark:hover:bg-indigo-950/30"><Link href="/electronic-services/templates"><Layers3 className="ml-1.5 h-4 w-4" />الخدمات المحفوظة</Link></Button>
    </div>

    <section className="relative overflow-hidden rounded-[28px] border border-teal-100/80 bg-gradient-to-br from-teal-50 via-white to-cyan-50/70 px-5 py-6 shadow-[0_22px_75px_-48px_rgba(13,148,136,0.5)] dark:border-slate-800 dark:from-slate-950 dark:via-slate-950 dark:to-teal-950/25 sm:px-6">
      <div aria-hidden className="absolute -left-20 -top-24 h-56 w-56 rounded-full bg-cyan-200/25 blur-3xl dark:bg-cyan-700/10" />
      <div className="relative flex items-start gap-4"><span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-teal-600 to-cyan-600 text-white shadow-lg shadow-teal-600/20"><Zap className="h-6 w-6" /></span><div><div className="flex flex-wrap items-center gap-2"><span className="rounded-full border border-teal-200 bg-white/80 px-2.5 py-1 text-[10px] font-black text-teal-700 dark:border-teal-900 dark:bg-teal-950/50 dark:text-teal-300">تنفيذ مالي متكامل</span><span className="inline-flex items-center gap-1 text-[10px] font-bold text-slate-400"><Sparkles className="h-3 w-3 text-cyan-500" /> مزود + تحصيل + دين في عملية واحدة</span></div><h1 className="mt-2 text-2xl font-black tracking-tight text-slate-950 dark:text-slate-50 sm:text-[28px]">خدمة إلكترونية جديدة</h1><p className="mt-1.5 max-w-2xl text-xs font-semibold leading-6 text-slate-500 dark:text-slate-400">نفّذ الخدمة وحدد أين استلمت المبلغ. مسار يخصم تكلفة المزود ويضيف التحصيل للدرج أو المحفظة، أو يفتح ديناً على العميل تلقائياً.</p></div></div>
    </section>

    {query.error ? <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs font-bold text-rose-700 dark:border-rose-900/70 dark:bg-rose-950/30 dark:text-rose-200">{query.error}</div> : null}
    {query.saved ? <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs font-bold text-emerald-700 dark:border-emerald-900/70 dark:bg-emerald-950/30 dark:text-emerald-200">تم تنفيذ الخدمة وتحديث رصيد المزود وتسجيل أثرها المالي بنجاح.</div> : null}
    {query.voided ? <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs font-bold text-amber-800 dark:border-amber-900/70 dark:bg-amber-950/30 dark:text-amber-200">تم إلغاء العملية وعكس رصيد المزود والتحصيل أو الدين المرتبط بها.</div> : null}

    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
      <Stat title="عمليات اليوم" value={String(data.today.count)} icon={Clock3} />
      <Stat title="تكلفة المزودين" value={formatCurrency(data.today.providerCost, context.currency)} icon={WalletCards} />
      <Stat title="إجمالي على العملاء" value={formatCurrency(data.today.customerCharge, context.currency)} icon={BookOpenCheck} />
      <Stat title="المحصّل فعلياً" value={formatCurrency(data.today.collected, context.currency)} icon={WalletCards} />
      <Stat title="الربح" value={formatCurrency(data.today.profit, context.currency)} icon={Sparkles} helper={data.today.deferred > 0 ? `آجل ${formatCurrency(data.today.deferred, context.currency)}` : undefined} />
    </section>

    {providers.length === 0 ? <section className="rounded-[24px] border border-amber-200 bg-amber-50 p-6 text-center dark:border-amber-900/70 dark:bg-amber-950/25"><WalletCards className="mx-auto h-8 w-8 text-amber-500" /><h2 className="mt-3 text-sm font-black text-amber-900 dark:text-amber-200">أضف مزود خدمة أولاً</h2><p className="mt-1 text-[11px] font-semibold text-amber-700 dark:text-amber-300">لا يمكن تنفيذ خدمة بدون رصيد مزود مرتبط بها.</p><Button asChild className="mt-4 rounded-xl bg-amber-600 text-xs font-black text-white hover:bg-amber-700"><Link href="/electronic-services">إدارة المزودين</Link></Button></section> : canCreate ? <section className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_390px]">
      <div className="rounded-[24px] border border-slate-200/80 bg-white p-5 shadow-[0_18px_55px_-38px_rgba(15,23,42,0.28)] dark:border-slate-800 dark:bg-slate-950 sm:p-6"><ElectronicServiceExecutionForm providers={providers} templates={templates} customers={customers} wallets={wallets} bankAccounts={bankAccounts} defaultCurrency={context.currency} defaultProviderId={query.provider} /></div>
      <aside className="h-fit rounded-[24px] border border-slate-200/80 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-950 xl:sticky xl:top-24"><h2 className="text-sm font-black text-slate-900 dark:text-slate-100">كيف يتحرك المال؟</h2><div className="mt-4 space-y-3 text-[11px] font-semibold leading-5 text-slate-500 dark:text-slate-400"><p><strong className="text-slate-800 dark:text-slate-200">رصيد المزود:</strong> ينقص بتكلفة التنفيذ فقط.</p><p><strong className="text-slate-800 dark:text-slate-200">نقدي:</strong> المبلغ على العميل يدخل الدرج.</p><p><strong className="text-slate-800 dark:text-slate-200">محفظة:</strong> المبلغ يدخل المحفظة المحددة.</p><p><strong className="text-slate-800 dark:text-slate-200">على الدين:</strong> ينشأ دين مرتبط بالعملية الأصلية.</p><p className="rounded-xl border border-amber-100 bg-amber-50 px-3 py-2 text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/25 dark:text-amber-200">عند الإلغاء يعكس مسار كل هذه الآثار معاً. وإذا تم تحصيل جزء من الدين، يمنع الإلغاء حتى تتم معالجة التحصيل أولاً.</p></div></aside>
    </section> : <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 text-[11px] font-bold text-slate-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400">حسابك يملك صلاحية العرض فقط ولا يستطيع تنفيذ خدمات جديدة.</div>}

    <section className="overflow-hidden rounded-[24px] border border-slate-200/80 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950">
      <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4 dark:border-slate-800"><div><h2 className="text-sm font-black text-slate-900 dark:text-slate-100">آخر عمليات الخدمات الإلكترونية</h2><p className="mt-1 text-[10px] font-semibold text-slate-400">السجل يبقي العمليات الملغاة لأغراض التدقيق.</p></div></div>
      {data.recentTransactions.length === 0 ? <div className="py-12 text-center text-xs font-bold text-slate-400">لا توجد عمليات بعد.</div> : <div className="overflow-x-auto"><table className="min-w-[1250px] w-full text-right text-xs"><thead className="bg-slate-50/80 text-[10px] font-black text-slate-500 dark:bg-slate-900/70 dark:text-slate-400"><tr><th className="px-4 py-3">الخدمة</th><th className="px-4 py-3">المزود</th><th className="px-4 py-3">العميل</th><th className="px-4 py-3">التكلفة</th><th className="px-4 py-3">على العميل</th><th className="px-4 py-3">الربح</th><th className="px-4 py-3">التحصيل</th><th className="px-4 py-3">الحالة</th><th className="px-4 py-3">التاريخ</th><th className="px-4 py-3">الإجراء</th></tr></thead><tbody className="divide-y divide-slate-100 dark:divide-slate-800">{data.recentTransactions.map((tx) => <tr key={tx.id} className={`${tx.status === "VOID" ? "opacity-50" : "hover:bg-teal-50/25 dark:hover:bg-teal-950/15"}`}><td className="px-4 py-3"><div className="font-black text-slate-800 dark:text-slate-200">{tx.serviceName}</div><div className="mt-0.5 text-[9px] font-semibold text-slate-400">{tx.category}{tx.customerPhone ? ` · ${tx.customerPhone}` : ""}</div></td><td className="px-4 py-3 font-bold text-slate-600 dark:text-slate-300">{tx.providerName}</td><td className="px-4 py-3 text-[10px] font-bold text-slate-600 dark:text-slate-300">{tx.customerName || "—"}</td><td className="px-4 py-3 font-numeric font-bold text-amber-700 dark:text-amber-300">{formatCurrency(tx.providerCost, context.currency)}</td><td className="px-4 py-3 font-numeric font-black text-teal-700 dark:text-teal-300">{formatCurrency(tx.customerCharge, context.currency)}</td><td className={`px-4 py-3 font-numeric font-black ${Number(tx.profit) < 0 ? "text-rose-600 dark:text-rose-300" : "text-emerald-700 dark:text-emerald-300"}`}>{formatCurrency(tx.profit, context.currency)}</td><td className="px-4 py-3"><span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-1 text-[9px] font-black text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">{paymentLabel(tx.paymentDestination, tx.walletName)}</span></td><td className="px-4 py-3">{tx.status === "ACTIVE" ? <span className="rounded-full bg-emerald-50 px-2 py-1 text-[9px] font-black text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300">فعالة</span> : <span className="rounded-full bg-rose-50 px-2 py-1 text-[9px] font-black text-rose-600 dark:bg-rose-950/30 dark:text-rose-300">ملغاة</span>}</td><td className="px-4 py-3 font-numeric text-[10px] font-semibold text-slate-500 dark:text-slate-400">{formatDateTime(tx.createdAt)}</td><td className="px-4 py-3">{tx.status === "ACTIVE" && canCancel ? <form action={voidElectronicServiceTransactionAction}><input type="hidden" name="transactionId" value={tx.id} /><input type="hidden" name="voidReason" value="إلغاء من سجل الخدمات الإلكترونية" /><ConfirmSubmitButton message="إلغاء العملية وعكس رصيد المزود والتحصيل أو الدين المرتبط بها؟" variant="ghost" size="sm" className="h-8 rounded-lg px-2 text-[9px] font-black text-rose-600 hover:bg-rose-50 hover:text-rose-700 dark:hover:bg-rose-950/25">إلغاء وعكس</ConfirmSubmitButton></form> : <span className="text-[9px] font-semibold text-slate-400">—</span>}</td></tr>)}</tbody></table></div>}
    </section>
  </div>;
}

function Stat({ title, value, icon: Icon, helper }: { title: string; value: string; icon: typeof Zap; helper?: string }) { return <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-950"><div className="flex items-center gap-3"><span className="flex h-9 w-9 items-center justify-center rounded-xl border border-teal-100 bg-teal-50 text-teal-700 dark:border-teal-900/70 dark:bg-teal-950/30 dark:text-teal-300"><Icon className="h-4 w-4" /></span><div className="min-w-0"><p className="truncate text-[9px] font-black text-slate-400">{title}</p><p className="mt-1 truncate font-numeric text-sm font-black text-slate-900 dark:text-slate-100">{value}</p>{helper ? <p className="mt-0.5 truncate text-[8px] font-bold text-amber-600 dark:text-amber-300">{helper}</p> : null}</div></div></div>; }
