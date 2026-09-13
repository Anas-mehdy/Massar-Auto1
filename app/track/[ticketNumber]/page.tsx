import type { Metadata } from "next";
import Link from "next/link";
import {
  Car,
  CheckCircle2,
  Clock,
  MapPin,
  MessageCircle,
  Phone,
  Search,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatDateTime } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import type { ServiceOrderStatus } from "@/lib/services/autoServiceOrderService";
import { normalizePhoneForWhatsApp } from "@/lib/services/whatsappService";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { robots: { index: false, follow: false } };

type TrackPageProps = {
  params: Promise<{ ticketNumber: string }>;
  searchParams?: Promise<{ phone?: string }>;
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
  WAITING_CUSTOMER_APPROVAL: { label: "بانتظار موافقة العميل", description: "تم تجهيز تفاصيل الأعمال والتكلفة، وبانتظار اعتماد العميل قبل متابعة التنفيذ.", step: 3, colorClass: "text-amber-300", bgClass: "bg-amber-500/10", borderClass: "border-amber-500/30" },
  APPROVED: { label: "تمت الموافقة", description: "تم اعتماد الأعمال المطلوبة وأمر الصيانة جاهز لبدء التنفيذ.", step: 3, colorClass: "text-emerald-300", bgClass: "bg-emerald-500/10", borderClass: "border-emerald-500/30" },
  IN_SERVICE: { label: "قيد الصيانة", description: "يتم تنفيذ أعمال الصيانة المعتمدة على المركبة حالياً.", step: 4, colorClass: "text-teal-300", bgClass: "bg-teal-500/10", borderClass: "border-teal-500/30" },
  WAITING_PARTS: { label: "بانتظار قطع الغيار", description: "أمر الصيانة متوقف مؤقتاً لحين توفر قطع الغيار المطلوبة.", step: 4, colorClass: "text-orange-300", bgClass: "bg-orange-500/10", borderClass: "border-orange-500/30" },
  READY_FOR_DELIVERY: { label: "جاهزة للتسليم 🎉", description: "اكتملت أعمال الصيانة وأصبحت المركبة جاهزة للتسليم.", step: 5, colorClass: "text-emerald-300", bgClass: "bg-emerald-500/15", borderClass: "border-emerald-500/40" },
  DELIVERED: { label: "تم تسليم المركبة", description: "تم تسجيل تسليم المركبة للعميل بنجاح.", step: 6, colorClass: "text-sky-300", bgClass: "bg-sky-500/10", borderClass: "border-sky-500/30" },
  CLOSED: { label: "تم إغلاق أمر الصيانة", description: "اكتملت دورة أمر الصيانة وتم إغلاقه في النظام.", step: 6, colorClass: "text-slate-200", bgClass: "bg-slate-500/10", borderClass: "border-slate-500/30" },
  REJECTED: { label: "لم تتم الموافقة على الصيانة", description: "تم إنهاء الإجراء بدون تنفيذ الأعمال المقترحة.", step: 0, colorClass: "text-rose-300", bgClass: "bg-rose-500/10", borderClass: "border-rose-500/30" },
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
      receivedAt: true,
      promisedAt: true,
      readyAt: true,
      deliveredAt: true,
      vehicle: { select: { make: true, model: true, year: true } },
      shop: { select: { name: true, currency: true, phone: true, address: true } },
    },
  });
  if (!order) return <NotFoundCard orderNumber={decodedParam} needsPhone={false} />;

  const currentStatus = statusDetails[order.status as ServiceOrderStatus] ?? { label: "قيد المتابعة", description: "أمر الصيانة قيد المتابعة لدى المركز.", step: 1, colorClass: "text-teal-300", bgClass: "bg-teal-500/10", borderClass: "border-teal-500/30" };
  const shop = order.shop;
  const vehicleLabel = `${order.vehicle.make} ${order.vehicle.model}${order.vehicle.year ? ` ${order.vehicle.year}` : ""}`;
  const whatsappPhone = normalizePhoneForWhatsApp(shop.phone, shop.currency || undefined);
  const whatsappUrl = whatsappPhone ? `https://wa.me/${whatsappPhone}?text=${encodeURIComponent(`مرحباً، أستفسر عن حالة أمر الصيانة رقم ${order.orderNumber} للمركبة ${vehicleLabel}.`)}` : null;

  return <div className="flex min-h-screen w-full flex-col items-center justify-start overflow-x-hidden bg-slate-950 px-3 py-4 text-slate-100 sm:px-4"><div className="w-full max-w-md space-y-4">
    <div className="rounded-2xl border border-slate-800 bg-slate-900/95 p-4 text-center shadow-lg"><div className="mb-2 inline-flex h-10 w-10 items-center justify-center rounded-xl border border-teal-500/20 bg-teal-500/10 text-teal-400"><Car className="h-5 w-5" /></div><h1 className="text-base font-black text-white">{shop.name}</h1><p className="mt-0.5 text-[11px] text-slate-400">متابعة حالة صيانة المركبة</p>{(shop.phone || shop.address) ? <div className="mt-3 flex flex-wrap items-center justify-center gap-3 border-t border-slate-800/80 pt-2.5 text-[11px] font-bold text-slate-400">{shop.phone ? <span className="flex items-center gap-1 font-numeric" dir="ltr"><Phone className="h-3 w-3 text-teal-400" />{whatsappPhone ? `+${whatsappPhone}` : shop.phone}</span> : null}{shop.address ? <span className="flex items-center gap-1"><MapPin className="h-3 w-3 text-teal-400" />{shop.address}</span> : null}</div> : null}</div>

    <div className="space-y-4 rounded-2xl border border-slate-800 bg-slate-900/95 p-4 shadow-xl sm:p-5">
      <div className="flex items-center justify-between gap-2 border-b border-slate-800 pb-3"><div><span className="block text-[9px] font-extrabold text-slate-400">رقم أمر الصيانة</span><span className="font-numeric text-lg font-black text-teal-400">{order.orderNumber}</span></div><span className={`inline-flex items-center gap-1 rounded-lg border px-2.5 py-1 text-[11px] font-black ${currentStatus.colorClass} ${currentStatus.bgClass} ${currentStatus.borderClass}`}><Sparkles className="h-3 w-3" />{currentStatus.label}</span></div>
      <div className="rounded-xl border border-slate-800/80 bg-slate-950/70 p-3"><p className="text-xs font-medium leading-relaxed text-slate-200">{currentStatus.description}</p></div>
      {currentStatus.step > 0 ? <div className="pt-1"><span className="mb-2.5 block text-[10px] font-extrabold text-slate-400">مراحل أمر الصيانة</span><div className="grid grid-cols-3 gap-1.5 sm:grid-cols-6">{steps.map((step) => { const passed = currentStatus.step >= step.num; const current = currentStatus.step === step.num; return <div key={step.num} className={`rounded-xl border px-1 py-2 text-center ${current ? "border-teal-500 bg-teal-500/20 font-black text-teal-300" : passed ? "border-emerald-500/40 bg-emerald-500/10 font-bold text-emerald-400" : "border-slate-800/80 bg-slate-950/40 text-slate-500"}`}><div className="mb-0.5 flex justify-center">{passed ? <CheckCircle2 className="h-3 w-3" /> : <Clock className="h-3 w-3" />}</div><span className="block text-[9px]">{step.label}</span></div>; })}</div></div> : null}
      <div className="grid gap-2"><PublicField label="المركبة" value={vehicleLabel} /><PublicField label="تاريخ الاستلام" value={formatDateTime(order.receivedAt)} numeric />{order.promisedAt ? <PublicField label="موعد التسليم المتوقع" value={formatDateTime(order.promisedAt)} numeric /> : null}{order.readyAt ? <PublicField label="تاريخ الجاهزية" value={formatDateTime(order.readyAt)} numeric /> : null}{order.deliveredAt ? <PublicField label="تاريخ التسليم" value={formatDateTime(order.deliveredAt)} numeric /> : null}<PublicField label="سبب دخول المركبة" value={order.reportedIssue} accent multiline /></div>
      {whatsappUrl ? <Button asChild variant="outline" className="h-11 w-full rounded-xl border-emerald-500/30 bg-emerald-500/10 font-black text-emerald-300 hover:bg-emerald-500/20"><a href={whatsappUrl} target="_blank" rel="noreferrer"><MessageCircle className="ml-2 h-4 w-4" />التواصل مع المركز عبر واتساب</a></Button> : null}
    </div>
    <p className="px-3 text-center text-[10px] font-semibold leading-5 text-slate-600">يعرض رابط التتبع حالة أمر الصيانة ومعلومات تشغيلية محدودة فقط. للاستفسارات التفصيلية تواصل مع مركز الصيانة.</p>
  </div></div>;
}

function PublicField({ label, value, numeric = false, accent = false, multiline = false }: { label: string; value: string; numeric?: boolean; accent?: boolean; multiline?: boolean }) {
  return <div className={`rounded-xl border p-3 ${accent ? "border-teal-500/20 bg-teal-500/5" : "border-slate-800 bg-slate-950/40"}`}><span className="block text-[9px] font-extrabold text-slate-500">{label}</span><span className={`mt-1 block text-xs font-bold leading-5 ${accent ? "text-teal-100" : "text-slate-200"} ${numeric ? "font-numeric" : ""} ${multiline ? "whitespace-pre-wrap" : ""}`}>{value}</span></div>;
}
