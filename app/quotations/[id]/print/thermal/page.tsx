import Image from "next/image";
import QRCode from "qrcode";
import { notFound } from "next/navigation";
import { PrintActions } from "@/components/print-actions";
import { requirePermission } from "@/lib/auth/context";
import { formatAutoDate, formatAutoMoney } from "@/lib/auto/service-order-ui";
import { autoPrintService } from "@/lib/services/autoPrintService";
import { shopService } from "@/lib/services/shopService";

export const dynamic = "force-dynamic";

type PageProps = { params: Promise<{ id: string }> };

const statusLabels: Record<string, string> = {
  DRAFT: "مسودة",
  SENT: "مرسل للعميل",
  APPROVED: "موافق عليه",
  PARTIALLY_APPROVED: "موافقة جزئية",
  REJECTED: "مرفوض",
  EXPIRED: "منتهي",
  SUPERSEDED: "نسخة سابقة",
};

const approvalLabels: Record<string, string> = {
  PENDING: "بانتظار القرار",
  APPROVED: "مقبول",
  REJECTED: "مرفوض",
};

export default async function QuotationThermalPrintPage({ params }: PageProps) {
  const auth = await requirePermission("quotes:read");
  const { id } = await params;
  const [quote, shop] = await Promise.all([
    autoPrintService.getQuotationPrintData(auth.shop.id, id),
    shopService.getShopById(auth.shop.id),
  ]);
  if (!quote) notFound();

  const currency = shop.currency || auth.shop.currency || "SAR";
  const qrCodeDataUrl = await QRCode.toDataURL(quote.quoteNumber || quote.id, { margin: 0, width: 140 });

  return (
    <main className="min-h-screen bg-slate-100 px-4 py-8 print:min-h-0 print:bg-white print:p-0" dir="rtl">
      <style>{`@page { size: 80mm auto; margin: 3mm; } @media print { html, body { width: 80mm; background: white !important; } }`}</style>
      <PrintActions backUrl={`/quotations/${quote.id}`} />
      <article className="mx-auto w-[80mm] max-w-full rounded-xl border border-slate-300 bg-white p-4 text-slate-950 shadow-xl print:w-full print:rounded-none print:border-0 print:p-1 print:shadow-none">
        <header className="border-b-2 border-dashed border-slate-900 pb-3 text-center">
          <h1 className="text-base font-black">{shop.name}</h1>
          {shop.phone ? <div className="mt-1 text-[10px] font-bold" dir="ltr">{shop.phone}</div> : null}
          <div className="mt-2 text-[11px] font-black">عرض سعر صيانة مركبة</div>
          <div className="font-numeric text-lg font-black">{quote.quoteNumber}</div>
          <div className="text-[10px] font-bold text-slate-600">نسخة {quote.revision} • {statusLabels[quote.status] ?? quote.status}</div>
        </header>

        <section className="space-y-1 border-b border-slate-300 py-2 text-[10px]">
          <Row label="التاريخ" value={formatAutoDate(quote.createdAt)} />
          <Row label="صالح حتى" value={formatAutoDate(quote.validUntil)} />
          <Row label="العميل" value={quote.customerName} />
          <Row label="الهاتف" value={quote.customerPhone || "-"} />
          <Row label="المركبة" value={`${quote.vehicleMake} ${quote.vehicleModel}${quote.vehicleYear ? ` ${quote.vehicleYear}` : ""}`} />
          <Row label="اللوحة" value={quote.plateNumber || "-"} />
          <Row label="أمر الصيانة" value={quote.orderNumber} />
        </section>

        <Block title="سبب الدخول" value={quote.reportedIssue} />
        {quote.diagnosis ? <Block title="التشخيص" value={quote.diagnosis} /> : null}

        <section className="border-b border-slate-300 py-2 text-[10px]">
          <div className="mb-1.5 font-black">بنود العرض</div>
          <div className="space-y-2">
            {quote.lines.map((line) => (
              <div key={line.id}>
                <div className="flex items-start justify-between gap-2"><span className="font-bold">{line.lineType === "LABOR" ? "عمل" : line.lineType === "PART" ? "قطعة" : "بند"}: {line.description}</span><span className="shrink-0 font-black">{formatAutoMoney(line.lineTotal, currency)}</span></div>
                <div className="text-[9px] text-slate-500">{line.quantity} × {formatAutoMoney(line.unitPrice, currency)} • {approvalLabels[line.approvalStatus] ?? line.approvalStatus}</div>
              </div>
            ))}
          </div>
        </section>

        <section className="space-y-1 border-b-2 border-dashed border-slate-900 py-2 text-[10px]">
          <Row label="المجموع" value={formatAutoMoney(quote.subtotal, currency)} />
          {quote.discountTotal > 0 ? <Row label="الخصم" value={formatAutoMoney(quote.discountTotal, currency)} /> : null}
          {quote.taxTotal > 0 ? <Row label="الضريبة" value={formatAutoMoney(quote.taxTotal, currency)} /> : null}
          <Row label="الإجمالي" value={formatAutoMoney(quote.total, currency)} strong />
        </section>

        {quote.notes ? <Block title="ملاحظات" value={quote.notes} /> : null}
        {quote.approvalDecision ? <Block title="قرار العميل المسجل" value={`${quote.approvalDecision} • ${formatAutoDate(quote.approvalDecidedAt)}`} /> : null}

        <div className="py-3 text-center">
          <Image src={qrCodeDataUrl} alt={`QR ${quote.quoteNumber}`} width={92} height={92} unoptimized className="mx-auto" />
          <div className="mt-1 text-[9px] font-bold text-slate-500">{quote.quoteNumber}</div>
        </div>

        <p className="border-t border-slate-300 pt-2 text-center text-[8px] leading-4 text-slate-500">هذا المستند عرض سعر وليس فاتورة نهائية. أي أعمال إضافية تحتاج موافقة العميل.</p>
        <footer className="mt-7 grid grid-cols-2 gap-5 text-center text-[9px] font-bold">
          <div><div className="border-b border-slate-500" /><div className="mt-1">توقيع العميل</div></div>
          <div><div className="border-b border-slate-500" /><div className="mt-1">مستشار الخدمة</div></div>
        </footer>
      </article>
    </main>
  );
}

function Row({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return <div className="flex items-start justify-between gap-3"><span className="shrink-0 font-bold text-slate-500">{label}:</span><span className={`text-left ${strong ? "font-black" : "font-bold"}`}>{value}</span></div>;
}
function Block({ title, value }: { title: string; value: string }) {
  return <section className="border-b border-slate-300 py-2"><div className="text-[10px] font-black">{title}</div><p className="mt-1 whitespace-pre-wrap text-[10px] font-semibold leading-5 text-slate-700">{value}</p></section>;
}
