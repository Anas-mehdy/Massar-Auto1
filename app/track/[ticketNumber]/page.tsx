import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import Link from "next/link";
import {
  Smartphone,
  CheckCircle2,
  Clock,
  MessageCircle,
  Phone,
  MapPin,
  Search,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { RepairStatus } from "@prisma/client";
import { formatCurrency, formatDateTime } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { normalizePhoneForWhatsApp } from "@/lib/services/whatsappService";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

type TrackPageProps = {
  params: Promise<{ ticketNumber: string }>;
  searchParams?: Promise<{ s?: string; shop?: string; phone?: string }>;
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const statusDetails: Record<RepairStatus, { label: string; description: string; step: number; colorClass: string; bgClass: string; borderClass: string }> = {
  PENDING: { label: "قيد الانتظار والاستلام", description: "تم تسجيل جهازك بنجاح وبانتظار بدء الفحص الفني من قبل المختص.", step: 1, colorClass: "text-amber-400", bgClass: "bg-amber-500/10", borderClass: "border-amber-500/30" },
  DIAGNOSING: { label: "قيد الفحص والتشخيص", description: "يقوم الفني حالياً بفحص الجهاز وتحديد العطل وقطع الغيار المطلوبة.", step: 2, colorClass: "text-indigo-400", bgClass: "bg-indigo-500/10", borderClass: "border-indigo-500/30" },
  WAITING_PARTS: { label: "بانتظار وصول قطع الغيار", description: "تم فحص الجهاز وتحديد القطعة وبانتظار توريدها للبدء بالتركيب فوراً.", step: 3, colorClass: "text-orange-400", bgClass: "bg-orange-500/10", borderClass: "border-orange-500/30" },
  REPAIRING: { label: "قيد الصيانة والإصلاح", description: "جاري صيانة واستبدال القطع وفحص أداء الجهاز بدقة.", step: 3, colorClass: "text-teal-400", bgClass: "bg-teal-500/10", borderClass: "border-teal-500/30" },
  DONE: { label: "مكتمل وجاهز للاستلام 🎉", description: "تمت صيانة جهازك بنجاح وبكفاءة، وهو جاهز للاستلام في المحل الآن!", step: 4, colorClass: "text-emerald-400", bgClass: "bg-emerald-500/15", borderClass: "border-emerald-500/40" },
  DELIVERED: { label: "تم تسليم الجهاز بنجاح", description: "تم استلام الجهاز من قبل العميل. شكراً لثقتكم واختياركم لنا!", step: 5, colorClass: "text-sky-400", bgClass: "bg-sky-500/10", borderClass: "border-sky-500/30" },
  CANCELLED: { label: "طلب صيانة ملغي", description: "تم إلغاء عملية الصيانة بناءً على طلب العميل أو تعذر الإصلاح.", step: 0, colorClass: "text-rose-400", bgClass: "bg-rose-500/10", borderClass: "border-rose-500/30" },
};

const steps = [
  { num: 1, label: "الاستلام" },
  { num: 2, label: "الفحص" },
  { num: 3, label: "الصيانة" },
  { num: 4, label: "جاهز" },
  { num: 5, label: "التسليم" },
];

function phoneProof(value?: string) {
  const digits = value?.replace(/\D/g, "") ?? "";
  return digits.length >= 8 ? digits.slice(-8) : null;
}

async function resolvePublicRepairOrderId(ticketOrId: string, phone?: string, shopRef?: string) {
  if (UUID_PATTERN.test(ticketOrId)) {
    const row = await prisma.repairOrder.findFirst({
      where: { id: ticketOrId, deletedAt: null },
      select: { id: true },
    });
    return row?.id ?? null;
  }

  const proof = phoneProof(phone);
  if (!proof) return null;
  const scopedShopId = shopRef && UUID_PATTERN.test(shopRef) ? shopRef : null;

  // Ticket numbers are sequential and therefore are not authentication secrets.
  // Require a second factor derived from the customer's phone for manual lookup.
  const matches = await prisma.repairOrder.findMany({
    where: {
      deletedAt: null,
      ticketNumber: { equals: ticketOrId, mode: "insensitive" },
      ...(scopedShopId ? { shopId: scopedShopId } : {}),
      customer: {
        OR: [
          { phone: { endsWith: proof } },
          { phoneNormalized: { endsWith: proof } },
        ],
      },
    },
    select: { id: true },
    orderBy: { createdAt: "desc" },
    take: 2,
  });

  // Fail closed when the lookup is missing or ambiguous across shops.
  return matches.length === 1 ? matches[0].id : null;
}

function NotFoundCard({ ticketNumber, needsPhone }: { ticketNumber: string; needsPhone: boolean }) {
  const href = needsPhone ? `/track?ticket=${encodeURIComponent(ticketNumber)}&verify=1` : "/track";
  return (
    <div className="min-h-screen w-full bg-slate-950 text-slate-100 flex flex-col justify-center items-center px-4 py-8 overflow-x-hidden">
      <div className="w-full max-w-sm text-center space-y-5 bg-slate-900/90 p-6 rounded-3xl border border-slate-800 shadow-2xl">
        <div className="flex h-12 w-12 mx-auto items-center justify-center rounded-2xl bg-rose-500/10 text-rose-400 border border-rose-500/20"><Search className="h-6 w-6" /></div>
        <h2 className="text-lg font-black text-white">تعذر التحقق من التذكرة</h2>
        <p className="text-xs text-slate-400 leading-relaxed font-medium">
          {needsPhone ? "للبحث برقم التذكرة أدخل رقم جوال العميل المسجل معها. روابط QR الأصلية تفتح مباشرة." : "تأكد من رقم التذكرة ورقم الجوال ثم حاول مرة أخرى."}
        </p>
        <Button asChild className="w-full bg-teal-500 text-slate-950 font-bold hover:bg-teal-400 rounded-xl h-11"><Link href={href}>العودة للتحقق</Link></Button>
      </div>
    </div>
  );
}

export default async function TrackTicketPage({ params, searchParams }: TrackPageProps) {
  const { ticketNumber } = await params;
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const decodedParam = decodeURIComponent(ticketNumber).trim();
  const isQrBearerLink = UUID_PATTERN.test(decodedParam);
  const phone = resolvedSearchParams.phone?.trim();
  const shopRef = resolvedSearchParams.s || resolvedSearchParams.shop;

  if (!isQrBearerLink && !phoneProof(phone)) {
    return <NotFoundCard ticketNumber={decodedParam} needsPhone />;
  }

  const repairOrderId = await resolvePublicRepairOrderId(decodedParam, phone, shopRef);
  if (!repairOrderId) {
    return <NotFoundCard ticketNumber={decodedParam} needsPhone={false} />;
  }

  const repairOrder = await prisma.repairOrder.findFirst({
    where: { id: repairOrderId, deletedAt: null },
    select: {
      id: true,
      ticketNumber: true,
      status: true,
      deviceBrand: true,
      deviceModel: true,
      reportedIssue: true,
      diagnosis: true,
      resolutionNotes: true,
      estimatedTotal: true,
      finalTotal: true,
      createdAt: true,
      shop: { select: { name: true, currency: true, phone: true, address: true, terms: true } },
      statusHistory: {
        select: { id: true, toStatus: true, note: true, createdAt: true },
        orderBy: { createdAt: "desc" },
      },
    },
  });

  if (!repairOrder) return <NotFoundCard ticketNumber={decodedParam} needsPhone={false} />;

  const shop = repairOrder.shop;
  const currentStatus = statusDetails[repairOrder.status] || statusDetails.PENDING;
  const currency = shop.currency || "SAR";
  const latestStatusNote = repairOrder.statusHistory.find((history) => history.note?.trim())?.note;
  const whatsappPhone = normalizePhoneForWhatsApp(shop.phone, currency);
  const whatsappUrl = whatsappPhone
    ? `https://wa.me/${whatsappPhone}?text=${encodeURIComponent(`مرحباً، أستفسر عن حالة تذكرة الصيانة رقم: ${repairOrder.ticketNumber} الخاصة بجهاز ${[repairOrder.deviceBrand, repairOrder.deviceModel].filter(Boolean).join(" ")}`)}`
    : null;
  const previousNotes = repairOrder.statusHistory.filter((history) => history.note?.trim()).slice(1);

  return (
    <div className="min-h-screen w-full bg-slate-950 text-slate-100 py-4 px-3 sm:px-4 flex flex-col items-center justify-start overflow-x-hidden">
      <div className="w-full max-w-md space-y-4">
        <div className="rounded-2xl border border-slate-800 bg-slate-900/95 p-4 text-center shadow-lg">
          <div className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-teal-500/10 text-teal-400 border border-teal-500/20 mb-2"><Smartphone className="h-5 w-5" /></div>
          <h1 className="text-base font-black text-white tracking-tight">{shop.name}</h1>
          <p className="text-[11px] text-slate-400 mt-0.5">تتبع حالة صيانة الأجهزة المباشر</p>
          {(shop.phone || shop.address) && <div className="mt-3 pt-2.5 border-t border-slate-800/80 flex flex-wrap items-center justify-center gap-3 text-[11px] font-bold text-slate-400">
            {shop.phone && <span className="flex items-center gap-1 font-numeric" dir="ltr"><Phone className="h-3 w-3 text-teal-400" />{whatsappPhone ? `+${whatsappPhone}` : shop.phone}</span>}
            {shop.address && <span className="flex items-center gap-1"><MapPin className="h-3 w-3 text-teal-400" />{shop.address}</span>}
          </div>}
        </div>

        <div className="rounded-2xl border border-slate-800 bg-slate-900/95 p-4 sm:p-5 shadow-xl space-y-4">
          <div className="flex items-center justify-between gap-2 border-b border-slate-800 pb-3">
            <div><span className="text-[9px] font-extrabold text-slate-400 uppercase block">رقم التذكرة</span><span className="text-xl font-black text-teal-400 font-numeric tracking-tight">{repairOrder.ticketNumber}</span></div>
            <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-black border ${currentStatus.colorClass} ${currentStatus.bgClass} ${currentStatus.borderClass}`}><Sparkles className="h-3 w-3" />{currentStatus.label}</span>
          </div>

          <div className="bg-slate-950/70 rounded-xl p-3 border border-slate-800/80"><p className="text-xs text-slate-200 leading-relaxed font-medium">{currentStatus.description}</p></div>

          {latestStatusNote && <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-3.5 space-y-1.5 text-right shadow-sm"><div className="flex items-center gap-1.5 text-xs font-black text-amber-400"><MessageCircle className="h-4 w-4 shrink-0" /><span>ملاحظة وتحديث من الفني المشرف:</span></div><p className="text-xs text-amber-100 font-bold leading-relaxed pr-5 whitespace-pre-wrap">{latestStatusNote}</p></div>}

          <div className="pt-1">
            <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider block mb-2.5">مراحل إنجاز جهازك:</span>
            <div className="grid grid-cols-5 gap-1">{steps.map((step) => {
              const isPassed = currentStatus.step >= step.num;
              const isCurrent = currentStatus.step === step.num;
              return <div key={step.num} className={`rounded-xl py-2 px-1 text-center border transition-all ${isCurrent ? "border-teal-500 bg-teal-500/20 text-teal-300 font-black shadow-sm shadow-teal-500/20" : isPassed ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-400 font-bold" : "border-slate-800/80 bg-slate-950/40 text-slate-500 font-medium"}`}><div className="flex items-center justify-center text-[10px] mb-0.5">{isPassed ? <CheckCircle2 className="h-3 w-3 text-emerald-400" /> : <Clock className="h-3 w-3" />}</div><span className="text-[9.5px] block leading-tight">{step.label}</span></div>;
            })}</div>
          </div>

          <div className="grid grid-cols-1 gap-2 pt-1">
            <PublicField label="الجهاز" value={[repairOrder.deviceBrand, repairOrder.deviceModel].filter(Boolean).join(" ") || "غير محدد"} />
            <PublicField label="تاريخ الاستلام" value={formatDateTime(repairOrder.createdAt)} numeric />
            <PublicField label="العطل المسجل" value={repairOrder.reportedIssue} accent />
            {repairOrder.diagnosis && <PublicField label="التشخيص الفني" value={repairOrder.diagnosis} multiline />}
            {repairOrder.resolutionNotes && <PublicField label="ملاحظات الإصلاح" value={repairOrder.resolutionNotes} multiline />}
            {repairOrder.estimatedTotal !== null && <PublicField label="التكلفة التقديرية" value={formatCurrency(repairOrder.estimatedTotal, currency)} accent numeric />}
            {repairOrder.finalTotal !== null && <PublicField label="التكلفة النهائية" value={formatCurrency(repairOrder.finalTotal, currency)} success numeric />}
          </div>

          {previousNotes.length > 0 && <div className="pt-2 border-t border-slate-800/80 space-y-2"><span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider block">سجل التحديثات والملاحظات السابقة:</span><div className="space-y-1.5">{previousNotes.map((history) => <div key={history.id} className="bg-slate-950/40 p-2.5 rounded-lg border border-slate-800/60 text-xs text-right"><div className="flex justify-between items-center text-[10px] text-slate-400 mb-1"><span className="font-bold text-teal-400">{statusDetails[history.toStatus]?.label ?? history.toStatus}</span><span className="font-numeric">{formatDateTime(history.createdAt)}</span></div><p className="text-slate-300 text-[11px] leading-relaxed font-medium">{history.note}</p></div>)}</div></div>}

          {whatsappUrl && <div className="pt-2"><Button asChild className="w-full h-11 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-lg shadow-emerald-600/20 border-0"><a href={whatsappUrl} target="_blank" rel="noreferrer" className="flex items-center justify-center gap-2"><MessageCircle className="h-4 w-4" />مراسلة المحل عبر واتساب للاستفسار</a></Button></div>}
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-3 text-center"><p className="text-[10px] text-slate-400 leading-normal font-medium flex items-center justify-center gap-1.5"><ShieldCheck className="h-3.5 w-3.5 text-teal-400 shrink-0" />{shop.terms || "الضمان يشمل القطع المستبدلة فقط لمدة 30 يوماً. شكراً لثقتكم بنا."}</p></div>
      </div>
    </div>
  );
}

function PublicField({ label, value, numeric = false, accent = false, success = false, multiline = false }: { label: string; value: string; numeric?: boolean; accent?: boolean; success?: boolean; multiline?: boolean }) {
  const valueClass = success ? "text-emerald-400" : accent ? "text-teal-300" : "text-white";
  return <div className={`bg-slate-950/50 p-3 rounded-xl border border-slate-800 flex justify-between ${multiline ? "items-start gap-3" : "items-center"}`}><span className="text-[11px] font-bold text-slate-400 shrink-0">{label}:</span><span className={`text-xs font-bold ${valueClass} ${numeric ? "font-numeric" : ""} ${multiline ? "text-left" : ""}`}>{value}</span></div>;
}
