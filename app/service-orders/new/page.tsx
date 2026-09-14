import Link from "next/link";
import { ArrowRight, Truck, Wrench } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { requirePermission } from "@/lib/auth/context";
import { customerService } from "@/lib/services/customerService";
import { vehicleService } from "@/lib/services/vehicleService";
import { createIntakeServiceOrderAction } from "./actions";

export const dynamic = "force-dynamic";

type PageProps = { searchParams: Promise<{ vehicleId?: string }> };

const inputClass = "h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none transition focus:border-cyan-400 focus:ring-2 focus:ring-cyan-100";
const labelClass = "grid gap-2 text-xs font-extrabold text-slate-700";

export default async function NewServiceOrderPage({ searchParams }: PageProps) {
  const auth = await requirePermission("service_orders:create");
  const params = await searchParams;
  const [vehicles, customers] = await Promise.all([
    vehicleService.listVehicles(auth.shop.id),
    customerService.listCustomers(auth.shop.id),
  ]);

  const requestedVehicleId = params.vehicleId && vehicles.some((vehicle) => vehicle.id === params.vehicleId)
    ? params.vehicleId
    : "";

  return (
    <div className="space-y-6">
      <PageHeader
        title="استقبال مركبة"
        description="افتح أمر الصيانة من شاشة واحدة؛ اختر مركبة مسجلة أو أضف العميل والمركبة الجديدة هنا مباشرة"
        actions={<Button asChild variant="outline" className="font-bold"><Link href="/service-orders"><ArrowRight className="ml-1.5 h-4 w-4" />أوامر الصيانة</Link></Button>}
      />

      <form action={createIntakeServiceOrderAction} className="space-y-6">
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-cyan-50 text-cyan-700"><Truck className="h-5 w-5" /></span>
            <div>
              <h2 className="font-black text-slate-950">العميل والمركبة</h2>
              <p className="text-xs text-slate-500">إذا المركبة مسجلة اخترها مباشرة. إذا كانت جديدة، اختر العميل الموجود أو أدخل بيانات عميل جديد ثم بيانات المركبة.</p>
            </div>
          </div>

          <div className="mt-5 grid gap-4">
            <label className={labelClass}>
              <span>مركبة مسجلة مسبقاً</span>
              <select name="vehicleId" defaultValue={requestedVehicleId} className={inputClass}>
                <option value="">المركبة جديدة / غير مسجلة</option>
                {vehicles.map((vehicle) => (
                  <option key={vehicle.id} value={vehicle.id}>
                    {vehicle.make} {vehicle.model}{vehicle.year ? ` ${vehicle.year}` : ""} — {vehicle.plateNumber || vehicle.vin || "بدون لوحة"} — {vehicle.customerName}{vehicle.customerPhone ? ` (${vehicle.customerPhone})` : ""}
                  </option>
                ))}
              </select>
              <span className="font-medium text-slate-500">إذا اخترت مركبة هنا، تجاهل حقول العميل والمركبة الجديدة بالأسفل.</span>
            </label>

            <div className="my-1 flex items-center gap-3 text-xs font-bold text-slate-400">
              <span className="h-px flex-1 bg-slate-200" />
              <span>أو تسجيل مركبة جديدة ضمن أمر الصيانة</span>
              <span className="h-px flex-1 bg-slate-200" />
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <label className={labelClass}>
                <span>عميل موجود</span>
                <select name="existingCustomerId" defaultValue="" className={inputClass}>
                  <option value="">العميل جديد</option>
                  {customers.map((customer) => (
                    <option key={customer.id} value={customer.id}>
                      {customer.name}{customer.phone ? ` — ${customer.phone}` : ""}
                    </option>
                  ))}
                </select>
              </label>
              <div className="rounded-xl border border-dashed border-cyan-200 bg-cyan-50/50 px-4 py-3 text-xs font-semibold leading-6 text-cyan-900">
                إذا العميل موجود اختره فقط. إذا جديد، اترك القائمة على «العميل جديد» وعبّئ بياناته التالية.
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              <label className={labelClass}><span>اسم العميل الجديد</span><input name="newCustomerName" className={inputClass} placeholder="مثال: أحمد محمد" /></label>
              <label className={labelClass}><span>هاتف العميل الجديد</span><input name="newCustomerPhone" className={inputClass} inputMode="tel" placeholder="05xxxxxxxx" /></label>
              <label className={labelClass}><span>البريد الإلكتروني (اختياري)</span><input name="newCustomerEmail" type="email" className={inputClass} placeholder="name@example.com" /></label>
            </div>

            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <h3 className="text-sm font-black text-slate-900">بيانات المركبة الجديدة</h3>
              <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                <label className={labelClass}><span>الماركة</span><input name="newVehicleMake" className={inputClass} placeholder="Toyota" /></label>
                <label className={labelClass}><span>الموديل</span><input name="newVehicleModel" className={inputClass} placeholder="Camry" /></label>
                <label className={labelClass}><span>سنة الصنع</span><input name="newVehicleYear" type="number" min="1886" max="2200" step="1" className={inputClass} placeholder="2022" /></label>
                <label className={labelClass}><span>رقم اللوحة</span><input name="newVehiclePlateNumber" className={inputClass} /></label>
                <label className={labelClass}><span>رقم الهيكل VIN</span><input name="newVehicleVin" className={inputClass} /></label>
                <label className={labelClass}><span>اللون</span><input name="newVehicleColor" className={inputClass} /></label>
              </div>
            </div>
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-cyan-50 text-cyan-700"><Wrench className="h-5 w-5" /></span>
            <div><h2 className="font-black text-slate-950">بيانات الاستقبال</h2><p className="text-xs text-slate-500">المعلومات التي تثبت حالة المركبة لحظة الدخول</p></div>
          </div>
          <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
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
    </div>
  );
}
