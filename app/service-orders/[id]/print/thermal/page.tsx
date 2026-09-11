import Image from "next/image";
import QRCode from "qrcode";
import { notFound } from "next/navigation";
import { PrintActions } from "@/components/print-actions";
import { requirePermission } from "@/lib/auth/context";
import { formatAutoDate, formatAutoMoney, SERVICE_ORDER_STATUS_LABELS } from "@/lib/auto/service-order-ui";
import type { ServiceOrderStatus } from "@/lib/services/autoServiceOrderService";
import { autoPrintService } from "@/lib/services/autoPrintService";
import { shopService } from "@/lib/services/shopService";

export const dynamic = "force-dynamic";

type PageProps = { params: Promise<{ id: string }> };

export default async function ServiceOrderThermalPrintPage({ params }: PageProps) {
  const auth = await requirePermission("service_orders:read");
  const { id } = await params;
  const [order, shop] = await Promise.all([
    autoPrintService.getServiceOrderPrintData(auth.shop.id, id),
    shopService.getShopById(auth.shop.id),
  ]);
  if (!order) notFound();

  const currency = shop.currency || auth.shop.currency || "SAR";
  const activeLabor = order.laborLines.filter((line) => line.status !== "CANCELLED");
  const activeParts = order.partLines.filter((line) => !["CANCELLED", "RETURNED"].includes(line.status));
  const laborTotal = activeLabor.reduce((sum, line) => sum + Number(line.lineTotal), 0);
  const partsTotal = activeParts.reduce((sum, line) => sum + Number(line.lineTotal), 0);
  const qrCodeDataUrl = await QRCode.toDataURL(order.orderNumber || order.id, { margin: 0, width: 140 });
  const status = order.status as ServiceOrderStatus;

  return (
    <main className="min-h-screen bg-slate-100 px-4 py-8 print:min-h-0 print:bg-white print:p-0" dir="rtl">
      <style>{`@page { size: 80mm auto; margin: 3mm; } @media print { html, body { width: 80mm; background: white !important; } }`}</style>
      <PrintActions backUrl={`/service-orders/${order.id}`} />
      <article className="mx-auto w-[80mm] max-w-full rounded-xl border border-slate-300 bg-white p-4 text-slate-950 shadow-xl print:w-full print:rounded-none print:border-0 print:p-1 print:shadow-none">
        <header className="border-b-2 border-dashed border-slate-900 pb-3 text-center">
          <h1 className="text-base font-black">{shop.name}</h1>
          {shop.phone ? <div className="mt-1 text-[10px] font-bold" dir="ltr">{shop.phone}</div> : null}
          <div className="mt-2 text-[11px] font-black">أمر صيانة مركبة</div>
          <div className="font-numeric text-lg font-black">{order.orderNumber}</div>
          <div className="text-[10px] font-bold text-slate-600">{SERVICE_ORDER_STATUS_LABELS[status] ?? order.status}</div>
        </header>

        <section className="space-y-1 border-b border-slate-300 py-2 text-[10px]">
          <Row label="الاستلام" value={formatAutoDate(order.receivedAt)} />
          <Row label="العميل" value={order.customerName} />
          <Row label="الهاتف" value={order.customerPhone || "-"} />
          <Row label="المركبة" value={`${order.vehicleMake} ${order.vehicleModel}${order.vehicleYear ? ` ${order.vehicleYear}` : ""}`} />
          <Row label="اللوحة" value={order.plateNumber || "-"} />
          <Row label="VIN" value={order.vin || "-"} />
          <Row label="العداد" value={order.odometerAtIntake != null ? `${order.odometerAtIntake.toLocaleString("ar")} كم` : "-"} />
          <Row label="الوقود" value={order.fuelLevelPercent != null ? `${order.fuelLevelPercent}%` : "-"} />
          <Row label="الفني" value={order.technicianName || "-"} />
        </section>

        <Block title="شكوى العميل" value={order.reportedIssue} />
        {order.diagnosis ? <Block title="التشخيص" value={order.diagnosis} /> : null}
        {order.exteriorCondition ? <Block title="حالة المركبة" value={order.exteriorCondition} /> : null}
        {order.keysAndItems ? <Block title="المفاتيح/الأغراض" value={order.keysAndItems} /> : null}

        {(activeLabor.length || activeParts.length) ? (
          <section className="border-b border-slate-300 py-2 text-[10px]">
            <div className="mb-1.5 font-black">الأعمال والقطع</div>
            <div className="space-y-1.5">
              {activeLabor.map((line) => <Line key={line.id} title={`عمل: ${line.description}`} meta={`${line.quantity} × ${formatAutoMoney(line.unitPrice, currency)}`} total={formatAutoMoney(line.lineTotal, currency)} />)}
              {activeParts.map((line) => <Line key={line.id} title={`قطعة: ${line.partName}`} meta={`${line.quantity} × ${formatAutoMoney(line.unitPrice, currency)}`} total={formatAutoMoney(line.lineTotal, currency)} />)}
            </div>
          </section>
        ) : null}

        <section className="space-y-1 border-b-2 border-dashed border-slate-900 py-2 text-[10px]">
          <Row label="أجور العمل" value={formatAutoMoney(laborTotal, currency)} strong />
          <Row label="قطع الغيار" value={formatAutoMoney(partsTotal, currency)} strong />
          <Row label="الإجمالي الحالي" value={formatAutoMoney(laborTotal + partsTotal, currency)} strong />
          {order.invoiceNumber ? <><Row label="الفاتورة" value={order.invoiceNumber} /><Row label="المتبقي" value={formatAutoMoney(order.invoiceBalanceDue, currency)} strong /></> : null}
        </section>

        <div className="py-3 text-center">
          <Image src={qrCodeDataUrl} alt={`QR ${order.orderNumber}`} width={92} height={92} unoptimized className="mx-auto" />
          <div className="mt-1 text-[9px] font-bold text-slate-500">{order.orderNumber}</div>
        </div>

        <footer className="grid grid-cols-2 gap-5 border-t border-slate-300 pt-7 text-center text-[9px] font-bold">
          <div><div className="border-b border-slate-500" /><div className="mt-1">توقيع العميل</div></div>
          <div><div className="border-b border-slate-500" /><div className="mt-1">المستلم</div></div>
        </footer>
        {shop.terms ? <p className="mt-4 border-t border-dotted border-slate-300 pt-2 text-center text-[8px] leading-4 text-slate-500">{shop.terms}</p> : null}
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
function Line({ title, meta, total }: { title: string; meta: string; total: string }) {
  return <div><div className="flex items-start justify-between gap-2"><span className="font-bold">{title}</span><span className="shrink-0 font-black">{total}</span></div><div className="text-[9px] text-slate-500">{meta}</div></div>;
}
