import { notFound } from "next/navigation";
import { PrintActions } from "@/components/print-actions";
import { getCurrentShopContext } from "@/lib/current-shop";
import { formatCurrency, formatDateTime } from "@/lib/format";
import { invoiceCreditNoteService, type CreditNoteReasonCode } from "@/lib/services/invoiceCreditNoteService";
import { shopService } from "@/lib/services/shopService";

export const dynamic = "force-dynamic";

const reasonLabels: Record<CreditNoteReasonCode, string> = {
  PRICE_ADJUSTMENT: "تصحيح سعر",
  CUSTOMER_COMPENSATION: "تعويض للعميل",
  SERVICE_CORRECTION: "تصحيح على خدمة الصيانة",
  DISCOUNT_AFTER_DELIVERY: "خصم بعد التسليم",
  OTHER: "سبب آخر",
};

type PageProps = {
  params: Promise<{ id: string; creditNoteId: string }>;
};

export default async function CreditNotePrintPage({ params }: PageProps) {
  const { id: invoiceId, creditNoteId } = await params;
  const { shopId } = await getCurrentShopContext();
  const [note, shop] = await Promise.all([
    invoiceCreditNoteService.getCreditNotePrintData(shopId, creditNoteId),
    shopService.getShopById(shopId),
  ]);
  if (!note || !shop || note.invoiceId !== invoiceId) notFound();

  const currency = shop.currency || "SAR";
  const vehicle = note.vehicleMake && note.vehicleModel
    ? `${note.vehicleMake} ${note.vehicleModel}${note.vehicleYear ? ` ${note.vehicleYear}` : ""}`
    : null;

  return (
    <main className="min-h-screen bg-slate-100 px-4 py-8 print:min-h-0 print:bg-white print:p-0">
      <PrintActions backUrl={`/invoices/${invoiceId}`} />
      <article className="mx-auto w-full max-w-[210mm] rounded-2xl border border-slate-200 bg-white p-8 text-slate-950 shadow-xl print:rounded-none print:border-0 print:p-[12mm] print:shadow-none">
        <header className="flex items-start justify-between gap-6 border-b-2 border-slate-900 pb-6">
          <div>
            <h1 className="text-2xl font-black">{shop.name}</h1>
            <div className="mt-2 space-y-1 text-xs font-semibold text-slate-600">
              {shop.phone ? <div>{shop.phone}</div> : null}
              {shop.address ? <div>{shop.address}</div> : null}
              {shop.taxNumber ? <div>الرقم الضريبي: <span className="font-numeric">{shop.taxNumber}</span></div> : null}
            </div>
          </div>
          <div className="text-left">
            <div className="inline-flex rounded-lg border-2 border-rose-700 px-4 py-2 text-lg font-black text-rose-800">إشعار دائن</div>
            <div className="mt-2 font-numeric text-lg font-black">{note.creditNoteNumber}</div>
            <div className="mt-1 text-xs font-bold text-slate-500">{formatDateTime(note.issuedAt)}</div>
          </div>
        </header>

        <section className="mt-6 grid gap-4 md:grid-cols-2">
          <Box label="العميل" value={note.customerName || "عميل نقدي"} />
          <Box label="رقم الهاتف" value={note.customerPhone || "-"} />
          <Box label="الفاتورة الأصلية" value={note.invoiceNumber} />
          <Box label="تاريخ الفاتورة الأصلية" value={formatDateTime(note.invoiceIssuedAt)} />
          {note.orderNumber ? <Box label="أمر الصيانة" value={note.orderNumber} /> : null}
          {vehicle ? <Box label="المركبة" value={vehicle} /> : null}
          {note.plateNumber || note.vin ? <Box label="اللوحة / VIN" value={note.plateNumber || note.vin || "-"} /> : null}
          <Box label="نوع التصحيح" value={reasonLabels[note.reasonCode]} />
        </section>

        <section className="mt-6 rounded-2xl border border-slate-200 p-5">
          <h2 className="text-sm font-black">سبب الإشعار الدائن</h2>
          <p className="mt-2 whitespace-pre-wrap text-sm font-semibold leading-7 text-slate-700">{note.reason}</p>
          {note.notes ? <p className="mt-3 whitespace-pre-wrap border-t border-slate-100 pt-3 text-xs font-semibold leading-6 text-slate-500">ملاحظات: {note.notes}</p> : null}
        </section>

        <section className="mt-6 overflow-hidden rounded-2xl border border-slate-200">
          <div className="grid grid-cols-2 border-b border-slate-200 bg-slate-50 px-5 py-3 text-xs font-black"><span>البيان</span><span className="text-left">القيمة</span></div>
          <MoneyRow label="قيمة التصحيح قبل الضريبة" value={formatCurrency(note.netAmount, currency)} />
          <MoneyRow label="تخفيض الضريبة" value={formatCurrency(note.taxAmount, currency)} />
          <MoneyRow label="إجمالي الإشعار الدائن" value={`-${formatCurrency(note.amount, currency)}`} strong />
        </section>

        <section className="mt-6 grid gap-3 sm:grid-cols-3">
          <Box label="إجمالي الفاتورة الأصلية" value={formatCurrency(note.originalInvoiceTotal, currency)} />
          <Box label="إشعارات سابقة" value={formatCurrency(note.previousCreditTotal, currency)} />
          <Box label="صافي الفاتورة بعد هذا الإشعار" value={formatCurrency(note.effectiveInvoiceTotalAfter, currency)} emphasis />
        </section>

        <footer className="mt-10 border-t border-slate-200 pt-5 text-xs font-semibold leading-6 text-slate-500">
          <p>هذا المستند تصحيح مالي مرتبط بالفاتورة الأصلية ولا يلغيها. يجب الاحتفاظ بالفاتورة الأصلية وهذا الإشعار معاً ضمن سجل العملية.</p>
          {note.createdByName ? <p className="mt-2">أصدره: <span className="font-black text-slate-700">{note.createdByName}</span></p> : null}
        </footer>
      </article>
    </main>
  );
}

function Box({ label, value, emphasis = false }: { label: string; value: string; emphasis?: boolean }) {
  return <div className="rounded-xl border border-slate-200 p-4"><div className="text-[10px] font-black text-slate-400">{label}</div><div className={`mt-1.5 font-bold ${emphasis ? "text-base text-indigo-800" : "text-sm text-slate-800"}`}>{value}</div></div>;
}

function MoneyRow({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return <div className={`grid grid-cols-2 px-5 py-3 text-sm ${strong ? "bg-rose-50 font-black text-rose-800" : "border-b border-slate-100 font-bold text-slate-700"}`}><span>{label}</span><span className="text-left font-numeric">{value}</span></div>;
}
