import Link from "next/link";
import { AlertTriangle, ArrowRight, BadgeCheck, Boxes, FileWarning, RotateCcw, ShieldCheck, Wrench } from "lucide-react";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { requirePermission } from "@/lib/auth/context";
import { formatAutoDate, formatAutoMoney } from "@/lib/auto/service-order-ui";
import { postDeliveryPartCorrectionService } from "@/lib/services/postDeliveryPartCorrectionService";
import { createPostDeliveryPartCorrectionAction } from "../../post-delivery-correction-actions";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ partCorrectionError?: string; partCorrectionSuccess?: string }>;
};

const reasonLabels: Record<string, string> = {
  CUSTOMER_RETURN: "إرجاع من العميل",
  DEFECTIVE: "قطعة معيبة",
  WARRANTY: "ضمان",
  REWORK: "إعادة عمل / Rework",
  REPLACEMENT: "استبدال قطعة",
  OTHER: "سبب آخر",
};

const dispositionLabels: Record<string, string> = {
  RETURN_TO_STOCK: "أُعيدت فعلياً للمخزون",
  NO_STOCK_CHANGE: "توثيق فقط — بدون تغيير مخزون",
};

const inputClass = "h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:border-cyan-400 focus:ring-2 focus:ring-cyan-100";
const textareaClass = "min-h-24 w-full resize-y rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm leading-6 outline-none focus:border-cyan-400 focus:ring-2 focus:ring-cyan-100";

