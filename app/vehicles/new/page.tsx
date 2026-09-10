import Link from "next/link";
import { ArrowRight, Truck } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { requirePermission } from "@/lib/auth/context";
import { customerService } from "@/lib/services/customerService";
import { createVehicleAction } from "../actions";

export const dynamic = "force-dynamic";

type NewVehiclePageProps = {
  searchParams: Promise<{ customerId?: string }>;
};

const inputClass = "h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none transition focus:border-teal-400 focus:ring-2 focus:ring-teal-100";
const labelClass = "grid gap-2 text-xs font-extrabold text-slate-700";

export default async function NewVehiclePage({ searchParams }: NewVehiclePageProps) {
  const auth = await requirePermission("vehicles:manage");
  const params = await searchParams;
  const customers = await customerService.listCustomers(auth.shop.id);

  return (
    <div className="space-y-6">
      <PageHeader
        title="إضافة مركبة"
        description="أنشئ ملف المركبة مرة واحدة ليبقى تاريخ الصيانة مرتبطًا بها دائمًا"
        actions={
          <Button asChild variant="outline" className="font-bold">
            <Link href="/vehicles">
              <ArrowRight className="ml-1.5 h-4 w-4" aria-hidden="true" />
              رجوع
            </Link>
          </Button>
        }
      />

      {customers.length === 0 ? (
        <div className="rounded-3xl border border-amber-200 bg-amber-50 p-6 text-center">
          <Truck className="mx-auto mb-3 h-9 w-9 text-amber-700" aria-hidden="true" />
          <h2 className="font-black text-amber-950">لا يوجد عملاء مسجلون</h2>
          <p className="mt-2 text-sm leading-7 text-amber-900">يجب إنشاء العميل أولًا ثم ربط المركبة به.</p>
          <Button asChild className="mt-4 font-bold"><Link href="/customers/new">إضافة عميل</Link></Button>
        </div>
      ) : (
        <form action={createVehicleAction} className="space-y-6">
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-base font-black text-slate-950">المالك وتعريف المركبة</h2>
            <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              <label className={`${labelClass} sm:col-span-2 xl:col-span-1`}>
                <span>العميل *</span>
                <select name="customerId" required defaultValue={params.customerId ?? ""} className={inputClass}>
                  <option value="" disabled>اختر العميل</option>
                  {customers.map((customer) => (
                    <option key={customer.id} value={customer.id}>
                      {customer.name}{customer.phone ? ` — ${customer.phone}` : ""}
                    </option>
                  ))}
                </select>
              </label>
              <label className={labelClass}><span>رقم اللوحة</span><input name="plateNumber" className={inputClass} placeholder="مثال: 1234 ABC" /></label>
              <label className={labelClass}><span>رقم الهيكل VIN</span><input name="vin" className={inputClass} dir="ltr" placeholder="VIN" /></label>
              <label className={labelClass}><span>الماركة *</span><input name="make" required className={inputClass} placeholder="Toyota" /></label>
              <label className={labelClass}><span>الموديل *</span><input name="model" required className={inputClass} placeholder="Camry" /></label>
              <label className={labelClass}><span>سنة الصنع</span><input name="year" type="number" min="1886" max="2200" className={inputClass} placeholder="2022" /></label>
              <label className={labelClass}><span>اللون</span><input name="color" className={inputClass} /></label>
              <label className={labelClass}><span>قراءة العداد الحالية</span><input name="currentOdometer" type="number" min="0" step="1" className={inputClass} placeholder="كم" /></label>
              <label className={labelClass}><span>رقم المحرك</span><input name="engineNumber" className={inputClass} /></label>
              <label className={labelClass}>
                <span>نوع الوقود</span>
                <select name="fuelType" className={inputClass} defaultValue="">
                  <option value="">غير محدد</option><option value="GASOLINE">بنزين</option><option value="DIESEL">ديزل</option><option value="HYBRID">هايبرد</option><option value="ELECTRIC">كهرباء</option><option value="LPG">غاز</option><option value="OTHER">أخرى</option>
                </select>
              </label>
              <label className={labelClass}>
                <span>ناقل الحركة</span>
                <select name="transmission" className={inputClass} defaultValue="">
                  <option value="">غير محدد</option><option value="AUTOMATIC">أوتوماتيك</option><option value="MANUAL">عادي</option><option value="CVT">CVT</option><option value="DCT">DCT</option><option value="OTHER">أخرى</option>
                </select>
              </label>
              <label className={`${labelClass} sm:col-span-2 xl:col-span-3`}><span>تفاصيل المحرك</span><input name="engineDetails" className={inputClass} placeholder="السعة، الكود، أي معلومات مهمة..." /></label>
              <label className={`${labelClass} sm:col-span-2 xl:col-span-3`}><span>ملاحظات</span><textarea name="notes" rows={4} className="w-full rounded-xl border border-slate-200 bg-white p-3 text-sm outline-none focus:border-teal-400 focus:ring-2 focus:ring-teal-100" /></label>
            </div>
          </section>

          <div className="sticky bottom-3 z-10 rounded-2xl border border-slate-200 bg-white/95 p-3 shadow-lg backdrop-blur sm:flex sm:justify-end">
            <Button type="submit" className="h-11 w-full px-8 font-black sm:w-auto">حفظ المركبة</Button>
          </div>
        </form>
      )}
    </div>
  );
}
