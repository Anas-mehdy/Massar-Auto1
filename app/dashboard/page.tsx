import {
  AlertTriangle,
  ArrowRightLeft,
  Boxes,
  CheckCircle2,
  Clock,
  Code2,
  Crown,
  FileText,
  Plus,
  Receipt,
  ShoppingCart,
  Sparkles,
  WalletCards,
  Wrench,
} from "lucide-react";
import { SubscriptionStatus } from "@prisma/client";
import Image from "next/image";
import Link from "next/link";
import { DatabaseUnavailable } from "@/components/database-unavailable";
import { Button } from "@/components/ui/button";
import {
  DashboardActivityCard,
  DashboardActivityItem,
  DashboardAttentionCard,
  DashboardEmptyActivity,
  DashboardQuickAction,
  DashboardSection,
  DashboardStatCard,
  type DashboardTone,
} from "@/components/dashboard/masar-dashboard-ui";
import { MasarJourney } from "@/components/dashboard/masar-journey";
import { MasarWaveBackground } from "@/components/dashboard/masar-wave-background";
import { DomainAnnouncement } from "@/components/dashboard/domain-announcement";
import { ActivationChecklist } from "@/components/onboarding/activation-checklist";
import { ContextualFeatureDiscovery } from "@/components/onboarding/contextual-feature-discovery";
import { MonetizationPrompt } from "@/components/onboarding/monetization-prompt";
import { getCurrentShopContext } from "@/lib/current-shop";
import { isDatabaseConnectionError } from "@/lib/database-errors";
import { formatCurrency, formatDate } from "@/lib/format";
import { dashboardService } from "@/lib/services/dashboardService";
import { subscriptionService, type SubscriptionOverview } from "@/lib/services/subscriptionService";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  let metrics: Awaited<ReturnType<typeof dashboardService.getDashboardMetrics>>;
  let activity: Awaited<ReturnType<typeof dashboardService.getRecentActivity>>;
  let shopContext: Awaited<ReturnType<typeof getCurrentShopContext>>;
  let subscriptionOverview: SubscriptionOverview | null = null;

  try {
    shopContext = await getCurrentShopContext();
    const { shopId } = shopContext;
    [metrics, activity, subscriptionOverview] = await Promise.all([
      dashboardService.getDashboardMetrics(shopId),
      dashboardService.getRecentActivity(shopId),
      shopContext.membershipRole === "OWNER"
        ? subscriptionService.getSubscriptionOverview(shopId).catch(() => null)
        : Promise.resolve(null),
    ]);
  } catch (error) {
    if (isDatabaseConnectionError(error)) return <DatabaseUnavailable />;
    throw error;
  }

  const currency = shopContext.currency || "SAR";
  const todayStr = new Intl.DateTimeFormat("ar-EG", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: shopContext.timeZone,
  }).format(new Date());

  const metricCards: Array<{
    label: string;
    helper: string;
    value: string | number;
    icon: typeof Wrench;
    href: string;
    tone: DashboardTone;
  }> = [
    { label: "طلبات صيانة مفتوحة", helper: "أجهزة قيد العمل بالورشة", value: metrics.openRepairOrdersCount, icon: Wrench, href: "/repair-orders", tone: "brand" },
    { label: "جاهزة للتسليم", helper: "تم إنجازها وبانتظار العميل", value: metrics.readyForDeliveryCount, icon: CheckCircle2, href: "/repair-orders", tone: "success" },
    { label: "طلبات استلمت اليوم", helper: "تذاكر صيانة جديدة مسجلة", value: metrics.repairOrdersCreatedToday, icon: Plus, href: "/repair-orders", tone: "info" },
    { label: "طلبات سلمت اليوم", helper: "أجهزة استلمها أصحابها", value: metrics.deliveredToday, icon: CheckCircle2, href: "/repair-orders", tone: "support" },
    { label: "مبيعات اليوم", helper: "إيرادات نقاط البيع والقطع", value: formatCurrency(metrics.salesRevenueToday, currency), icon: ShoppingCart, href: "/sales", tone: "warning" },
    { label: "مبيعات السوفتوير اليوم", helper: "خدمات سوفتوير مسجلة اليوم", value: formatCurrency(metrics.softwareSalesToday, currency), icon: Code2, href: "/software-services", tone: "support" },
    { label: "فواتير غير مكتملة", helper: "فواتير بانتظار التحصيل", value: metrics.unpaidInvoicesCount, icon: FileText, href: "/invoices", tone: "warning" },
    { label: "مبالغ مستحقة", helper: "أرصدة متبقية للتحصيل", value: formatCurrency(metrics.unpaidBalanceTotal, currency), icon: Receipt, href: "/invoices", tone: "danger" },
    { label: "إجمالي الديون", helper: "أرصدة العملاء في دفتر الديون", value: formatCurrency(metrics.totalDebtOutstanding, currency), icon: WalletCards, href: "/debts", tone: "warning" },
    { label: "تنبيهات المخزون", helper: "قطع قاربت على النفاد", value: metrics.lowStockItemsCount, icon: Boxes, href: "/inventory?lowStockOnly=true", tone: "danger" },
  ];

  const hasAttentionItems = metrics.readyForDeliveryCount > 0 || metrics.lowStockItemsCount > 0 || metrics.unpaidInvoicesCount > 0;

  return (
    <div className="masar-page">
      <DomainAnnouncement />

      <ActivationChecklist />

      <ContextualFeatureDiscovery shopId={shopContext.shopId} membershipRole={shopContext.membershipRole} />

      <MonetizationPrompt />

      {subscriptionOverview?.effectiveStatus === SubscriptionStatus.TRIALING ? (
        <section className="masar-surface-brand flex flex-col gap-4 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-teal-600 to-cyan-600 text-white shadow-md shadow-teal-600/15"><Crown className="h-5 w-5" /></span>
            <div>
              <p className="text-[17px] font-black text-slate-900">تجربتك الاحترافية فعّالة</p>
              <p className="mt-1 text-[14px] font-semibold text-slate-600">بقي {subscriptionOverview.remainingDays} يوم و{subscriptionOverview.remainingHours} ساعة — جميع مزايا مسار متاحة لك الآن.</p>
            </div>
          </div>
          <Button asChild variant="outline" className="h-10 rounded-xl border-teal-200 bg-white px-4 text-[14px] font-black text-teal-700 hover:bg-teal-50"><Link href="/support">التواصل مع الدعم</Link></Button>
        </section>
      ) : null}

      <section className="relative overflow-hidden rounded-[26px] border border-teal-100/80 bg-gradient-to-br from-teal-50 via-white to-cyan-50/70 p-5 shadow-[0_22px_70px_-46px_rgba(13,148,136,0.52)] sm:p-7">
        <MasarWaveBackground />
        <div className="relative flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap items-center gap-2 text-[14px] font-semibold text-slate-500">
            <span className="masar-badge masar-badge-brand"><Sparkles className="h-3.5 w-3.5" />{shopContext.shopName}</span>
            <span>أهلاً بك، <strong className="font-black text-slate-700">{shopContext.userName}</strong></span>
            <span className="inline-flex items-center gap-1.5 font-numeric text-slate-400"><Clock className="h-3.5 w-3.5" />{todayStr}</span>
          </div>
          <div className="flex flex-wrap gap-2.5">
            <Link href="/repair-orders/new" className="masar-btn-primary"><Plus className="h-4.5 w-4.5" />طلب صيانة جديد</Link>
            <Link href="/sales/new" className="masar-btn-secondary"><ShoppingCart className="h-4.5 w-4.5" />عملية بيع POS جديدة</Link>
          </div>
        </div>

        <div className="relative mt-6 text-center">
          <div className="mx-auto flex justify-center"><Image src="/masar-logo.png" alt="مسار" width={220} height={198} priority className="h-24 w-auto object-contain drop-shadow-sm transition-transform duration-300 hover:scale-105 sm:h-28" /></div>
          <p className="mt-2 text-[16px] font-black text-teal-700">رحلة الجهاز من الاستلام حتى التسليم</p>
        </div>
        <MasarJourney />
        <p className="relative mt-5 text-center text-[14px] font-semibold text-slate-400">من أول خطوة... حتى يعود الجهاز لصاحبه</p>
      </section>

      <section className="dashboard-pos-launch-wrap" aria-label="اختصار نقطة البيع">
        <Link href="/point-of-sale" className="dashboard-pos-launch-card">
          <span className="dashboard-pos-launch-card__content">
            <span className="dashboard-pos-launch-card__icon"><ShoppingCart className="h-6 w-6" /></span>
            <span className="dashboard-pos-launch-card__copy">
              <span className="dashboard-pos-launch-card__eyebrow"><Sparkles className="h-3.5 w-3.5" /> مركز العمليات اليومية</span>
              <strong>نقطة البيع</strong>
              <span>بيع مباشر، صيانة، سوفتوير، خدمات إلكترونية ومحافظ — من مكان واحد.</span>
            </span>
            <span className="dashboard-pos-launch-card__action">فتح نقطة البيع<ArrowRightLeft className="h-4 w-4" /></span>
          </span>
        </Link>
      </section>

      <section>
        <div className="mb-4 flex items-end justify-between gap-3">
          <div><h2 className="masar-section-title">نظرة سريعة على عملك</h2><p className="masar-section-description">أهم مؤشرات الورشة اليوم والحالات التي تحتاج متابعة.</p></div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-5">{metricCards.map((card) => <DashboardStatCard key={card.label} {...card} />)}</div>
      </section>

      {hasAttentionItems ? (
        <DashboardSection title="يحتاج انتباهك اليوم" description="حالات تستحق المتابعة قبل نهاية يوم العمل." icon={AlertTriangle}>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {metrics.readyForDeliveryCount > 0 ? <DashboardAttentionCard title="أجهزة جاهزة للتسليم" tone="success" href="/repair-orders" action="عرض الأجهزة الجاهزة" description={<>يوجد <strong className="font-numeric font-black text-slate-900">{metrics.readyForDeliveryCount}</strong> جهاز مكتمل الصيانة بانتظار التواصل مع العميل والتسليم.</>} /> : null}
            {metrics.lowStockItemsCount > 0 ? <DashboardAttentionCard title="نقص في المخزون" tone="danger" href="/inventory?lowStockOnly=true" action="مراجعة المخزون" description={<>يوجد <strong className="font-numeric font-black text-slate-900">{metrics.lowStockItemsCount}</strong> قطع بلغت أو تخطت حد إعادة الطلب.</>} /> : null}
            {metrics.unpaidInvoicesCount > 0 ? <DashboardAttentionCard title="مستحقات غير محصلة" tone="warning" href="/invoices" action="متابعة التحصيل" description={<>توجد <strong className="font-numeric font-black text-slate-900">{metrics.unpaidInvoicesCount}</strong> فواتير معلقة بإجمالي <strong className="font-numeric font-black text-slate-900">{formatCurrency(metrics.unpaidBalanceTotal, currency)}</strong>.</>} /> : null}
          </div>
        </DashboardSection>
      ) : null}

      <section className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="grid gap-5 md:grid-cols-2 2xl:grid-cols-3">
          <DashboardActivityCard title="آخر تذاكر صيانة" icon={Wrench}>
            {activity.repairOrders.length === 0 ? <DashboardEmptyActivity href="/repair-orders/new" label="طلب صيانة جديد" /> : activity.repairOrders.map((repairOrder) => (
              <DashboardActivityItem key={repairOrder.id} href={`/repair-orders/${repairOrder.id}`} title={repairOrder.ticketNumber} description={`${repairOrder.customer?.name ?? "عميل سريع"} - ${repairOrder.deviceBrand ?? ""} ${repairOrder.deviceModel ?? ""}`} meta={formatDate(repairOrder.createdAt, shopContext.timeZone)} />
            ))}
          </DashboardActivityCard>

          <DashboardActivityCard title="آخر عمليات البيع" icon={ShoppingCart}>
            {activity.sales.length === 0 ? <DashboardEmptyActivity href="/sales/new" label="عملية بيع جديدة" /> : activity.sales.map((sale) => (
              <DashboardActivityItem key={sale.id} href={`/sales/${sale.id}`} title={sale.receiptNumber ?? "إيصال بيع"} description={`${sale.customer?.name ?? "عميل نقدي"} - إجمالي: ${formatCurrency(sale.total, currency)}`} meta={formatDate(sale.soldAt, shopContext.timeZone)} />
            ))}
          </DashboardActivityCard>

          <DashboardActivityCard title="آخر الفواتير" icon={FileText}>
            {activity.invoices.length === 0 ? <DashboardEmptyActivity href="/invoices" label="عرض الفواتير" /> : activity.invoices.map((invoice) => (
              <DashboardActivityItem key={invoice.id} href={`/invoices/${invoice.id}`} title={invoice.invoiceNumber} description={`${invoice.customer?.name ?? "عميل سريع"} - متبقي: ${formatCurrency(invoice.balanceDue, currency)}`} meta={formatDate(invoice.issuedAt, shopContext.timeZone)} />
            ))}
          </DashboardActivityCard>
        </div>

        <DashboardSection title="إجراءات سريعة" description="أكثر العمليات استخداماً في يوم العمل." icon={ArrowRightLeft} className="h-fit xl:sticky xl:top-24">
          <div className="space-y-2.5">
            <DashboardQuickAction href="/repair-orders/new" title="فتح تذكرة صيانة" description="تسجيل واستلام جهاز جديد" icon={Wrench} tone="brand" />
            <DashboardQuickAction href="/sales/new" title="تسجيل عملية POS" description="بيع مباشر لقطع وإكسسوارات" icon={ShoppingCart} tone="warning" />
            <DashboardQuickAction href="/software-services/new" title="بيع خدمة سوفتوير" description="تفليش، تحديث وخدمات رقمية" icon={Code2} tone="support" />
            <DashboardQuickAction href="/inventory/new" title="إضافة للمستودع" description="إدخال صنف أو قطعة جديدة" icon={Boxes} tone="info" />
            <DashboardQuickAction href="/invoices" title="مراجعة المقبوضات" description="متابعة الفواتير المعلقة" icon={Receipt} tone="danger" />
            <DashboardQuickAction href="/customers" title="سجل العملاء" description="مراجعة حسابات وبيانات العملاء" icon={CheckCircle2} tone="neutral" />
          </div>
        </DashboardSection>
      </section>
    </div>
  );
}
