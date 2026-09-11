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
  SUPERSEDED: "مستبدل بنسخة أحدث",
};

const approvalLabels: Record<string, string> = {
  PENDING: "بانتظار القرار",
  APPROVED: "مقبول",
  REJECTED: "مرفوض",
};

const decisionLabels: Record<string, string> = {
  APPROVED: "موافقة كاملة",
  PARTIALLY_APPROVED: "موافقة جزئية",
  REJECTED: "رفض",
};

export default async function QuotationPrintPage({ params }: PageProps) {
  const auth = await requirePermission("quotes:read");
  const { id } = await params;
  const [quote, shop] = await Promise.all([
    autoPrintService.getQuotationPrintData(auth.shop.id, id),
    shopService.getShopById(auth.shop.id),
  ]);
  if (!quote) notFound();

  const currency = shop.currency || auth.shop.currency || "SAR";
  const qrCodeDataUrl = await QRCode.toDataURL(quote.quoteNumber || quote.id, { margin: 0, width: 180 });

  return (
    <main className="min-h-screen bg-slate-100 p-4 print:min-h-0 print:bg-white print:p-0" dir="rtl">
      <style>{`@page { size: A4; margin: 10mm; } @media print { html, body { background: white !important; } }`}</style>
      <PrintActions backUrl={`/quotations/${quote.id}`} />

      <article className="mx-auto w-[210mm] max-w-full bg-white p-[12mm] text-slate-950 shadow-xl print:w-auto print:max-w-none print:p-0 print:shadow-none">
        <header className="flex items-start justify-between gap-6 border-b-2 border-slate-900 pb-5">
          <div>
            <h1 className="text-2xl font-black">{shop.name}</h1>
            <div className="mt-2 space-y-1 text-xs font-semibold text-slate-600">
              {shop.phone ? <div dir="ltr" className="text-right">{shop.phone}</div> : null}
              {shop.address ? <div>{shop.address}</div> : null}
              {shop.taxNumber ? <div>الرقم الضريبي: {shop.taxNumber}</div> : null}
            </div>
          </div>
          <div className="flex items-start gap-4">
            <div className="text-left">
              <div className="text-xs font-black text-slate-500">عرض سعر صيانة مركبة</div>
              <div className="mt-1 font-numeric text-xl font-black">{quote.quoteNumber}</div>
              <div className="mt-1 text-xs font-bold text-slate-600">نسخة {quote.revision} • {statusLabels[quote.status] ?? quote.status}</div>
              <div className="mt-1 text-[11px] text-slate-500">أنشئ: {formatAutoDate(quote.createdAt)}</div>
            </div>
            <Image src={qrCodeDataUrl} alt={`QR ${quote.quoteNumber}`} width={86} height={86} unoptimized className="shrink-0" />
          </div>
        </header>

        <section className="mt-5 grid grid-cols-2 gap-4">
          <InfoPanel title="بيانات العميل" rows={[
            ["الاسم", quote.customerName],
            ["الهاتف", quote.customerPhone || "-"],
            ["البريد", quote.customerEmail || "-"],
            ["أمر الصيانة", quote.orderNumber],
          ]} />
          <InfoPanel title="بيانات المركبة" rows={[
            ["المركبة", `${quote.vehicleMake} ${quote.vehicleModel}${quote.vehicleYear ? ` • ${quote.vehicleYear}` : ""}`],
            ["اللوحة", quote.plateNumber || "-"],
            ["VIN", quote.vin || "-"],
            ["اللون / المحرك", [quote.vehicleColor, quote.engineNumber].filter(Boolean).join(" • ") || "-"],
          ]} />
        </section>

        <section className="mt-4 grid grid-cols-3 gap-2 text-xs">
          <Stat label="الحالة" value={statusLabels[quote.status] ?? quote.status} />
          <Stat label="صالح حتى" value={formatAutoDate(quote.validUntil)} />
          <Stat label="عداد المركبة" value={quote.odometerAtIntake != null ? `${quote.odometerAtIntake.toLocaleString("ar")} كم` : "-"} />
        </section>

        <section className="mt-5 grid grid-cols-2 gap-4">
          <TextBox title="شكوى العميل / سبب الدخول" value={quote.reportedIssue} />
          <TextBox title="التشخيص" value={quote.diagnosis || "لم يتم تسجيل تشخيص نصي."} />
        </section>

        <section className="mt-6 break-inside-avoid">
          <SectionTitle>بنود عرض السعر</SectionTitle>
          <table className="w-full border-collapse text-xs">
            <thead><tr className="border-y border-slate-300 bg-slate-100"><th className="w-[13%] p-2 text-right">النوع</th><th className="p-2 text-right">الوصف</th><th className="w-[11%] p-2 text-center">الكمية</th><th className="w-[17%] p-2 text-left">سعر الوحدة</th><th className="w-[15%] p-2 text-center">قرار العميل</th><th className="w-[18%] p-2 text-left">الإجمالي</th></tr></thead>
            <tbody>
              {quote.lines.map((line) => <tr key={line.id} className="border-b border-slate-200"><td className="p-2 font-bold">{line.lineType === "LABOR" ? "عمل" : line.lineType === "PART" ? "قطعة" : "أخرى"}</td><td className="p-2 font-bold">{line.description}</td><td className="p-2 text-center">{line.quantity}</td><td className="p-2 text-left">{formatAutoMoney(line.unitPrice, currency)}</td><td className="p-2 text-center text-[10px] font-bold">{approvalLabels[line.approvalStatus] ?? line.approvalStatus}</td><td className="p-2 text-left font-black">{formatAutoMoney(line.lineTotal, currency)}</td></tr>)}
              {!quote.lines.length ? <tr><td colSpan={6} className="p-5 text-center font-bold text-slate-400">لا توجد بنود في عرض السعر.</td></tr> : null}
            </tbody>
          </table>

          <div className="mt-4 mr-auto w-[300px] space-y-1.5 rounded-lg border border-slate-300 p-3 text-xs">
            <MoneyRow label="المجموع الفرعي" value={formatAutoMoney(quote.subtotal, currency)} />
            <MoneyRow label="الخصم" value={formatAutoMoney(quote.discountTotal, currency)} />
            <MoneyRow label="الضريبة" value={formatAutoMoney(quote.taxTotal, currency)} />
            <MoneyRow label="الإجمالي النهائي" value={formatAutoMoney(quote.total, currency)} bold />
          </div>
        </section>

        {quote.notes ? <section className="mt-5"><TextBox title="ملاحظات عرض السعر" value={quote.notes} /></section> : null}

        {quote.approvalDecision ? (
          <section className="mt-5 break-inside-avoid rounded-lg border-2 border-slate-900 p-4 text-xs">
            <div className="font-black">اعتماد العميل المسجل</div>
            <div className="mt-2 grid grid-cols-2 gap-2 text-slate-700">
              <div>القرار: <span className="font-black">{decisionLabels[quote.approvalDecision] ?? quote.approvalDecision}</span></div>
              <div>التاريخ: <span className="font-black">{formatAutoDate(quote.approvalDecidedAt)}</span></div>
              <div>العميل: <span className="font-black">{quote.approvalCustomerName || quote.customerName}</span></div>
              <div>القناة: <span className="font-black">{quote.approvalChannel || "-"}</span></div>
            </div>
            {quote.approvalNote ? <div className="mt-2 border-t border-slate-300 pt-2 font-semibold">{quote.approvalNote}</div> : null}
          </section>
        ) : null}

        <section className="mt-7 break-inside-avoid rounded-lg border border-slate-300 p-4 text-xs leading-6 text-slate-600">
          <div className="font-black text-slate-900">تنبيه</div>
          <p className="mt-1">هذا المستند عرض سعر للأعمال وقطع الغيار الموضحة أعلاه، وليس فاتورة نهائية. قد تتغير القيمة إذا ظهرت أعمال إضافية وبعد موافقة العميل عليها.</p>
          {shop.terms ? <p className="mt-2 border-t border-dashed border-slate-300 pt-2">{shop.terms}</p> : null}
        </section>

        <footer className="mt-8 grid grid-cols-3 gap-6 break-inside-avoid border-t border-slate-300 pt-6 text-center text-xs font-bold">
          <Signature label="اسم/توقيع العميل" />
          <Signature label="مستشار الخدمة" />
          <Signature label="التاريخ" />
        </footer>
      </article>
    </main>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h2 className="mb-3 border-r-4 border-slate-900 pr-2 text-sm font-black">{children}</h2>;
}
function InfoPanel({ title, rows }: { title: string; rows: Array<[string, string]> }) {
  return <div className="rounded-lg border border-slate-300 p-3"><div className="mb-2 text-xs font-black">{title}</div><div className="space-y-1.5 text-xs">{rows.map(([label, value]) => <div key={label} className="grid grid-cols-[105px_1fr] gap-2"><span className="font-bold text-slate-500">{label}</span><span className="font-semibold">{value}</span></div>)}</div></div>;
}
function Stat({ label, value }: { label: string; value: string }) {
  return <div className="rounded-lg bg-slate-100 p-3"><div className="font-bold text-slate-500">{label}</div><div className="mt-1 font-black">{value}</div></div>;
}
function TextBox({ title, value }: { title: string; value: string }) {
  return <div className="rounded-lg border border-slate-300 p-3"><div className="text-xs font-black">{title}</div><p className="mt-2 whitespace-pre-wrap text-xs font-semibold leading-6 text-slate-700">{value}</p></div>;
}
function MoneyRow({ label, value, bold = false }: { label: string; value: string; bold?: boolean }) {
  return <div className={`flex items-center justify-between gap-3 ${bold ? "border-t border-slate-300 pt-2 font-black" : "font-semibold"}`}><span>{label}</span><span className="font-numeric">{value}</span></div>;
}
function Signature({ label }: { label: string }) {
  return <div><div className="h-12 border-b border-slate-400" /><div className="mt-2">{label}</div></div>;
}
