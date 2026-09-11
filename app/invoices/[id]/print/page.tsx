import QRCode from "qrcode";
import { notFound } from "next/navigation";
import Image from "next/image";
import { getCurrentShopContext } from "@/lib/current-shop";
import { invoiceService } from "@/lib/services/invoiceService";
import { shopService } from "@/lib/services/shopService";
import { formatCurrency, formatDateTime } from "@/lib/format";
import { PrintActions } from "@/components/print-actions";
import { getInvoiceTypeLabel } from "@/app/invoices/_components";
import { AutoServiceInvoicePrint } from "./_auto-service-print";

export const dynamic = "force-dynamic";

type InvoicePrintPageProps = {
  params: Promise<{
    id: string;
  }>;
};

export default async function InvoicePrintPage({ params }: InvoicePrintPageProps) {
  const { id } = await params;
  const { shopId } = await getCurrentShopContext();

  const [invoice, shop] = await Promise.all([
    invoiceService.getInvoiceById(shopId, id),
    shopService.getShopById(shopId),
  ]);

  if (!invoice || !shop) {
    notFound();
  }

  const qrValue = invoice.invoiceNumber || invoice.id;
  const qrCodeDataUrl = await QRCode.toDataURL(qrValue, {
    margin: 0,
    width: 140,
  });

  const currency = shop.currency || "SAR";

  return (
    <div className="min-h-screen bg-slate-100 py-8 px-4 flex items-start justify-center selection:bg-none print:min-h-0 print:py-0 print:px-0">
      {/* Floating Action Bar */}
      <PrintActions backUrl={`/invoices/${invoice.id}`} />

      {/* 80mm Thermal Receipt Container */}
      <div className="w-[80mm] max-w-full bg-white p-5 shadow-2xl rounded-xl border border-slate-300 text-slate-900 font-sans print:shadow-none print:border-0 print:p-2 print:m-0 print:w-full">
        {/* Header Shop Info */}
        <div className="text-center border-b-2 border-dashed border-slate-900 pb-3">
          <h1 className="text-base font-black tracking-tight text-slate-950 uppercase">
            {shop.name}
          </h1>
          {shop.phone && (
            <p className="text-[11px] font-bold text-slate-800 mt-0.5" dir="ltr">
              {shop.phone}
            </p>
          )}
          {shop.address && (
            <p className="text-[10px] font-medium text-slate-700 mt-0.5">
              {shop.address}
            </p>
          )}
          {shop.taxNumber && (
            <p className="text-[10px] font-bold text-slate-700 mt-0.5">
              الرقم الضريبي: <span className="font-numeric">{shop.taxNumber}</span>
            </p>
          )}
        </div>

        {/* Invoice Title */}
        <div className="text-center py-2 border-b border-slate-300">
          <span className="text-[11px] font-black tracking-wider text-slate-900 bg-slate-100 px-3 py-0.5 rounded border border-slate-300 inline-block">
            فاتورة ضريبية مبسطة
          </span>
          <div className="text-lg font-black text-slate-950 font-numeric mt-1 tracking-tight">
            {invoice.invoiceNumber}
          </div>
          <div className="text-[10px] text-slate-600 font-numeric mt-0.5">
            تاريخ الإصدار: {formatDateTime(invoice.issuedAt)}
          </div>
        </div>

        {/* Customer & Type */}
        <div className="py-2 border-b border-slate-300 text-xs space-y-1">
          <div className="flex justify-between items-baseline">
            <span className="text-[10px] font-bold text-slate-600">العميل:</span>
            <span className="font-extrabold text-slate-900">
              {invoice.customer?.name ?? "عميل نقدي"}
            </span>
          </div>
          {invoice.customer?.phone && (
            <div className="flex justify-between items-baseline">
              <span className="text-[10px] font-bold text-slate-600">الهاتف:</span>
              <span className="font-bold text-slate-900 font-numeric" dir="ltr">
                {invoice.customer.phone}
              </span>
            </div>
          )}
          <div className="flex justify-between items-baseline">
            <span className="text-[10px] font-bold text-slate-600">نوع الخدمة:</span>
            <span className="font-bold text-slate-800">
              {getInvoiceTypeLabel(invoice.type)}
            </span>
          </div>
        </div>

        <AutoServiceInvoicePrint invoiceId={invoice.id} />

        {/* Financial Summary */}
        <div className="py-2.5 border-b border-slate-300 text-xs space-y-1.5">
          <div className="flex justify-between items-baseline">
            <span className="text-slate-600 font-bold">المجموع الفرعي:</span>
            <span className="font-extrabold text-slate-900 font-numeric">
              {formatCurrency(invoice.subtotal, currency)}
            </span>
          </div>

          {Number(invoice.discountTotal) > 0 && (
            <div className="flex justify-between items-baseline text-rose-600 font-bold">
              <span>الخصم:</span>
              <span className="font-numeric">
                -{formatCurrency(invoice.discountTotal, currency)}
              </span>
            </div>
          )}

          {Number(invoice.taxTotal) > 0 && (
            <div className="flex justify-between items-baseline text-slate-600">
              <span>ضريبة القيمة المضافة ({Number(shop.taxRate)}%):</span>
              <span className="font-bold text-slate-900 font-numeric">
                {formatCurrency(invoice.taxTotal, currency)}
              </span>
            </div>
          )}

          <div className="flex justify-between items-center text-sm font-black bg-slate-100 p-2 rounded border border-slate-200 mt-1">
            <span>الإجمالي النهائي:</span>
            <span className="font-numeric text-base">
              {formatCurrency(invoice.total, currency)}
            </span>
          </div>
        </div>

        {/* Payments Summary */}
        <div className="py-2.5 border-b-2 border-dashed border-slate-900 text-xs space-y-1">
          <div className="flex justify-between items-baseline">
            <span className="font-bold text-emerald-700">المدفوع:</span>
            <span className="font-extrabold text-emerald-800 font-numeric">
              {formatCurrency(invoice.amountPaid, currency)}
            </span>
          </div>

          <div className="flex justify-between items-baseline">
            <span className="font-bold text-slate-800">المتبقي:</span>
            <span className="font-black text-slate-950 font-numeric">
              {formatCurrency(invoice.balanceDue, currency)}
            </span>
          </div>

          {invoice.payments.length > 0 && (
            <div className="pt-1.5 text-[9.5px] text-slate-600 space-y-0.5 border-t border-dotted border-slate-300 mt-1">
              <span className="font-bold block text-slate-800">سجل الدفعات:</span>
              {invoice.payments.map((pmt) => (
                <div key={pmt.id} className="flex justify-between font-numeric">
                  <span>{formatDateTime(pmt.paidAt)} ({pmt.method}{pmt.sourceName ? ` - ${pmt.sourceName}` : ""})</span>
                  <span className="font-bold text-slate-900">{formatCurrency(pmt.amount, currency)}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* QR Code */}
        <div className="py-3 text-center border-b border-slate-300">
          <div className="inline-block p-1 bg-white border border-slate-300 rounded-lg">
            <Image
              src={qrCodeDataUrl}
              alt={`QR ${invoice.invoiceNumber}`}
              width={110}
              height={110}
              unoptimized
              className="mx-auto"
            />
          </div>
          <p className="text-[9px] font-bold text-slate-500 mt-1">
            رمز التحقق من الفاتورة الضريبية
          </p>
        </div>

        {/* Terms */}
        <div className="py-2 border-b border-slate-300">
          <p className="text-[8.5px] leading-tight text-slate-600 text-center font-medium">
            {shop.terms || "الضمان سارٍ بموجب الفاتورة الأصلية. شكراً لتعاملكم معنا."}
          </p>
        </div>

        {/* Footer greeting */}
        <div className="mt-3 pt-2 text-center text-[9px] font-bold text-slate-500">
          شكراً لثقتكم واختياركم {shop.name}!
        </div>
      </div>
    </div>
  );
}
