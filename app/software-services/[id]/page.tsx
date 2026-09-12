import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, FileText, Smartphone, Tag, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmSubmitButton } from "@/components/confirm-submit-button";
import { getCurrentShopContext } from "@/lib/current-shop";
import { formatCurrency, formatDate } from "@/lib/format";
import { softwareServiceService } from "@/lib/services/softwareServiceService";
import { cancelSoftwareServiceSaleAction, markSoftwareDeviceDeliveredAction } from "../actions";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ created?: string; delivered?: string; error?: string }>;
};

export default async function SoftwareServiceDetailsPage({ params, searchParams }: Props) {
  const { id } = await params;
  const query = await searchParams;
  const context = await getCurrentShopContext();
  const canCreateSale = context.permissions.includes("sales:create");
  const canCancelSale = context.permissions.includes("sales:cancel");
  const sale = await softwareServiceService.getSaleById(context.shopId, id);
  if (!sale) notFound();
  const currency = context.currency || "SAR";
  const serviceCost = Number(sale.serviceCost ?? 0);
  const profit = Number(sale.invoiceTotal) - serviceCost;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-[11px] font-black text-violet-600">خدمة سوفتوير</p>
          <h1 className="mt-1 text-2xl font-black text-slate-900">{sale.serviceName}</h1>
          <p className="mt-1 text-xs font-medium text-slate-500">فاتورة {sale.invoiceNumber} · {formatDate(sale.soldAt)}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {sale.deviceKept ? (
            <Button
              asChild
              variant="outline"
              className="rounded-xl border-teal-300 bg-teal-50/30 font-bold text-teal-950 transition hover:border-teal-300 hover:bg-teal-50 hover:text-teal-900"
            >
              <Link href={`/software-services/${sale.id}/sticker`} target="_blank">
                <Tag className="ml-1.5 h-4 w-4 shrink-0 text-teal-600" aria-hidden="true" />
                طباعة ستيكر الهاتف (50×30 مم)
              </Link>
            </Button>
          ) : null}
          <Button asChild className="rounded-xl font-bold">
            <Link href={`/invoices/${sale.invoiceId}`}><FileText className="ml-1.5 h-4 w-4" />فتح الفاتورة</Link>
          </Button>
          <Button asChild variant="outline" className="rounded-xl font-bold">
            <Link href="/software-services"><ArrowRight className="ml-1.5 h-4 w-4" />رجوع</Link>
          </Button>
        </div>
      </div>

      {query.created ? <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs font-bold text-emerald-800">تم تسجيل الخدمة وإنشاء الفاتورة بنجاح.</div> : null}
      {query.delivered ? <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs font-bold text-emerald-800">تم تسجيل تسليم الجهاز للعميل.</div> : null}
      {query.error ? <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs font-bold text-rose-700">{query.error}</div> : null}

      <section className="grid gap-5 lg:grid-cols-[1fr_320px]">
        <div className="erp-section">
          <h2 className="mb-4 border-b border-slate-100 pb-3 text-sm font-black text-slate-900">تفاصيل العملية</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <Info label="العميل" value={sale.customerName ?? "عميل نقدي"} />
            <Info label="الهاتف" value={sale.customerPhone ?? "-"} />
            <Info label="الخدمة" value={sale.serviceName} />
            <Info label="الجهاز" value={[sale.deviceBrand, sale.deviceModel].filter(Boolean).join(" ") || "-"} />
            <Info label="IMEI / Serial" value={sale.deviceSerial ?? "-"} />
            <Info label="سعر البيع الأصلي" value={formatCurrency(sale.salePrice, currency)} />
            <Info label="خصم الفاتورة" value={formatCurrency(sale.invoiceDiscountTotal, currency)} />
            <Info label="إجمالي الفاتورة بعد الخصم" value={formatCurrency(sale.invoiceTotal, currency)} />
            <Info label="تكلفة الخدمة" value={formatCurrency(serviceCost, currency)} />
            <Info label="الربح الحالي" value={formatCurrency(profit, currency)} />
            <Info label="المتبقي" value={formatCurrency(sale.invoiceBalanceDue, currency)} />
            <Info label="ملاحظات" value={sale.notes ?? "-"} />
          </div>
        </div>

        <aside className="space-y-5">
          <div className="erp-section">
            <div className="flex items-center gap-2"><Smartphone className="h-5 w-5 text-amber-600" /><h2 className="text-sm font-black text-slate-900">عهدة الجهاز</h2></div>
            {!sale.deviceKept ? (
              <p className="mt-3 text-xs font-medium text-slate-500">الجهاز لم يُسجل كجهاز متروك في المحل.</p>
            ) : sale.deliveredAt ? (
              <div className="mt-3 rounded-xl bg-emerald-50 p-3 text-xs font-bold text-emerald-800">تم تسليم الجهاز بتاريخ {formatDate(sale.deliveredAt)}</div>
            ) : canCreateSale ? (
              <form action={markSoftwareDeviceDeliveredAction} className="mt-4">
                <input type="hidden" name="id" value={sale.id} />
                <p className="mb-3 text-xs font-medium text-slate-500">الجهاز ما زال مسجلاً داخل المحل. لا توجد حالات تنفيذ؛ هذا فقط لتتبع العهدة.</p>
                <ConfirmSubmitButton
                  className="h-10 w-full rounded-xl text-xs font-black"
                  message="تأكيد أن الجهاز تم تسليمه للعميل؟"
                >
                  تم تسليم الجهاز
                </ConfirmSubmitButton>
              </form>
            ) : (
              <p className="mt-3 text-xs font-medium text-slate-500">الجهاز ما زال مسجلاً داخل المحل.</p>
            )}
          </div>
          <div className="erp-section">
            <h2 className="text-sm font-black text-slate-900">المحاسبة</h2>
            <p className="mt-2 text-xs font-medium leading-6 text-slate-500">الخصم والدفع والمتبقي تتم إدارتها من فاتورة مسار نفسها، لذلك لا يوجد نظام مالي منفصل لخدمات السوفتوير.</p>
            <Button asChild variant="outline" className="mt-4 w-full rounded-xl font-bold"><Link href={`/invoices/${sale.invoiceId}`}>فتح الفاتورة</Link></Button>
          </div>
          {canCancelSale ? (
            <div className="rounded-2xl border border-rose-100 bg-rose-50/60 p-4">
              <h2 className="text-sm font-black text-rose-800">إلغاء العملية</h2>
              <p className="mt-2 text-xs font-medium leading-6 text-rose-700/80">الإلغاء يزيل الخدمة من السجل والتقارير ويُلغي فاتورتها. إذا كانت هناك دفعة فسيتم عكس أثرها المالي تلقائياً.</p>
              <form action={cancelSoftwareServiceSaleAction} className="mt-3">
                <input type="hidden" name="id" value={sale.id} />
                <ConfirmSubmitButton
                  className="h-10 w-full rounded-xl border border-rose-200 bg-white text-xs font-black text-rose-700 hover:bg-rose-100"
                  message="هل أنت متأكد من إلغاء هذه الخدمة؟ سيتم إلغاء الفاتورة المرتبطة وعكس أي دفعات مسجلة وإزالة الخدمة من السجلات الفعالة والتقارير."
                >
                  <Trash2 className="ml-1.5 h-4 w-4" />إلغاء خدمة السوفتوير
                </ConfirmSubmitButton>
              </form>
            </div>
          ) : null}
        </aside>
      </section>
    </div>
  );
}

function Info({ label, value }: { label: string; value: React.ReactNode }) {
  return <div className="rounded-xl border border-slate-100 bg-slate-50/60 p-3"><p className="text-[10px] font-black text-slate-400">{label}</p><div className="mt-1 text-xs font-bold text-slate-800">{value}</div></div>;
}
