import Image from "next/image";
import Link from "next/link";
import QRCode from "qrcode";
import { ArrowRight, ExternalLink, QrCode, ShieldCheck } from "lucide-react";
import { notFound } from "next/navigation";
import { Button } from "@/components/ui/button";
import { requirePermission } from "@/lib/auth/context";
import { buildAppUrl } from "@/lib/app-url";
import { SERVICE_ORDER_STATUS_LABELS, formatAutoDate } from "@/lib/auto/service-order-ui";
import { autoServiceOrderService } from "@/lib/services/autoServiceOrderService";

export const dynamic = "force-dynamic";

type PageProps = { params: Promise<{ id: string }> };

export default async function ServiceOrderTrackingPage({ params }: PageProps) {
  const auth = await requirePermission("service_orders:read");
  const { id } = await params;
  const order = await autoServiceOrderService.getServiceOrderById(auth.shop.id, id);
  if (!order) notFound();

  const trackingPath = `/track/${order.id}`;
  const trackingUrl = buildAppUrl(trackingPath);
  const qrCodeDataUrl = await QRCode.toDataURL(trackingUrl, {
    margin: 1,
    width: 360,
    errorCorrectionLevel: "M",
  });
  const statusLabel = SERVICE_ORDER_STATUS_LABELS[order.status] ?? order.status;
  const vehicleLabel = `${order.vehicleMake} ${order.vehicleModel}${order.vehicleYear ? ` • ${order.vehicleYear}` : ""}`;

  return (
    <main className="mx-auto w-full max-w-4xl space-y-6 pb-10">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="text-xs font-black text-cyan-700">تتبع العميل</div>
          <h1 className="mt-1 text-2xl font-black text-slate-950">QR ورابط متابعة أمر الصيانة</h1>
          <p className="mt-1 text-sm font-semibold text-slate-500">{order.orderNumber} • {vehicleLabel}</p>
        </div>
        <Button asChild variant="outline" className="font-black">
          <Link href={`/service-orders/${order.id}`}>
            <ArrowRight className="ml-1.5 h-4 w-4" />
            العودة لأمر الصيانة
          </Link>
        </Button>
      </div>

      <section className="grid gap-5 lg:grid-cols-[320px_1fr]">
        <div className="rounded-3xl border border-slate-200 bg-white p-6 text-center shadow-sm">
          <div className="mx-auto mb-4 flex h-11 w-11 items-center justify-center rounded-2xl bg-cyan-50 text-cyan-700">
            <QrCode className="h-5 w-5" />
          </div>
          <div className="mx-auto w-fit rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
            <Image src={qrCodeDataUrl} alt={`QR تتبع ${order.orderNumber}`} width={260} height={260} unoptimized priority />
          </div>
          <p className="mt-4 text-xs font-bold leading-6 text-slate-500">يمسح العميل الرمز لفتح حالة الصيانة مباشرة بدون تسجيل دخول.</p>
        </div>

        <div className="space-y-4 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-start gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
            <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-emerald-700" />
            <div>
              <div className="font-black text-emerald-950">رابط مخصص للمتابعة فقط</div>
              <p className="mt-1 text-xs font-bold leading-6 text-emerald-800">صفحة العميل لا تعرض التكاليف الداخلية أو الأرباح أو ملاحظات الموظفين أو بيانات الإدارة.</p>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <Info label="حالة الصيانة" value={statusLabel} />
            <Info label="تاريخ الاستلام" value={formatAutoDate(order.receivedAt)} />
            <Info label="العميل" value={order.customerName} />
            <Info label="المركبة" value={vehicleLabel} />
          </div>

          <div>
            <label className="mb-2 block text-xs font-black text-slate-600">رابط التتبع</label>
            <div dir="ltr" className="break-all rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-left font-mono text-xs font-bold text-slate-700">{trackingUrl}</div>
            <p className="mt-2 text-[11px] font-semibold leading-5 text-slate-500">يمكن نسخ الرابط مباشرة من زر «نسخ رابط التتبع» الموجود في صفحة أمر الصيانة.</p>
          </div>

          <div className="flex flex-wrap gap-2 pt-1">
            <Button asChild className="font-black">
              <a href={trackingPath} target="_blank" rel="noreferrer">
                <ExternalLink className="ml-1.5 h-4 w-4" />
                فتح صفحة العميل
              </a>
            </Button>
            <Button asChild variant="outline" className="font-black">
              <Link href={`/service-orders/${order.id}/print`}>
                طباعة أمر الاستلام والـQR
              </Link>
            </Button>
          </div>
        </div>
      </section>
    </main>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
      <div className="text-[10px] font-black text-slate-500">{label}</div>
      <div className="mt-1 text-sm font-black text-slate-900">{value}</div>
    </div>
  );
}
