import Link from "next/link";
import { ArrowRight, Plus, Truck, Wrench } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { requirePermission } from "@/lib/auth/context";
import { vehicleService } from "@/lib/services/vehicleService";
import { createServiceOrderAction } from "../actions";

export const dynamic = "force-dynamic";

type PageProps = { searchParams: Promise<{ vehicleId?: string }> };

const inputClass = "h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none transition focus:border-cyan-400 focus:ring-2 focus:ring-cyan-100";
const labelClass = "grid gap-2 text-xs font-extrabold text-slate-700";

export default async function NewServiceOrderPage({ searchParams }: PageProps) {
  const auth = await requirePermission("service_orders:create");
  const params = await searchParams;
  const vehicles = await vehicleService.listVehicles(auth.shop.id);

  return (
    <div className="space-y-6">
      <PageHeader
        title="استقبال مركبة"
        description="سجّل حالة المركبة عند الدخول وشكوى العميل وموعد التسليم المتوقع"
        actions={<Button asChild variant="outline" className="font-bold"><Link href="/service-orders"><ArrowRight className="ml-1.5 h-4 w-4" />أوامر الصيانة</Link></Button>}
      />

      {vehicles.length === 0 ? (
        <div className="rounded-3xl border border-amber-200 bg-amber-50 p-8 text-center">
          <Truck className="mx-auto mb-3 h-10 w-10 text-amber-700" />
          <h2 className="font-black text-amber-950">لا توجد مركبات مسجلة</h2>
          <p className="mt-2 text-sm font-semibold leading-7 text-amber-900">أنشئ ملف المركبة أولًا، وبعدها تستطيع فتح أمر صيانة لها.</p>
          <Button asChild className="mt-5 font-black"><Link href="/vehicles/new"><Plus className="ml-1.5 h-4 w-4" />إضافة مركبة</Link></Button>
        </div>
      ) : (
        <form action={createServiceOrderAction} className="space-y-6">
          <input type="hidden" name="receptionistUserId" value={auth.user.id} />

          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center gap-3"><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-cyan-50 text-cyan-700"><Wrench className="h-5 w-5" /></span><div><h2 className="font-black text-slate-950">بيانات الاستقبال</h2><p className="text-xs text-slate-500">المعلومات التي تثبت حالة المركبة لحظة الدخول</p></div></div>
            <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              <label className={`${labelClass} sm:col-span-2 xl:col-span-3`}>
                <span>المركبة *</span>
                <select name="vehicleId" required defaultValue={params.vehicleId ?? ""} className={inputClass}>
                  <option value="" disabled>اختر المركبة</option>
                  {vehicles.map((vehicle) => <option key={vehicle.id} value={vehicle.id}>{vehicle.make} {vehicle.model}{vehicle.year ? ` ${vehicle.year}` : ""} — {vehicle.plateNumber || vehicle.vin || "بدون لوحة"} — {vehicle.customerName}</option>)}
                </select>
              </label>
              <label className={labelClass}><span>قراءة العداد عند الاستلام</span><input name="odometerAtIntake" type="number" min="0" step="1" className={inputClass} placeholder="كم" /></label>
              <label className={labelClass}><span>مستوى الوقود %</span><input name="fuelLevelPercent" type="number" min="0" max="100" step="0.01" className={inputClass} placeholder="50" /></label>
              <label className={labelClass}><span>التسليم المتوقع</span><input name="promisedAt" type="datetime-local" className={inputClass} /></label>
              <label className={`${labelClass} sm:col-span-2 xl:col-span-3`}><span>شكوى العميل / سبب الدخول *</span><textarea name="reportedIssue" required rows={4} className="w-full rounded-xl border border-slate-200 p-3 text-sm outline-none focus:border-cyan-400 focus:ring-2 focus:ring-cyan-100" placeholder="اكتب المشكلة كما وصفها العميل..." /></label>
              <label className={`${labelClass} sm:col-span-2`}><span>حالة المركبة الخارجية</span><textarea name="exteriorCondition" rows={3} className="w-full rounded-xl border border-slate-200 p-3 text-sm outline-none focus:border-cyan-400 focus:ring-2 focus:ring-cyan-100" placeholder="خدوش، صدمات، حالة الزجاج..." /></label>
              <label className={labelClass}><span>المفاتيح والأغراض المسلّمة</span><textarea name="keysAndItems" rows={3} className="w-full rounded-xl border border-slate-200 p-3 text-sm outline-none focus:border-cyan-400 focus:ring-2 focus:ring-cyan-100" placeholder="مفتاح رئيسي، ريموت..." /></label>
              <label className={`${labelClass} sm:col-span-2 xl:col-span-3`}><span>ملاحظات الاستقبال</span><textarea name="receptionNotes" rows={3} className="w-full rounded-xl border border-slate-200 p-3 text-sm outline-none focus:border-cyan-400 focus:ring-2 focus:ring-cyan-100" /></label>
              <label className={labelClass}><span>تقدير أولي (اختياري)</span><input name="estimatedTotal" type="number" min="0" step="0.01" className={inputClass} /></label>
            </div>
          </section>

          <div className="sticky bottom-3 z-10 rounded-2xl border border-slate-200 bg-white/95 p-3 shadow-lg backdrop-blur sm:flex sm:justify-end">
            <Button type="submit" className="h-11 w-full px-9 font-black sm:w-auto">فتح أمر الصيانة</Button>
          </div>
        </form>
      )}
    </div>
  );
}
