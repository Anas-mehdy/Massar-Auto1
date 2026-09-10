import Link from "next/link";
import { Plus, Search, Truck, Wrench } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { requirePermission } from "@/lib/auth/context";
import {
  SERVICE_ORDER_STATUS_CLASSES,
  SERVICE_ORDER_STATUS_LABELS,
  formatAutoDate,
  formatAutoMoney,
} from "@/lib/auto/service-order-ui";
import {
  SERVICE_ORDER_STATUSES,
  autoServiceOrderService,
  type ServiceOrderStatus,
} from "@/lib/services/autoServiceOrderService";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams: Promise<{ search?: string; status?: string; assigned?: string }>;
};

function parseStatus(value?: string): ServiceOrderStatus | undefined {
  return value && (SERVICE_ORDER_STATUSES as readonly string[]).includes(value)
    ? (value as ServiceOrderStatus)
    : undefined;
}

export default async function ServiceOrdersPage({ searchParams }: PageProps) {
  const auth = await requirePermission("service_orders:read");
  const params = await searchParams;
  const search = params.search?.trim() ?? "";
  const status = parseStatus(params.status);
  const mine = params.assigned === "mine";
  const orders = await autoServiceOrderService.listServiceOrders(auth.shop.id, {
    search,
    status,
    assignedToUserId: mine ? auth.user.id : undefined,
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="أوامر الصيانة"
        description="من استقبال المركبة والفحص حتى الموافقة والتنفيذ والتسليم"
        actions={<Button asChild className="font-black"><Link href="/service-orders/new"><Plus className="ml-1.5 h-4 w-4" />أمر صيانة جديد</Link></Button>}
      />

      <form className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:grid-cols-2 xl:grid-cols-[1fr_230px_190px_auto]">
        <div className="relative sm:col-span-2 xl:col-span-1">
          <Search className="absolute right-3 top-3.5 h-4 w-4 text-slate-400" />
          <input name="search" defaultValue={search} placeholder="رقم الأمر، العميل، الهاتف، اللوحة، VIN..." className="h-11 w-full rounded-xl border border-slate-200 pr-10 pl-3 text-sm outline-none focus:border-cyan-400 focus:ring-2 focus:ring-cyan-100" />
        </div>
        <select name="status" defaultValue={status ?? ""} className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm font-bold outline-none focus:border-cyan-400">
          <option value="">كل الحالات</option>
          {SERVICE_ORDER_STATUSES.map((item) => <option key={item} value={item}>{SERVICE_ORDER_STATUS_LABELS[item]}</option>)}
        </select>
        <select name="assigned" defaultValue={mine ? "mine" : "all"} className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm font-bold outline-none focus:border-cyan-400">
          <option value="all">كل أوامر المركز</option>
          <option value="mine">المسندة إليّ</option>
        </select>
        <Button type="submit" className="h-11 px-6 font-black">تطبيق</Button>
      </form>

      <div className="rounded-2xl border border-cyan-100 bg-cyan-50/60 px-4 py-3 text-sm font-bold text-cyan-950">{orders.length} أمر صيانة يطابق التصفية الحالية</div>

      {orders.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-slate-300 bg-white p-12 text-center">
          <Wrench className="mx-auto mb-4 h-10 w-10 text-slate-400" />
          <h2 className="font-black text-slate-950">لا توجد أوامر صيانة</h2>
          <p className="mt-2 text-sm text-slate-500">ابدأ باستقبال مركبة جديدة أو غيّر التصفية الحالية.</p>
          <Button asChild className="mt-5 font-black"><Link href="/service-orders/new">إنشاء أمر صيانة</Link></Button>
        </div>
      ) : (
        <div className="grid gap-4 xl:grid-cols-2">
          {orders.map((order) => (
            <Link key={order.id} href={`/service-orders/${order.id}`} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-cyan-200 hover:shadow-md sm:p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-black text-slate-950">{order.orderNumber}</span>
                    <span className={`rounded-full border px-2.5 py-1 text-[11px] font-black ${SERVICE_ORDER_STATUS_CLASSES[order.status]}`}>{SERVICE_ORDER_STATUS_LABELS[order.status]}</span>
                  </div>
                  <div className="mt-2 flex items-center gap-1.5 text-sm font-black text-slate-800"><Truck className="h-4 w-4 text-cyan-700" />{order.vehicleMake} {order.vehicleModel}{order.vehicleYear ? ` • ${order.vehicleYear}` : ""}</div>
                  <div className="mt-1 text-xs font-bold text-slate-500">{order.plateNumber || order.vin || "بدون لوحة/VIN"} • {order.customerName}{order.customerPhone ? ` • ${order.customerPhone}` : ""}</div>
                </div>
                <div className="shrink-0 text-left text-xs text-slate-500"><div>{formatAutoDate(order.receivedAt)}</div><div className="mt-1 font-black text-slate-900">{formatAutoMoney(order.finalTotal ?? order.estimatedTotal, auth.shop.currency)}</div></div>
              </div>
              <div className="mt-4 rounded-xl bg-slate-50 p-3 text-sm font-semibold leading-6 text-slate-650">{order.reportedIssue}</div>
              {order.promisedAt ? <div className="mt-3 text-xs font-bold text-amber-800">التسليم المتوقع: {formatAutoDate(order.promisedAt)}</div> : null}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
