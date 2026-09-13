import type { Metadata } from "next";
import { Car, Search, ArrowLeft, Phone, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Button } from "@/components/ui/button";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default async function TrackSearchPage({
  searchParams,
}: {
  searchParams: Promise<{ order?: string; ticket?: string; phone?: string; verify?: string }>;
}) {
  const query = await searchParams;
  const orderNumber = query.order?.trim() || query.ticket?.trim() || "";
  const phone = query.phone?.trim() ?? "";
  const phoneDigits = phone.replace(/\D/g, "");

  if (orderNumber && phoneDigits.length >= 8) {
    redirect(`/track/${encodeURIComponent(orderNumber)}?phone=${encodeURIComponent(phone)}`);
  }

  async function handleSearch(formData: FormData) {
    "use server";
    const submittedOrder = String(formData.get("order") || "").trim();
    const submittedPhone = String(formData.get("phone") || "").trim();
    const digits = submittedPhone.replace(/\D/g, "");
    if (!submittedOrder) redirect("/track");
    if (digits.length < 8) {
      redirect(`/track?order=${encodeURIComponent(submittedOrder)}&verify=1`);
    }
    redirect(`/track/${encodeURIComponent(submittedOrder)}?phone=${encodeURIComponent(submittedPhone)}`);
  }

  return (
    <div className="flex min-h-screen w-full flex-col items-center justify-center overflow-x-hidden bg-slate-950 px-4 py-8 text-slate-100 selection:bg-teal-500 selection:text-white">
      <div className="w-full max-w-sm space-y-5">
        <div className="space-y-1.5 text-center">
          <div className="mb-1 inline-flex h-12 w-12 items-center justify-center rounded-2xl border border-teal-500/20 bg-teal-500/10 text-teal-400"><Car className="h-6 w-6" /></div>
          <h1 className="text-xl font-black text-white">تتبع حالة صيانة المركبة</h1>
          <p className="text-xs font-medium text-slate-400">أدخل رقم أمر الصيانة ورقم جوال العميل، أو امسح QR المطبوع على أمر الاستلام.</p>
        </div>

        <div className="rounded-2xl border border-slate-800 bg-slate-900/90 p-5 shadow-2xl">
          {query.verify ? <div className="mb-4 flex items-start gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-[11px] font-bold leading-5 text-amber-200"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" /><span>لحماية بيانات الصيانة، البحث اليدوي يتطلب رقم جوال العميل المسجل مع أمر الصيانة.</span></div> : null}

          <form action={handleSearch} className="space-y-4">
            <div>
              <label className="mb-2 block text-xs font-extrabold uppercase tracking-wider text-slate-300">رقم أمر الصيانة</label>
              <div className="relative">
                <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3.5 text-slate-500"><Search className="h-4 w-4" /></div>
                <input type="text" name="order" required defaultValue={orderNumber} placeholder="مثال: WO-20260913-ABC123" dir="ltr" className="w-full rounded-xl border border-slate-800 bg-slate-950/70 py-3 pl-3 pr-10 text-sm font-numeric uppercase text-white placeholder-slate-600 transition focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500" />
              </div>
            </div>

            <div>
              <label className="mb-2 block text-xs font-extrabold uppercase tracking-wider text-slate-300">رقم جوال العميل للتأكيد</label>
              <div className="relative">
                <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3.5 text-slate-500"><Phone className="h-4 w-4" /></div>
                <input type="tel" name="phone" required minLength={8} defaultValue={phone} placeholder="مثال: 05xxxxxxxx" dir="ltr" autoComplete="tel" className="w-full rounded-xl border border-slate-800 bg-slate-950/70 py-3 pl-3 pr-10 text-sm font-numeric text-white placeholder-slate-600 transition focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500" />
              </div>
              <p className="mt-1.5 text-[10px] font-semibold leading-5 text-slate-500">يمكن إدخال الرقم بصيغته المحلية أو الدولية؛ يتم استخدام آخر 8 أرقام فقط للتحقق من الأمر.</p>
            </div>

            <Button type="submit" className="flex h-11 w-full items-center justify-center gap-2 rounded-xl border-0 bg-gradient-to-r from-teal-500 to-primary text-xs font-black text-slate-950 shadow-lg shadow-teal-500/20 transition hover:from-teal-400 hover:to-teal-600">بحث وتتبع الآن<ArrowLeft className="h-4 w-4" /></Button>
          </form>

          <div className="mt-4 border-t border-slate-800/80 pt-3 text-center"><Link href="/" className="text-[11px] font-medium text-slate-400 transition hover:text-teal-400">العودة للصفحة الرئيسية</Link></div>
        </div>
      </div>
    </div>
  );
}
