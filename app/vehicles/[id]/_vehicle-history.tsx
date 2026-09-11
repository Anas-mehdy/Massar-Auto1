import Link from "next/link";
import {
  Banknote,
  CalendarDays,
  CarFront,
  CheckCircle2,
  ClipboardCheck,
  FileText,
  Gauge,
  Package,
  ReceiptText,
  UserRoundCog,
  Wrench,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  formatAutoDate,
  formatAutoMoney,
  SERVICE_ORDER_STATUS_CLASSES,
  SERVICE_ORDER_STATUS_LABELS,
} from "@/lib/auto/service-order-ui";
import type { ServiceOrderStatus } from "@/lib/services/autoServiceOrderService";
import type { VehicleHistoryOrder } from "@/lib/services/vehicleHistoryService";
import { vehicleHistoryService } from "@/lib/services/vehicleHistoryService";

const invoiceStatusLabels: Record<string, string> = {
  UNPAID: "غير مدفوعة",
  PARTIAL: "مدفوعة جزئيًا",
  PAID: "مدفوعة",
  VOID: "ملغاة",
};

const quoteStatusLabels: Record<string, string> = {
  DRAFT: "مسودة",
  SENT: "مرسل للعميل",
  APPROVED: "موافق عليه",
  PARTIALLY_APPROVED: "موافقة جزئية",
  REJECTED: "مرفوض",
  EXPIRED: "منتهي",
};

const approvalLabels: Record<string, string> = {
  APPROVED: "موافقة",
  PARTIALLY_APPROVED: "موافقة جزئية",
  PARTIAL: "موافقة جزئية",
  REJECTED: "رفض",
};

const lineStatusLabels: Record<string, string> = {
  PLANNED: "مخطط",
  APPROVED: "معتمد",
  IN_PROGRESS: "قيد التنفيذ",
  DONE: "منجز",
  RESERVED: "محجوز",
  USED: "مستخدم",
  RETURNED: "مرتجع",
  CANCELLED: "ملغى",
};

const paymentMethodLabels: Record<string, string> = {
  CASH: "نقدي",
  CARD: "بطاقة",
  BANK_TRANSFER: "تحويل بنكي",
  E_WALLET: "محفظة إلكترونية",
  WALLET: "محفظة",
  OTHER: "أخرى",
};

