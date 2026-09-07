import QRCode from "qrcode";
import { notFound } from "next/navigation";
import Image from "next/image";
import { PrintActions } from "@/components/print-actions";
import { getCurrentShopContext } from "@/lib/current-shop";
import { formatCurrency, formatDate } from "@/lib/format";
import { softwareServiceService } from "@/lib/services/softwareServiceService";
import { buildAppUrl } from "@/lib/app-url";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ id: string }> };

export default async function SoftwareServiceStickerPage({ params }: Props) {
  const { id } = await params;
  const context = await getCurrentShopContext();
  const sale = await softwareServiceService.getSaleById(context.shopId, id);
  if (!sale || !sale.deviceKept) notFound();

  const serviceUrl = buildAppUrl(`/software-services/${sale.id}`);
  const qrCodeDataUrl = await QRCode.toDataURL(serviceUrl, {
    margin: 0,
    width: 100,
  });
  const currency = context.currency || "SAR";
  const device = [sale.deviceBrand, sale.deviceModel].filter(Boolean).join(" ") || "جهاز غير محدد";

  return (
    <main className="min-h-screen bg-slate-900 px-4 py-10 flex flex-col items-center justify-center selection:bg-none print:min-h-0 print:p-0 print:m-0 print:bg-white">
      <PrintActions backUrl={`/software-services/${sale.id}`} />

      <div className="no-print mb-4 text-center">
        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-bold bg-teal-500/10 text-teal-400 border border-teal-500/20">
          🏷️ معاينة ستيكر الهاتف (المقاس القياسي: 50mm × 30mm)
        </span>
        <p className="text-[10px] text-slate-400 mt-1">
          مخصص للطباعة على طابعات الملصقات الحرارية ولصقه على ظهر الهاتف
        </p>
      </div>

      <section className="sticker-container w-[50mm] min-h-[30mm] h-[30mm] bg-white text-slate-950 p-[2mm] rounded-sm shadow-2xl border border-slate-300 font-sans flex flex-col justify-between overflow-hidden print:shadow-none print:border-0 print:rounded-none print:p-[1.5mm] print:m-0 print:w-[50mm] print:h-[30mm]">
        <div className="flex items-center justify-between border-b border-slate-900 pb-[1mm] leading-none">
          <span className="max-w-[27mm] truncate text-[10px] font-black tracking-tight font-numeric text-black" dir="ltr">
            #{sale.invoiceNumber}
          </span>
          <span className="text-[7.5px] font-extrabold text-slate-800 truncate max-w-[20mm]">
            {context.shopName}
          </span>
        </div>

        <div className="flex items-center justify-between gap-[1.5mm] my-auto pt-[0.5mm] leading-tight">
          <div className="flex-1 min-w-0 space-y-[0.8mm] text-right">
            <div className="text-[9px] font-black text-black truncate">
              📱 {device}
            </div>
            <div className="flex min-w-0 items-center justify-end gap-1 text-[7.5px] font-bold text-slate-900" dir="rtl">
              <span className="min-w-0 truncate">👤 {sale.customerName || "عميل نقدي"}</span>
              {sale.customerPhone ? (
                <span className="shrink-0 whitespace-nowrap font-numeric text-[6.5px]" dir="ltr">
                  ({sale.customerPhone})
                </span>
              ) : null}
            </div>
            <div className="text-[7.5px] font-extrabold text-slate-950 line-clamp-1 bg-slate-100 px-1 py-0.5 rounded border border-slate-200">
              ⚙️ {sale.serviceName}
            </div>
            {sale.deviceSerial ? (
              <div className="truncate font-numeric text-[6px] font-bold text-slate-600" dir="ltr">
                IMEI/SN: {sale.deviceSerial}
              </div>
            ) : null}
          </div>

          <div className="shrink-0 flex flex-col items-center">
            <div className="p-[0.5mm] bg-white border border-slate-400 rounded-xs">
              <Image
                src={qrCodeDataUrl}
                alt={`QR ${sale.invoiceNumber}`}
                width={36}
                height={36}
                unoptimized
                className="w-[9mm] h-[9mm]"
              />
            </div>
            <span className="text-[5.5px] font-extrabold text-slate-700 mt-[0.5mm]">فتح</span>
          </div>
        </div>

        <div className="flex items-center justify-between pt-[0.8mm] border-t border-slate-300 text-[6.5px] font-bold text-slate-700 leading-none">
          <span className="font-numeric">{formatDate(sale.soldAt)}</span>
          <span className="font-black text-slate-900 font-numeric">{formatCurrency(sale.invoiceTotal, currency)}</span>
        </div>
      </section>

      <style dangerouslySetInnerHTML={{ __html: `
        @media print {
          @page {
            size: 50mm 30mm;
            margin: 0mm;
          }
          *, *::before, *::after {
            box-sizing: border-box !important;
          }
          html, body {
            width: 50mm !important;
            height: 30mm !important;
            max-width: 50mm !important;
            max-height: 30mm !important;
            margin: 0 !important;
            padding: 0 !important;
            overflow: hidden !important;
            background: #ffffff !important;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
          .no-print, aside, header, nav {
            display: none !important;
          }
          .sticker-container {
            width: 50mm !important;
            height: 30mm !important;
            max-width: 50mm !important;
            max-height: 30mm !important;
            border: none !important;
            box-shadow: none !important;
            margin: 0 !important;
            padding: 1.5mm !important;
            page-break-inside: avoid !important;
            page-break-after: avoid !important;
            page-break-before: avoid !important;
            break-inside: avoid !important;
          }
        }
      `}} />
    </main>
  );
}
