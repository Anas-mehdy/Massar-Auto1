import Link from "next/link";
import { Plus, Search, Truck, Wrench } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { requirePermission } from "@/lib/auth/context";
import { vehicleService } from "@/lib/services/vehicleService";
import { formatAutoDate } from "@/lib/auto/service-order-ui";

export const dynamic = "force-dynamic";

type VehiclesPageProps = {
  searchParams: Promise<{ search?: string }>;
};

export default async function VehiclesPage({ searchParams }: VehiclesPageProps) {
  const auth = await requirePermission("vehicles:read");
  const params = await searchParams;
  const search = params.search?.trim() ?? "";
  const vehicles = await vehicleService.listVehicles(auth.shop.id, search);

  return (
    <div className="space-y-6">
      <PageHeader
        title="المركبات"
        description="ملف مستقل لكل مركبة مع مالكها وسجل الصيانة الكامل"
        actions={
          <Button asChild className="font-bold shadow-sm">
            <Link href="/vehicles/new">
              <Plus className="ml-1.5 h-4 w-4" aria-hidden="true" />
              إضافة مركبة
            </Link>
          </Button>
        }
      />

      <form className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row">
          <div className="relative min-w-0 flex-1">
            <Search className="absolute right-3 top-3.5 h-4 w-4 text-slate-400" aria-hidden="true" />
            <input
              name="search"
              defaultValue={search}
              placeholder="ابحث بالعميل، اللوحة، VIN، الماركة أو الموديل..."
              className="h-11 w-full rounded-xl border border-slate-200 bg-white pr-10 pl-3 text-sm outline-none transition focus:border-teal-400 focus:ring-2 focus:ring-teal-100"
            />
          </div>
          <Button type="submit" className="h-11 px-6 font-bold">
            بحث
          </Button>
        </div>
      </form>

      <div className="rounded-2xl border border-teal-100 bg-teal-50/60 px-4 py-3 text-sm font-bold text-teal-950">
        {vehicles.length} مركبة تطابق التصفية الحالية
      </div>

      {vehicles.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-slate-300 bg-white px-6 py-14 text-center shadow-sm">
          <Truck className="mx-auto mb-4 h-11 w-11 text-slate-400" aria-hidden="true" />
          <h2 className="text-lg font-black text-slate-900">لا توجد مركبات بعد</h2>
          <p className="mx-auto mt-2 max-w-md text-sm leading-7 text-slate-500">
            أضف أول مركبة واربطها بالعميل، وبعدها سيظهر سجل أوامر الصيانة الخاص بها هنا.
          </p>
          <Button asChild className="mt-5 font-bold">
            <Link href="/vehicles/new">إضافة أول مركبة</Link>
          </Button>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {vehicles.map((vehicle) => (
            <Link
              key={vehicle.id}
              href={`/vehicles/${vehicle.id}`}
              className="group rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-teal-200 hover:shadow-md"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="truncate text-base font-black text-slate-950">
                    {vehicle.make} {vehicle.model} {vehicle.year ? `• ${vehicle.year}` : ""}
                  </div>
                  <div className="mt-1 truncate text-sm font-bold text-slate-600">{vehicle.customerName}</div>
                </div>
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-teal-50 text-teal-700 ring-1 ring-teal-100">
                  <Truck className="h-5 w-5" aria-hidden="true" />
                </span>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
                <div className="rounded-xl bg-slate-50 p-3">
                  <div className="font-bold text-slate-400">رقم اللوحة</div>
                  <div className="mt-1 font-black text-slate-800">{vehicle.plateNumber || "-"}</div>
                </div>
                <div className="rounded-xl bg-slate-50 p-3">
                  <div className="font-bold text-slate-400">العداد</div>
                  <div className="mt-1 font-black text-slate-800">
                    {vehicle.currentOdometer != null ? `${vehicle.currentOdometer.toLocaleString("ar")} كم` : "-"}
                  </div>
                </div>
              </div>

              <div className="mt-3 flex items-center justify-between gap-3 border-t border-slate-100 pt-3 text-xs">
                <span className="flex items-center gap-1.5 font-bold text-slate-600">
                  <Wrench className="h-3.5 w-3.5 text-teal-600" aria-hidden="true" />
                  {vehicle.serviceOrderCount} أمر صيانة
                </span>
                <span className="text-slate-400">{vehicle.lastServiceAt ? formatAutoDate(vehicle.lastServiceAt) : "لا يوجد سجل بعد"}</span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
