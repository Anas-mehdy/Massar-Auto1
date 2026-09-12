import Link from "next/link";
import { ArrowRight, CheckCircle2, FileText, LockKeyhole, Send, Truck, XCircle } from "lucide-react";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { requirePermission } from "@/lib/auth/context";
import { formatAutoDate, formatAutoMoney } from "@/lib/auto/service-order-ui";
import { autoServiceOrderService } from "@/lib/services/autoServiceOrderService";
import { quotationService } from "@/lib/services/quotationService";
import { markQuotationSentAction, recordCustomerApprovalAction } from "@/app/service-orders/actions";

export const dynamic = "force-dynamic";

type PageProps = { params: Promise<{ id: string }> };
type QuoteView = {
  id: string;
  shopId: string;
  serviceOrderId: string;
  quoteNumber: string;
  revision: number;
  status: string;
  subtotal: string | number;
  discountTotal: string | number;
  taxTotal: string | number;
  total: string | number;
  validUntil: Date | null;
  notes: string | null;
  sentAt: Date | null;
  createdAt: Date;
  orderNumber: string;
  customerName: string;
  customerPhone: string | null;
  vehicleMake: string;
  vehicleModel: string;
  vehicleYear: number | null;
  plateNumber: string | null;
  vin: string | null;
  lines: Array<{
    id: string;
    lineType: string;
    description: string;
    quantity: string | number;
    unitPrice: string | number;
    discountTotal: string | number;
    lineTotal: string | number;
    approvalStatus: string;
  }>;
};

const statusLabel: Record<string, string> = {
  DRAFT: "مسودة",
  SENT: "مرسل للعميل",
  APPROVED: "موافق عليه",
  PARTIALLY_APPROVED: "موافقة جزئية",
  REJECTED: "مرفوض",
  EXPIRED: "منتهي",
  SUPERSEDED: "تم استبداله بنسخة أحدث",
};

