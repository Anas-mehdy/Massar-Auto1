import Link from "next/link";
import { ArrowRight, CalendarDays, LockKeyhole, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { requirePermission } from "@/lib/auth/context";
import { dailyCashCloseQueryService } from "@/lib/services/dailyCashCloseQueryService";
import { dailyCashCloseService } from "@/lib/services/dailyCashCloseService";
import { localDateString, timeZoneForCountry } from "@/lib/timezone";
import { CashClosingPrintButton } from "./_print-button";

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
  notes?: string | null;
  closeVersion: number;
  closedByName?: string | null;
  reopenedByName?: string | null;
  closedAt?: Date | null;
  reopenedAt?: Date | null;
  reopenReason?: string | null;
};

const field = "h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:border-slate-400";

function money(value: string | number | null | undefined, currency: string) {
  return new Intl.NumberFormat("ar", { style: "currency", currency, maximumFractionDigits: 2 }).format(Number(value ?? 0));
}

function statusLabel(status: string | undefined) {
  if (status === "CLOSED") return "مغلق";
  if (status === "REOPENED") return "معاد فتحه";
  return "غير مغلق";
}

function actionLabel(action: string) {
  if (action === "CLOSED") return "إغلاق";
  if (action === "REOPENED") return "إعادة فتح";
  return "إعادة إغلاق";
}

