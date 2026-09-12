import { ArrowDownLeft, ArrowLeftRight, ArrowUpRight, CheckCircle2, Eye, ExternalLink, Filter, Search, Sparkles, WalletCards } from "lucide-react";
import Link from "next/link";
import { ConfirmSubmitButton } from "@/components/confirm-submit-button";
import { Button } from "@/components/ui/button";
import { SmartEmptyState } from "@/components/onboarding/smart-empty-state";
import { can, requirePermission } from "@/lib/auth/context";
import { getCurrentShopContext } from "@/lib/current-shop";
import {
  transferCanVoid,
  transferCustomerDisplayName,
  transferSourceHref,
  transferSourceLabel,
  transferSourceLinkLabel,
} from "@/lib/financial-transfer-presentation";
import { formatCurrency, formatDate } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { financialTransferService, type FinancialTransferSourceType, type FinancialTransferType } from "@/lib/services/financialTransferService";
import { getTransferDailyData } from "@/lib/services/transferDailyStatsService";
import { dateInputEndUtcForTimeZone, dateInputStartUtcForTimeZone } from "@/lib/timezone";
import { voidTransferAction } from "./actions";
import { TransferStatsCards } from "./_transfer-stats-cards";
import { TransferForm } from "./_transfer-form";
import { WalletsPanel } from "./_wallets-panel";
import { OnboardingWalletSetup } from "./_onboarding-wallet-setup";
import { OnboardingTransferForm } from "./_onboarding-transfer-form";

export const dynamic = "force-dynamic";

type SearchParams = { saved?: string; walletSaved?: string; walletUpdated?: string; voided?: string; error?: string; wallet?: string; type?: string; q?: string; from?: string; to?: string; onboarding?: string };
const transferLabels: Record<FinancialTransferType, string> = { CUSTOMER_DEPOSIT: "إيداع للعميل", CUSTOMER_WITHDRAWAL: "سحب للعميل", WALLET_TOPUP: "زيادة رصيد المحفظة", WALLET_WITHDRAWAL: "نقص رصيد المحفظة" };
const commissionLabels = { ADDED: "مضافة", DEDUCTED: "مخصومة", NONE: "بدون عمولة" } as const;

