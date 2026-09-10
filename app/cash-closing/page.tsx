import Link from "next/link";
import { CalendarDays, CheckCircle2, LockKeyhole, RotateCcw, WalletCards } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { requirePermission } from "@/lib/auth/context";
import { dailyCashCloseQueryService } from "@/lib/services/dailyCashCloseQueryService";
import { dailyCashCloseService } from "@/lib/services/dailyCashCloseService";
import { localDateString, timeZoneForCountry } from "@/lib/timezone";
import { closeBusinessDayAction, reopenBusinessDayAction } from "./actions";

export const dynamic = "force-dynamic";

type PageProps = { searchParams: Promise<{ date?: string }> };
type CloseRow = {
  id: string;
  businessDate: Date | string;
  status: string;
  openingBalance: string | number;
  cashSalesTotal: string | number;
  customerReceiptsTotal: string | number;
  receiptVouchersTotal: string | number;
  otherCashInTotal: string | number;
  supplierPaymentsTotal: string | number;
  expensesTotal: string | number;
  paymentVouchersTotal: string | number;
  otherCashOutTotal: string | number;
  expectedCash: string | number;
  actualCash: string | number | null;
  variance: string | number | null;
  closeVersion: number;
  closedByName?: string | null;
  reopenedByName?: string | null;
  closedAt?: Date | null;
  reopenedAt?: Date | null;
  reopenReason?: string | null;
};

const field = "h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100";

function money(value: string | number | null | undefined, currency: string) {
  return new Intl.NumberFormat("ar", { style: "currency", currency, maximumFractionDigits: 2 }).format(Number(value ?? 0));
}

function dateText(value: Date | string) {
  return typeof value === "string" ? value.slice(0, 10) : value.toISOString().slice(0, 10);
}

function statusLabel(status: string) {
  if (status === "CLOSED") return "مغلق";
  if (status === "REOPENED") return "معاد فتحه";
  return "مسودة";
}

