import type { Metadata } from "next";
import Link from "next/link";
import {
  Car,
  CheckCircle2,
  Clock,
  FileText,
  MapPin,
  MessageCircle,
  Phone,
  Search,
  ShieldCheck,
  Sparkles,
  Wrench,
} from "lucide-react";
import { PublicQuotationApprovalForm } from "@/components/public-quotation-approval-form";
import { Button } from "@/components/ui/button";
import { formatAutoMoney } from "@/lib/auto/service-order-ui";
import { formatDateTime } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { createPublicQuotationApprovalToken } from "@/lib/public-quotation-approval";
import type { ServiceOrderStatus } from "@/lib/services/autoServiceOrderService";
import { quotationService } from "@/lib/services/quotationService";
import { serviceInspectionService } from "@/lib/services/serviceInspectionService";
import { normalizePhoneForWhatsApp } from "@/lib/services/whatsappService";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { robots: { index: false, follow: false } };

type TrackPageProps = {
  params: Promise<{ ticketNumber: string }>;
  searchParams?: Promise<{ phone?: string; approval?: string }>;
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type StatusDetails = {
  label: string;
  description: string;
  step: number;
  colorClass: string;
  bgClass: string;
  borderClass: string;
};

const statusDetails: Record<ServiceOrderStatus, StatusDetails> = {
  RECEIVED: { label: "تم استلام المركبة", description: "تم تسجيل المركبة في مركز الصيانة وبانتظار بدء الفحص الفني.", step: 1, colorClass: "text-cyan-300", bgClass: "bg-cyan-500/10", borderClass: "border-cyan-500/30" },
  INSPECTING: { label: "قيد الفحص والتشخيص", description: "يقوم الفريق الفني حالياً بفحص المركبة وتحديد الأعمال وقطع الغيار المطلوبة.", step: 2, colorClass: "text-indigo-300", bgClass: "bg-indigo-500/10", borderClass: "border-indigo-500/30" },
  WAITING_CUSTOMER_APPROVAL: { label: "بانتظار موافقة العميل", description: "نتيجة الفحص وعرض السعر جاهزان أدناه. راجع البنود ثم سجل قرارك قبل بدء التنفيذ.", step: 3, colorClass: "text-amber-300", bgClass: "bg-amber-500/10", borderClass: "border-amber-500/30" },
  APPROVED: { label: "تمت الموافقة", description: "تم اعتماد الأعمال المطلوبة وأمر الصيانة جاهز لبدء التنفيذ.", step: 3, colorClass: "text-emerald-300", bgClass: "bg-emerald-500/10", borderClass: "border-emerald-500/30" },
  IN_SERVICE: { label: "قيد الصيانة", description: "يتم تنفيذ أعمال الصيانة المعتمدة على المركبة حالياً.", step: 4, colorClass: "text-teal-300", bgClass: "bg-teal-500/10", borderClass: "border-teal-500/30" },
  WAITING_PARTS: { label: "بانتظار قطع الغيار", description: "أمر الصيانة متوقف مؤقتاً لحين توفر قطع الغيار المطلوبة.", step: 4, colorClass: "text-orange-300", bgClass: "bg-orange-500/10", borderClass: "border-orange-500/30" },
  READY_FOR_DELIVERY: { label: "جاهزة للتسليم 🎉", description: "اكتملت أعمال الصيانة وأصبحت المركبة جاهزة للتسليم.", step: 5, colorClass: "text-emerald-300", bgClass: "bg-emerald-500/15", borderClass: "border-emerald-500/40" },
  DELIVERED: { label: "تم تسليم المركبة", description: "تم تسجيل تسليم المركبة للعميل بنجاح.", step: 6, colorClass: "text-sky-300", bgClass: "bg-sky-500/10", borderClass: "border-sky-500/30" },
  CLOSED: { label: "تم إغلاق أمر الصيانة", description: "اكتملت دورة أمر الصيانة وتم إغلاقه في النظام.", step: 6, colorClass: "text-slate-200", bgClass: "bg-slate-500/10", borderClass: "border-slate-500/30" },
  REJECTED: { label: "لم تتم الموافقة على الصيانة", description: "تم تسجيل رفض عرض الصيانة ولن يبدأ تنفيذ الأعمال المقترحة.", step: 0, colorClass: "text-rose-300", bgClass: "bg-rose-500/10", borderClass: "border-rose-500/30" },
  CANCELLED: { label: "أمر الصيانة ملغي", description: "تم إلغاء أمر الصيانة.", step: 0, colorClass: "text-rose-300", bgClass: "bg-rose-500/10", borderClass: "border-rose-500/30" },
};

const steps = [
  { num: 1, label: "الاستلام" },
  { num: 2, label: "الفحص" },
  { num: 3, label: "الموافقة" },
  { num: 4, label: "الصيانة" },
  { num: 5, label: "جاهزة" },
  { num: 6, label: "التسليم" },
];

const inspectionResultLabels: Record<string, string> = {
  OK: "سليم",
  WARNING: "يحتاج انتباه",
  FAIL: "يحتاج إصلاح/تبديل",
  NOT_CHECKED: "لم يتم فحصه",
};

const inspectionTypeLabels: Record<string, string> = {
  INITIAL: "الفحص الأولي",
  FINAL: "الفحص النهائي",
  OTHER: "فحص إضافي",
};

const quoteStatusLabels: Record<string, string> = {
  SENT: "بانتظار قرارك",
  APPROVED: "تمت الموافقة بالكامل",
  PARTIALLY_APPROVED: "تمت الموافقة جزئياً",
  REJECTED: "تم رفض العرض",
  EXPIRED: "انتهت صلاحية العرض",
};

const approvalBannerLabels: Record<string, string> = {
  APPROVED: "تم تسجيل موافقتك على عرض السعر بنجاح.",
  PARTIALLY_APPROVED: "تم تسجيل موافقتك الجزئية على البنود المحددة بنجاح.",
  REJECTED: "تم تسجيل رفضك لعرض السعر بنجاح.",
};

function phoneProof(value?: string) {
  const digits = value?.replace(/\D/g, "") ?? "";
  return digits.length >= 8 ? digits.slice(-8) : null;
}

async function resolvePublicServiceOrderId(orderOrId: string, phone?: string) {
  if (UUID_PATTERN.test(orderOrId)) {
    const row = await prisma.serviceOrder.findFirst({ where: { id: orderOrId, deletedAt: null }, select: { id: true } });
    return row?.id ?? null;
  }

  const proof = phoneProof(phone);
  if (!proof) return null;

  const matches = await prisma.serviceOrder.findMany({
    where: {
      deletedAt: null,
      orderNumber: { equals: orderOrId, mode: "insensitive" },
      customer: { OR: [{ phone: { endsWith: proof } }, { phoneNormalized: { endsWith: proof } }] },
    },
    select: { id: true },
    orderBy: { receivedAt: "desc" },
    take: 2,
  });
  return matches.length === 1 ? matches[0].id : null;
}

function NotFoundCard({ orderNumber, needsPhone }: { orderNumber: string; needsPhone: boolean }) {
  const href = needsPhone ? `/track?order=${encodeURIComponent(orderNumber)}&verify=1` : "/track";
  return <div className="flex min-h-screen w-full flex-col items-center justify-center bg-slate-950 px-4 py-8 text-slate-100"><div className="w-full max-w-sm space-y-5 rounded-3xl border border-slate-800 bg-slate-900/90 p-6 text-center shadow-2xl"><div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl border border-rose-500/20 bg-rose-500/10 text-rose-400"><Search className="h-6 w-6" /></div><h2 className="text-lg font-black text-white">تعذر التحقق من أمر الصيانة</h2><p className="text-xs font-medium leading-relaxed text-slate-400">{needsPhone ? "للبحث برقم أمر الصيانة أدخل رقم جوال العميل المسجل معه. روابط QR الأصلية تفتح مباشرة." : "تأكد من رقم أمر الصيانة ورقم الجوال ثم حاول مرة أخرى."}</p><Button asChild className="h-11 w-full rounded-xl bg-teal-500 font-bold text-slate-950 hover:bg-teal-400"><Link href={href}>العودة للتحقق</Link></Button></div></div>;
}

export default async function TrackServiceOrderPage({ params, searchParams }: TrackPageProps) {
  const { ticketNumber } = await params;
  const query = searchParams ? await searchParams : {};
  const decodedParam = decodeURIComponent(ticketNumber).trim();
  const isQrBearerLink = UUID_PATTERN.test(decodedParam);
  const phone = query.phone?.trim();

  if (!isQrBearerLink && !phoneProof(phone)) return <NotFoundCard orderNumber={decodedParam} needsPhone />;

  const serviceOrderId = await resolvePublicServiceOrderId(decodedParam, phone);
  if (!serviceOrderId) return <NotFoundCard orderNumber={decodedParam} needsPhone={false} />;

  const order = await prisma.serviceOrder.findFirst({
    where: { id: serviceOrderId, deletedAt: null },
    select: {
      id: true,
      orderNumber: true,
      status: true,
      reportedIssue: true,
      diagnosis: true,
      receivedAt: true,
      promisedAt: true,
      readyAt: true,
      deliveredAt: true,
      vehicle: { select: { make: true, model: true, year: true } },
      shop: { select: { id: true, name: true, currency: true, phone: true, address: true } },
    },
  });
  if (!order) return <NotFoundCard orderNumber={decodedParam} needsPhone={false} />;

  const [inspections, quoteRef] = await Promise.all([
    serviceInspectionService.listServiceInspections(order.shop.id, order.id),
    prisma.quotation.findFirst({
      where: {
        shopId: order.shop.id,
        serviceOrderId: order.id,
        status: { in: ["SENT", "APPROVED", "PARTIALLY_APPROVED", "REJECTED", "EXPIRED"] },
      },
      orderBy: [{ revision: "desc" }, { createdAt: "desc" }],
      select: { id: true },
    }),
  ]);

  const quote = quoteRef ? await quotationService.getQuotation(order.shop.id, quoteRef.id) : null;
  const latestApproval = quote ? await prisma.customerApproval.findFirst({
    where: { shopId: order.shop.id, quotationId: quote.id },
    orderBy: { decidedAt: "desc" },
    select: { decision: true, decidedAt: true, channel: true },
  }) : null;

  const currentStatus = statusDetails[order.status as ServiceOrderStatus] ?? { label: "قيد المتابعة", description: "أمر الصيانة قيد المتابعة لدى المركز.", step: 1, colorClass: "text-teal-300", bgClass: "bg-teal-500/10", borderClass: "border-teal-500/30" };
  const shop = order.shop;
  const vehicleLabel = `${order.vehicle.make} ${order.vehicle.model}${order.vehicle.year ? ` ${order.vehicle.year}` : ""}`;
  const whatsappPhone = normalizePhoneForWhatsApp(shop.phone, shop.currency || undefined);
  const whatsappUrl = whatsappPhone ? `https://wa.me/${whatsappPhone}?text=${encodeURIComponent(`مرحباً، أستفسر عن حالة أمر الصيانة رقم ${order.orderNumber} للمركبة ${vehicleLabel}.`)}` : null;
  const quoteExpired = Boolean(quote?.validUntil && quote.validUntil.getTime() < Date.now());
  const canApproveOnline = Boolean(quote && quote.status === "SENT" && order.status === "WAITING_CUSTOMER_APPROVAL" && !quoteExpired);
  const approvalToken = canApproveOnline && quote ? createPublicQuotationApprovalToken(quote.id, order.id) : null;
  const approvalBanner = query.approval ? approvalBannerLabels[query.approval] : null;

  return <div className="flex min-h-screen w-full flex-col items-center justify-start overflow-x-hidden bg-slate-950 px-3 py-4 text-slate-100 sm:px-4"><div className="w-full max-w-2xl space-y-4">
    <div className="rounded-2xl border border-slate-800 bg-slate-900/95 p-4 text-center shadow-lg"><div className="mb-2 inline-flex h-10 w-10 items-center justify-center rounded-xl border border-teal-500/20 bg-teal-500/10 text-teal-400"><Car className="h-5 w-5" /></div><h1 className="text-base font-black text-white">{shop.name}</h1><p className="mt-0.5 text-[11px] text-slate-400">متابعة حالة صيانة المركبة</p>{(shop.phone || shop.address) ? <div className="mt-3 flex flex-wrap items-center justify-center gap-3 border-t border-slate-800/80 pt-2.5 text-[11px] font-bold text-slate-400">{shop.phone ? <span className="flex items-center gap-1 font-numeric" dir="ltr"><Phone className="h-3 w-3 text-teal-400" />{whatsappPhone ? `+${whatsappPhone}` : shop.phone}</span> : null}{shop.address ? <span className="flex items-center gap-1"><MapPin className="h-3 w-3 text-teal-400" />{shop.address}</span> : null}</div> : null}</div>

    {approvalBanner ? <div className="flex items-start gap-2 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-xs font-bold leading-6 text-emerald-200"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" /><span>{approvalBanner}</span></div> : null}

    <div className="space-y-4 rounded-2xl border border-slate-800 bg-slate-900/95 p-4 shadow-xl sm:p-5">
      <div className="flex items-center justify-between gap-2 border-b border-slate-800 pb-3"><div><span className="block text-[9px] font-extrabold text-slate-400">رقم أمر الصيانة</span><span className="font-numeric text-lg font-black text-teal-400">{order.orderNumber}</span></div><span className={`inline-flex items-center gap-1 rounded-lg border px-2.5 py-1 text-[11px] font-black ${currentStatus.colorClass} ${currentStatus.bgClass} ${currentStatus.borderClass}`}><Sparkles className="h-3 w-3" />{currentStatus.label}</span></div>
      <div className="rounded-xl border border-slate-800/80 bg-slate-950/70 p-3"><p className="text-xs font-medium leading-relaxed text-slate-200">{currentStatus.description}</p></div>
      {currentStatus.step > 0 ? <div className="pt-1"><span className="mb-2.5 block text-[10px] font-extrabold text-slate-400">مراحل أمر الصيانة</span><div className="grid grid-cols-3 gap-1.5 sm:grid-cols-6">{steps.map((step) => { const passed = currentStatus.step >= step.num; const current = currentStatus.step === step.num; return <div key={step.num} className={`rounded-xl border px-1 py-2 text-center ${current ? "border-teal-500 bg-teal-500/20 font-black text-teal-300" : passed ? "border-emerald-500/40 bg-emerald-500/10 font-bold text-emerald-400" : "border-slate-800/80 bg-slate-950/40 text-slate-500"}`}><div className="mb-0.5 flex justify-center">{passed ? <CheckCircle2 className="h-3 w-3" /> : <Clock className="h-3 w-3" />}</div><span className="block text-[9px]">{step.label}</span></div>; })}</div></div> : null}
      <div className="grid gap-2 sm:grid-cols-2"><PublicField label="المركبة" value={vehicleLabel} /><PublicField label="تاريخ الاستلام" value={formatDateTime(order.receivedAt)} numeric />{order.promisedAt ? <PublicField label="موعد التسليم المتوقع" value={formatDateTime(order.promisedAt)} numeric /> : null}{order.readyAt ? <PublicField label="تاريخ الجاهزية" value={formatDateTime(order.readyAt)} numeric /> : null}{order.deliveredAt ? <PublicField label="تاريخ التسليم" value={formatDateTime(order.deliveredAt)} numeric /> : null}<PublicField label="سبب دخول المركبة" value={order.reportedIssue} accent multiline /></div>
    </div>

    {(order.diagnosis || inspections.length) ? <section className="space-y-3 rounded-2xl border border-slate-800 bg-slate-900/95 p-4 shadow-xl sm:p-5">
      <div className="flex items-center gap-2"><Wrench className="h-4 w-4 text-cyan-300" /><h2 className="text-sm font-black text-white">نتيجة الفحص والتشخيص</h2></div>
      {order.diagnosis ? <div className="rounded-xl border border-cyan-500/20 bg-cyan-500/5 p-3"><span className="block text-[10px] font-black text-cyan-300">التشخيص</span><p className="mt-1 whitespace-pre-wrap text-xs font-semibold leading-6 text-slate-200">{order.diagnosis}</p></div> : null}
      {inspections.map((inspection) => <div key={inspection.id} className="rounded-xl border border-slate-800 bg-slate-950/50 p-3"><div className="mb-2 flex items-center justify-between gap-2"><span className="text-[11px] font-black text-slate-200">{inspectionTypeLabels[inspection.inspectionType] ?? "فحص"}</span><span className="text-[9px] font-semibold text-slate-500">{formatDateTime(inspection.inspectedAt ?? inspection.createdAt)}</span></div><div className="space-y-2">{inspection.items.map((item) => <div key={item.id} className="grid gap-1 rounded-lg border border-slate-800 bg-slate-900/70 p-2.5 sm:grid-cols-[1fr_auto] sm:items-center"><div><div className="text-xs font-black text-slate-100">{item.component}</div>{item.recommendedAction ? <div className="mt-1 text-[10px] font-semibold leading-5 text-slate-400">الإجراء المقترح: {item.recommendedAction}</div> : null}</div><span className={`w-fit rounded-lg border px-2 py-1 text-[10px] font-black ${item.result === "OK" ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300" : item.result === "FAIL" ? "border-rose-500/30 bg-rose-500/10 text-rose-300" : item.result === "WARNING" ? "border-amber-500/30 bg-amber-500/10 text-amber-300" : "border-slate-700 bg-slate-800 text-slate-400"}`}>{inspectionResultLabels[item.result] ?? item.result}</span></div>)}</div></div>)}
    </section> : null}

    {quote ? <section className="space-y-4 rounded-2xl border border-slate-800 bg-slate-900/95 p-4 shadow-xl sm:p-5">
      <div className="flex flex-col gap-2 border-b border-slate-800 pb-3 sm:flex-row sm:items-center sm:justify-between"><div className="flex items-center gap-2"><FileText className="h-4 w-4 text-violet-300" /><div><h2 className="text-sm font-black text-white">عرض السعر {quote.quoteNumber}</h2><p className="mt-0.5 text-[10px] font-semibold text-slate-500">نسخة {quote.revision}{quote.validUntil ? ` • صالح حتى ${formatDateTime(quote.validUntil)}` : ""}</p></div></div><span className={`w-fit rounded-lg border px-2.5 py-1 text-[10px] font-black ${quote.status === "SENT" && !quoteExpired ? "border-amber-500/30 bg-amber-500/10 text-amber-300" : quote.status === "REJECTED" ? "border-rose-500/30 bg-rose-500/10 text-rose-300" : "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"}`}>{quoteExpired && quote.status === "SENT" ? "انتهت صلاحية العرض" : quoteStatusLabels[quote.status] ?? quote.status}</span></div>

      {quote.notes ? <div className="rounded-xl border border-slate-800 bg-slate-950/50 p-3 text-xs font-semibold leading-6 text-slate-300">{quote.notes}</div> : null}

      <div className="overflow-hidden rounded-xl border border-slate-800"><div className="divide-y divide-slate-800">{quote.lines.map((line) => <div key={line.id} className="grid gap-2 bg-slate-950/40 p-3 sm:grid-cols-[1fr_auto] sm:items-center"><div><div className="text-xs font-black text-slate-100">{line.description}</div><div className="mt-1 text-[10px] font-semibold text-slate-500">{line.lineType === "LABOR" ? "أجرة عمل" : line.lineType === "PART" ? "قطعة غيار" : "بند"} • {Number(line.quantity)} × {formatAutoMoney(Number(line.unitPrice), shop.currency)}{line.approvalStatus === "APPROVED" ? " • مقبول" : line.approvalStatus === "REJECTED" ? " • مرفوض" : ""}</div></div><div className="font-numeric text-xs font-black text-teal-300">{formatAutoMoney(Number(line.lineTotal), shop.currency)}</div></div>)}</div></div>

      <div className="mr-auto w-full max-w-sm space-y-1.5 rounded-xl border border-slate-800 bg-slate-950/60 p-3 text-xs"><MoneyRow label="المجموع" value={formatAutoMoney(Number(quote.subtotal), shop.currency)} /><MoneyRow label="الخصم" value={formatAutoMoney(Number(quote.discountTotal), shop.currency)} /><MoneyRow label="الضريبة" value={formatAutoMoney(Number(quote.taxTotal), shop.currency)} /><MoneyRow label="الإجمالي النهائي" value={formatAutoMoney(Number(quote.total), shop.currency)} bold /></div>

      {latestApproval ? <div className="flex items-start gap-2 rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-3 text-[11px] font-bold leading-5 text-emerald-200"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" /><span>{quoteStatusLabels[latestApproval.decision] ?? latestApproval.decision} • سُجل القرار بتاريخ {formatDateTime(latestApproval.decidedAt)}{latestApproval.channel === "WEB" ? " عبر رابط التتبع" : ""}.</span></div> : null}

      {quoteExpired && quote.status === "SENT" ? <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs font-bold leading-6 text-amber-200">انتهت صلاحية هذا العرض ولا يمكن اعتماده الآن. تواصل مع المركز ليصدر عرض سعر محدث.</div> : null}

      {canApproveOnline && approvalToken ? <PublicQuotationApprovalForm
        quotationId={quote.id}
        serviceOrderId={order.id}
        approvalToken={approvalToken}
        lines={quote.lines.map((line) => ({ id: line.id, lineType: line.lineType, description: line.description, quantity: Number(line.quantity), unitPrice: Number(line.unitPrice), lineTotal: Number(line.lineTotal) }))}
        currency={shop.currency}
        subtotal={Number(quote.subtotal)}
        discountTotal={Number(quote.discountTotal)}
        taxTotal={Number(quote.taxTotal)}
        total={Number(quote.total)}
        defaultPhone={phone || ""}
      /> : null}
    </section> : order.status === "WAITING_CUSTOMER_APPROVAL" ? <section className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 text-xs font-bold leading-6 text-amber-200">أمر الصيانة بانتظار موافقتك، لكن عرض السعر المرسل غير متاح حالياً. تواصل مع المركز قبل اعتماد أي أعمال.</section> : null}

    {whatsappUrl ? <Button asChild variant="outline" className="h-11 w-full rounded-xl border-emerald-500/30 bg-emerald-500/10 font-black text-emerald-300 hover:bg-emerald-500/20"><a href={whatsappUrl} target="_blank" rel="noreferrer"><MessageCircle className="ml-2 h-4 w-4" />التواصل مع المركز عبر واتساب</a></Button> : null}
    <p className="px-3 text-center text-[10px] font-semibold leading-5 text-slate-600">تعرض الصفحة حالة أمر الصيانة ونتيجة الفحص وعرض السعر المرسل فقط. لا تعرض تكاليف المركز الداخلية أو الأرباح أو ملاحظات الموظفين.</p>
  </div></div>;
}

function PublicField({ label, value, numeric = false, accent = false, multiline = false }: { label: string; value: string; numeric?: boolean; accent?: boolean; multiline?: boolean }) {
  return <div className={`rounded-xl border p-3 ${accent ? "border-teal-500/20 bg-teal-500/5" : "border-slate-800 bg-slate-950/40"}`}><span className="block text-[9px] font-extrabold text-slate-500">{label}</span><span className={`mt-1 block text-xs font-bold leading-5 ${accent ? "text-teal-100" : "text-slate-200"} ${numeric ? "font-numeric" : ""} ${multiline ? "whitespace-pre-wrap" : ""}`}>{value}</span></div>;
}

function MoneyRow({ label, value, bold = false }: { label: string; value: string; bold?: boolean }) {
  return <div className={`flex items-center justify-between gap-3 ${bold ? "border-t border-slate-800 pt-2 font-black text-white" : "font-bold text-slate-400"}`}><span>{label}</span><span className="font-numeric">{value}</span></div>;
}