export default async function TransfersPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const query = await searchParams;
  const [auth, context] = await Promise.all([
    requirePermission("sales:create"),
    getCurrentShopContext(),
  ]);
  const canManageFinance = can(auth, "finance:vouchers");
  const [wallets, customers] = await Promise.all([
    financialTransferService.listWallets(context.shopId),
    prisma.customer.findMany({ where: { shopId: context.shopId, deletedAt: null }, select: { id: true, name: true, phone: true }, orderBy: { name: "asc" }, take: 500 }),
  ]);

  const currency = context.currency || "SAR";
  const formWallets = wallets.map((wallet) => ({ id: wallet.id, name: wallet.name, balance: Number(wallet.currentBalance), depositCommission: Number(wallet.defaultDepositCommission), withdrawalCommission: Number(wallet.defaultWithdrawalCommission) }));

  if (query.onboarding === "1") {
    return (
      <div className="pb-8 pt-1">
        {query.error ? <div className="mx-auto mb-4 max-w-3xl rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-[11px] font-bold leading-5 text-rose-700 dark:border-rose-900/70 dark:bg-rose-950/30 dark:text-rose-200">{query.error}</div> : null}
        {wallets.length === 0 ? (
          canManageFinance ? <OnboardingWalletSetup currency={currency} /> : <div className="mx-auto max-w-3xl rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4 text-xs font-bold leading-6 text-amber-800">لا توجد محفظة مالية مهيأة بعد. اطلب من المدير أو المحاسب إضافة المحفظة أولاً، ثم يمكنك تنفيذ عمليات العملاء.</div>
        ) : (
          <OnboardingTransferForm
            currency={currency}
            wallets={formWallets.map((wallet) => ({ id: wallet.id, name: wallet.name, balance: wallet.balance }))}
          />
        )}
      </div>
    );
  }

  if (!canManageFinance) {
    return (
      <div className="mx-auto max-w-3xl space-y-5 pb-8">
        <section className="relative overflow-hidden rounded-[26px] border border-teal-100/80 bg-gradient-to-br from-teal-50 via-white to-cyan-50/70 px-5 py-5 shadow-[0_20px_70px_-46px_rgba(13,148,136,0.5)] sm:px-6 sm:py-6">
          <div className="relative flex items-start gap-4">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-teal-600 to-cyan-600 text-white shadow-lg shadow-teal-600/20"><ArrowLeftRight className="h-6 w-6" /></span>
            <div>
              <span className="rounded-full border border-teal-200 bg-white/80 px-2.5 py-1 text-[9px] font-black text-teal-700">خدمة العملاء</span>
              <h1 className="mt-2 text-2xl font-black tracking-tight text-slate-950 sm:text-[28px]">تنفيذ تحويل للعميل</h1>
              <p className="mt-1.5 text-xs font-semibold leading-6 text-slate-500">يمكنك تنفيذ عمليات الإيداع والسحب للعملاء. إدارة الأرصدة، الحركات الداخلية والسجل المالي متاحة للمخولين ماليًا فقط.</p>
            </div>
          </div>
        </section>
        <Feedback query={query} />
        <section className="overflow-hidden rounded-[22px] border border-teal-100 bg-white shadow-[0_20px_60px_-38px_rgba(13,148,136,0.38)]">
          <div className="border-b border-teal-100 bg-gradient-to-l from-teal-50 via-white to-cyan-50 px-5 py-4"><div className="flex items-center gap-3"><span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-teal-600 to-cyan-600 text-white"><ArrowLeftRight className="h-4 w-4" /></span><div><h2 className="text-sm font-black text-slate-900">عملية عميل جديدة</h2><p className="mt-0.5 text-[10px] font-semibold text-slate-500">اختر نوع الخدمة والمبلغ وطريقة التسوية.</p></div></div></div>
          <div className="p-4 sm:p-5">{wallets.length === 0 ? <div className="rounded-xl border border-amber-100 bg-amber-50/70 p-4 text-[10px] font-bold leading-5 text-amber-800">لا توجد محفظة مهيأة. راجع المدير أو المحاسب لإضافة محفظة قبل تنفيذ العمليات.</div> : <TransferForm wallets={formWallets} customers={customers} currency={currency} canManageFinance={false} />}</div>
        </section>
      </div>
    );
  }

  const type = Object.prototype.hasOwnProperty.call(transferLabels, query.type ?? "") ? (query.type as FinancialTransferType) : undefined;
  const from = query.from ? dateInputStartUtcForTimeZone(query.from, context.timeZone) : undefined;
  const to = query.to ? dateInputEndUtcForTimeZone(query.to, context.timeZone) : undefined;
  const [dailyData, transfers] = await Promise.all([
    getTransferDailyData(context.shopId),
    financialTransferService.listTransfers(context.shopId, { walletId: query.wallet || undefined, operationType: type, q: query.q, from, to }),
  ]);
  const statsWallets = wallets.map((wallet) => ({ id: wallet.id, name: wallet.name, balance: Number(wallet.currentBalance), monthlyLimit: wallet.monthlyLimit == null ? null : Number(wallet.monthlyLimit), monthlyUsed: Number(wallet.monthlyUsed) }));
  const statsOperations = dailyData.operations.map((row) => ({ id: row.id, walletName: row.walletName, userName: row.userName, customerName: row.customerName, operationType: row.operationType, amount: row.amount, commission: row.commission, createdAt: row.createdAt.toISOString() }));
  const walletPanelItems = wallets.map((wallet) => ({ id: wallet.id, name: wallet.name, balance: Number(wallet.currentBalance), monthlyLimit: wallet.monthlyLimit == null ? null : Number(wallet.monthlyLimit), monthlyUsed: Number(wallet.monthlyUsed), depositCommission: Number(wallet.defaultDepositCommission), withdrawalCommission: Number(wallet.defaultWithdrawalCommission) }));

  return <div className="space-y-6 pb-8">
    <section className="relative overflow-hidden rounded-[26px] border border-teal-100/80 bg-gradient-to-br from-teal-50 via-white to-cyan-50/70 px-5 py-5 shadow-[0_20px_70px_-46px_rgba(13,148,136,0.5)] sm:px-6 sm:py-6">
      <div className="absolute -left-20 -top-24 h-56 w-56 rounded-full bg-cyan-200/25 blur-3xl" />
      <div className="absolute -bottom-24 -right-20 h-56 w-56 rounded-full bg-teal-200/30 blur-3xl" />
      <div className="relative flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-start gap-4">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-teal-600 to-cyan-600 text-white shadow-lg shadow-teal-600/20"><WalletCards className="h-6 w-6" /></span>
          <div>
            <div className="flex flex-wrap items-center gap-2"><span className="rounded-full border border-teal-200 bg-white/80 px-2.5 py-1 text-[9px] font-black text-teal-700">المحافظ والأرصدة</span><span className="inline-flex items-center gap-1 text-[9px] font-bold text-slate-400"><Sparkles className="h-3 w-3 text-cyan-500" /> لوحة مالية موحدة</span></div>
            <h1 className="mt-2 text-2xl font-black tracking-tight text-slate-950 sm:text-[28px]">التحويلات المالية</h1>
            <p className="mt-1.5 max-w-2xl text-xs font-semibold leading-6 text-slate-500">تابع أرصدة محافظك ومصدر كل حركة، وافتح تفاصيلها أو العملية الأصلية المرتبطة بها عند الحاجة.</p>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:flex lg:justify-end">
          <div className="rounded-xl border border-white/90 bg-white/75 px-3.5 py-2.5 shadow-sm backdrop-blur-sm"><div className="text-[9px] font-black text-slate-400">العملة</div><div className="mt-0.5 font-numeric text-xs font-black text-slate-800">{currency}</div></div>
          <div className="rounded-xl border border-white/90 bg-white/75 px-3.5 py-2.5 shadow-sm backdrop-blur-sm"><div className="text-[9px] font-black text-slate-400">المحافظ</div><div className="mt-0.5 font-numeric text-xs font-black text-teal-700">{wallets.length} نشطة</div></div>
        </div>
      </div>
    </section>

    <Feedback query={query} />
    <TransferStatsCards stats={dailyData.stats} wallets={statsWallets} operations={statsOperations} currency={currency} timeZone={context.timeZone} />
    <WalletsPanel wallets={walletPanelItems} currency={currency} />

    <section className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_420px]">
      <div className="min-w-0 overflow-hidden rounded-[22px] border border-slate-200/80 bg-white shadow-[0_18px_55px_-38px_rgba(15,23,42,0.28)]">
        <div className="flex flex-col gap-3 border-b border-slate-100 bg-gradient-to-l from-slate-50 via-white to-teal-50/40 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div><h2 className="text-sm font-black text-slate-900">سجل التحويلات</h2><p className="mt-1 text-[10px] font-semibold text-slate-500">كل حركة مرتبطة بماهيتها الحقيقية ويمكن فتح تفاصيلها الكاملة.</p></div>
          <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-[9px] font-black text-slate-500">{transfers.length} نتيجة</span>
        </div>

        <form method="get" className="border-b border-slate-100 bg-slate-50/45 p-4">
          <div className="mb-2 flex items-center gap-1.5 text-[9px] font-black text-slate-400"><Filter className="h-3.5 w-3.5 text-teal-600" /> تصفية السجل</div>
          <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-6">
            <div className="relative md:col-span-2 xl:col-span-2"><Search className="absolute right-3 top-3.5 h-4 w-4 text-slate-400" /><input name="q" defaultValue={query.q} className={`${inputClass} pr-9`} placeholder="بحث بالعميل، المرجع أو المحفظة" /></div>
            <select name="wallet" defaultValue={query.wallet ?? ""} className={inputClass}><option value="">كل المحافظ</option>{wallets.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}</select>
            <select name="type" defaultValue={query.type ?? ""} className={inputClass}><option value="">كل العمليات</option>{Object.entries(transferLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
            <input type="date" name="from" defaultValue={query.from} className={inputClass} />
            <input type="date" name="to" defaultValue={query.to} className={inputClass} />
          </div>
          <div className="mt-2 flex justify-end"><Button type="submit" variant="outline" className="h-9 rounded-xl border-teal-200 bg-white px-4 text-[10px] font-black text-teal-700 hover:bg-teal-50">تطبيق الفلاتر</Button></div>
        </form>

        {transfers.length === 0 ? <SmartEmptyState job="WALLETS" icon={Search} title="لا توجد عمليات ضمن النطاق الحالي" description="غيّر الفلاتر أو سجّل عملية جديدة." /> : <div className="overflow-x-auto"><table className="min-w-[1180px] w-full text-right text-xs"><thead className="bg-slate-50/80 text-[10px] font-black text-slate-500"><tr><th className="px-4 py-3">ماهية الحركة</th><th className="px-4 py-3">المحفظة</th><th className="px-4 py-3">العميل</th><th className="px-4 py-3">المبلغ</th><th className="px-4 py-3">العمولة</th><th className="px-4 py-3">الدفع</th><th className="px-4 py-3">الحالة</th><th className="px-4 py-3">التاريخ</th><th className="px-4 py-3">الإجراءات</th></tr></thead><tbody className="divide-y divide-slate-100">{transfers.map((transfer) => {
          const canVoid = transferCanVoid(transfer.sourceType);
          const sourceHref = transferSourceHref(transfer);
          return <tr key={transfer.id} className={`transition hover:bg-teal-50/25 ${transfer.status === "VOID" ? "opacity-50" : ""}`}>
          <td className="px-4 py-3"><OperationBadge sourceType={transfer.sourceType} type={transfer.operationType} /><div className="mt-1 max-w-[190px] truncate font-numeric text-[9px] font-bold text-slate-400" title={transfer.sourceReference || transfer.notes || undefined}>{transfer.sourceReference || cleanMovementText(transfer.notes) || "—"}</div></td>
          <td className="px-4 py-3 font-bold text-slate-700">{transfer.walletName}</td>
          <td className="px-4 py-3"><div className="font-bold text-slate-700">{transferCustomerDisplayName(transfer)}</div><div className="font-numeric text-[9px] text-slate-400">{transfer.customerPhone || ""}</div></td>
          <td className="px-4 py-3 font-numeric font-black text-slate-900">{formatCurrency(transfer.amount, currency)}</td>
          <td className="px-4 py-3"><div className="font-numeric font-black text-amber-700">{formatCurrency(transfer.commission, currency)}</div><div className="text-[9px] font-bold text-slate-400">{commissionLabels[transfer.commissionMode]}</div></td>
          <td className="px-4 py-3">{transfer.isDeferred ? <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-1 text-[9px] font-black text-amber-700">آجل — دفتر الديون</span> : <span className="text-[9px] font-bold text-slate-400">فوري</span>}</td>
          <td className="px-4 py-3">{transfer.status === "ACTIVE" ? <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-1 text-[9px] font-black text-emerald-700"><CheckCircle2 className="h-3 w-3" /> فعالة</span> : <span className="rounded-full bg-rose-50 px-2 py-1 text-[9px] font-black text-rose-600">ملغاة</span>}</td>
          <td className="px-4 py-3 font-numeric text-[10px] font-bold text-slate-500">{formatDate(transfer.createdAt, context.timeZone)}</td>
          <td className="px-4 py-3"><div className="flex items-center gap-1"><Button asChild variant="ghost" size="sm" className="h-8 rounded-lg px-2 text-[9px] font-black text-teal-700 hover:bg-teal-50"><Link href={`/transfers/${transfer.id}`}><Eye className="ml-1 h-3.5 w-3.5" />فتح التفاصيل</Link></Button>{sourceHref ? <Button asChild variant="ghost" size="sm" className="h-8 rounded-lg px-2 text-[9px] font-black text-indigo-700 hover:bg-indigo-50"><Link href={sourceHref}><ExternalLink className="ml-1 h-3.5 w-3.5" />{transferSourceLinkLabel(transfer.sourceType)}</Link></Button> : null}{transfer.status === "ACTIVE" && canVoid ? <form action={voidTransferAction}><input type="hidden" name="id" value={transfer.id} /><ConfirmSubmitButton message="إلغاء العملية وعكس أثرها على الرصيد والدين المرتبط إن وجد؟" variant="ghost" size="sm" className="h-8 rounded-lg px-2 text-[9px] font-black text-rose-600 hover:bg-rose-50 hover:text-rose-700">إلغاء</ConfirmSubmitButton></form> : null}</div></td>
        </tr>})}</tbody></table></div>}
      </div>

      <aside className="h-fit overflow-hidden rounded-[22px] border border-teal-100 bg-white shadow-[0_20px_60px_-38px_rgba(13,148,136,0.38)] xl:sticky xl:top-24">
        <div className="border-b border-teal-100 bg-gradient-to-l from-teal-50 via-white to-cyan-50 px-5 py-4"><div className="flex items-center gap-3"><span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-teal-600 to-cyan-600 text-white shadow-md shadow-teal-600/15"><ArrowLeftRight className="h-4 w-4" /></span><div><h2 className="text-sm font-black text-slate-900">عملية جديدة</h2><p className="mt-0.5 text-[10px] font-semibold text-slate-500">سجّل الحركة وحدد العمولة وطريقة التحصيل.</p></div></div></div>
        <div className="p-4 sm:p-5">{wallets.length === 0 ? <div className="rounded-xl border border-amber-100 bg-amber-50/70 p-4 text-[10px] font-bold leading-5 text-amber-800">أضف محفظة أولاً قبل تسجيل العمليات.</div> : <TransferForm wallets={formWallets} customers={customers} currency={currency} canManageFinance />}</div>
      </aside>
    </section>
  </div>;
}

function OperationBadge({ sourceType, type }: { sourceType: FinancialTransferSourceType; type: FinancialTransferType }) {
  const label = transferSourceLabel(sourceType, type);
  const config = sourceType === "SALE" ? { icon: ArrowDownLeft, cls: "border-emerald-100 bg-emerald-50 text-emerald-700" } : sourceType === "SALE_CHANGE" ? { icon: ArrowUpRight, cls: "border-rose-100 bg-rose-50 text-rose-700" } : sourceType === "INVOICE" ? { icon: ArrowDownLeft, cls: "border-cyan-100 bg-cyan-50 text-cyan-700" } : sourceType === "INSTALLMENT" || sourceType === "INSTALLMENT_DOWN_PAYMENT" ? { icon: ArrowDownLeft, cls: "border-indigo-100 bg-indigo-50 text-indigo-700" } : sourceType === "DEBT" ? { icon: ArrowDownLeft, cls: "border-amber-100 bg-amber-50 text-amber-700" } : sourceType === "CASH_DRAWER_TRANSFER" ? { icon: ArrowLeftRight, cls: "border-violet-100 bg-violet-50 text-violet-700" } : type === "CUSTOMER_DEPOSIT" ? { icon: ArrowDownLeft, cls: "border-cyan-100 bg-cyan-50 text-cyan-700" } : type === "CUSTOMER_WITHDRAWAL" ? { icon: ArrowUpRight, cls: "border-indigo-100 bg-indigo-50 text-indigo-700" } : { icon: WalletCards, cls: "border-teal-100 bg-teal-50 text-teal-700" };
  const Icon = config.icon;
  return <span className={`inline-flex items-center gap-1.5 rounded-lg border px-2 py-1.5 text-[9px] font-black ${config.cls}`}><Icon className="h-3 w-3" />{label}</span>;
}

function cleanMovementText(notes: string | null) {
  if (!notes) return "";
  return notes.replace(/\s*\[(?:INSTALLMENT-PAYMENT|INSTALLMENT-DOWN|DEBT-PAYMENT):[0-9a-f-]+\]\s*/gi, "").trim();
}

function Feedback({ query }: { query: SearchParams }) {
  const text = query.saved ? "تم تسجيل العملية وتحديث رصيد المحفظة." : query.walletSaved ? "تمت إضافة المحفظة بنجاح." : query.walletUpdated ? "تم تعديل بيانات المحفظة بنجاح." : query.voided ? "تم إلغاء العملية وعكس أثرها المالي بنجاح." : null;
  if (query.error) return <div className="rounded-xl border border-rose-100 bg-rose-50/80 px-4 py-3 text-[10px] font-black text-rose-700">{query.error}</div>;
  if (!text) return null;
  return <div className="flex items-center gap-2 rounded-xl border border-emerald-100 bg-emerald-50/70 px-4 py-3 text-[10px] font-black text-emerald-700"><CheckCircle2 className="h-4 w-4" />{text}</div>;
}

const inputClass = "h-11 w-full rounded-xl border border-slate-200 bg-white px-3.5 text-[10px] font-bold text-slate-700 outline-none transition focus:border-teal-300 focus:ring-4 focus:ring-teal-100/70";
