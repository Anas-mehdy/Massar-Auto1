import { InstallmentPlanStatus } from "@prisma/client";
import { AlertTriangle, CalendarClock, CheckCircle2, Eye, Pencil, Plus, Search, Trash2, WalletCards } from "lucide-react";
import Link from "next/link";

import { EmptyState } from "@/components/empty-state";
import { ConfirmSubmitButton } from "@/components/confirm-submit-button";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { requirePermission } from "@/lib/auth/context";
import { formatCurrency, formatDate } from "@/lib/format";
import { installmentService } from "@/lib/services/installmentService";
import { localDateString, timeZoneForCountry } from "@/lib/timezone";
import { PlanStatus } from "./_components";
import { deleteInstallmentPlanAction } from "./actions";

export const dynamic = "force-dynamic";

function calendarDaysFromToday(value: Date, now: Date, timeZone: string) {
  const due = localDateString(value, timeZone);
  const today = localDateString(now, timeZone);
  const dueUtc = Date.parse(`${due}T00:00:00.000Z`);
  const todayUtc = Date.parse(`${today}T00:00:00.000Z`);
  return Math.round((dueUtc - todayUtc) / 86400000);
}

export default async function InstallmentsPage({ searchParams }: { searchParams: Promise<{ search?: string; error?: string; deleted?: string }> }) {
  const query = await searchParams;
  const auth = await requirePermission("invoices:read");
  const canEdit = auth.permissions.includes("invoices:pay");
  const canDelete = auth.permissions.includes("invoices:void");
  const plans = await installmentService.listPlans(auth.shop.id, query.search);
  const now = new Date();
  const timeZone = timeZoneForCountry(auth.shop.countryCode);
  const active = plans.filter((plan) => plan.status === InstallmentPlanStatus.ACTIVE);
  const overdue = active.filter((plan) => plan.schedules[0] && calendarDaysFromToday(plan.schedules[0].dueAt, now, timeZone) < 0);
  const dueSoon = active.filter((plan) => {
    const due = plan.schedules[0]?.dueAt;
    if (!due) return false;
    const days = calendarDaysFromToday(due, now, timeZone);
    return days >= 0 && days <= 7;
  });
  const totalDue = active.reduce((sum, plan) => sum + Number(plan.balanceDue), 0);

  return <div className="space-y-6">
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <PageHeader title="الدفعات والأقساط" description="تابع الخطط المستقلة والفواتير المقسّطة ومواعيد التحصيل" />
      {canEdit && <Button asChild className="h-11 rounded-xl font-black"><Link href="/installments/new"><Plus className="ml-2 h-4 w-4" />خطة تقسيط جديدة</Link></Button>}
    </div>

    {query.deleted && <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-bold text-emerald-700">تم حذف خطة الأقساط بنجاح.</div>}
    {query.error && <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm font-bold text-rose-700">{query.error}</div>}

    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <Summary icon={WalletCards} label="الخطط النشطة" value={String(active.length)} tone="teal" />
      <Summary icon={AlertTriangle} label="خطط متأخرة" value={String(overdue.length)} tone="rose" />
      <Summary icon={CalendarClock} label="مستحقة خلال أسبوع" value={String(dueSoon.length)} tone="amber" />
      <Summary icon={CheckCircle2} label="إجمالي الرصيد" value={formatCurrency(totalDue, auth.shop.currency)} tone="violet" />
    </div>

    <form className="erp-filter-card flex flex-col gap-3 sm:flex-row">
      <div className="relative flex-1"><Search className="absolute right-3.5 top-3.5 h-4 w-4 text-slate-400" /><input name="search" defaultValue={query.search || ""} className="erp-input pr-10" placeholder="اسم العميل، الهاتف، رقم الخطة أو الوصف..." /></div>
      <Button type="submit" className="h-11 px-6 font-bold">بحث</Button>
    </form>

    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      {plans.length === 0 ? <EmptyState icon={WalletCards} title="لا توجد خطط أقساط" description="أنشئ أول خطة مستقلة أو قسّط رصيد فاتورة موجودة." /> : <div className="overflow-x-auto"><table className="erp-table min-w-[1080px]"><thead><tr><th>رقم الخطة</th><th>العميل</th><th>الوصف</th><th>المصدر</th><th>المدفوع</th><th>المتبقي</th><th>القسط القادم</th><th>الحالة</th><th className="text-center">الإجراءات</th></tr></thead><tbody>{plans.map((plan) => {
        const next = plan.schedules[0];
        const isOverdue = plan.status === InstallmentPlanStatus.ACTIVE && next && calendarDaysFromToday(next.dueAt, now, timeZone) < 0;
        return <tr key={plan.id}>
          <td className="font-numeric font-black text-slate-900">{plan.planNumber}</td>
          <td><div className="font-bold text-slate-900">{plan.customer.name}</div><div className="text-[10px] text-slate-400" dir="ltr">{plan.customer.phone || ""}</div></td>
          <td className="max-w-56 truncate font-semibold text-slate-700">{plan.title}</td>
          <td><span className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-bold text-slate-600">{plan.invoice ? `فاتورة ${plan.invoice.invoiceNumber}` : "اتفاق مستقل"}</span></td>
          <td className="font-numeric font-bold text-emerald-700">{formatCurrency(plan.amountPaid, auth.shop.currency)}</td>
          <td className="font-numeric font-black text-amber-700">{formatCurrency(plan.balanceDue, auth.shop.currency)}</td>
          <td>{next ? <div><div className={`font-numeric text-xs font-black ${isOverdue ? "text-rose-700" : "text-slate-800"}`}>{formatCurrency(Number(next.amount) - Number(next.amountPaid), auth.shop.currency)}</div><div className={`text-[10px] ${isOverdue ? "text-rose-600" : "text-slate-400"}`}>{formatDate(next.dueAt, timeZone)}</div></div> : "-"}</td>
          <td><PlanStatus status={plan.status} overdue={Boolean(isOverdue)} /></td>
          <td><div className="flex items-center justify-center gap-1.5">
            <Button asChild size="sm" variant="outline" title="عرض"><Link href={`/installments/${plan.id}`}><Eye className="h-4 w-4" /></Link></Button>
            {canEdit && <Button asChild size="sm" variant="outline" className="text-indigo-700" title="تعديل"><Link href={`/installments/${plan.id}/edit`}><Pencil className="ml-1 h-3.5 w-3.5" />تعديل</Link></Button>}
            {canDelete && <form action={deleteInstallmentPlanAction}><input type="hidden" name="planId" value={plan.id} /><ConfirmSubmitButton type="submit" size="sm" variant="outline" className="border-rose-200 text-rose-700 hover:bg-rose-50" message={`هل تريد حذف خطة ${plan.planNumber}؟ لا يمكن حذف خطة تحتوي دفعات.`}><Trash2 className="ml-1 h-3.5 w-3.5" />حذف</ConfirmSubmitButton></form>}
          </div></td>
        </tr>;
      })}</tbody></table></div>}
    </div>
  </div>;
}

function Summary({ icon: Icon, label, value, tone }: { icon: typeof WalletCards; label: string; value: string; tone: "teal" | "rose" | "amber" | "violet" }) {
  const colors = { teal: "bg-teal-50 text-teal-700 border-teal-200", rose: "bg-rose-50 text-rose-700 border-rose-200", amber: "bg-amber-50 text-amber-700 border-amber-200", violet: "bg-violet-50 text-violet-700 border-violet-200" };
  return <div className={`rounded-2xl border p-4 ${colors[tone]}`}><Icon className="h-5 w-5" /><div className="mt-3 text-2xl font-black font-numeric">{value}</div><div className="mt-1 text-xs font-bold opacity-80">{label}</div></div>;
}
