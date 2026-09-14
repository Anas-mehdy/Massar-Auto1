import { notFound } from "next/navigation";
import { PrintActions } from "@/components/print-actions";
import { requirePermission } from "@/lib/auth/context";
import { autoPrintService } from "@/lib/services/autoPrintService";
import { shopService } from "@/lib/services/shopService";

export const dynamic = "force-dynamic";

type PageProps = { params: Promise<{ id: string }> };

export default async function ServiceOrderKeyLabelPage({ params }: PageProps) {
  const auth = await requirePermission("service_orders:read");
  const { id } = await params;
  const [order, shop] = await Promise.all([
    autoPrintService.getServiceOrderPrintData(auth.shop.id, id),
    shopService.getShopById(auth.shop.id),
  ]);
  if (!order) notFound();

  const vehicleName = `${order.vehicleMake} ${order.vehicleModel}${order.vehicleYear ? ` ${order.vehicleYear}` : ""}`.trim();
  const vehicleIdentifier = order.plateNumber?.trim()
    || (order.vin ? `VIN ${order.vin.slice(-8)}` : "بدون رقم لوحة");

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-100 p-6 print:block print:min-h-0 print:bg-white print:p-0" dir="rtl">
      <style>{`
        @page { size: 50mm 30mm; margin: 0; }
        @media print {
          html, body {
            width: 50mm !important;
            height: 30mm !important;
            margin: 0 !important;
            padding: 0 !important;
            overflow: hidden !important;
            background: #fff !important;
          }
          body {
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
        }
      `}</style>

      <PrintActions backUrl={`/service-orders/${order.id}`} />

      <article className="h-[30mm] w-[50mm] overflow-hidden rounded-md border border-black bg-white p-[1.4mm] text-black shadow-xl print:rounded-none print:border-0 print:shadow-none">
        <header className="flex items-center justify-between gap-[1mm] text-[6.5px] font-black leading-none">
          <span className="max-w-[33mm] truncate">{shop.name}</span>
          <span className="shrink-0">مفتاح مركبة</span>
        </header>

        <section className="mt-[0.9mm] border-y-2 border-black py-[0.8mm] text-center">
          <div className="text-[6px] font-bold leading-none">رقم / لوحة المركبة</div>
          <div className="mt-[0.5mm] truncate text-[15px] font-black leading-none" dir="auto">{vehicleIdentifier}</div>
        </section>

        <div className="mt-[0.9mm] truncate text-center text-[8px] font-black leading-tight" dir="auto">{vehicleName || "مركبة"}</div>

        <footer className="mt-[0.9mm] grid grid-cols-[minmax(0,1fr)_auto] items-end gap-[1mm] border-t border-black pt-[0.8mm] text-[6.5px] font-bold leading-tight">
          <div className="min-w-0">
            <div className="truncate">العميل: {order.customerName}</div>
            <div className="truncate font-black" dir="ltr">{order.orderNumber}</div>
          </div>
          <div className="shrink-0 text-[6px] font-black">مسار</div>
        </footer>
      </article>
    </main>
  );
}