export default async function PostDeliveryPartCorrectionsPage({ params, searchParams }: PageProps) {
  const auth = await requirePermission("service_orders:read");
  const { id } = await params;
  const query = await searchParams;
  const context = await postDeliveryPartCorrectionService.getPostDeliveryPartCorrectionContext(auth.shop.id, id);
  if (!context) notFound();

  const canUpdate = auth.permissions.includes("service_orders:update");
  const canReturnStock = auth.permissions.includes("inventory:use_parts");
  const canLinkCredit = auth.permissions.includes("invoices:credit");

  return (
    <div className="space-y-6">
      <PageHeader
        title="تصحيحات القطع بعد التسليم"
        description={`${context.orderNumber} • الفاتورة ${context.invoiceNumber}`}
        actions={
          <Button asChild variant="outline" className="font-bold">
            <Link href={`/service-orders/${id}`}><ArrowRight className="ml-1.5 h-4 w-4" />أمر الصيانة</Link>
          </Button>
        }
      />

      {query.partCorrectionSuccess ? (
        <div className="flex items-start gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-bold text-emerald-900">
          <BadgeCheck className="mt-0.5 h-5 w-5 shrink-0" />تم تسجيل تصحيح القطعة بنجاح وحفظ أثره التدقيقي.
        </div>
      ) : null}
      {query.partCorrectionError ? (
        <div className="flex items-start gap-2 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-bold leading-7 text-red-900">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />{query.partCorrectionError}
        </div>
      ) : null}

      <section className="rounded-2xl border border-sky-200 bg-sky-50/60 p-5">
        <div className="flex items-start gap-3">
          <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-sky-700" />
          <div>
            <div className="font-black text-sky-950">التصحيح لا يغيّر البند المفوتر الأصلي</div>
            <p className="mt-1 text-xs font-semibold leading-6 text-sky-800">
              يبقى بند القطعة وحركة الاستهلاك الأصلية كما صدرت في الفاتورة. إذا رجعت القطعة فعلياً للمركز، ينشئ النظام حركة إرجاع جديدة إلى المستودع الأصلي. أي خصم أو استرداد مالي يتم بشكل منفصل عبر الإشعار الدائن.
            </p>
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 p-5">
          <h2 className="flex items-center gap-2 font-black text-slate-950"><Wrench className="h-5 w-5 text-amber-700" />القطع المستهلكة القابلة للتصحيح</h2>
          <p className="mt-1 text-xs font-semibold text-slate-500">يمكن تسجيل ضمان/استبدال/عيب بدون تعديل المخزون، أو إعادة الكمية فعلياً إلى مستودعها الأصلي.</p>
        </div>

        <div className="space-y-4 p-4 sm:p-5">
          {context.parts.length ? context.parts.map((part) => (
            <div key={part.id} className="rounded-2xl border border-slate-200 bg-slate-50/40 p-4">
              <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div>
                  <div className="font-black text-slate-950">{part.partName}</div>
                  <div className="mt-1 text-xs font-semibold text-slate-500">
                    الكمية الأصلية {part.quantity} • {formatAutoMoney(part.unitPrice, auth.shop.currency)} للوحدة
                    {part.warehouseName ? ` • ${part.warehouseName}` : ""}
                    {part.sku ? ` • SKU ${part.sku}` : ""}
                  </div>
                </div>
                <div className="grid shrink-0 grid-cols-3 gap-2 text-center text-[11px]">
                  <Metric label="مستهلك" value={part.consumedQuantity} />
                  <Metric label="عاد للمخزون" value={part.returnedQuantity} />
                  <Metric label="متبقي للإرجاع" value={part.remainingReturnableQuantity} highlight />
                </div>
              </div>

              {canUpdate ? (
                <form action={createPostDeliveryPartCorrectionAction} className="mt-4 grid gap-3 border-t border-slate-200 pt-4 md:grid-cols-2">
                  <input type="hidden" name="serviceOrderId" value={context.serviceOrderId} />
                  <input type="hidden" name="servicePartLineId" value={part.id} />

                  <label className="grid gap-1.5 text-xs font-black text-slate-700">
                    سبب التصحيح
                    <select name="reasonCode" required defaultValue="" className={inputClass}>
                      <option value="" disabled>اختر السبب...</option>
                      {Object.entries(reasonLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                    </select>
                  </label>

                  <label className="grid gap-1.5 text-xs font-black text-slate-700">
                    أثر المخزون
                    <select name="inventoryDisposition" required defaultValue="NO_STOCK_CHANGE" className={inputClass}>
                      <option value="NO_STOCK_CHANGE">توثيق فقط — بدون تغيير مخزون</option>
                      {canReturnStock && part.inventoryItemId && part.warehouseId && part.remainingReturnableQuantity > 0
                        ? <option value="RETURN_TO_STOCK">إعادة فعلية للمستودع الأصلي</option>
                        : null}
                    </select>
                  </label>

                  <label className="grid gap-1.5 text-xs font-black text-slate-700">
                    الكمية المتأثرة
                    <input name="quantity" type="number" min="1" max={part.quantity} step="1" defaultValue="1" required className={inputClass} />
                  </label>

                  <label className="grid gap-1.5 text-xs font-black text-slate-700">
                    ربط بإشعار دائن موجود <span className="font-semibold text-slate-400">اختياري</span>
                    <select name="creditNoteId" defaultValue="" disabled={!canLinkCredit} className={inputClass}>
                      <option value="">بدون ربط مالي</option>
                      {canLinkCredit ? context.creditNotes.map((credit) => (
                        <option key={credit.id} value={credit.id}>{credit.creditNoteNumber} — {formatAutoMoney(credit.amount, auth.shop.currency)}</option>
                      )) : null}
                    </select>
                    <span className="font-semibold text-slate-400">الربط للتدقيق فقط ولا ينشئ خصماً أو استرداداً جديداً.</span>
                  </label>

                  <label className="grid gap-1.5 text-xs font-black text-slate-700 md:col-span-2">
                    السبب التفصيلي
                    <textarea name="reason" required minLength={3} maxLength={1000} className={textareaClass} placeholder="مثال: القطعة تعطلت خلال فترة الضمان وتم استبدالها للعميل..." />
                  </label>
                  <label className="grid gap-1.5 text-xs font-black text-slate-700 md:col-span-2">
                    ملاحظات داخلية <span className="font-semibold text-slate-400">اختياري</span>
                    <textarea name="notes" maxLength={2000} className={textareaClass} placeholder="رقم القطعة القديمة، نتيجة الفحص، ملاحظات المورد..." />
                  </label>

                  <Button type="submit" className="font-black md:col-span-2"><FileWarning className="ml-1.5 h-4 w-4" />تسجيل التصحيح</Button>
                </form>
              ) : (
                <div className="mt-4 rounded-xl border border-amber-100 bg-amber-50 p-3 text-xs font-bold text-amber-800">حسابك يملك صلاحية العرض فقط ولا يمكنه تسجيل تصحيح جديد.</div>
              )}
            </div>
          )) : (
            <div className="py-8 text-center text-sm font-bold text-slate-400">لا توجد قطع بحالة «مستخدمة» في هذا الأمر.</div>
          )}
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 p-5">
          <h2 className="flex items-center gap-2 font-black text-slate-950"><RotateCcw className="h-5 w-5 text-violet-700" />سجل التصحيحات</h2>
          <p className="mt-1 text-xs font-semibold text-slate-500">السجلات نهائية وغير قابلة للتعديل أو الحذف للحفاظ على التدقيق.</p>
        </div>
        <div className="space-y-3 p-4 sm:p-5">
          {context.corrections.length ? context.corrections.map((correction) => (
            <div key={correction.id} className="rounded-xl border border-slate-200 p-4">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-black text-slate-950">{correction.correctionNumber}</span>
                    <span className="rounded-full border border-violet-200 bg-violet-50 px-2 py-0.5 text-[10px] font-black text-violet-800">{reasonLabels[correction.reasonCode] ?? correction.reasonCode}</span>
                    <span className={`rounded-full border px-2 py-0.5 text-[10px] font-black ${correction.inventoryDisposition === "RETURN_TO_STOCK" ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-slate-200 bg-slate-50 text-slate-600"}`}>{dispositionLabels[correction.inventoryDisposition] ?? correction.inventoryDisposition}</span>
                  </div>
                  <div className="mt-1 text-xs font-bold text-slate-700">{correction.partName} • كمية {correction.quantity} • {formatAutoMoney(correction.grossAmountSnapshot, auth.shop.currency)}</div>
                  <div className="mt-2 text-xs leading-6 text-slate-600">{correction.reason}</div>
                  {correction.notes ? <div className="mt-1 text-[11px] font-semibold text-slate-400">{correction.notes}</div> : null}
                </div>
                <div className="shrink-0 text-left text-[11px] font-semibold text-slate-400">
                  <div>{formatAutoDate(correction.createdAt)}</div>
                  <div>{correction.createdByName || "-"}</div>
                  {correction.creditNoteNumber ? <div className="mt-1 font-black text-violet-700">مرتبط: {correction.creditNoteNumber}</div> : null}
                </div>
              </div>
            </div>
          )) : <div className="py-8 text-center text-sm font-bold text-slate-400">لم يتم تسجيل أي تصحيح بعد.</div>}
        </div>
      </section>

      <section className="rounded-2xl border border-amber-200 bg-amber-50/50 p-4 text-xs font-semibold leading-6 text-amber-900">
        <div className="flex items-start gap-2"><Boxes className="mt-0.5 h-4 w-4 shrink-0" /><div><span className="font-black">مهم:</span> «إعادة للمخزون» تعني أن القطعة القديمة عادت فعلياً للمركز وأصبحت قابلة للإدارة كمخزون. القطعة التالفة التي لن تُباع مجدداً سجّلها «بدون تغيير مخزون»؛ مسار الضمان/Rework لا يعيد المخزون تلقائياً.</div></div>
      </section>
    </div>
  );
}

function Metric({ label, value, highlight = false }: { label: string; value: number; highlight?: boolean }) {
  return <div className={`rounded-lg border px-2 py-1.5 ${highlight ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-slate-200 bg-white text-slate-600"}`}><div className="font-black">{value}</div><div className="mt-0.5 whitespace-nowrap font-semibold">{label}</div></div>;
}
