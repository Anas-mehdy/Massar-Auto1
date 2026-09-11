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

const inspectionResultLabels: Record<string, string> = {
  OK: "سليم",
  WARNING: "يحتاج انتباه",
  FAIL: "يحتاج إصلاح/تبديل",
  NOT_CHECKED: "لم يفحص",
};

export default async function ServiceOrderPrintPage({ params }: PageProps) {
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
  const currentTotal = laborTotal + partsTotal;
  const qrCodeDataUrl = await QRCode.toDataURL(order.orderNumber || order.id, { margin: 0, width: 180 });
  const status = order.status as ServiceOrderStatus;

  return (
    <main className="min-h-screen bg-slate-100 p-4 print:min-h-0 print:bg-white print:p-0" dir="rtl">
      <style>{`@page { size: A4; margin: 10mm; } @media print { html, body { background: white !important; } }`}</style>
      <PrintActions backUrl={`/service-orders/${order.id}`} />

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
              <div className="text-xs font-black text-slate-500">أمر صيانة مركبة</div>
              <div className="mt-1 font-numeric text-xl font-black">{order.orderNumber}</div>
              <div className="mt-1 text-xs font-bold text-slate-600">{SERVICE_ORDER_STATUS_LABELS[status] ?? order.status}</div>
              <div className="mt-1 text-[11px] text-slate-500">الاستلام: {formatAutoDate(order.receivedAt)}</div>
            </div>
            <Image src={qrCodeDataUrl} alt={`QR ${order.orderNumber}`} width={86} height={86} unoptimized className="shrink-0" />
          </div>
        </header>

        <section className="mt-5 grid grid-cols-2 gap-4">
          <InfoPanel title="بيانات العميل" rows={[
            ["الاسم", order.customerName],
            ["الهاتف", order.customerPhone || "-"],
            ["البريد", order.customerEmail || "-"],
            ["موظف الاستقبال", order.receptionistName || "-"],
          ]} />
          <InfoPanel title="بيانات المركبة" rows={[
            ["المركبة", `${order.vehicleMake} ${order.vehicleModel}${order.vehicleYear ? ` • ${order.vehicleYear}` : ""}`],
            ["اللوحة", order.plateNumber || "-"],
            ["VIN", order.vin || "-"],
            ["اللون / المحرك", [order.vehicleColor, order.engineNumber].filter(Boolean).join(" • ") || "-"],
          ]} />
        </section>

        <section className="mt-4 grid grid-cols-4 gap-2 text-xs">
          <Stat label="عداد الدخول" value={order.odometerAtIntake != null ? `${order.odometerAtIntake.toLocaleString("ar")} كم` : "-"} />
          <Stat label="الوقود" value={order.fuelLevelPercent != null ? `${order.fuelLevelPercent}%` : "-"} />
          <Stat label="الموعد المتوقع" value={formatAutoDate(order.promisedAt)} />
          <Stat label="الفني المسؤول" value={order.technicianName || "-"} />
        </section>

        <section className="mt-5 grid grid-cols-2 gap-4">
          <TextBox title="شكوى العميل / سبب الدخول" value={order.reportedIssue} />
          <TextBox title="ملاحظات الاستقبال" value={order.receptionNotes || "لا توجد ملاحظات إضافية."} />
          <TextBox title="حالة المركبة الخارجية" value={order.exteriorCondition || "لم تسجل."} />
          <TextBox title="المفاتيح والأغراض المستلمة" value={order.keysAndItems || "لم تسجل."} />
        </section>

        {order.inspections.length ? (
          <section className="mt-6 break-inside-avoid">
            <SectionTitle>الفحص الفني</SectionTitle>
            <div className="space-y-3">
              {order.inspections.map((inspection) => (
                <div key={inspection.id} className="rounded-lg border border-slate-300 p-3">
                  <div className="flex items-center justify-between gap-3 text-xs">
                    <div className="font-black">{inspection.inspectionType === "INITIAL" ? "فحص أولي" : inspection.inspectionType === "FINAL" ? "فحص نهائي" : "فحص إضافي"}</div>
                    <div className="font-semibold text-slate-500">{inspection.inspectorName ? `${inspection.inspectorName} • ` : ""}{formatAutoDate(inspection.inspectedAt ?? inspection.createdAt)}</div>
                  </div>
                  {inspection.summary ? <p className="mt-2 text-xs font-semibold leading-5 text-slate-700">{inspection.summary}</p> : null}
                  {inspection.items.length ? (
                    <table className="mt-2 w-full table-fixed border-collapse text-[10px]">
                      <thead><tr className="bg-slate-100"><th className="w-[24%] p-1.5 text-right">البند</th><th className="w-[18%] p-1.5 text-right">النتيجة</th><th className="p-1.5 text-right">الإجراء/الملاحظة</th><th className="w-[18%] p-1.5 text-left">تقدير</th></tr></thead>
                      <tbody>{inspection.items.map((item) => <tr key={item.id} className="border-t border-slate-200"><td className="p-1.5 font-bold">{item.component}</td><td className="p-1.5">{inspectionResultLabels[item.result] ?? item.result}</td><td className="p-1.5">{item.recommendedAction || item.notes || "-"}</td><td className="p-1.5 text-left font-bold">{item.estimatedCost != null ? formatAutoMoney(item.estimatedCost, currency) : "-"}</td></tr>)}</tbody>
                    </table>
                  ) : null}
                </div>
              ))}
            </div>
          </section>
        ) : null}

        {order.diagnosis ? <section className="mt-5"><TextBox title="التشخيص" value={order.diagnosis} /></section> : null}

        <section className="mt-6 break-inside-avoid">
          <SectionTitle>الأعمال وقطع الغيار</SectionTitle>
          <table className="w-full border-collapse text-xs">
            <thead><tr className="border-y border-slate-300 bg-slate-100"><th className="w-[13%] p-2 text-right">النوع</th><th className="p-2 text-right">الوصف</th><th className="w-[12%] p-2 text-center">الكمية</th><th className="w-[18%] p-2 text-left">سعر الوحدة</th><th className="w-[18%] p-2 text-left">الإجمالي</th></tr></thead>
            <tbody>
              {activeLabor.map((line) => <tr key={line.id} className="border-b border-slate-200"><td className="p-2 font-bold">عمل</td><td className="p-2"><div className="font-bold">{line.description}</div>{line.technicianName || line.hours != null ? <div className="mt-0.5 text-[10px] text-slate-500">{[line.technicianName, line.hours != null ? `${line.hours} ساعة` : null].filter(Boolean).join(" • ")}</div> : null}</td><td className="p-2 text-center">{line.quantity}</td><td className="p-2 text-left">{formatAutoMoney(line.unitPrice, currency)}</td><td className="p-2 text-left font-black">{formatAutoMoney(line.lineTotal, currency)}</td></tr>)}
              {activeParts.map((line) => <tr key={line.id} className="border-b border-slate-200"><td className="p-2 font-bold">قطعة</td><td className="p-2"><div className="font-bold">{line.partName}</div>{line.sku ? <div className="mt-0.5 text-[10px] text-slate-500">SKU {line.sku}</div> : null}</td><td className="p-2 text-center">{line.quantity}</td><td className="p-2 text-left">{formatAutoMoney(line.unitPrice, currency)}</td><td className="p-2 text-left font-black">{formatAutoMoney(line.lineTotal, currency)}</td></tr>)}
              {!activeLabor.length && !activeParts.length ? <tr><td colSpan={5} className="p-5 text-center font-bold text-slate-400">لا توجد أعمال أو قطع مسجلة.</td></tr> : null}
            </tbody>
          </table>
          <div className="mt-3 mr-auto w-[280px] space-y-1.5 rounded-lg border border-slate-300 p-3 text-xs">
            <MoneyRow label="أجور العمل" value={formatAutoMoney(laborTotal, currency)} />
            <MoneyRow label="قطع الغيار" value={formatAutoMoney(partsTotal, currency)} />
            <MoneyRow label="الإجمالي الحالي" value={formatAutoMoney(currentTotal, currency)} bold />
          </div>
        </section>

        <section className="mt-5 grid grid-cols-2 gap-4 break-inside-avoid">
          <div className="rounded-lg border border-slate-300 p-3 text-xs">
            <div className="font-black">المرجع المالي</div>
            <div className="mt-2 space-y-1.5 text-slate-700">
              <div>عرض السعر: {order.quotationNumber ? `${order.quotationNumber} — ${formatAutoMoney(order.quotationTotal, currency)}` : "-"}</div>
              <div>الفاتورة: {order.invoiceNumber ? `${order.invoiceNumber} — ${formatAutoMoney(order.invoiceTotal, currency)}` : "-"}</div>
              {order.invoiceNumber ? <div>المدفوع: {formatAutoMoney(order.invoiceAmountPaid, currency)} • المتبقي: {formatAutoMoney(order.invoiceBalanceDue, currency)}</div> : null}
            </div>
          </div>
          <div className="rounded-lg border border-slate-300 p-3 text-xs">
            <div className="font-black">التسليم والإغلاق</div>
            <div className="mt-2 space-y-1.5 text-slate-700">
              <div>التسليم: {formatAutoDate(order.deliveredAt)}{order.deliveredByName ? ` • ${order.deliveredByName}` : ""}</div>
              <div>عداد التسليم: {order.odometerAtDelivery != null ? `${order.odometerAtDelivery.toLocaleString("ar")} كم` : "-"}</div>
              <div>الإغلاق: {formatAutoDate(order.closedAt)}{order.closedByName ? ` • ${order.closedByName}` : ""}</div>
            </div>
          </div>
        </section>

        {order.resolutionNotes ? <section className="mt-4"><TextBox title="ملاحظات النتيجة النهائية" value={order.resolutionNotes} /></section> : null}

        <footer className="mt-8 grid grid-cols-3 gap-6 break-inside-avoid border-t border-slate-300 pt-6 text-center text-xs font-bold">
          <Signature label="توقيع العميل" />
          <Signature label="توقيع مستشار الخدمة" />
          <Signature label="توقيع الفني" />
        </footer>
        {shop.terms ? <div className="mt-6 border-t border-dashed border-slate-300 pt-3 text-[9px] leading-5 text-slate-500">{shop.terms}</div> : null}
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