export default async function QuotationPage({ params }: PageProps) {
  const auth = await requirePermission("quotes:read");
  const { id } = await params;
  const raw = await quotationService.getQuotation(auth.shop.id, id);
  if (!raw) notFound();
  const quote = raw as unknown as QuoteView;
  const order = await autoServiceOrderService.getServiceOrderById(auth.shop.id, quote.serviceOrderId);

  const canManage = auth.permissions.includes("quotes:manage");
  const quoteOpen = quote.status === "DRAFT" || quote.status === "SENT";
  const orderAcceptsDecision = Boolean(order && ["RECEIVED", "INSPECTING", "WAITING_CUSTOMER_APPROVAL"].includes(order.status));
  const canDecide = canManage && quoteOpen && orderAcceptsDecision;
  const canSend = canManage && quote.status === "DRAFT" && orderAcceptsDecision;
  const staleQuote = quoteOpen && !orderAcceptsDecision;

  return (
    <div className="space-y-6">
      <PageHeader
        title={`عرض السعر ${quote.quoteNumber}`}
        description={`نسخة ${quote.revision} • ${statusLabel[quote.status] ?? quote.status}`}
        actions={<Button asChild variant="outline" className="font-bold"><Link href={`/service-orders/${quote.serviceOrderId}`}><ArrowRight className="ml-1.5 h-4 w-4" />أمر الصيانة {quote.orderNumber}</Link></Button>}
      />

      {staleQuote ? <div className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-xs font-bold leading-6 text-amber-900"><LockKeyhole className="mt-0.5 h-4 w-4 shrink-0" /><span>هذا العرض بقي مفتوحاً لكن أمر الصيانة تجاوز مرحلة انتظار موافقة العميل، لذلك تم قفل الإرسال والموافقة والرفض عليه. ارجع لأمر الصيانة لمعالجة الحالة الحالية بدل اعتماد عرض قديم.</span></div> : null}

      <div className="grid gap-4 md:grid-cols-3">
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm md:col-span-2">
          <div className="flex items-center gap-3"><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-50 text-violet-700"><FileText className="h-5 w-5" /></span><div><div className="font-black text-slate-950">{quote.customerName}</div><div className="text-xs font-bold text-slate-500">{quote.customerPhone || "بدون هاتف"}</div></div></div>
          <div className="mt-4 flex items-center gap-2 rounded-xl bg-slate-50 p-3 text-sm font-bold text-slate-700"><Truck className="h-4 w-4 text-teal-700" />{quote.vehicleMake} {quote.vehicleModel}{quote.vehicleYear ? ` • ${quote.vehicleYear}` : ""} • {quote.plateNumber || quote.vin || "بدون لوحة/VIN"}</div>
          {quote.notes ? <div className="mt-3 text-sm font-semibold leading-7 text-slate-600">{quote.notes}</div> : null}
        </section>
        <section className="rounded-2xl border border-violet-100 bg-violet-50/50 p-5">
          <div className="text-xs font-black text-violet-700">الإجمالي</div>
          <div className="mt-2 text-2xl font-black text-slate-950">{formatAutoMoney(quote.total, auth.shop.currency)}</div>
          <div className="mt-3 space-y-1 text-xs font-bold text-slate-500"><div>المجموع: {formatAutoMoney(quote.subtotal, auth.shop.currency)}</div><div>الخصم: {formatAutoMoney(quote.discountTotal, auth.shop.currency)}</div><div>الضريبة: {formatAutoMoney(quote.taxTotal, auth.shop.currency)}</div></div>
        </section>
      </div>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 p-5"><h2 className="font-black text-slate-950">بنود عرض السعر</h2></div>
        <div className="divide-y divide-slate-100">
          {quote.lines.map((line) => (
            <div key={line.id} className="grid gap-2 p-4 sm:grid-cols-[1fr_auto] sm:items-center sm:p-5">
              <div><div className="font-bold text-slate-900">{line.description}</div><div className="mt-1 text-xs font-bold text-slate-500">{line.lineType === "LABOR" ? "أجرة عمل" : line.lineType === "PART" ? "قطعة غيار" : "بند آخر"} • {Number(line.quantity)} × {formatAutoMoney(line.unitPrice, auth.shop.currency)} • {line.approvalStatus === "APPROVED" ? "مقبول" : line.approvalStatus === "REJECTED" ? "مرفوض" : "بانتظار القرار"}</div></div>
              <div className="font-black text-slate-950">{formatAutoMoney(line.lineTotal, auth.shop.currency)}</div>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div><h2 className="font-black text-slate-950">اعتماد العميل</h2><p className="mt-1 text-xs font-semibold text-slate-500">نسجل طريقة الموافقة ووقتها حتى تبقى موثقة في ملف أمر الصيانة.</p></div>
          <div className="flex flex-wrap gap-2">
            {canSend ? (
              <form action={markQuotationSentAction}>
                <input type="hidden" name="quotationId" value={quote.id} /><input type="hidden" name="serviceOrderId" value={quote.serviceOrderId} />
                <Button type="submit" variant="outline" className="font-black"><Send className="ml-1.5 h-4 w-4" />تسجيل إرسال العرض</Button>
              </form>
            ) : null}
            {canDecide ? (
              <form action={recordCustomerApprovalAction} className="flex flex-wrap gap-2">
                <input type="hidden" name="quotationId" value={quote.id} /><input type="hidden" name="serviceOrderId" value={quote.serviceOrderId} /><input type="hidden" name="decision" value="APPROVED" /><input type="hidden" name="channel" value="IN_PERSON" />
                <Button type="submit" className="font-black"><CheckCircle2 className="ml-1.5 h-4 w-4" />موافقة كاملة</Button>
              </form>
            ) : null}
            {canDecide ? (
              <form action={recordCustomerApprovalAction}>
                <input type="hidden" name="quotationId" value={quote.id} /><input type="hidden" name="serviceOrderId" value={quote.serviceOrderId} /><input type="hidden" name="decision" value="REJECTED" /><input type="hidden" name="channel" value="IN_PERSON" />
                <Button type="submit" variant="destructive" className="font-black"><XCircle className="ml-1.5 h-4 w-4" />رفض العرض</Button>
              </form>
            ) : null}
            {!canManage && quoteOpen && orderAcceptsDecision ? <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold text-slate-500">عرض فقط — حسابك لا يملك صلاحية إدارة عروض الأسعار.</div> : null}
          </div>
        </div>
        <div className="mt-4 grid gap-2 text-xs font-bold text-slate-500 sm:grid-cols-3"><div>الحالة: {statusLabel[quote.status] ?? quote.status}</div><div>أنشئ: {formatAutoDate(quote.createdAt)}</div><div>أرسل: {formatAutoDate(quote.sentAt)}</div></div>
      </section>
    </div>
  );
}