export default async function CashClosingPrintPage({ searchParams }: PageProps) {
  const auth = await requirePermission("cash:close");
  const params = await searchParams;
  const timeZone = timeZoneForCountry(auth.shop.countryCode);
  const today = localDateString(new Date(), timeZone);
  const selectedDate = params.date && /^\d{4}-\d{2}-\d{2}$/.test(params.date) ? params.date : today;

  const [liveTotals, rawClose] = await Promise.all([
    dailyCashCloseService.calculateDailyCashClose(auth.shop.id, selectedDate),
    dailyCashCloseService.getDailyCashClose(auth.shop.id, selectedDate),
  ]);
  const close = rawClose as CloseRow | null;
  const events = close ? await dailyCashCloseQueryService.listCloseEvents(auth.shop.id, close.id) : [];

  const useSnapshot = close?.status === "CLOSED";
  const totals = useSnapshot
    ? {
        openingBalance: Number(close.openingBalance),
        cashSalesTotal: Number(close.cashSalesTotal),
        customerReceiptsTotal: Number(close.customerReceiptsTotal),
        receiptVouchersTotal: Number(close.receiptVouchersTotal),
        otherCashInTotal: Number(close.otherCashInTotal),
        supplierPaymentsTotal: Number(close.supplierPaymentsTotal),
        expensesTotal: Number(close.expensesTotal),
        paymentVouchersTotal: Number(close.paymentVouchersTotal),
        otherCashOutTotal: Number(close.otherCashOutTotal),
        expectedCash: Number(close.expectedCash),
      }
    : liveTotals;

  const inflow = totals.cashSalesTotal + totals.customerReceiptsTotal + totals.receiptVouchersTotal + totals.otherCashInTotal;
  const outflow = totals.supplierPaymentsTotal + totals.expensesTotal + totals.paymentVouchersTotal + totals.otherCashOutTotal;

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm print:hidden sm:flex-row sm:items-end">
        <form className="flex flex-1 flex-col gap-2 sm:flex-row sm:items-end">
          <label className="grid flex-1 gap-1.5 text-xs font-black text-slate-700">
            <span>يوم التقرير</span>
            <input type="date" name="date" defaultValue={selectedDate} className={field} />
          </label>
          <Button type="submit" variant="outline" className="font-black"><CalendarDays className="ml-1 h-4 w-4" />عرض</Button>
        </form>
        <Button asChild variant="outline" className="font-black"><Link href={`/cash-closing?date=${selectedDate}`}><ArrowRight className="ml-1 h-4 w-4" />رجوع للإغلاق</Link></Button>
        <CashClosingPrintButton />
      </div>

      <article className="mx-auto max-w-5xl rounded-2xl border border-slate-200 bg-white p-6 shadow-sm print:fixed print:inset-0 print:z-[9999] print:max-w-none print:overflow-visible print:rounded-none print:border-0 print:p-6 print:shadow-none">
        <header className="flex flex-col gap-4 border-b border-slate-200 pb-5 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="text-xs font-black text-slate-500">مسار أوتو — تقرير مالي</div>
            <h1 className="mt-1 text-2xl font-black text-slate-950">تقرير الإغلاق النقدي اليومي</h1>
            <p className="mt-1 text-sm font-bold text-slate-500">يوم العمل: {selectedDate}</p>
          </div>
          <div className="rounded-xl border border-slate-200 px-4 py-3 text-sm">
            <div className="flex items-center gap-2 font-black text-slate-900">
              {close?.status === "CLOSED" ? <LockKeyhole className="h-4 w-4" /> : close?.status === "REOPENED" ? <RotateCcw className="h-4 w-4" /> : null}
              الحالة: {statusLabel(close?.status)}
            </div>
            {close ? <div className="mt-1 text-xs font-bold text-slate-500">نسخة الإغلاق: {close.closeVersion}</div> : null}
          </div>
        </header>

        {close?.status === "REOPENED" ? (
          <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs font-bold text-amber-900">
            هذا اليوم معاد فتحه حاليًا؛ الأرقام أدناه محسوبة من الحركات الحالية وليست لقطة الإغلاق السابقة. {close.reopenReason ? `سبب إعادة الفتح: ${close.reopenReason}` : ""}
          </div>
        ) : null}

        <section className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <Metric label="بداية اليوم" value={money(totals.openingBalance, auth.shop.currency)} />
          <Metric label="إجمالي الداخل" value={money(inflow, auth.shop.currency)} />
          <Metric label="إجمالي الخارج" value={money(outflow, auth.shop.currency)} />
          <Metric label="الرصيد المتوقع" value={money(totals.expectedCash, auth.shop.currency)} />
          <Metric label="الرصيد الفعلي" value={close?.actualCash == null ? "-" : money(close.actualCash, auth.shop.currency)} />
        </section>

        <section className="mt-6">
          <h2 className="mb-3 text-sm font-black text-slate-950">تفصيل حركة اليوم</h2>
          <div className="overflow-hidden rounded-xl border border-slate-200">
            <table className="w-full text-sm">
              <tbody className="divide-y divide-slate-100">
                <ReportRow label="مبيعات نقدية" value={money(totals.cashSalesTotal, auth.shop.currency)} />
                <ReportRow label="تحصيلات العملاء" value={money(totals.customerReceiptsTotal, auth.shop.currency)} />
                <ReportRow label="سندات قبض" value={money(totals.receiptVouchersTotal, auth.shop.currency)} />
                <ReportRow label="دخل نقدي آخر" value={money(totals.otherCashInTotal, auth.shop.currency)} />
                <ReportRow label="مدفوعات الموردين" value={money(totals.supplierPaymentsTotal, auth.shop.currency)} />
                <ReportRow label="المصاريف" value={money(totals.expensesTotal, auth.shop.currency)} />
                <ReportRow label="سندات صرف" value={money(totals.paymentVouchersTotal, auth.shop.currency)} />
                <ReportRow label="خروج نقدي آخر" value={money(totals.otherCashOutTotal, auth.shop.currency)} />
              </tbody>
            </table>
          </div>
        </section>

        <section className="mt-6 grid gap-3 sm:grid-cols-3">
          <Metric label="المتوقع عند الإغلاق" value={close ? money(close.expectedCash, auth.shop.currency) : "-"} />
          <Metric label="الفعلي المعدود" value={close?.actualCash == null ? "-" : money(close.actualCash, auth.shop.currency)} />
          <Metric label="الفرق" value={close?.variance == null ? "-" : money(close.variance, auth.shop.currency)} />
        </section>

        {close?.notes ? <div className="mt-5 rounded-xl border border-slate-200 p-3 text-sm"><span className="font-black">ملاحظة الإغلاق:</span> {close.notes}</div> : null}

        {events.length ? (
          <section className="mt-6">
            <h2 className="mb-3 text-sm font-black text-slate-950">سجل التدقيق</h2>
            <div className="overflow-hidden rounded-xl border border-slate-200">
              <table className="w-full text-xs">
                <thead className="bg-slate-50 text-slate-500"><tr><th className="p-2 text-right">الحدث</th><th className="p-2 text-right">النسخة</th><th className="p-2 text-right">المستخدم</th><th className="p-2 text-right">السبب/الملاحظة</th><th className="p-2 text-right">الوقت</th></tr></thead>
                <tbody className="divide-y divide-slate-100">
                  {events.map((event) => (
                    <tr key={event.id}>
                      <td className="p-2 font-black">{actionLabel(event.action)}</td>
                      <td className="p-2">{event.version}</td>
                      <td className="p-2">{event.performedByName || "مستخدم"}</td>
                      <td className="p-2">{event.reason || "-"}</td>
                      <td className="p-2">{new Intl.DateTimeFormat("ar", { dateStyle: "short", timeStyle: "short", timeZone }).format(new Date(event.createdAt))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ) : null}

        <footer className="mt-8 flex flex-col gap-2 border-t border-slate-200 pt-4 text-xs font-bold text-slate-500 sm:flex-row sm:items-center sm:justify-between">
          <span>تم إنشاء التقرير من مسار أوتو.</span>
          <span>{useSnapshot ? "الأرقام مأخوذة من لقطة الإغلاق المعتمدة." : "الأرقام محسوبة من الحركات الحالية."}</span>
        </footer>
      </article>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl border border-slate-200 p-3"><div className="text-[11px] font-black text-slate-500">{label}</div><div className="mt-1 text-base font-black text-slate-950">{value}</div></div>;
}

function ReportRow({ label, value }: { label: string; value: string }) {
  return <tr><td className="p-3 font-bold text-slate-600">{label}</td><td className="p-3 text-left font-black text-slate-950">{value}</td></tr>;
}