export default async function CashClosingPage({ searchParams }: PageProps) {
  const auth = await requirePermission("cash:close");
  const params = await searchParams;
  const timeZone = timeZoneForCountry(auth.shop.countryCode);
  const today = localDateString(new Date(), timeZone);
  const selectedDate = params.date && /^\d{4}-\d{2}-\d{2}$/.test(params.date) ? params.date : today;

  const [totals, currentClose, closes] = await Promise.all([
    dailyCashCloseService.calculateDailyCashClose(auth.shop.id, selectedDate),
    dailyCashCloseService.getDailyCashClose(auth.shop.id, selectedDate),
    dailyCashCloseService.listDailyCashCloses(auth.shop.id, 60),
  ]);
  const close = currentClose as CloseRow | null;
  const closeRows = closes as CloseRow[];
  const events = close ? await dailyCashCloseQueryService.listCloseEvents(auth.shop.id, close.id) : [];
  const canReopen = auth.permissions.includes("cash:reopen");

  const inflow = totals.cashSalesTotal + totals.customerReceiptsTotal + totals.receiptVouchersTotal + totals.otherCashInTotal;
  const outflow = totals.supplierPaymentsTotal + totals.expensesTotal + totals.paymentVouchersTotal + totals.otherCashOutTotal;

  return <div className="space-y-6">
    <PageHeader title="الإغلاق النقدي اليومي" description="مطابقة الدرج الفعلي مع رصيد النظام، وتجميد اليوم بعد الإغلاق مع سجل تدقيق لإعادة الفتح." actions={<Button asChild variant="outline" className="font-black"><Link href="/cash-drawer"><WalletCards className="ml-1 h-4 w-4" />الدرج النقدي</Link></Button>} />

    <form className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:flex-row sm:items-end">
      <label className="grid flex-1 gap-2 text-xs font-black text-slate-700"><span>يوم العمل</span><input type="date" name="date" defaultValue={selectedDate} className={field} /></label>
      <Button type="submit" variant="outline" className="font-black"><CalendarDays className="ml-1 h-4 w-4" />عرض اليوم</Button>
    </form>

    {close?.status === "CLOSED" ? <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-black text-emerald-900"><div className="flex items-center gap-2"><LockKeyhole className="h-5 w-5" />يوم {selectedDate} مغلق — النسخة {close.closeVersion}</div><div className="mt-1 text-xs font-semibold text-emerald-800">أي عملية مالية مرتبطة بهذا التاريخ يجب أن تمر أولًا بإعادة فتح اليوم.</div></div> : close?.status === "REOPENED" ? <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm font-black text-amber-900">اليوم معاد فتحه حاليًا ويمكن تسجيل التعديلات ثم إعادة الإغلاق. {close.reopenReason ? `السبب: ${close.reopenReason}` : ""}</div> : null}

    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
      <div className="rounded-2xl border border-slate-200 bg-white p-4"><div className="text-xs font-black text-slate-500">رصيد بداية اليوم</div><div className="mt-2 text-xl font-black text-slate-950">{money(totals.openingBalance, auth.shop.currency)}</div></div>
      <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4"><div className="text-xs font-black text-emerald-700">إجمالي الداخل</div><div className="mt-2 text-xl font-black text-emerald-950">{money(inflow, auth.shop.currency)}</div></div>
      <div className="rounded-2xl border border-red-200 bg-red-50 p-4"><div className="text-xs font-black text-red-700">إجمالي الخارج</div><div className="mt-2 text-xl font-black text-red-950">{money(outflow, auth.shop.currency)}</div></div>
      <div className="rounded-2xl border border-indigo-200 bg-indigo-50 p-4"><div className="text-xs font-black text-indigo-700">الرصيد المتوقع</div><div className="mt-2 text-xl font-black text-indigo-950">{money(totals.expectedCash, auth.shop.currency)}</div></div>
      <div className={`rounded-2xl border p-4 ${close?.variance != null && Number(close.variance) !== 0 ? "border-amber-200 bg-amber-50" : "border-slate-200 bg-white"}`}><div className="text-xs font-black text-slate-500">فرق آخر إغلاق</div><div className="mt-2 text-xl font-black text-slate-950">{close?.variance != null ? money(close.variance, auth.shop.currency) : "-"}</div></div>
    </div>

    <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-100 p-5"><h2 className="font-black text-slate-950">تفصيل حركة اليوم</h2></div>
      <div className="grid gap-3 p-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-xl bg-slate-50 p-3"><div className="text-xs font-bold text-slate-500">مبيعات نقدية</div><div className="mt-1 font-black">{money(totals.cashSalesTotal, auth.shop.currency)}</div></div>
        <div className="rounded-xl bg-slate-50 p-3"><div className="text-xs font-bold text-slate-500">تحصيلات العملاء</div><div className="mt-1 font-black">{money(totals.customerReceiptsTotal, auth.shop.currency)}</div></div>
        <div className="rounded-xl bg-slate-50 p-3"><div className="text-xs font-bold text-slate-500">سندات قبض</div><div className="mt-1 font-black">{money(totals.receiptVouchersTotal, auth.shop.currency)}</div></div>
        <div className="rounded-xl bg-slate-50 p-3"><div className="text-xs font-bold text-slate-500">دخل نقدي آخر</div><div className="mt-1 font-black">{money(totals.otherCashInTotal, auth.shop.currency)}</div></div>
        <div className="rounded-xl bg-slate-50 p-3"><div className="text-xs font-bold text-slate-500">مدفوعات الموردين</div><div className="mt-1 font-black">{money(totals.supplierPaymentsTotal, auth.shop.currency)}</div></div>
        <div className="rounded-xl bg-slate-50 p-3"><div className="text-xs font-bold text-slate-500">المصاريف</div><div className="mt-1 font-black">{money(totals.expensesTotal, auth.shop.currency)}</div></div>
        <div className="rounded-xl bg-slate-50 p-3"><div className="text-xs font-bold text-slate-500">سندات صرف</div><div className="mt-1 font-black">{money(totals.paymentVouchersTotal, auth.shop.currency)}</div></div>
        <div className="rounded-xl bg-slate-50 p-3"><div className="text-xs font-bold text-slate-500">خروج نقدي آخر</div><div className="mt-1 font-black">{money(totals.otherCashOutTotal, auth.shop.currency)}</div></div>
      </div>
    </section>

    {close?.status !== "CLOSED" ? <section className="rounded-2xl border border-emerald-200 bg-white shadow-sm"><div className="border-b border-emerald-100 bg-emerald-50/50 p-5"><h2 className="flex items-center gap-2 font-black text-emerald-950"><CheckCircle2 className="h-5 w-5" />إغلاق اليوم</h2><p className="mt-1 text-xs font-semibold text-emerald-800">عدّ النقد الموجود فعليًا بالدرج وأدخل المبلغ. سيحفظ النظام الفرق والتفاصيل كنسخة تدقيق.</p></div><form action={closeBusinessDayAction} className="grid gap-3 p-5 sm:grid-cols-2"><input type="hidden" name="businessDate" value={selectedDate} /><label className="grid gap-2 text-xs font-black text-slate-700"><span>الرصيد الفعلي المعدود</span><input name="actualCash" type="number" min="0" step="0.01" defaultValue={totals.expectedCash.toFixed(2)} required className={field} /></label><label className="grid gap-2 text-xs font-black text-slate-700"><span>ملاحظة الإغلاق</span><input name="notes" className={field} placeholder="اختياري" /></label><Button type="submit" className="font-black sm:col-span-2"><LockKeyhole className="ml-1 h-4 w-4" />اعتماد وإغلاق يوم {selectedDate}</Button></form></section> : canReopen ? <section className="rounded-2xl border border-amber-200 bg-white shadow-sm"><div className="border-b border-amber-100 bg-amber-50/60 p-5"><h2 className="flex items-center gap-2 font-black text-amber-950"><RotateCcw className="h-5 w-5" />إعادة فتح اليوم</h2><p className="mt-1 text-xs font-semibold text-amber-800">إعادة الفتح لا تمحو الإغلاق السابق. تحفظ كحدث مستقل مع اسم المستخدم والسبب.</p></div><form action={reopenBusinessDayAction} className="grid gap-3 p-5"><input type="hidden" name="businessDate" value={selectedDate} /><input name="reason" required minLength={3} className={field} placeholder="سبب إعادة فتح اليوم" /><Button type="submit" variant="outline" className="font-black"><RotateCcw className="ml-1 h-4 w-4" />إعادة فتح اليوم</Button></form></section> : null}

    {events.length ? <section className="rounded-2xl border border-slate-200 bg-white shadow-sm"><div className="border-b border-slate-100 p-4 font-black text-slate-950">سجل التدقيق لهذا اليوم</div><div className="divide-y divide-slate-100">{events.map((event) => <div key={event.id} className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between"><div><div className="font-black text-slate-900">{event.action === "CLOSED" ? "إغلاق" : event.action === "REOPENED" ? "إعادة فتح" : "إعادة إغلاق"} — نسخة {event.version}</div><div className="mt-1 text-xs text-slate-500">{event.performedByName || "مستخدم"}{event.reason ? ` • ${event.reason}` : ""}</div></div><div className="text-xs font-bold text-slate-400">{new Intl.DateTimeFormat("ar", { dateStyle: "medium", timeStyle: "short" }).format(new Date(event.createdAt))}</div></div>)}</div></section> : null}

    <section className="rounded-2xl border border-slate-200 bg-white shadow-sm"><div className="border-b border-slate-100 p-4 font-black text-slate-950">آخر الإغلاقات</div><div className="overflow-x-auto"><table className="min-w-[760px] w-full text-sm"><thead className="bg-slate-50 text-xs text-slate-500"><tr><th className="p-3 text-right">اليوم</th><th className="p-3 text-right">الحالة</th><th className="p-3 text-right">المتوقع</th><th className="p-3 text-right">الفعلي</th><th className="p-3 text-right">الفرق</th><th className="p-3 text-right">نسخة</th></tr></thead><tbody className="divide-y divide-slate-100">{closeRows.map((row) => <tr key={row.id}><td className="p-3"><Link className="font-black text-cyan-700 hover:underline" href={`/cash-closing?date=${dateText(row.businessDate)}`}>{dateText(row.businessDate)}</Link></td><td className="p-3 font-bold">{statusLabel(row.status)}</td><td className="p-3 font-black">{money(row.expectedCash, auth.shop.currency)}</td><td className="p-3">{row.actualCash == null ? "-" : money(row.actualCash, auth.shop.currency)}</td><td className="p-3 font-black">{row.variance == null ? "-" : money(row.variance, auth.shop.currency)}</td><td className="p-3">{row.closeVersion}</td></tr>)}</tbody></table></div>{!closeRows.length ? <div className="p-8 text-center text-sm font-bold text-slate-400">لا يوجد إغلاق يومي مسجل بعد.</div> : null}</section>
  </div>;
}
