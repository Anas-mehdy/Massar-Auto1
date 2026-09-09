"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, LayoutDashboard, RotateCcw, Sparkles, WalletCards } from "lucide-react";
import Link from "next/link";
import { captureClientEvent } from "@/lib/analytics/client";
import { ANALYTICS_EVENTS } from "@/lib/analytics/events";
import { formatCurrency } from "@/lib/format";

type Props = {
  transactionId: string;
  providerId: string;
  providerBalance: number;
  providerCost: number;
  customerCharge: number;
  profit: number;
  currency: string;
  paymentDestination: "DRAWER" | "WALLET" | "BANK" | "OTHER" | "DEBT";
};

export function ElectronicServiceActivationSuccess(props: Props) {
  const [viewed, setViewed] = useState(false);
  useEffect(() => {
    const key = `masar:onboarding:electronic-service-impact:${props.transactionId}`;
    if (!window.localStorage.getItem(key)) {
      captureClientEvent(ANALYTICS_EVENTS.ELECTRONIC_PROVIDER_BALANCE_IMPACT_VIEWED, {
        onboarding_mode: true,
        onboarding_flow: "electronic_services",
        payment_destination: props.paymentDestination.toLowerCase(),
      });
      window.localStorage.setItem(key, "1");
    }
    setViewed(true);
  }, [props.paymentDestination, props.transactionId]);

  return (
    <div className="mx-auto max-w-3xl space-y-5" dir="rtl">
      <section className="overflow-hidden rounded-[28px] border border-emerald-200 bg-gradient-to-br from-emerald-50 via-white to-teal-50/70 p-6 shadow-sm dark:border-emerald-900 dark:from-emerald-950/25 dark:via-slate-950 dark:to-teal-950/20">
        <div className="flex items-start gap-4"><span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-emerald-600 text-white"><CheckCircle2 className="h-6 w-6" /></span><div><div className="text-[10px] font-black text-emerald-700 dark:text-emerald-300">3 / 3 مكتملة</div><h1 className="mt-1 text-2xl font-black text-slate-950 dark:text-slate-50">ممتاز — أول خدمة الإلكترونية تسجلت فعلياً</h1><p className="mt-2 text-xs font-semibold leading-6 text-slate-500 dark:text-slate-400">مسار سجل العملية، خصم تكلفة التنفيذ من المزود، وحسب الربح من نفس الحركة.</p></div></div>
      </section>

      <section className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-950 sm:p-6">
        <div className="grid gap-3 sm:grid-cols-3"><Step done label="مزود الخدمة جاهز" /><Step done label="نفذت أول خدمة" /><Step done={viewed} label="شاهدت أثرها على الرصيد" /></div>
        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><Metric label="تكلفة المزود" value={formatCurrency(props.providerCost, props.currency)} /><Metric label="على العميل" value={formatCurrency(props.customerCharge, props.currency)} /><Metric label="الربح" value={formatCurrency(props.profit, props.currency)} /><Metric label="رصيد المزود الآن" value={formatCurrency(props.providerBalance, props.currency)} /></div>
        <div className="mt-4 rounded-2xl border border-teal-100 bg-teal-50/60 p-4 text-[11px] font-bold leading-6 text-teal-800 dark:border-teal-900 dark:bg-teal-950/25 dark:text-teal-200"><div className="flex items-start gap-2"><WalletCards className="mt-0.5 h-4 w-4 shrink-0" /><span>من الآن، كل خدمة حقيقية تقدر تخصم تكلفتها من رصيد المزود تلقائياً. وإذا اخترت النقدي، يدخل مبلغ العميل للدرج ضمن نفس العملية.</span></div></div>
        <div className="mt-5 flex flex-col gap-2 sm:flex-row"><Link href={`/electronic-services/new?provider=${encodeURIComponent(props.providerId)}`} className="inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-xl border border-teal-200 bg-white text-xs font-black text-teal-700 hover:bg-teal-50 dark:border-teal-900 dark:bg-slate-900 dark:text-teal-300"><RotateCcw className="h-4 w-4" />خدمة أخرى</Link><Link href="/dashboard" className="inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-slate-900 text-xs font-black text-white hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-950"><LayoutDashboard className="h-4 w-4" />لوحة التحكم</Link></div>
      </section>
    </div>
  );
}

function Step({ done, label }: { done: boolean; label: string }) { return <div className={`rounded-xl border px-3 py-3 text-[10px] font-black ${done ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/25 dark:text-emerald-300" : "border-slate-200 bg-slate-50 text-slate-400 dark:border-slate-800 dark:bg-slate-900"}`}><div className="flex items-center gap-2">{done ? <CheckCircle2 className="h-4 w-4" /> : <Sparkles className="h-4 w-4" />}{label}</div></div>; }
function Metric({ label, value }: { label: string; value: string }) { return <div className="rounded-xl border border-slate-200 bg-slate-50/60 px-3 py-3 dark:border-slate-800 dark:bg-slate-900"><div className="text-[9px] font-black text-slate-400">{label}</div><div className="mt-1 font-numeric text-sm font-black text-slate-900 dark:text-slate-100">{value}</div></div>; }
