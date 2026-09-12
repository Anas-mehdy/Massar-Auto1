import { InstallmentPlanStatus, InstallmentScheduleStatus } from "@prisma/client";
import { CalendarDays, CheckCircle2, Clock3, Phone, ShieldCheck, WalletCards } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { formatCurrency, formatDate, formatDateTime } from "@/lib/format";
import { verifyInstallmentPublicToken } from "@/lib/installment-public-link";
import { installmentService } from "@/lib/services/installmentService";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default async function InstallmentTrackPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const payload = await verifyInstallmentPublicToken(token);
  if (!payload) notFound();
  const plan = await installmentService.getPublicPlan(payload.planId, payload.version);
  if (!plan) notFound();
  const next = plan.schedules.find((item) => item.status !== InstallmentScheduleStatus.PAID && item.status !== InstallmentScheduleStatus.CANCELLED);
  const overdue = Boolean(next && next.dueAt < new Date());
  const whatsapp = plan.shop.phone ? `https://wa.me/${plan.shop.phone.replace(/\D/g, "")}?text=${encodeURIComponent(`مرحباً، أستفسر عن خطة الأقساط ${plan.planNumber}`)}` : null;

  return <main className="min-h-screen bg-slate-950 px-3 py-6 text-slate-100 sm:px-5">
    <div className="mx-auto max-w-2xl space-y-4">
      <header className="rounded-3xl border border-slate-800 bg-slate-900 p-5 text-center shadow-2xl"><div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-teal-400/10 text-teal-400"><WalletCards className="h-6 w-6" /></div><h1 className="mt-3 text-xl font-black">{plan.shop.name}</h1><p className="mt-1 text-xs text-slate-400">متابعة الدفعات والأقساط</p><div className="mt-3 inline-flex rounded-full border border-slate-700 bg-slate-800 px-3 py-1 font-numeric text-xs font-bold text-teal-300">{plan.planNumber}</div></header>

      <section className="rounded-3xl border border-slate-800 bg-slate-900 p-5"><div className="flex items-start justify-between gap-4"><div><div className="text-xs text-slate-400">العميل</div><div className="mt-1 font-black">{plan.customer.name}</div><div className="mt-3 text-xs text-slate-400">الاتفاق</div><div className="mt-1 font-bold text-slate-200">{plan.title}</div></div><span className={`rounded-full px-3 py-1 text-[10px] font-black ${plan.status === InstallmentPlanStatus.COMPLETED ? "bg-emerald-400/10 text-emerald-300" : overdue ? "bg-rose-400/10 text-rose-300" : "bg-teal-400/10 text-teal-300"}`}>{plan.status === InstallmentPlanStatus.COMPLETED ? "مكتمل" : overdue ? "يوجد قسط متأخر" : "منتظم"}</span></div></section>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4"><PublicMetric label="الإجمالي" value={formatCurrency(plan.totalAmount, plan.shop.currency)} /><PublicMetric label="المدفوع" value={formatCurrency(plan.amountPaid, plan.shop.currency)} tone="emerald" /><PublicMetric label="المتبقي" value={formatCurrency(plan.balanceDue, plan.shop.currency)} tone="amber" /><PublicMetric label="الدفعة القادمة" value={next ? formatCurrency(Number(next.amount) - Number(next.amountPaid), plan.shop.currency) : "مكتمل"} tone={overdue ? "rose" : "teal"} /></div>

      {next && <section className={`rounded-3xl border p-5 ${overdue ? "border-rose-500/30 bg-rose-500/10" : "border-teal-500/30 bg-teal-500/10"}`}><div className="flex items-center gap-2"><Clock3 className={`h-5 w-5 ${overdue ? "text-rose-300" : "text-teal-300"}`} /><div><div className="text-xs text-slate-300">{overdue ? "قسط متأخر" : "موعد القسط القادم"}</div><div className="mt-1 font-black">{formatDate(next.dueAt)} — {formatCurrency(Number(next.amount) - Number(next.amountPaid), plan.shop.currency)}</div></div></div></section>}

      <section className="overflow-hidden rounded-3xl border border-slate-800 bg-slate-900"><div className="border-b border-slate-800 p-5"><h2 className="flex items-center gap-2 font-black"><CalendarDays className="h-5 w-5 text-teal-400" />جدول الأقساط</h2></div><div className="divide-y divide-slate-800">{plan.schedules.map((item) => { const itemOverdue = item.status !== InstallmentScheduleStatus.PAID && item.dueAt < new Date(); return <div key={item.id} className="flex items-center justify-between gap-3 p-4"><div className="flex items-center gap-3"><span className={`flex h-9 w-9 items-center justify-center rounded-xl text-xs font-black ${item.status === InstallmentScheduleStatus.PAID ? "bg-emerald-400/10 text-emerald-300" : itemOverdue ? "bg-rose-400/10 text-rose-300" : "bg-slate-800 text-slate-300"}`}>{item.installmentNo}</span><div><div className="font-numeric text-sm font-black">{formatCurrency(item.amount, plan.shop.currency)}</div><div className="mt-0.5 text-[10px] text-slate-400">{formatDate(item.dueAt)}</div></div></div><div className="text-left"><div className={`text-xs font-black ${item.status === InstallmentScheduleStatus.PAID ? "text-emerald-300" : itemOverdue ? "text-rose-300" : "text-slate-300"}`}>{item.status === InstallmentScheduleStatus.PAID ? "مدفوع" : item.status === InstallmentScheduleStatus.PARTIALLY_PAID ? "جزئي" : itemOverdue ? "متأخر" : "قادم"}</div>{Number(item.amountPaid) > 0 && item.status !== InstallmentScheduleStatus.PAID && <div className="mt-1 text-[10px] text-slate-500">دُفع {formatCurrency(item.amountPaid, plan.shop.currency)}</div>}</div></div>; })}</div></section>

      <section className="rounded-3xl border border-slate-800 bg-slate-900 p-5"><h2 className="flex items-center gap-2 font-black"><CheckCircle2 className="h-5 w-5 text-emerald-400" />سجل الدفعات</h2>{plan.payments.length === 0 ? <p className="mt-4 text-xs text-slate-500">لا توجد دفعات مسجلة.</p> : <div className="mt-4 space-y-2">{plan.payments.map((payment) => <div key={payment.id} className="flex items-center justify-between rounded-xl bg-slate-800/70 p-3"><div><div className="text-sm font-black text-emerald-300">{formatCurrency(payment.amount, plan.shop.currency)}</div><div className="mt-1 text-[10px] text-slate-500">{payment.isDownPayment ? "دفعة أولى" : "دفعة"}{payment.sourceName ? ` — ${payment.sourceName}` : ""}</div></div><div className="text-left text-[10px] text-slate-400">{formatDateTime(payment.paidAt)}</div></div>)}</div>}</section>

      <footer className="rounded-3xl border border-slate-800 bg-slate-900 p-5 text-center"><ShieldCheck className="mx-auto h-5 w-5 text-teal-400" /><p className="mt-2 text-[11px] leading-5 text-slate-400">هذه الصفحة للعرض فقط. تُسجل الدفعات لدى المتجر وتظهر هنا تلقائياً.</p>{whatsapp && <a href={whatsapp} target="_blank" rel="noreferrer" className="mt-4 inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-emerald-500 px-5 text-xs font-black text-slate-950"><Phone className="h-4 w-4" />التواصل مع المتجر</a>}</footer>
    </div>
  </main>;
}

function PublicMetric({ label, value, tone = "slate" }: { label: string; value: string; tone?: "slate" | "teal" | "emerald" | "amber" | "rose" }) { const colors = { slate: "text-white", teal: "text-teal-300", emerald: "text-emerald-300", amber: "text-amber-300", rose: "text-rose-300" }; return <div className="rounded-2xl border border-slate-800 bg-slate-900 p-3"><div className="text-[10px] text-slate-500">{label}</div><div className={`mt-2 font-numeric text-sm font-black ${colors[tone]}`}>{value}</div></div>; }
