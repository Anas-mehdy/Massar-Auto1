import Link from "next/link";
import { ArrowRight, CalendarDays, Gauge, Plus, Truck, UserRound, Wrench } from "lucide-react";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { requirePermission } from "@/lib/auth/context";
import { formatAutoDate, formatAutoMoney, SERVICE_ORDER_STATUS_CLASSES, SERVICE_ORDER_STATUS_LABELS } from "@/lib/auto/service-order-ui";
import type { ServiceOrderStatus } from "@/lib/services/autoServiceOrderService";
import { vehicleService } from "@/lib/services/vehicleService";

export const dynamic = "force-dynamic";

type VehiclePageProps = { params: Promise<{ id: string }> };

export default async function VehiclePage({ params }: VehiclePageProps) {
  const auth = await requirePermission("vehicles:read");
  const { id } = await params;
  const vehicle = await vehicleService.getVehicleById(auth.shop.id, id);
  if (!vehicle) notFound();

  return (
    <div className="space-y-6">
      <PageHeader
        title={`${vehicle.make} ${vehicle.model}${vehicle.year ? ` • ${vehicle.year}` : ""}`}
        description={vehicle.plateNumber ? `لوحة ${vehicle.plateNumber}` : vehicle.vin ? `VIN ${vehicle.vin}` : "ملف المركبة وسجل الصيانة"}
        actions={
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline" className="font-bold"><Link href="/vehicles"><ArrowRight className="ml-1.5 h-4 w-4" />المركبات</Link></Button>
            <Button asChild className="font-black"><Link href={`/service-orders/new?vehicleId=${vehicle.id}`}><Plus className="ml-1.5 h-4 w-4" />أمر صيانة جديد</Link></Button>
          </div>
        }
      />

      <div className="grid gap-4 md:grid-cols-3">
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm md:col-span-2">
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-teal-50 text-teal-700"><Truck className="h-5 w-5" /></span>
            <div><h2 className="font-black text-slate-950">بيانات المركبة</h2><p className="text-xs text-slate-500">التعريف الفني الأساسي للمركبة</p></div>
          </div>
          <dl className="mt-5 grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
            {[
              ["اللوحة", vehicle.plateNumber || "-"],
              ["VIN", vehicle.vin || "-"],
              ["اللون", vehicle.color || "-"],
              ["رقم المحرك", vehicle.engineNumber || "-"],
              ["الوقود", vehicle.fuelType || "-"],
              ["ناقل الحركة", vehicle.transmission || "-"],
            ].map(([label, value]) => <div key={label} className="rounded-xl bg-slate-50 p-3"><dt className="text-xs font-bold text-slate-400">{label}</dt><dd className="mt-1 break-words font-black text-slate-800">{value}</dd></div>)}
          </dl>
          {vehicle.engineDetails || vehicle.notes ? <div className="mt-4 grid gap-3 sm:grid-cols-2">{vehicle.engineDetails ? <div className="rounded-xl border border-slate-100 p-3"><div className="text-xs font-bold text-slate-400">تفاصيل المحرك</div><div className="mt-1 text-sm font-semibold leading-6 text-slate-700">{vehicle.engineDetails}</div></div> : null}{vehicle.notes ? <div className="rounded-xl border border-slate-100 p-3"><div className="text-xs font-bold text-slate-400">ملاحظات</div><div className="mt-1 text-sm font-semibold leading-6 text-slate-700">{vehicle.notes}</div></div> : null}</div> : null}
        </section>

        <div className="space-y-4">
          <section className="rounded-2xl border border-sky-100 bg-sky-50/60 p-5">
            <div className="flex items-center gap-2 text-sm font-black text-sky-950"><UserRound className="h-4 w-4" />المالك</div>
            <div className="mt-3 text-lg font-black text-slate-950">{vehicle.customerName}</div>
            <div className="mt-1 text-sm font-bold text-slate-600">{vehicle.customerPhone || "لا يوجد رقم هاتف"}</div>
            {vehicle.customerEmail ? <div className="mt-1 break-all text-xs text-slate-500">{vehicle.customerEmail}</div> : null}
          </section>
          <section className="rounded-2xl border border-amber-100 bg-amber-50/60 p-5">
            <div className="flex items-center gap-2 text-sm font-black text-amber-950"><Gauge className="h-4 w-4" />آخر قراءة للعداد</div>
            <div className="mt-3 text-2xl font-black text-slate-950">{vehicle.currentOdometer != null ? vehicle.currentOdometer.toLocaleString("ar") : "-"}</div>
            <div className="text-xs font-bold text-slate-500">كيلومتر</div>
          </section>
        </div>
      </div>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center justify-between gap-3 border-b border-slate-100 p-5">
          <div><h2 className="flex items-center gap-2 font-black text-slate-950"><Wrench className="h-4 w-4 text-teal-600" />سجل الصيانة</h2><p className="mt-1 text-xs text-slate-500">كل زيارات هذه المركبة للمركز</p></div>
          <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-black text-slate-600">{vehicle.serviceOrders.length}</span>
        </div>
        {vehicle.serviceOrders.length === 0 ? (
          <div className="p-10 text-center text-sm font-bold text-slate-500">لا يوجد سجل صيانة لهذه المركبة بعد.</div>
        ) : (
          <div className="divide-y divide-slate-100">
            {vehicle.serviceOrders.map((order) => {
              const status = order.status as ServiceOrderStatus;
              return <Link key={order.id} href={`/service-orders/${order.id}`} className="block p-4 transition hover:bg-slate-50 sm:p-5">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2"><span className="font-black text-slate-950">{order.orderNumber}</span><span className={`rounded-full border px-2.5 py-1 text-[11px] font-black ${SERVICE_ORDER_STATUS_CLASSES[status] ?? "border-slate-200 bg-slate-50"}`}>{SERVICE_ORDER_STATUS_LABELS[status] ?? order.status}</span></div>
                    <div className="mt-2 line-clamp-2 text-sm font-semibold leading-6 text-slate-600">{order.reportedIssue}</div>
                  </div>
                  <div className="shrink-0 text-xs text-slate-500 sm:text-left"><div className="flex items-center gap-1 font-bold"><CalendarDays className="h-3.5 w-3.5" />{formatAutoDate(order.receivedAt)}</div><div className="mt-1 font-black text-slate-800">{formatAutoMoney(order.finalTotal ?? order.estimatedTotal, auth.shop.currency)}</div></div>
                </div>
              </Link>;
            })}
          </div>
        )}
      </section>
    </div>
  );
}
