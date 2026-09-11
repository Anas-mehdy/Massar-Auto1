import Link from "next/link";
import { AlertTriangle, CarFront, Clock3, Gauge, PackageCheck, TrendingUp, UserRoundCog, Wrench } from "lucide-react";
import { formatCurrency, formatDate } from "@/lib/format";
import {
  SERVICE_ORDER_STATUS_CLASSES,
  SERVICE_ORDER_STATUS_LABELS,
} from "@/lib/auto/service-order-ui";
import type { ServiceOrderStatus } from "@/lib/services/autoServiceOrderService";
import type { AutoOperationalReport } from "@/lib/services/autoOperationalReportService";

function formatDuration(hours: number) {
  if (!hours || hours <= 0) return "-";
  if (hours < 24) return `${hours.toFixed(hours < 10 ? 1 : 0)} ساعة`;
  const days = Math.floor(hours / 24);
  const remaining = Math.round(hours % 24);
  return remaining ? `${days} يوم و${remaining} س` : `${days} يوم`;
}

export function AutoWorkshopReport({
  report,
  currency,
  timeZone,
}: {
  report: AutoOperationalReport;
  currency: string;
  timeZone: string;
}) {
  const { period, current } = report;
  const totalGrossProfit = period.laborProfit + period.partsProfit;

  return (
    <section className="space-y-5 rounded-3xl border border-teal-200 bg-gradient-to-br from-teal-50/80 via-white to-cyan-50/60 p-4 shadow-sm sm:p-5 dark:border-teal-900/60 dark:from-slate-950 dark:via-slate-950 dark:to-teal-950/20">
      <div className="flex flex-col gap-3 border-b border-teal-100 pb-4 sm:flex-row sm:items-start sm:justify-between dark:border-teal-900/50">
        <div>
          <p className="text-[10px] font-black text-teal-700 dark:text-teal-300">تشغيل مركز صيانة السيارات</p>
          <h2 className="mt-1 flex items-center gap-2 text-lg font-black text-slate-950 dark:text-slate-100"><CarFront className="h-5 w-5 text-teal-700" />تقرير الورشة المتخصص</h2>
          <p className="mt-1 max-w-3xl text-[11px] font-bold leading-6 text-slate-500">مؤشرات الفترة المختارة في الأعلى، مع لقطة حية للأوامر المفتوحة والمتأخرة حاليًا حتى لا تختفي مشكلة تشغيلية عند تغيير الفترة.</p>
        </div>
        <div className={`rounded-2xl border px-4 py-3 ${totalGrossProfit >= 0 ? "border-emerald-200 bg-emerald-50" : "border-rose-200 bg-rose-50"}`}>
          <div className="text-[9px] font-black text-slate-500">مجمل ربح صيانة السيارات</div>
          <div className={`mt-1 font-numeric text-lg font-black ${totalGrossProfit >= 0 ? "text-emerald-700" : "text-rose-700"}`}>{formatCurrency(totalGrossProfit, currency)}</div>
          <div className="mt-1 text-[9px] font-bold text-slate-400">قبل المصروفات العامة</div>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <Kpi icon={<CarFront className="h-4 w-4" />} label="استلام خلال الفترة" value={`${period.receivedOrders}`} helper={`${period.deliveredOrders} تم تسليمها`} />
        <Kpi icon={<Clock3 className="h-4 w-4" />} label="متوسط مدة الصيانة" value={formatDuration(period.averageTurnaroundHours)} helper="من الاستلام حتى التسليم" />
        <Kpi icon={<Wrench className="h-4 w-4" />} label="فواتير صيانة" value={`${period.invoicedOrders}`} helper={formatCurrency(period.serviceRevenueBeforeTax, currency)} />
        <Kpi icon={<AlertTriangle className="h-4 w-4" />} label="متأخرة الآن" value={`${current.overdueOrders}`} helper="تجاوزت موعد التسليم المتوقع" tone={current.overdueOrders > 0 ? "danger" : "default"} />
        <Kpi icon={<PackageCheck className="h-4 w-4" />} label="بانتظار قطع" value={`${current.waitingParts}`} helper={`${current.readyForDelivery} جاهزة للتسليم`} />
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <ProfitCard
          title="أجور العمل"
          revenue={period.laborRevenue}
          cost={period.laborCost}
          profit={period.laborProfit}
          currency={currency}
          helper="يتم توزيع خصم الفاتورة نسبيًا بين الأجور والقطع. الضريبة غير محسوبة كإيراد."
        />
        <ProfitCard
          title="قطع الغيار"
          revenue={period.partsRevenue}
          cost={period.partsCost}
          profit={period.partsProfit}
          currency={currency}
          helper="التكلفة تشمل صافي قطع المخزون بعد المرتجعات + تكلفة القطع اليدوية."
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.15fr_.85fr]">
        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950/70">
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3 dark:border-slate-800">
            <div><h3 className="flex items-center gap-2 text-sm font-black text-slate-900 dark:text-slate-100"><UserRoundCog className="h-4 w-4 text-indigo-600" />إنتاجية الفنيين</h3><p className="mt-1 text-[10px] font-bold text-slate-400">بحسب الفني المسؤول عن أمر الصيانة؛ الأوامر المسلّمة ضمن الفترة.</p></div>
          </div>
          {report.technicians.length ? (
            <div className="overflow-x-auto">
              <table className="min-w-[650px] w-full text-xs">
                <thead className="bg-slate-50 text-[10px] font-black text-slate-500 dark:bg-slate-900"><tr><th className="px-4 py-3 text-right">الفني</th><th className="px-3 py-3">مسلّمة</th><th className="px-3 py-3">جارية الآن</th><th className="px-3 py-3">بنود عمل</th><th className="px-3 py-3">ساعات</th><th className="px-4 py-3 text-left">قيمة العمل</th></tr></thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {report.technicians.map((tech) => <tr key={tech.userId}><td className="px-4 py-3 font-black text-slate-800 dark:text-slate-200">{tech.name}</td><td className="px-3 py-3 text-center font-numeric font-black">{tech.completedOrders}</td><td className="px-3 py-3 text-center font-numeric font-black text-amber-700">{tech.activeOrders}</td><td className="px-3 py-3 text-center font-numeric">{tech.laborLineCount}</td><td className="px-3 py-3 text-center font-numeric">{tech.laborHours.toFixed(1)}</td><td className="px-4 py-3 text-left font-numeric font-black">{formatCurrency(tech.laborValue, currency)}</td></tr>)}
                </tbody>
              </table>
            </div>
          ) : <Empty text="لا توجد بيانات فنيين مرتبطة بأوامر مسلّمة في هذه الفترة." />}
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-950/70">
          <h3 className="flex items-center gap-2 text-sm font-black text-slate-900 dark:text-slate-100"><Gauge className="h-4 w-4 text-teal-600" />الوضع الحالي للأوامر</h3>
          <p className="mt-1 text-[10px] font-bold text-slate-400">{current.activeOrders} أمر غير مغلق حاليًا، بما فيها المسلّمة بانتظار الإغلاق الإداري.</p>
          <div className="mt-4 flex flex-wrap gap-2">
            {current.byStatus.length ? current.byStatus.map((item) => {
              const status = item.status as ServiceOrderStatus;
              return <Link key={item.status} href={`/service-orders?status=${encodeURIComponent(item.status)}`} className={`rounded-full border px-3 py-1.5 text-[10px] font-black transition hover:opacity-80 ${SERVICE_ORDER_STATUS_CLASSES[status] ?? "border-slate-200 bg-slate-50 text-slate-700"}`}>{SERVICE_ORDER_STATUS_LABELS[status] ?? item.status} • {item.count}</Link>;
            }) : <span className="text-xs font-bold text-slate-400">لا توجد أوامر مفتوحة.</span>}
          </div>
        </section>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <RankCard title="أكثر الخدمات تنفيذًا" subtitle="بنود أجور العمل المفوترة خلال الفترة" icon={<TrendingUp className="h-4 w-4 text-emerald-600" />} empty="لا توجد خدمات مفوترة ضمن الفترة.">
          {report.topServices.map((item, index) => <div key={`${item.description}-${index}`} className="grid grid-cols-[auto_1fr_auto] items-center gap-3 border-b border-slate-100 py-3 last:border-0 dark:border-slate-800"><span className="flex h-7 w-7 items-center justify-center rounded-lg bg-slate-100 text-[10px] font-black text-slate-600 dark:bg-slate-900">{index + 1}</span><div className="min-w-0"><div className="truncate text-xs font-black text-slate-800 dark:text-slate-200">{item.description}</div><div className="mt-1 text-[9px] font-bold text-slate-400">{item.lineCount} بند • كمية {item.quantity.toLocaleString("ar")}</div></div><div className="font-numeric text-[11px] font-black text-emerald-700">{formatCurrency(item.revenue, currency)}</div></div>)}
        </RankCard>

        <RankCard title="أكثر الأعطال / الشكاوى" subtitle="بحسب نص شكوى الاستقبال للأوامر الداخلة خلال الفترة" icon={<AlertTriangle className="h-4 w-4 text-amber-600" />} empty="لا توجد شكاوى مسجلة ضمن الفترة.">
          {report.topIssues.map((item, index) => <div key={`${item.issue}-${index}`} className="grid grid-cols-[auto_1fr_auto] items-start gap-3 border-b border-slate-100 py-3 last:border-0 dark:border-slate-800"><span className="flex h-7 w-7 items-center justify-center rounded-lg bg-slate-100 text-[10px] font-black text-slate-600 dark:bg-slate-900">{index + 1}</span><div className="text-xs font-bold leading-6 text-slate-700 dark:text-slate-300">{item.issue}</div><span className="rounded-full bg-amber-50 px-2.5 py-1 text-[10px] font-black text-amber-700">{item.count} مرة</span></div>)}
        </RankCard>
      </div>

      <section className="overflow-hidden rounded-2xl border border-rose-200 bg-white dark:border-rose-900/60 dark:bg-slate-950/70">
        <div className="flex items-center justify-between gap-3 border-b border-rose-100 bg-rose-50/60 px-4 py-3 dark:border-rose-900/40 dark:bg-rose-950/20">
          <div><h3 className="flex items-center gap-2 text-sm font-black text-rose-900 dark:text-rose-200"><AlertTriangle className="h-4 w-4" />الأوامر المتأخرة عن الموعد</h3><p className="mt-1 text-[10px] font-bold text-rose-700/70 dark:text-rose-300/70">نعرض أقدم 20 أمرًا؛ العداد أعلاه يعرض العدد الحقيقي الكامل.</p></div>
          <span className="rounded-full bg-white px-3 py-1 text-xs font-black text-rose-700 shadow-sm dark:bg-slate-900">{current.overdueOrders}</span>
        </div>
        {report.overdueOrders.length ? (
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {report.overdueOrders.map((order) => <Link key={order.id} href={`/service-orders/${order.id}`} className="grid gap-2 px-4 py-3 transition hover:bg-rose-50/40 sm:grid-cols-[1fr_auto] sm:items-center dark:hover:bg-rose-950/10"><div><div className="flex flex-wrap items-center gap-2"><span className="font-black text-slate-900 dark:text-slate-100">{order.orderNumber}</span><span className="text-[10px] font-bold text-slate-500">{order.vehicleMake} {order.vehicleModel}{order.plateNumber ? ` • ${order.plateNumber}` : ""}</span></div><div className="mt-1 text-[10px] font-bold text-slate-400">{order.customerName}{order.assignedTechnicianName ? ` • الفني: ${order.assignedTechnicianName}` : ""}</div></div><div className="text-left"><div className="text-[9px] font-black text-rose-500">موعد التسليم</div><div className="mt-1 text-[10px] font-black text-rose-800 dark:text-rose-200">{formatDate(order.promisedAt, timeZone)}</div></div></Link>)}
          </div>
        ) : <Empty text="لا توجد أوامر متأخرة حاليًا." />}
      </section>
    </section>
  );
}