export async function VehicleHistorySection({
  shopId,
  vehicleId,
  currency,
}: {
  shopId: string;
  vehicleId: string;
  currency: string;
}) {
  const history = await vehicleHistoryService.getVehicleLifetimeHistory(shopId, vehicleId);
  const { metrics, orders } = history;

  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-3 border-b border-slate-100 pb-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="flex items-center gap-2 font-black text-slate-950"><CarFront className="h-5 w-5 text-teal-700" />التاريخ الكامل للمركبة</h2>
            <p className="mt-1 text-xs font-semibold text-slate-500">ملخص مالي وتشغيلي لكل زيارات المركبة وأعمالها السابقة.</p>
          </div>
          <span className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-black text-slate-700">{metrics.visitCount} زيارة</span>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard icon={<CalendarDays className="h-4 w-4" />} label="آخر زيارة" value={formatAutoDate(metrics.lastServiceAt)} note={metrics.firstServiceAt ? `أول زيارة: ${formatAutoDate(metrics.firstServiceAt)}` : "لا يوجد سجل بعد"} />
          <MetricCard icon={<Gauge className="h-4 w-4" />} label="آخر عداد مسجل" value={metrics.lastRecordedOdometer != null ? `${metrics.lastRecordedOdometer.toLocaleString("ar")} كم` : "-"} note={`${metrics.completedVisitCount} زيارة مسلّمة/مغلقة`} />
          <MetricCard icon={<ReceiptText className="h-4 w-4" />} label="إجمالي الفواتير" value={formatAutoMoney(metrics.invoicedTotal, currency)} note={`المدفوع: ${formatAutoMoney(metrics.paidTotal, currency)}`} />
          <MetricCard icon={<Banknote className="h-4 w-4" />} label="الرصيد المتبقي" value={formatAutoMoney(metrics.outstandingTotal, currency)} note={`أجور ${formatAutoMoney(metrics.laborTotal, currency)} • قطع ${formatAutoMoney(metrics.partsTotal, currency)}`} />
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-5 flex items-center justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-2 font-black text-slate-950"><Wrench className="h-4 w-4 text-teal-700" />Timeline الصيانة</h2>
            <p className="mt-1 text-xs font-semibold text-slate-500">كل أمر صيانة مع الفحص والأعمال والقطع والموافقات والفاتورة والدفعات.</p>
          </div>
        </div>

        {orders.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/50 p-10 text-center text-sm font-bold text-slate-500">لا يوجد سجل صيانة لهذه المركبة بعد.</div>
        ) : (
          <div className="relative space-y-5 pr-5 before:absolute before:bottom-2 before:right-[7px] before:top-2 before:w-px before:bg-slate-200">
            {orders.map((order, index) => (
              <div key={order.id} className="relative">
                <span className="absolute -right-5 top-6 z-10 h-3.5 w-3.5 rounded-full border-[3px] border-white bg-teal-600 shadow-sm" />
                <OrderHistoryCard order={order} currency={currency} defaultOpen={index === 0} />
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function OrderHistoryCard({ order, currency, defaultOpen }: { order: VehicleHistoryOrder; currency: string; defaultOpen: boolean }) {
  const status = order.status as ServiceOrderStatus;
  const activeLabor = order.laborLines.filter((line) => line.status !== "CANCELLED");
  const activeParts = order.partLines.filter((line) => !["CANCELLED", "RETURNED"].includes(line.status));
  const laborTotal = activeLabor.reduce((sum, line) => sum + Number(line.lineTotal), 0);
  const partsTotal = activeParts.reduce((sum, line) => sum + Number(line.lineTotal), 0);
  const latestQuote = order.quotations[0] ?? null;
  const latestApproval = order.approvals[0] ?? null;

  return (
    <details open={defaultOpen} className="group overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <summary className="cursor-pointer list-none p-4 transition hover:bg-slate-50 sm:p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-numeric text-base font-black text-slate-950">{order.orderNumber}</span>
              <span className={`rounded-full border px-2.5 py-1 text-[11px] font-black ${SERVICE_ORDER_STATUS_CLASSES[status] ?? "border-slate-200 bg-slate-50 text-slate-700"}`}>{SERVICE_ORDER_STATUS_LABELS[status] ?? order.status}</span>
              {order.invoiceStatus ? <span className="rounded-full border border-indigo-100 bg-indigo-50 px-2.5 py-1 text-[11px] font-black text-indigo-700">{invoiceStatusLabels[order.invoiceStatus] ?? order.invoiceStatus}</span> : null}
            </div>
            <div className="mt-2 line-clamp-2 text-sm font-bold leading-6 text-slate-650">{order.reportedIssue}</div>
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] font-semibold text-slate-500">
              <span>{formatAutoDate(order.receivedAt)}</span>
              <span>{order.assignedTechnicianName ? `الفني: ${order.assignedTechnicianName}` : "فني غير محدد"}</span>
              <span>{order.odometerAtIntake != null ? `دخول: ${order.odometerAtIntake.toLocaleString("ar")} كم` : "عداد الدخول: -"}</span>
            </div>
          </div>
          <div className="grid shrink-0 grid-cols-2 gap-2 sm:grid-cols-4 lg:min-w-[430px]">
            <MiniStat label="أجور" value={formatAutoMoney(laborTotal, currency)} />
            <MiniStat label="قطع" value={formatAutoMoney(partsTotal, currency)} />
            <MiniStat label="الفاتورة" value={order.invoiceId ? formatAutoMoney(order.invoiceTotal, currency) : "-"} />
            <MiniStat label="المتبقي" value={order.invoiceId ? formatAutoMoney(order.invoiceBalanceDue, currency) : "-"} />
          </div>
        </div>
        <div className="mt-3 text-[11px] font-black text-teal-700 group-open:hidden">عرض التفاصيل الكاملة ↓</div>
        <div className="mt-3 hidden text-[11px] font-black text-slate-500 group-open:block">إخفاء التفاصيل ↑</div>
      </summary>

      <div className="space-y-5 border-t border-slate-100 bg-slate-50/25 p-4 sm:p-5">
        <div className="grid gap-3 lg:grid-cols-3">
          <TextBlock label="شكوى العميل / سبب الدخول" value={order.reportedIssue} />
          <TextBlock label="التشخيص" value={order.diagnosis || "لم يُسجل تشخيص نصي."} />
          <TextBlock label="النتيجة النهائية" value={order.resolutionNotes || order.deliveryNotesFallback || "لم تُسجل ملاحظة إغلاق نهائية."} />
        </div>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <InfoBox label="الاستقبال" value={order.receptionistName || "-"} />
          <InfoBox label="الفني المسؤول" value={order.assignedTechnicianName || "-"} />
          <InfoBox label="التسليم" value={order.deliveredByName ? `${order.deliveredByName} • ${formatAutoDate(order.deliveredAt)}` : formatAutoDate(order.deliveredAt)} />
          <InfoBox label="الإغلاق" value={order.closedByName ? `${order.closedByName} • ${formatAutoDate(order.closedAt)}` : formatAutoDate(order.closedAt)} />
          <InfoBox label="عداد الدخول" value={order.odometerAtIntake != null ? `${order.odometerAtIntake.toLocaleString("ar")} كم` : "-"} />
          <InfoBox label="عداد التسليم" value={order.odometerAtDelivery != null ? `${order.odometerAtDelivery.toLocaleString("ar")} كم` : "-"} />
          <InfoBox label="الموعد المتوقع" value={formatAutoDate(order.promisedAt)} />
          <InfoBox label="جاهزة منذ" value={formatAutoDate(order.readyAt)} />
        </div>

        {order.inspections.length ? (
          <HistoryGroup title="الفحوصات" icon={<ClipboardCheck className="h-4 w-4" />} count={order.inspections.length}>
            <div className="grid gap-2 lg:grid-cols-2">
              {order.inspections.map((inspection) => <div key={inspection.id} className="rounded-xl border border-slate-100 bg-white p-3"><div className="flex flex-wrap items-center justify-between gap-2"><span className="text-xs font-black text-slate-800">{inspection.inspectionType}</span><span className="text-[10px] font-bold text-slate-500">{formatAutoDate(inspection.inspectedAt ?? inspection.createdAt)}</span></div><p className="mt-2 text-xs font-semibold leading-6 text-slate-600">{inspection.summary || "بدون ملخص نصي."}</p>{inspection.inspectorName ? <div className="mt-2 text-[10px] font-bold text-slate-400">الفاحص: {inspection.inspectorName}</div> : null}</div>)}
            </div>
          </HistoryGroup>
        ) : null}

        <div className="grid gap-4 xl:grid-cols-2">
          <HistoryGroup title="أجور وأعمال الصيانة" icon={<Wrench className="h-4 w-4" />} count={order.laborLines.length}>
            {order.laborLines.length ? <div className="divide-y divide-slate-100 rounded-xl border border-slate-100 bg-white">{order.laborLines.map((line) => <div key={line.id} className="grid grid-cols-[1fr_auto] gap-3 p-3"><div><div className="text-xs font-black text-slate-800">{line.description}</div><div className="mt-1 text-[10px] font-semibold text-slate-500">{line.quantity} × {formatAutoMoney(line.unitPrice, currency)}{line.hours != null ? ` • ${line.hours} ساعة` : ""}{line.technicianName ? ` • ${line.technicianName}` : ""}</div>{line.notes ? <div className="mt-1 text-[10px] text-slate-400">{line.notes}</div> : null}</div><div className="text-left"><div className="font-numeric text-xs font-black text-slate-900">{formatAutoMoney(line.lineTotal, currency)}</div><div className="mt-1 text-[9px] font-bold text-slate-400">{lineStatusLabels[line.status] ?? line.status}</div></div></div>)}</div> : <EmptyLine />}
          </HistoryGroup>

          <HistoryGroup title="قطع الغيار" icon={<Package className="h-4 w-4" />} count={order.partLines.length}>
            {order.partLines.length ? <div className="divide-y divide-slate-100 rounded-xl border border-slate-100 bg-white">{order.partLines.map((line) => <div key={line.id} className="grid grid-cols-[1fr_auto] gap-3 p-3"><div><div className="text-xs font-black text-slate-800">{line.partName}</div><div className="mt-1 text-[10px] font-semibold text-slate-500">{line.quantity} × {formatAutoMoney(line.unitPrice, currency)}{line.warehouseName ? ` • ${line.warehouseName}` : ""}{line.sku ? ` • SKU ${line.sku}` : ""}</div>{line.notes ? <div className="mt-1 text-[10px] text-slate-400">{line.notes}</div> : null}</div><div className="text-left"><div className="font-numeric text-xs font-black text-slate-900">{formatAutoMoney(line.lineTotal, currency)}</div><div className="mt-1 text-[9px] font-bold text-slate-400">{lineStatusLabels[line.status] ?? line.status}</div></div></div>)}</div> : <EmptyLine />}
          </HistoryGroup>
        </div>

        {(order.quotations.length || order.approvals.length) ? (
          <HistoryGroup title="عروض السعر وموافقات العميل" icon={<FileText className="h-4 w-4" />} count={order.quotations.length + order.approvals.length}>
            <div className="grid gap-3 lg:grid-cols-2">
              <div className="space-y-2">
                {order.quotations.length ? order.quotations.map((quote) => <div key={quote.id} className="rounded-xl border border-slate-100 bg-white p-3"><div className="flex items-center justify-between gap-2"><div className="text-xs font-black text-slate-800">{quote.quoteNumber} <span className="text-[10px] text-slate-400">R{quote.revision}</span></div><div className="font-numeric text-xs font-black text-slate-900">{formatAutoMoney(quote.total, currency)}</div></div><div className="mt-2 flex flex-wrap gap-2 text-[10px] font-bold text-slate-500"><span>{quoteStatusLabels[quote.status] ?? quote.status}</span><span>{formatAutoDate(quote.createdAt)}</span>{quote.sentAt ? <span>أرسل: {formatAutoDate(quote.sentAt)}</span> : null}</div>{quote.notes ? <p className="mt-2 text-[10px] leading-5 text-slate-500">{quote.notes}</p> : null}</div>) : <EmptyLine />}
              </div>
              <div className="space-y-2">
                {order.approvals.length ? order.approvals.map((approval) => <div key={approval.id} className="rounded-xl border border-emerald-100 bg-emerald-50/40 p-3"><div className="flex items-center gap-2 text-xs font-black text-emerald-900"><CheckCircle2 className="h-3.5 w-3.5" />{approvalLabels[approval.decision] ?? approval.decision}</div><div className="mt-2 text-[10px] font-bold text-slate-500">{formatAutoDate(approval.decidedAt)}{approval.channel ? ` • ${approval.channel}` : ""}{approval.customerNameSnapshot ? ` • ${approval.customerNameSnapshot}` : ""}</div>{approval.note ? <p className="mt-2 text-[10px] leading-5 text-slate-600">{approval.note}</p> : null}{approval.recordedByName ? <div className="mt-1 text-[10px] text-slate-400">سجلها: {approval.recordedByName}</div> : null}</div>) : <EmptyLine />}
              </div>
            </div>
            {latestQuote || latestApproval ? <div className="mt-3 rounded-lg bg-slate-100/70 px-3 py-2 text-[10px] font-bold text-slate-500">آخر عرض: {latestQuote ? `${latestQuote.quoteNumber} — ${quoteStatusLabels[latestQuote.status] ?? latestQuote.status}` : "-"} • آخر قرار: {latestApproval ? approvalLabels[latestApproval.decision] ?? latestApproval.decision : "-"}</div> : null}
          </HistoryGroup>
        ) : null}

        <HistoryGroup title="الفاتورة والدفعات" icon={<ReceiptText className="h-4 w-4" />} count={order.payments.length}>
          {order.invoiceId ? (
            <div className="space-y-3">
              <div className="grid gap-3 rounded-xl border border-indigo-100 bg-indigo-50/35 p-4 sm:grid-cols-4">
                <div><div className="text-[10px] font-bold text-slate-400">رقم الفاتورة</div><Link href={`/invoices/${order.invoiceId}`} className="mt-1 block font-numeric text-xs font-black text-indigo-700 hover:underline">{order.invoiceNumber}</Link></div>
                <div><div className="text-[10px] font-bold text-slate-400">الإجمالي</div><div className="mt-1 font-numeric text-xs font-black text-slate-900">{formatAutoMoney(order.invoiceTotal, currency)}</div></div>
                <div><div className="text-[10px] font-bold text-slate-400">المدفوع</div><div className="mt-1 font-numeric text-xs font-black text-emerald-700">{formatAutoMoney(order.invoiceAmountPaid, currency)}</div></div>
                <div><div className="text-[10px] font-bold text-slate-400">المتبقي</div><div className="mt-1 font-numeric text-xs font-black text-amber-700">{formatAutoMoney(order.invoiceBalanceDue, currency)}</div></div>
              </div>
              {order.payments.length ? <div className="divide-y divide-slate-100 rounded-xl border border-slate-100 bg-white">{order.payments.map((payment) => <div key={payment.id} className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center sm:justify-between"><div><div className="text-xs font-black text-slate-800">{paymentMethodLabels[payment.method] ?? payment.method}{payment.sourceName ? ` • ${payment.sourceName}` : ""}</div><div className="mt-1 text-[10px] font-semibold text-slate-500">{formatAutoDate(payment.paidAt)}{payment.reference ? ` • ${payment.reference}` : ""}</div>{payment.note ? <div className="mt-1 text-[10px] text-slate-400">{payment.note}</div> : null}</div><div className="font-numeric text-sm font-black text-emerald-700">{formatAutoMoney(payment.amount, currency)}</div></div>)}</div> : <div className="text-xs font-bold text-slate-400">لا توجد دفعات مسجلة على الفاتورة.</div>}
              <div className="flex justify-end"><Button asChild variant="outline" size="sm" className="text-xs font-black"><Link href={`/invoices/${order.invoiceId}`}>فتح الفاتورة</Link></Button></div>
            </div>
          ) : <div className="text-xs font-bold text-slate-400">لم تصدر فاتورة فعالة لهذا الأمر.</div>}
        </HistoryGroup>

        <div className="flex flex-wrap justify-end gap-2 border-t border-slate-100 pt-4">
          <Button asChild variant="outline" size="sm" className="text-xs font-black"><Link href={`/service-orders/${order.id}`}><UserRoundCog className="ml-1.5 h-3.5 w-3.5" />فتح أمر الصيانة</Link></Button>
          {order.invoiceId ? <Button asChild size="sm" className="text-xs font-black"><Link href={`/invoices/${order.invoiceId}`}><ReceiptText className="ml-1.5 h-3.5 w-3.5" />الفاتورة</Link></Button> : null}
        </div>
      </div>
    </details>
  );
}

function MetricCard({ icon, label, value, note }: { icon: React.ReactNode; label: string; value: string; note: string }) {
  return <div className="rounded-xl border border-slate-100 bg-slate-50/40 p-4"><div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-wider text-slate-400">{icon}{label}</div><div className="mt-2 text-lg font-black text-slate-900">{value}</div><div className="mt-1 text-[10px] font-bold leading-5 text-slate-500">{note}</div></div>;
}
function MiniStat({ label, value }: { label: string; value: string }) {
  return <div className="rounded-lg bg-slate-50 px-2.5 py-2 text-center"><div className="text-[9px] font-bold text-slate-400">{label}</div><div className="mt-1 truncate font-numeric text-[11px] font-black text-slate-800">{value}</div></div>;
}
function InfoBox({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl border border-slate-100 bg-white p-3"><div className="text-[10px] font-bold text-slate-400">{label}</div><div className="mt-1.5 text-xs font-black leading-5 text-slate-700">{value}</div></div>;
}
function TextBlock({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl border border-slate-100 bg-white p-4"><div className="text-[10px] font-black uppercase tracking-wider text-slate-400">{label}</div><p className="mt-2 text-xs font-semibold leading-6 text-slate-650">{value}</p></div>;
}
function HistoryGroup({ title, icon, count, children }: { title: string; icon: React.ReactNode; count: number; children: React.ReactNode }) {
  return <div className="rounded-2xl border border-slate-200 bg-white p-4"><div className="mb-3 flex items-center justify-between border-b border-slate-100 pb-3"><h3 className="flex items-center gap-2 text-xs font-black text-slate-800">{icon}{title}</h3><span className="rounded-full bg-slate-100 px-2 py-0.5 text-[9px] font-black text-slate-500">{count}</span></div>{children}</div>;
}
function EmptyLine() { return <div className="rounded-lg border border-dashed border-slate-200 p-4 text-center text-[10px] font-bold text-slate-400">لا توجد بيانات مسجلة.</div>; }
