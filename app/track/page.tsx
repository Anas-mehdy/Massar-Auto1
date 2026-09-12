import type { Metadata } from "next";
import { Smartphone, Search, ArrowLeft, Phone, ShieldCheck } from "lucide-react";
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
  searchParams: Promise<{ ticket?: string; phone?: string; verify?: string }>;
}) {
  const query = await searchParams;
  const ticket = query.ticket?.trim() ?? "";
  const phone = query.phone?.trim() ?? "";
  const phoneDigits = phone.replace(/\D/g, "");

  if (ticket && phoneDigits.length >= 8) {
    redirect(`/track/${encodeURIComponent(ticket)}?phone=${encodeURIComponent(phone)}`);
  }

  async function handleSearch(formData: FormData) {
    "use server";
    const submittedTicket = String(formData.get("ticket") || "").trim();
    const submittedPhone = String(formData.get("phone") || "").trim();
    const digits = submittedPhone.replace(/\D/g, "");
    if (!submittedTicket) redirect("/track");
    if (digits.length < 8) {
      redirect(`/track?ticket=${encodeURIComponent(submittedTicket)}&verify=1`);
    }
    redirect(`/track/${encodeURIComponent(submittedTicket)}?phone=${encodeURIComponent(submittedPhone)}`);
  }

  return (
    <div className="min-h-screen w-full bg-slate-950 text-slate-100 flex flex-col justify-center items-center px-4 py-8 selection:bg-teal-500 selection:text-white overflow-x-hidden">
      <div className="w-full max-w-sm space-y-5">
        <div className="text-center space-y-1.5">
          <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-teal-500/10 text-teal-400 border border-teal-500/20 mb-1"><Smartphone className="h-6 w-6" /></div>
          <h1 className="text-xl font-black text-white">تتبع حالة جهاز الصيانة</h1>
          <p className="text-xs text-slate-400 font-medium">أدخل رقم التذكرة ورقم جوال العميل، أو امسح QR المطبوع على الإيصال.</p>
        </div>

        <div className="bg-slate-900/90 border border-slate-800 p-5 rounded-2xl shadow-2xl">
          {query.verify ? <div className="mb-4 flex items-start gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-[11px] font-bold leading-5 text-amber-200"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" /><span>لحماية بيانات الصيانة، البحث اليدوي يتطلب رقم جوال العميل المسجل مع التذكرة.</span></div> : null}

          <form action={handleSearch} className="space-y-4">
            <div>
              <label className="block text-xs font-extrabold text-slate-300 uppercase tracking-wider mb-2">رقم التذكرة (Ticket Number)</label>
              <div className="relative">
                <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3.5 text-slate-500"><Search className="h-4 w-4" /></div>
                <input type="text" name="ticket" required defaultValue={ticket} placeholder="مثال: RO-202609-0001" dir="ltr" className="w-full rounded-xl border border-slate-800 bg-slate-950/70 py-3 pr-10 pl-3 text-sm text-white placeholder-slate-600 focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500 transition font-numeric uppercase" />
              </div>
            </div>

            <div>
              <label className="block text-xs font-extrabold text-slate-300 uppercase tracking-wider mb-2">رقم جوال العميل للتأكيد</label>
              <div className="relative">
                <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3.5 text-slate-500"><Phone className="h-4 w-4" /></div>
                <input type="tel" name="phone" required minLength={8} defaultValue={phone} placeholder="مثال: 05xxxxxxxx" dir="ltr" autoComplete="tel" className="w-full rounded-xl border border-slate-800 bg-slate-950/70 py-3 pr-10 pl-3 text-sm text-white placeholder-slate-600 focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500 transition font-numeric" />
              </div>
              <p className="mt-1.5 text-[10px] font-semibold leading-5 text-slate-500">يمكن إدخال الرقم بصيغته المحلية أو الدولية؛ يتم استخدامه فقط للتحقق من التذكرة.</p>
            </div>

            <Button type="submit" className="w-full h-11 rounded-xl bg-gradient-to-r from-teal-500 to-primary text-slate-950 font-black text-xs shadow-lg shadow-teal-500/20 hover:from-teal-400 hover:to-teal-600 transition border-0 flex items-center justify-center gap-2">بحث وتتبع الآن<ArrowLeft className="h-4 w-4" /></Button>
          </form>

          <div className="mt-4 pt-3 border-t border-slate-800/80 text-center"><Link href="/" className="text-[11px] text-slate-400 hover:text-teal-400 transition font-medium">العودة للصفحة الرئيسية</Link></div>
        </div>
      </div>
    </div>
  );
}
