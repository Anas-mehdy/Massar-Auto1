import type { Metadata } from "next";
import Link from "next/link";
import { MailCheck, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { verifyLifecycleUnsubscribeToken } from "@/lib/lifecycle/unsubscribe-token";
import { unsubscribeLifecycleEmailAction } from "./actions";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { robots: { index: false, follow: false } };

type SearchParams = { token?: string; done?: string; invalid?: string };

export default async function LifecycleEmailPreferencesPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const query = await searchParams;

  if (query.done === "1") {
    return <Shell><MailCheck className="mx-auto h-9 w-9 text-emerald-600" /><h1 className="mt-4 text-xl font-black text-slate-900">تم إيقاف رسائل تفعيل الاستخدام</h1><p className="mt-2 text-sm font-semibold leading-7 text-slate-500">لن نرسل لك رسائل الـLifecycle الخاصة بتجربة واستخدام مسار. رسائل الأمان الضرورية مثل إعادة تعيين كلمة المرور تبقى فعّالة.</p><Button asChild className="mt-6 rounded-xl"><Link href="/login">العودة إلى مسار</Link></Button></Shell>;
  }

  const verified = query.token ? verifyLifecycleUnsubscribeToken(query.token) : null;
  if (!verified || query.invalid === "1") {
    return <Shell><ShieldCheck className="mx-auto h-9 w-9 text-slate-400" /><h1 className="mt-4 text-xl font-black text-slate-900">الرابط غير صالح أو انتهت صلاحيته</h1><p className="mt-2 text-sm font-semibold leading-7 text-slate-500">افتح رابط الإيقاف من آخر رسالة Lifecycle وصلتك، أو تواصل مع الدعم إذا احتجت مساعدة.</p><Button asChild variant="outline" className="mt-6 rounded-xl"><Link href="/login">فتح مسار</Link></Button></Shell>;
  }

  return <Shell><MailCheck className="mx-auto h-9 w-9 text-teal-600" /><h1 className="mt-4 text-xl font-black text-slate-900">إيقاف رسائل تفعيل الاستخدام؟</h1><p className="mt-2 text-sm font-semibold leading-7 text-slate-500">هذه الرسائل مرتبطة بتجربة مسار، مثل تذكيرك بإكمال أول عملية أو اقتراب نهاية الفترة التجريبية. الإيقاف لا يحذف حسابك ولا يؤثر على رسائل الأمان الضرورية.</p><form action={unsubscribeLifecycleEmailAction} className="mt-6"><input type="hidden" name="token" value={query.token} /><Button type="submit" variant="outline" className="rounded-xl border-rose-200 text-rose-700 hover:bg-rose-50">إيقاف هذه الرسائل</Button></form></Shell>;
}

function Shell({ children }: { children: React.ReactNode }) {
  return <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-10" dir="rtl"><section className="w-full max-w-lg rounded-3xl border border-slate-200 bg-white p-7 text-center shadow-sm sm:p-9">{children}</section></main>;
}