function Kpi({ icon, label, value, helper, tone = "default" }: { icon: React.ReactNode; label: string; value: string; helper: string; tone?: "default" | "danger" }) {
  return <div className={`rounded-2xl border p-4 ${tone === "danger" ? "border-rose-200 bg-rose-50" : "border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950/70"}`}><div className={`flex items-center gap-2 text-[10px] font-black ${tone === "danger" ? "text-rose-700" : "text-slate-500"}`}>{icon}{label}</div><div className="mt-2 font-numeric text-xl font-black text-slate-950 dark:text-slate-100">{value}</div><div className="mt-1 text-[9px] font-bold text-slate-400">{helper}</div></div>;
}

function ProfitCard({ title, revenue, cost, profit, currency, helper }: { title: string; revenue: number; cost: number; profit: number; currency: string; helper: string }) {
  const margin = revenue > 0 ? (profit / revenue) * 100 : 0;
  return <section className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-950/70"><div className="flex items-center justify-between gap-3"><div><h3 className="text-sm font-black text-slate-900 dark:text-slate-100">{title}</h3><p className="mt-1 text-[9px] font-bold leading-5 text-slate-400">{helper}</p></div><span className={`rounded-full px-2.5 py-1 text-[10px] font-black ${profit >= 0 ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"}`}>هامش {margin.toFixed(1)}%</span></div><div className="mt-4 grid grid-cols-3 gap-2"><MiniMoney label="الإيراد" value={revenue} currency={currency} /><MiniMoney label="التكلفة" value={cost} currency={currency} /><MiniMoney label="الربح" value={profit} currency={currency} emphasized={profit >= 0} /></div></section>;
}

function MiniMoney({ label, value, currency, emphasized = false }: { label: string; value: number; currency: string; emphasized?: boolean }) {
  return <div className="rounded-xl bg-slate-50 p-3 dark:bg-slate-900"><div className="text-[9px] font-black text-slate-400">{label}</div><div className={`mt-1 font-numeric text-xs font-black ${emphasized ? "text-emerald-700 dark:text-emerald-300" : "text-slate-800 dark:text-slate-200"}`}>{formatCurrency(value, currency)}</div></div>;
}

function RankCard({ title, subtitle, icon, empty, children }: { title: string; subtitle: string; icon: React.ReactNode; empty: string; children: React.ReactNode }) {
  const hasChildren = Array.isArray(children) ? children.length > 0 : Boolean(children);
  return <section className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-950/70"><div><h3 className="flex items-center gap-2 text-sm font-black text-slate-900 dark:text-slate-100">{icon}{title}</h3><p className="mt-1 text-[10px] font-bold text-slate-400">{subtitle}</p></div><div className="mt-3">{hasChildren ? children : <Empty text={empty} />}</div></section>;
}

function Empty({ text }: { text: string }) {
  return <div className="p-6 text-center text-xs font-bold text-slate-400">{text}</div>;
}
