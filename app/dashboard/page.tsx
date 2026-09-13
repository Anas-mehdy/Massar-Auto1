import {
  AlertTriangle,
  ArrowRightLeft,
  Banknote,
  Boxes,
  CheckCircle2,
  CircleDollarSign,
  Clock,
  Code2,
  Crown,
  FileText,
  Plus,
  Receipt,
  ShoppingCart,
  Sparkles,
  TrendingDown,
  TrendingUp,
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
import { dailySummaryService } from "@/lib/services/dailySummaryService";
import { dashboardService } from "@/lib/services/dashboardService";
import { subscriptionService, type SubscriptionOverview } from "@/lib/services/subscriptionService";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  let metrics: Awaited<ReturnType<typeof dashboardService.getDashboardMetrics>>;
  let activity: Awaited<ReturnType<typeof dashboardService.getRecentActivity>>;
  let shopContext: Awaited<ReturnType<typeof getCurrentShopContext>>;
  let subscriptionOverview: SubscriptionOverview | null = null;
  let dailySummary: Awaited<ReturnType<typeof dailySummaryService.getDailySummaryHeadline>> | null = null;

  try {
    shopContext = await getCurrentShopContext();
    const { shopId, permissions } = shopContext;
    const canReadReports = permissions.includes("reports:read");
    [metrics, activity, subscriptionOverview, dailySummary] = await Promise.all([
      dashboardService.getDashboardMetrics(shopId, permissions),
      dashboardService.getRecentActivity(shopId, permissions),
      shopContext.membershipRole === "OWNER"
        ? subscriptionService.getSubscriptionOverview(shopId).catch(() => null)
        : Promise.resolve(null),
      canReadReports
        ? dailySummaryService.getDailySummaryHeadline(shopId).catch(() => null)
        : Promise.resolve(null),
    ]);
  } catch (error) {
    if (isDatabaseConnectionError(error)) return <DatabaseUnavailable />;
    throw error;
  }

  const { permissions } = shopContext;
  const canReadServiceOrders = permissions.includes("service_orders:read");
  const canCreateServiceOrders = permissions.includes("service_orders:create");
  const canReadInventory = permissions.includes("inventory:read");
  const canManageInventory = permissions.includes("inventory:manage");
  const canReadSales = permissions.includes("sales:read");
  const canCreateSales = permissions.includes("sales:create");
  const canReadInvoices = permissions.includes("invoices:read");
  const canReadCustomers = permissions.includes("customers:read");
  const canExecuteElectronicServices = permissions.includes("electronic_services:execute");
  const canUsePointOfSale = canCreateSales || canCreateServiceOrders || canExecuteElectronicServices || permissions.includes("finance:vouchers");
  const hasActivity = canReadServiceOrders || canReadSales || canReadInvoices;
  const hasQuickActions = canCreateServiceOrders || canCreateSales || canManageInventory || canReadInvoices || canReadCustomers;

  const currency = shopContext.currency || "SAR";
  const todayStr = new Intl.DateTimeFormat("ar-EG", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: shopContext.timeZone,
  }).format(new Date());

  const financialCards: Array<{
    label: string;
    helper: string;
    value: string | number;
    icon: typeof Wrench;
    href: string;
    tone: DashboardTone;
  }> = dailySummary ? [
    { label: "إجمالي مبيعات اليوم", helper: "كل قنوات البيع المحققة اليوم", value: formatCurrency(dailySummary.totals.sales, currency), icon: ShoppingCart, href: "/daily-summary", tone: "brand" },
    { label: "المقبوض فعلياً اليوم", helper: "الأموال التي تم تحصيلها فعلياً", value: formatCurrency(dailySummary.totals.collected, currency), icon: Banknote, href: "/daily-summary", tone: "success" },
    { label: "مجمل ربح اليوم", helper: "بعد التكاليف + عمولات التحويلات", value: formatCurrency(dailySummary.totals.grossProfit, currency), icon: TrendingUp, href: "/daily-summary", tone: dailySummary.totals.grossProfit >= 0 ? "info" : "danger" },
    { label: "مصروفات اليوم", helper: "كل المصروفات المسجلة اليوم", value: formatCurrency(dailySummary.totals.expenses, currency), icon: TrendingDown, href: "/daily-summary", tone: "warning" },
    { label: "صافي ربح اليوم", helper: "مجمل الربح بعد خصم المصروفات", value: formatCurrency(dailySummary.totals.netProfit, currency), icon: CircleDollarSign, href: "/daily-summary", tone: dailySummary.totals.netProfit >= 0 ? "success" : "danger" },
  ] : [];

  const metricCards: Array<{
    label: string;
    helper: string;
    value: string | number;
    icon: typeof Wrench;
    href: string;
    tone: DashboardTone;
  }> = [];

  if (canReadServiceOrders) {
    metricCards.push(
      { label: "أوامر صيانة مفتوحة", helper: "مركبات قيد الفحص أو الصيانة", value: metrics.openServiceOrdersCount, icon: Wrench, href: "/service-orders", tone: "brand" },
      { label: "جاهزة للتسليم", helper: "مركبات مكتملة وبانتظار العميل", value: metrics.readyForDeliveryCount, icon: CheckCircle2, href: "/service-orders?status=READY_FOR_DELIVERY", tone: "success" },
      { label: "استُقبلت اليوم", helper: "أوامر صيانة جديدة مسجلة اليوم", value: metrics.serviceOrdersCreatedToday, icon: Plus, href: "/service-orders", tone: "info" },
      { label: "سُلّمت اليوم", helper: "مركبات تم تسليمها لأصحابها", value: metrics.deliveredToday, icon: CheckCircle2, href: "/service-orders?status=DELIVERED", tone: "support" },
    );
  }
  if (canReadInventory) {
    metricCards.push({ label: "تنبيهات المخزون", helper: "قطع قاربت على النفاد", value: metrics.lowStockItemsCount, icon: Boxes, href: "/inventory?lowStockOnly=true", tone: "danger" });
  }

  const hasAttentionItems =
    (canReadServiceOrders && metrics.readyForDeliveryCount > 0) ||
    (canReadInventory && metrics.lowStockItemsCount > 0) ||
    (canReadInvoices && metrics.unpaidInvoicesCount > 0);

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
          {(canCreateServiceOrders || canCreateSales) ? (
            <div className="flex flex-wrap gap-2.5">
              {canCreateServiceOrders ? <Link href="/service-orders/new" className="masar-btn-primary"><Plus className="h-4.5 w-4.5" />أمر صيانة جديد</Link> : null}
              {canCreateSales ? <Link href="/point-of-sale?tab=sale" className="masar-btn-secondary"><ShoppingCart className="h-4.5 w-4.5" />عملية بيع POS جديدة</Link> : null}
            </div>
          ) : null}
        </div>

        <div className="relative mt-6 text-center">
          <div className="mx-auto flex justify-center"><Image src="/masar-logo.png" alt="مسار" width={220} height={198} priority className="h-24 w-auto object-contain drop-shadow-sm transition-transform duration-300 hover:scale-105 sm:h-28" /></div>
          <p className="mt-2 text-[16px] font-black text-teal-700">رحلة المركبة من الاستقبال حتى التسليم</p>
        </div>
        <MasarJourney />
        <p className="relative mt-5 text-center text-[14px] font-semibold text-slate-400">من أول خطوة... حتى تعود المركبة لصاحبها</p>
      </section>

      {canUsePointOfSale ? (
        <section className="dashboard-pos-launch-wrap" aria-label="اختصار نقطة البيع">
          <Link href="/point-of-sale" className="dashboard-pos-launch-card">
            <span className="dashboard-pos-launch-card__content">
              <span className="dashboard-pos-launch-card__icon"><ShoppingCart className="h-6 w-6" /></span>
              <span className="dashboard-pos-launch-card__copy">
                <span className="dashboard-pos-launch-card__eyebrow"><Sparkles className="h-3.5 w-3.5" /> مركز العمليات اليومية</span>
                <strong>نقطة البيع</strong>
                <span>بيع مباشر، أوامر صيانة، سوفتوير، خدمات إلكترونية ومحافظ — من مكان واحد.</span>
              </span>
              <span className="dashboard-pos-launch-card__action">فتح نقطة البيع<ArrowRightLeft className="h-4 w-4" /></span>
            </span>
          </Link>
        </section>
      ) : null}

      {dailySummary ? (
        <section>
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div><h2 className="masar-section-title">ملخص اليوم المالي</h2><p className="masar-section-description">أهم أرقام اليوم المالية في مكان واحد، مع صفحة جرد كاملة للتفاصيل.</p></div>
            <Button asChild variant="outline" className="h-10 rounded-xl border-teal-200 bg-white px-4 text-[12px] font-black text-teal-700 hover:bg-teal-50"><Link href="/daily-summary">عرض الجرد اليومي الكامل<ArrowRightLeft className="mr-1.5 h-4 w-4" /></Link></Button>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-5">{financialCards.map((card) => <DashboardStatCard key={card.label} {...card} />)}</div>
        </section>
      ) : null}

      {metricCards.length > 0 ? (
        <section>
          <div className="mb-4 flex items-end justify-between gap-3">
            <div><h2 className="masar-section-title">حالة الورشة الآن</h2><p className="masar-section-description">أوامر الصيانة والتسليمات والمخزون التي تحتاج متابعة تشغيلية.</p></div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-5">{metricCards.map((card) => <DashboardStatCard key={card.label} {...card} />)}</div>
        </section>
      ) : null}

      {hasAttentionItems ? (
        <DashboardSection title="يحتاج انتباهك اليوم" description="حالات تستحق المتابعة قبل نهاية يوم العمل." icon={AlertTriangle}>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {canReadServiceOrders && metrics.readyForDeliveryCount > 0 ? <DashboardAttentionCard title="مركبات جاهزة للتسليم" tone="success" href="/service-orders?status=READY_FOR_DELIVERY" action="عرض المركبات الجاهزة" description={<>يوجد <strong className="font-numeric font-black text-slate-900">{metrics.readyForDeliveryCount}</strong> مركبة مكتملة الصيانة بانتظار التواصل مع العميل والتسليم.</>} /> : null}
            {canReadInventory && metrics.lowStockItemsCount > 0 ? <DashboardAttentionCard title="نقص في المخزون" tone="danger" href="/inventory?lowStockOnly=true" action="مراجعة المخزون" description={<>يوجد <strong className="font-numeric font-black text-slate-900">{metrics.lowStockItemsCount}</strong> قطع بلغت أو تخطت حد إعادة الطلب.</>} /> : null}
            {canReadInvoices && metrics.unpaidInvoicesCount > 0 ? <DashboardAttentionCard title="مستحقات غير محصلة" tone="warning" href="/invoices" action="متابعة التحصيل" description={<>توجد <strong className="font-numeric font-black text-slate-900">{metrics.unpaidInvoicesCount}</strong> فواتير معلقة بإجمالي <strong className="font-numeric font-black text-slate-900">{formatCurrency(metrics.unpaidBalanceTotal, currency)}</strong>.</>} /> : null}
          </div>
        </DashboardSection>
      ) : null}

      {(hasActivity || hasQuickActions) ? (
        <section className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
          {hasActivity ? (
            <div className="grid gap-5 md:grid-cols-2 2xl:grid-cols-3">
              {canReadServiceOrders ? (
                <DashboardActivityCard title="آخر أوامر الصيانة" icon={Wrench}>
                  {activity.serviceOrders.length === 0 ? <DashboardEmptyActivity href={canCreateServiceOrders ? "/service-orders/new" : "/service-orders"} label={canCreateServiceOrders ? "أمر صيانة جديد" : "عرض أوامر الصيانة"} /> : activity.serviceOrders.map((order) => (
                    <DashboardActivityItem key={order.id} href={`/service-orders/${order.id}`} title={order.orderNumber} description={`${order.customer.name} - ${order.vehicle.make} ${order.vehicle.model}${order.vehicle.plateNumber ? ` - ${order.vehicle.plateNumber}` : ""}`} meta={formatDate(order.receivedAt, shopContext.timeZone)} />
                  ))}
                </DashboardActivityCard>
              ) : null}

              {canReadSales ? (
                <DashboardActivityCard title="آخر عمليات البيع" icon={ShoppingCart}>
                  {activity.sales.length === 0 ? <DashboardEmptyActivity href={canCreateSales ? "/point-of-sale?tab=sale" : "/sales"} label={canCreateSales ? "عملية بيع جديدة" : "عرض المبيعات"} /> : activity.sales.map((sale) => (
                    <DashboardActivityItem key={sale.id} href={`/sales/${sale.id}`} title={sale.receiptNumber ?? "إيصال بيع"} description={`${sale.customer?.name ?? "عميل نقدي"} - إجمالي: ${formatCurrency(sale.total, currency)}`} meta={formatDate(sale.soldAt, shopContext.timeZone)} />
                  ))}
                </DashboardActivityCard>
              ) : null}

              {canReadInvoices ? (
                <DashboardActivityCard title="آخر الفواتير" icon={FileText}>
                  {activity.invoices.length === 0 ? <DashboardEmptyActivity href="/invoices" label="عرض الفواتير" /> : activity.invoices.map((invoice) => (
                    <DashboardActivityItem key={invoice.id} href={`/invoices/${invoice.id}`} title={invoice.invoiceNumber} description={`${invoice.customer?.name ?? "عميل سريع"} - متبقي: ${formatCurrency(invoice.balanceDue, currency)}`} meta={formatDate(invoice.issuedAt, shopContext.timeZone)} />
                  ))}
                </DashboardActivityCard>
              ) : null}
            </div>
          ) : <div />}

          {hasQuickActions ? (
            <DashboardSection title="إجراءات سريعة" description="أكثر العمليات استخداماً في يوم العمل." icon={ArrowRightLeft} className="h-fit xl:sticky xl:top-24">
              <div className="space-y-2.5">
                {canCreateServiceOrders ? <DashboardQuickAction href="/service-orders/new" title="فتح أمر صيانة" description="استقبال مركبة وتسجيل شكوى العميل" icon={Wrench} tone="brand" /> : null}
                {canCreateSales ? <DashboardQuickAction href="/point-of-sale?tab=sale" title="تسجيل عملية POS" description="بيع مباشر لقطع الغيار والخدمات" icon={ShoppingCart} tone="warning" /> : null}
                {canCreateSales ? <DashboardQuickAction href="/point-of-sale?tab=software" title="بيع خدمة سوفتوير" description="تسجيل خدمة سوفتوير من نقطة البيع" icon={Code2} tone="support" /> : null}
                {canManageInventory ? <DashboardQuickAction href="/inventory/new" title="إضافة للمستودع" description="إدخال صنف أو قطعة جديدة" icon={Boxes} tone="info" /> : null}
                {canReadInvoices ? <DashboardQuickAction href="/invoices" title="مراجعة المقبوضات" description="متابعة الفواتير المعلقة" icon={Receipt} tone="danger" /> : null}
                {canReadCustomers ? <DashboardQuickAction href="/customers" title="سجل العملاء" description="مراجعة العملاء ومركباتهم" icon={CheckCircle2} tone="neutral" /> : null}
              </div>
            </DashboardSection>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}
