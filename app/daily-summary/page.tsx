import {
  ArrowRight,
  Banknote,
  Boxes,
  CalendarRange,
  CircleDollarSign,
  CreditCard,
  ExternalLink,
  PackageX,
  ReceiptText,
  TrendingDown,
  TrendingUp,
  WalletCards,
} from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/page-header";
import { requirePermission } from "@/lib/auth/context";
import { resolveDailySummaryRange, type DailySummarySearchParams } from "@/lib/daily-summary-range";
import { formatCurrency } from "@/lib/format";
import { dailySummaryService } from "@/lib/services/dailySummaryService";
import { getShopTimeZone } from "@/lib/shop-timezone";

export const dynamic = "force-dynamic";

export default async function DailySummaryPage({ searchParams }: { searchParams: Promise<DailySummarySearchParams> }) {
  const auth = await requirePermission("reports:read");
  const params = await searchParams;
  const timeZone = await getShopTimeZone(auth.shop.id);
  const selection = resolveDailySummaryRange(params, timeZone);
  const summary = await dailySummaryService.getDailySummary(auth.shop.id, selection.range);
  const currency = auth.shop.currency || "SAR";
  const dateFormatter = new Intl.DateTimeFormat("ar-EG", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: summary.timeZone,
  });
  const rangeLabel = selection.from === selection.to
    ? dateFormatter.format(selection.range.start)
    : `${dateFormatter.format(selection.range.start)} — ${dateFormatter.format(new Date(selection.range.end.getTime() - 1))}`;
  const periodWord = selection.period === "today" ? "اليوم" : "الفترة";

  return (
    <div className="space-y-7" dir="rtl">
      <PageHeader
        eyebrow="جرد مالي وتشغيلي"
        title={selection.period === "today" ? "ملخص اليوم" : "ملخص الفترة"}
        description={`صورة مالية وتشغيلية كاملة للفترة: ${rangeLabel}. الحساب حسب توقيت المتجر (${summary.timeZone}).`}
        actions={(
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline" className="rounded-xl font-black"><Link href="/"><ArrowRight className="ml-1.5 h-4 w-4" />لوحة التحكم</Link></Button>
            <Button asChild className="rounded-xl font-black"><Link href="/reports">التقارير والأرباح</Link></Button>
          </div>
        )}
      />

      <DateRangeFilter selection={selection} />

      <section>
        <div className="mb-4"><h2 className="text-base font-black text-slate-900 dark:text-slate-100">نتيجة {periodWord} المالية</h2><p className="mt-1 text-xs font-bold text-slate-400">المبيعات والتكاليف والتحصيل والربح ضمن النطاق الزمني المحدد.</p></div>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
          <SummaryMetric label="إجمالي المبيعات" value={formatCurrency(summary.totals.sales, currency)} helper="كل قنوات البيع المحققة" icon={ReceiptText} />
          <SummaryMetric label="المقبوض فعلياً" value={formatCurrency(summary.totals.collected, currency)} helper="كل الأموال المحصلة ضمن الفترة" icon={Banknote} />
          <SummaryMetric label="مجمل الربح" value={formatCurrency(summary.totals.grossProfit, currency)} helper="بعد التكاليف + عمولات التحويلات" icon={TrendingUp} />
          <SummaryMetric label="المصروفات" value={formatCurrency(summary.totals.expenses, currency)} helper="المصروفات المسجلة ضمن الفترة" icon={TrendingDown} />
          <SummaryMetric label="صافي الربح" value={formatCurrency(summary.totals.netProfit, currency)} helper="مجمل الربح ناقص المصروفات" icon={CircleDollarSign} featured />
        </div>
      </section>

      <section className="grid gap-5 xl:grid-cols-[minmax(0,1.4fr)_minmax(320px,0.6fr)]">
        <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950">
          <div className="border-b border-slate-100 px-5 py-4 dark:border-slate-800"><h2 className="text-sm font-black text-slate-900 dark:text-slate-100">المبيعات والربح حسب النشاط</h2><p className="mt-1 text-[11px] font-bold text-slate-400">تظهر التكلفة مع الإيراد ضمن الفترة نفسها. تكلفة الصيانة لا تدخل إلا عند وجود فاتورة غير ملغاة.</p></div>
          <div className="overflow-x-auto">
            <table className="erp-table min-w-[760px]">
              <thead><tr><th>النشاط</th><th>العمليات</th><th>المبيعات / الحجم</th><th>التكلفة</th><th>الربح</th><th>تفاصيل</th></tr></thead>
              <tbody>{summary.channels.map((channel) => (
                <tr key={channel.key}>
                  <td><div className="font-black text-slate-900 dark:text-slate-100">{channel.label}</div>{channel.volumeOnly ? <div className="mt-1 text-[9px] font-bold text-amber-600 dark:text-amber-300">حجم العمليات ليس مبيعات؛ يدخل في الربح فقط مقدار العمولة.</div> : null}</td>
                  <td className="font-numeric font-bold">{channel.count}</td>
                  <td className="font-numeric font-black">{formatCurrency(channel.revenue, currency)}</td>
                  <td className="font-numeric font-bold text-rose-700 dark:text-rose-300">{channel.volumeOnly ? "—" : formatCurrency(channel.cost, currency)}</td>
                  <td className={`font-numeric font-black ${channel.profit >= 0 ? "text-emerald-700 dark:text-emerald-300" : "text-rose-700 dark:text-rose-300"}`}>{formatCurrency(channel.profit, currency)}</td>
                  <td><Button asChild size="sm" variant="outline" className="rounded-lg"><Link href={channel.href}>فتح<ExternalLink className="mr-1 h-3.5 w-3.5" /></Link></Button></td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        </div>

        <div className="space-y-4">
          <CollectionPanel
            sources={summary.collections.sources}
            collected={summary.totals.collected}
            outstanding={summary.totals.outstandingFromToday}
            transferProfit={summary.totals.transferCommissionProfit}
            currency={currency}
            periodLabel={periodWord}
          />
          <MoneyPanel title="حركة السيولة خلال الفترة" icon={WalletCards} rows={[
            ["رصيد بداية الفترة", summary.periodLiquidity.openingBalance],
            ["إجمالي الداخل", summary.periodLiquidity.inflow],
            ["إجمالي الخارج", summary.periodLiquidity.outflow],
            ["رصيد نهاية الفترة", summary.periodLiquidity.closingBalance],
          ]} currency={currency} />
        </div>
      </section>

      <section className="grid gap-5 xl:grid-cols-2">
        <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-950">
          <div className="flex items-center gap-3"><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-50 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300"><WalletCards className="h-5 w-5" /></span><div><h2 className="text-sm font-black text-slate-900 dark:text-slate-100">تفصيل الأموال الموجودة الآن</h2><p className="mt-1 text-[10px] font-bold text-slate-400">هذه أرصدة حالية وليست إيراد الفترة المحددة.</p></div></div>
          <div className="mt-4 space-y-2">{summary.liquidity.sources.map((source) => (
            <Link key={`${source.kind}:${source.id}`} href={source.href} className="flex items-center justify-between gap-3 rounded-xl border border-slate-100 px-3 py-2.5 transition hover:border-primary/30 hover:bg-primary/5 dark:border-slate-800 dark:hover:bg-slate-900">
              <span className="text-xs font-black text-slate-700 dark:text-slate-300">{source.label}</span>
              <span className="font-numeric text-sm font-black text-slate-950 dark:text-white">{formatCurrency(source.balance, currency)}</span>
            </Link>
          ))}</div>
        </div>

        <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-950">
          <div className="flex items-center gap-3"><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300"><Boxes className="h-5 w-5" /></span><div><h2 className="text-sm font-black text-slate-900 dark:text-slate-100">المخزون والتوالف</h2><p className="mt-1 text-[10px] font-bold text-slate-400">قيمة المخزون الحالية والتالف المسجل ضمن الفترة.</p></div></div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2"><MiniValue label="قيمة المخزون بسعر التكلفة" value={formatCurrency(summary.inventory.valueAtCost, currency)} /><MiniValue label="قيمة التوالف في الفترة" value={formatCurrency(summary.inventory.damageValue, currency)} helper={`${summary.inventory.damageCount} حركة تالف`} /></div>
          {summary.inventory.damageItems.length ? <div className="mt-4 border-t border-slate-100 pt-4 dark:border-slate-800"><p className="mb-2 text-[10px] font-black text-slate-500">المنتجات التي سجل عليها تالف في الفترة</p><div className="flex flex-wrap gap-2">{summary.inventory.damageItems.map((item) => <Button key={item.inventoryItemId} asChild size="sm" variant="outline" className="rounded-lg border-rose-200 text-rose-700 dark:border-rose-900 dark:text-rose-300"><Link href={`/inventory/${item.inventoryItemId}#inventory-movements`}><PackageX className="ml-1 h-3.5 w-3.5" />{item.name} ({item.quantity})</Link></Button>)}</div></div> : <p className="mt-4 text-xs font-bold text-slate-400">لا توجد توالف مسجلة ضمن الفترة.</p>}
        </div>
      </section>

      <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-950">
        <div className="mb-4"><h2 className="text-sm font-black text-slate-900 dark:text-slate-100">الذمم والالتزامات الحالية</h2><p className="mt-1 text-[10px] font-bold text-slate-400">هذه أرصدة حالية حتى الآن وليست محصورة بما حدث ضمن الفترة المحددة.</p></div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <DebtCard label="إجمالي ديون العملاء" value={summary.debts.customerOutstanding} currency={currency} href="/debts" helper="الرصيد الحالي في دفتر الديون" />
          <DebtCard label="ديون خارجية / يدوية" value={summary.debts.externalOutstanding} currency={currency} href="/debts" helper="أرصدة افتتاحية وديون غير مرتبطة ببيع معروف" />
          <DebtCard label="علينا للموردين" value={summary.debts.supplierPayable} currency={currency} href="/suppliers" helper={`مشتريات ${formatCurrency(summary.debts.supplierPurchaseOutstanding, currency)} + ديون سابقة ${formatCurrency(summary.debts.supplierManualOutstanding, currency)}`} />
          <DebtCard label="صافي مستحق الموردين" value={summary.debts.supplierNetPayable} currency={currency} href="/suppliers" helper={`بعد خصم رصيد لنا لدى الموردين ${formatCurrency(summary.debts.supplierCredit, currency)}`} />
        </div>
      </section>

      {summary.electronicCategories.length > 0 ? (
        <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-950">
          <div className="mb-4"><h2 className="text-sm font-black text-slate-900 dark:text-slate-100">تفصيل الخدمات الإلكترونية في الفترة</h2><p className="mt-1 text-[10px] font-bold text-slate-400">تفصيل حسب التصنيفات الفعلية التي يستخدمها المتجر.</p></div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{summary.electronicCategories.map((category) => <div key={category.category} className="rounded-2xl border border-slate-100 p-4 dark:border-slate-800"><div className="flex items-center justify-between gap-2"><span className="text-xs font-black text-slate-800 dark:text-slate-200">{category.category}</span><span className="font-numeric text-[10px] font-bold text-slate-400">{category.count} عملية</span></div><div className="mt-3 grid grid-cols-3 gap-2 text-center"><SmallStat label="المبيعات" value={formatCurrency(category.revenue, currency)} /><SmallStat label="التكلفة" value={formatCurrency(category.cost, currency)} /><SmallStat label="الربح" value={formatCurrency(category.profit, currency)} /></div></div>)}</div>
        </section>
      ) : null}
    </div>
  );
}

function DateRangeFilter({ selection }: { selection: ReturnType<typeof resolveDailySummaryRange> }) {
  const activeClass = "border-primary bg-primary text-white shadow-sm";
  const idleClass = "border-slate-200 bg-white text-slate-600 hover:border-primary/40 hover:bg-primary/5 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300";
  const quick = [
    { key: "today", label: "اليوم", href: "/daily-summary" },
    { key: "yesterday", label: "أمس", href: "/daily-summary?period=yesterday" },
    { key: "month", label: "هذا الشهر", href: "/daily-summary?period=month" },
  ] as const;

  return <section className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-950">
    <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
      <div>
        <div className="flex items-center gap-2"><CalendarRange className="h-5 w-5 text-primary" /><h2 className="text-sm font-black text-slate-900 dark:text-slate-100">الفترة الزمنية</h2></div>
        <p className="mt-1 text-[10px] font-bold text-slate-400">اختر يومًا، شهرًا، أو نطاقًا مخصصًا. النتائج تُحسب حسب توقيت المتجر.</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {quick.map((item) => {
            const active = item.key === "month"
              ? selection.period === "month" && selection.month === selection.currentMonth
              : selection.period === item.key;
            return <Link key={item.key} href={item.href} className={`rounded-xl border px-3 py-2 text-[11px] font-black transition ${active ? activeClass : idleClass}`}>{item.label}</Link>;
          })}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <form method="get" className="flex items-end gap-2 rounded-2xl border border-slate-100 p-3 dark:border-slate-800">
          <input type="hidden" name="period" value="day" />
          <label className="min-w-0 flex-1"><span className="mb-1 block text-[9px] font-black text-slate-400">يوم محدد</span><input type="date" name="date" defaultValue={selection.date} className="h-9 w-full rounded-lg border border-slate-200 bg-white px-2 text-[11px] font-bold dark:border-slate-700 dark:bg-slate-900" /></label>
          <Button type="submit" size="sm" variant="outline" className="h-9 rounded-lg px-3 text-[10px] font-black">عرض</Button>
        </form>

        <form method="get" className="flex items-end gap-2 rounded-2xl border border-slate-100 p-3 dark:border-slate-800">
          <input type="hidden" name="period" value="month" />
          <label className="min-w-0 flex-1"><span className="mb-1 block text-[9px] font-black text-slate-400">شهر محدد</span><input type="month" name="month" defaultValue={selection.month} className="h-9 w-full rounded-lg border border-slate-200 bg-white px-2 text-[11px] font-bold dark:border-slate-700 dark:bg-slate-900" /></label>
          <Button type="submit" size="sm" variant="outline" className="h-9 rounded-lg px-3 text-[10px] font-black">عرض</Button>
        </form>

        <details className={`rounded-2xl border p-3 ${selection.period === "custom" ? "border-primary/40 bg-primary/5" : "border-slate-100 dark:border-slate-800"}`} open={selection.period === "custom"}>
          <summary className="cursor-pointer text-[10px] font-black text-slate-600 dark:text-slate-300">فترة مخصصة: من — إلى</summary>
          <form method="get" className="mt-3 grid gap-2">
            <input type="hidden" name="period" value="custom" />
            <div className="grid grid-cols-2 gap-2"><label><span className="mb-1 block text-[8px] font-black text-slate-400">من</span><input type="date" name="from" defaultValue={selection.from} className="h-9 w-full rounded-lg border border-slate-200 bg-white px-2 text-[10px] font-bold dark:border-slate-700 dark:bg-slate-900" /></label><label><span className="mb-1 block text-[8px] font-black text-slate-400">إلى</span><input type="date" name="to" defaultValue={selection.to} className="h-9 w-full rounded-lg border border-slate-200 bg-white px-2 text-[10px] font-bold dark:border-slate-700 dark:bg-slate-900" /></label></div>
            <Button type="submit" size="sm" className="h-9 rounded-lg text-[10px] font-black">تطبيق الفترة</Button>
          </form>
        </details>
      </div>
    </div>
  </section>;
}

function SummaryMetric({ label, value, helper, icon: Icon, featured = false }: { label: string; value: string; helper: string; icon: typeof Banknote; featured?: boolean }) {
  return <div className={`rounded-2xl border p-4 shadow-sm ${featured ? "border-emerald-300 bg-emerald-50/60 ring-2 ring-emerald-500/10 dark:border-emerald-800 dark:bg-emerald-950/20" : "border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950"}`}><div className="flex items-start justify-between gap-3"><div><p className="text-[10px] font-black text-slate-500">{label}</p><p className="mt-2 font-numeric text-xl font-black text-slate-950 dark:text-white">{value}</p><p className="mt-1 text-[9px] font-bold text-slate-400">{helper}</p></div><span className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-100 text-slate-700 dark:bg-slate-900 dark:text-slate-300"><Icon className="h-4.5 w-4.5" /></span></div></div>;
}

function CollectionPanel({ sources, collected, outstanding, transferProfit, currency, periodLabel }: {
  sources: Array<{ key: string; label: string; amount: number; href: string | null; kind: string }>;
  collected: number;
  outstanding: number;
  transferProfit: number;
  currency: string;
  periodLabel: string;
}) {
  return <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-950">
    <div className="flex items-center gap-2"><CreditCard className="h-5 w-5 text-primary" /><div><h3 className="text-sm font-black text-slate-900 dark:text-slate-100">أين دخل المقبوض خلال {periodLabel}؟</h3><p className="mt-1 text-[9px] font-bold text-slate-400">تفصيل ديناميكي حسب الدرج والمحافظ ومصادر التحصيل المسجلة.</p></div></div>
    <div className="mt-4 rounded-xl bg-slate-50 px-3 py-3 dark:bg-slate-900"><div className="flex items-center justify-between gap-3"><span className="text-[11px] font-black text-slate-600 dark:text-slate-300">إجمالي المقبوض فعلياً</span><span className="font-numeric text-base font-black text-slate-950 dark:text-white">{formatCurrency(collected, currency)}</span></div></div>
    <div className="mt-3 space-y-2">{sources.length ? sources.map((source) => {
      const content = <><span className="text-[11px] font-bold text-slate-500 dark:text-slate-400">{source.label}</span><span className={`font-numeric text-sm font-black ${source.amount < 0 ? "text-rose-700 dark:text-rose-300" : "text-slate-900 dark:text-white"}`}>{formatCurrency(source.amount, currency)}</span></>;
      return source.href ? <Link key={source.key} href={source.href} className="flex items-center justify-between gap-3 rounded-xl border border-slate-100 px-3 py-2.5 transition hover:border-primary/30 hover:bg-primary/5 dark:border-slate-800 dark:hover:bg-slate-900">{content}</Link> : <div key={source.key} className="flex items-center justify-between gap-3 rounded-xl border border-slate-100 px-3 py-2.5 dark:border-slate-800">{content}</div>;
    }) : <p className="rounded-xl border border-dashed border-slate-200 p-3 text-center text-[10px] font-bold text-slate-400 dark:border-slate-800">لا توجد مقبوضات مسجلة ضمن الفترة.</p>}</div>
    <div className="mt-4 grid gap-2 border-t border-slate-100 pt-4 dark:border-slate-800">
      <div className="flex items-center justify-between gap-3"><span className="text-[10px] font-bold text-slate-500">المتبقي من أعمال الفترة</span><span className="font-numeric text-sm font-black text-amber-700 dark:text-amber-300">{formatCurrency(outstanding, currency)}</span></div>
      <div className="flex items-center justify-between gap-3"><span className="text-[10px] font-bold text-slate-500">ربح عمولات المحافظ</span><span className="font-numeric text-sm font-black text-emerald-700 dark:text-emerald-300">{formatCurrency(transferProfit, currency)}</span></div>
    </div>
    <p className="mt-3 text-[9px] font-bold leading-5 text-slate-400">المقبوض خلال الفترة هو حركة الأموال التي دخلت ضمن النطاق المحدد، وقد يشمل تحصيل فاتورة أو دين أو قسط أقدم. لذلك لا نخلطه مع إجمالي المبيعات عند وجود تحصيلات قديمة أو مبيعات آجلة.</p>
  </div>;
}

function MoneyPanel({ title, icon: Icon, rows, currency }: { title: string; icon: typeof WalletCards; rows: Array<[string, number]>; currency: string }) {
  return <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-950"><div className="flex items-center gap-2"><Icon className="h-5 w-5 text-primary" /><h3 className="text-sm font-black text-slate-900 dark:text-slate-100">{title}</h3></div><div className="mt-4 space-y-2">{rows.map(([label, value]) => <div key={label} className="flex items-center justify-between gap-3 rounded-xl bg-slate-50 px-3 py-2.5 dark:bg-slate-900"><span className="text-[11px] font-bold text-slate-500">{label}</span><span className="font-numeric text-sm font-black text-slate-900 dark:text-white">{formatCurrency(value, currency)}</span></div>)}</div></div>;
}

function MiniValue({ label, value, helper }: { label: string; value: string; helper?: string }) {
  return <div className="rounded-xl bg-slate-50 p-3 dark:bg-slate-900"><p className="text-[9px] font-black text-slate-400">{label}</p><p className="mt-1 font-numeric text-sm font-black text-slate-900 dark:text-white">{value}</p>{helper ? <p className="mt-1 text-[9px] font-bold text-slate-400">{helper}</p> : null}</div>;
}

function DebtCard({ label, value, currency, href, helper }: { label: string; value: number; currency: string; href: string; helper: string }) {
  return <Link href={href} className="rounded-2xl border border-slate-200 p-4 transition hover:border-primary/40 hover:bg-primary/5 dark:border-slate-800 dark:hover:bg-slate-900"><p className="text-[10px] font-black text-slate-500">{label}</p><p className="mt-2 font-numeric text-lg font-black text-slate-950 dark:text-white">{formatCurrency(value, currency)}</p><p className="mt-1 text-[9px] font-bold leading-5 text-slate-400">{helper}</p></Link>;
}

function SmallStat({ label, value }: { label: string; value: string }) {
  return <div><p className="text-[8px] font-black text-slate-400">{label}</p><p className="mt-1 font-numeric text-[11px] font-black text-slate-800 dark:text-slate-200">{value}</p></div>;
}
