import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  BadgeCheck,
  CarFront,
  ClipboardCheck,
  FilePlus2,
  ShieldCheck,
  Wrench,
} from "lucide-react";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { requirePermission } from "@/lib/auth/context";
import { formatAutoDate, formatAutoMoney } from "@/lib/auto/service-order-ui";
import { serviceWarrantyClaimService } from "@/lib/services/serviceWarrantyClaimService";
import {
  closeWarrantyClaimAction,
  createWarrantyClaimAction,
  createWarrantyFollowUpOrderAction,
  decideWarrantyClaimAction,
  resolveWarrantyClaimAction,
} from "../../warranty-actions";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ warrantyError?: string; warrantySuccess?: string }>;
};

const typeLabels: Record<string, string> = {
  WARRANTY: "ضمان",
  COMEBACK: "عودة للمركز",
  REWORK: "إعادة عمل / Rework",
};

const statusLabels: Record<string, string> = {
  OPEN: "مفتوحة",
  APPROVED: "معتمدة",
  REJECTED: "مرفوضة",
  IN_SERVICE: "قيد المعالجة",
  RESOLVED: "تم حلها",
  CLOSED: "مغلقة",
};

const coverageLabels: Record<string, string> = {
  PENDING: "بانتظار القرار",
  COVERED: "مغطاة بالكامل",
  PARTIAL: "تغطية جزئية",
  CUSTOMER_PAY: "على حساب العميل",
  NOT_APPLICABLE: "لا ينطبق",
};

const statusClasses: Record<string, string> = {
  OPEN: "border-amber-200 bg-amber-50 text-amber-800",
  APPROVED: "border-emerald-200 bg-emerald-50 text-emerald-800",
  REJECTED: "border-red-200 bg-red-50 text-red-800",
  IN_SERVICE: "border-sky-200 bg-sky-50 text-sky-800",
  RESOLVED: "border-violet-200 bg-violet-50 text-violet-800",
  CLOSED: "border-slate-200 bg-slate-50 text-slate-700",
};

const inputClass =
  "h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:border-cyan-400 focus:ring-2 focus:ring-cyan-100";
const textareaClass =
  "min-h-24 w-full resize-y rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm leading-6 outline-none focus:border-cyan-400 focus:ring-2 focus:ring-cyan-100";

export default async function WarrantyClaimsPage({ params, searchParams }: PageProps) {
  const auth = await requirePermission("service_orders:read");
  const { id } = await params;
  const query = await searchParams;
  const context = await serviceWarrantyClaimService.getWarrantyClaimContext(auth.shop.id, id);
  if (!context) notFound();

  const canUpdate = auth.permissions.includes("service_orders:update");
  const canCreateOrder = auth.permissions.includes("service_orders:create");

  return (
    <div className="space-y-6">
      <PageHeader
        title="الضمان والعودة للصيانة"
        description={`${context.originalOrder.orderNumber} • ${context.originalOrder.vehicleLabel} • ${context.originalOrder.customerName}`}
        actions={
          <Button asChild variant="outline" className="font-bold">
            <Link href={`/service-orders/${id}`}>
              <ArrowRight className="ml-1.5 h-4 w-4" />
              أمر الصيانة الأصلي
            </Link>
          </Button>
        }
      />

      {query.warrantySuccess ? (
        <div className="flex items-start gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-bold text-emerald-900">
          <BadgeCheck className="mt-0.5 h-5 w-5 shrink-0" />
          {query.warrantySuccess}
        </div>
      ) : null}
      {query.warrantyError ? (
        <div className="flex items-start gap-2 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-bold leading-7 text-red-900">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
          {query.warrantyError}
        </div>
      ) : null}

      <section className="rounded-2xl border border-sky-200 bg-sky-50/60 p-5">
        <div className="flex items-start gap-3">
          <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-sky-700" />
          <div>
            <div className="font-black text-sky-950">الأمر الأصلي يبقى مغلقاً ومحفوظاً كما هو</div>
            <p className="mt-1 text-xs font-semibold leading-6 text-sky-800">
              الضمان أو الـComeback لا يعيد فتح أمر الصيانة القديم ولا يغيّر فاتورته. إذا احتاجت المركبة عملاً جديداً، ينشئ النظام أمر متابعة مستقل مرتبط بهذه المطالبة.
            </p>
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 p-5">
          <h2 className="flex items-center gap-2 font-black text-slate-950">
            <FilePlus2 className="h-5 w-5 text-teal-700" />
            فتح مطالبة جديدة
          </h2>
          <p className="mt-1 text-xs font-semibold text-slate-500">
            سجل سبب عودة المركبة واربطه بقطعة أو عمل سابق عند الحاجة.
          </p>
        </div>

        {canUpdate ? (
          <form action={createWarrantyClaimAction} className="grid gap-3 p-4 sm:p-5 md:grid-cols-2">
            <input type="hidden" name="serviceOrderId" value={id} />
            <label className="grid gap-1.5 text-xs font-black text-slate-700">
              نوع الحالة
              <select name="claimType" required defaultValue="WARRANTY" className={inputClass}>
                <option value="WARRANTY">ضمان</option>
                <option value="COMEBACK">عودة للمركز / Comeback</option>
                <option value="REWORK">إعادة عمل / Rework</option>
              </select>
            </label>
            <label className="grid gap-1.5 text-xs font-black text-slate-700">
              مرتبطة ببند سابق <span className="font-semibold text-slate-400">اختياري</span>
              <select name="scope" defaultValue="" className={inputClass}>
                <option value="">المطالبة عامة على أمر الصيانة</option>
                <optgroup label="قطع الغيار">
                  {context.parts.map((part) => (
                    <option key={part.id} value={`PART:${part.id}`}>
                      {part.partName} — كمية {part.quantity}
                    </option>
                  ))}
                </optgroup>
                <optgroup label="أعمال الصيانة">
                  {context.laborLines.map((line) => (
                    <option key={line.id} value={`LABOR:${line.id}`}>
                      {line.description}
                    </option>
                  ))}
                </optgroup>
              </select>
            </label>
            <label className="grid gap-1.5 text-xs font-black text-slate-700">
              انتهاء الضمان <span className="font-semibold text-slate-400">اختياري</span>
              <input name="warrantyEndsAt" type="date" className={inputClass} />
            </label>
            <div className="rounded-xl border border-slate-100 bg-slate-50 p-3 text-xs font-bold leading-6 text-slate-600">
              <div>تاريخ التسليم: {formatAutoDate(context.originalOrder.deliveredAt)}</div>
              <div>تاريخ الإغلاق: {formatAutoDate(context.originalOrder.closedAt)}</div>
            </div>
            <label className="grid gap-1.5 text-xs font-black text-slate-700 md:col-span-2">
              سبب العودة / المشكلة
              <textarea
                name="reportedIssue"
                required
                minLength={3}
                maxLength={4000}
                className={textareaClass}
                placeholder="مثال: عاد العميل بعد 10 أيام بسبب تسريب من نفس المنطقة التي تم إصلاحها..."
              />
            </label>
            <label className="grid gap-1.5 text-xs font-black text-slate-700 md:col-span-2">
              ملاحظات داخلية <span className="font-semibold text-slate-400">اختياري</span>
              <textarea
                name="notes"
                maxLength={2000}
                className={textareaClass}
                placeholder="ملاحظات الاستقبال، رقم القطعة، اتفاق أولي مع العميل..."
              />
            </label>
            <Button type="submit" className="font-black md:col-span-2">
              <FilePlus2 className="ml-1.5 h-4 w-4" />
              فتح المطالبة
            </Button>
          </form>
        ) : (
          <div className="p-5 text-sm font-bold text-amber-700">حسابك يملك صلاحية العرض فقط.</div>
        )}
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 p-5">
          <h2 className="flex items-center gap-2 font-black text-slate-950">
            <ClipboardCheck className="h-5 w-5 text-violet-700" />
            سجل المطالبات
          </h2>
          <p className="mt-1 text-xs font-semibold text-slate-500">
            كل Claim يبقى مرتبطاً بالأمر الأصلي، ويمتلك دورة حياة مستقلة.
          </p>
        </div>

        <div className="space-y-4 p-4 sm:p-5">
          {context.claims.length ? (
            context.claims.map((claim) => (
              <article key={claim.id} className="rounded-2xl border border-slate-200 bg-slate-50/30 p-4">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-numeric font-black text-slate-950">{claim.claimNumber}</span>
                      <span className="rounded-full border border-cyan-200 bg-cyan-50 px-2.5 py-1 text-[10px] font-black text-cyan-800">
                        {typeLabels[claim.claimType] ?? claim.claimType}
                      </span>
                      <span className={`rounded-full border px-2.5 py-1 text-[10px] font-black ${statusClasses[claim.status] ?? statusClasses.CLOSED}`}>
                        {statusLabels[claim.status] ?? claim.status}
                      </span>
                      <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[10px] font-black text-slate-600">
                        {coverageLabels[claim.coverageDecision] ?? claim.coverageDecision}
                      </span>
                    </div>
                    <p className="mt-2 text-sm font-bold leading-7 text-slate-700">{claim.reportedIssue}</p>
                    <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[10px] font-bold text-slate-400">
                      <span>فتح: {formatAutoDate(claim.openedAt)}</span>
                      {claim.createdByName ? <span>بواسطة {claim.createdByName}</span> : null}
                      {claim.partName ? <span>قطعة: {claim.partName}</span> : null}
                      {claim.laborDescription ? <span>عمل: {claim.laborDescription}</span> : null}
                      {claim.warrantyEndsAt ? <span>الضمان حتى: {formatAutoDate(claim.warrantyEndsAt)}</span> : null}
                    </div>
                  </div>
                  <div className="shrink-0 text-left">
                    {claim.customerCharge > 0 ? (
                      <div>
                        <div className="text-[10px] font-bold text-slate-400">النهائي على العميل — شامل الضريبة</div>
                        <div className="font-numeric text-sm font-black text-amber-700">
                          {formatAutoMoney(claim.customerCharge, auth.shop.currency)}
                        </div>
                      </div>
                    ) : null}
                    {claim.followUpServiceOrderId ? (
                      <Button asChild size="sm" variant="outline" className="mt-2 text-xs font-black">
                        <Link href={`/service-orders/${claim.followUpServiceOrderId}`}>
                          <CarFront className="ml-1.5 h-3.5 w-3.5" />
                          {claim.followUpOrderNumber ?? "أمر المتابعة"}
                        </Link>
                      </Button>
                    ) : null}
                  </div>
                </div>

                {claim.assessment ? (
                  <div className="mt-3 rounded-xl border border-slate-100 bg-white p-3 text-xs leading-6 text-slate-600">
                    <span className="font-black text-slate-800">التقييم: </span>
                    {claim.assessment}
                  </div>
                ) : null}
                {claim.resolution ? (
                  <div className="mt-3 rounded-xl border border-emerald-100 bg-emerald-50/50 p-3 text-xs leading-6 text-emerald-900">
                    <span className="font-black">الحل: </span>
                    {claim.resolution}
                  </div>
                ) : null}
                {claim.notes ? <div className="mt-2 text-[10px] font-semibold leading-5 text-slate-400">{claim.notes}</div> : null}

                {canUpdate && claim.status === "OPEN" ? (
                  <form action={decideWarrantyClaimAction} className="mt-4 grid gap-3 border-t border-slate-200 pt-4 md:grid-cols-2">
                    <input type="hidden" name="serviceOrderId" value={id} />
                    <input type="hidden" name="claimId" value={claim.id} />
                    <label className="grid gap-1 text-[11px] font-black text-slate-700">
                      قرار المطالبة
                      <select name="decision" required defaultValue="APPROVED" className={inputClass}>
                        <option value="APPROVED">اعتماد المطالبة</option>
                        <option value="REJECTED">رفض المطالبة</option>
                      </select>
                    </label>
                    <label className="grid gap-1 text-[11px] font-black text-slate-700">
                      التغطية
                      <select name="coverageDecision" required defaultValue="COVERED" className={inputClass}>
                        <option value="COVERED">مغطاة بالكامل — العميل 0</option>
                        <option value="PARTIAL">تغطية جزئية — أدخل المبلغ النهائي على العميل</option>
                        <option value="CUSTOMER_PAY">على حساب العميل — فوترة كاملة طبيعية</option>
                      </select>
                      <span className="font-semibold leading-5 text-slate-400">
                        عند رفض المطالبة يحفظ النظام «لا ينطبق» ومبلغ العميل 0 تلقائياً.
                      </span>
                    </label>
                    <label className="grid gap-1 text-[11px] font-black text-slate-700">
                      المبلغ النهائي على العميل
                      <span className="font-semibold leading-5 text-slate-400">
                        للتغطية الجزئية فقط — المبلغ شامل الضريبة، وستصدر فاتورة المتابعة بهذا الإجمالي تماماً. اتركه 0 للتغطية الكاملة أو «على حساب العميل».
                      </span>
                      <input
                        name="customerCharge"
                        type="number"
                        min="0"
                        step="0.01"
                        defaultValue="0"
                        className={inputClass}
                      />
                    </label>
                    <label className="grid gap-1 text-[11px] font-black text-slate-700 md:col-span-2">
                      نتيجة التقييم
                      <textarea
                        name="assessment"
                        required
                        minLength={3}
                        maxLength={4000}
                        className={textareaClass}
                        placeholder="فحصنا المركبة وتبين أن المشكلة..."
                      />
                    </label>
                    <Button type="submit" className="font-black md:col-span-2">حفظ القرار</Button>
                  </form>
                ) : null}

                {canUpdate && canCreateOrder && claim.status === "APPROVED" && !claim.followUpServiceOrderId ? (
                  <form action={createWarrantyFollowUpOrderAction} className="mt-4 grid gap-3 rounded-xl border border-sky-100 bg-sky-50/50 p-3 md:grid-cols-2">
                    <input type="hidden" name="serviceOrderId" value={id} />
                    <input type="hidden" name="claimId" value={claim.id} />
                    <label className="grid gap-1 text-[11px] font-black text-sky-900">
                      عداد المركبة الآن <span className="font-semibold text-sky-600">اختياري</span>
                      <input name="odometerAtIntake" type="number" min="0" step="1" className={inputClass} />
                    </label>
                    <label className="grid gap-1 text-[11px] font-black text-sky-900 md:col-span-2">
                      ملاحظة الاستقبال <span className="font-semibold text-sky-600">اختياري</span>
                      <input
                        name="receptionNotes"
                        maxLength={2000}
                        className={inputClass}
                        placeholder="مثال: العميل أحضر المركبة صباحاً لفحص الضمان"
                      />
                    </label>
                    <Button type="submit" className="font-black md:col-span-2">
                      <Wrench className="ml-1.5 h-4 w-4" />
                      إنشاء أمر متابعة للصيانة
                    </Button>
                  </form>
                ) : null}

                {canUpdate && ["APPROVED", "IN_SERVICE"].includes(claim.status) ? (
                  <form action={resolveWarrantyClaimAction} className="mt-4 grid gap-3 rounded-xl border border-emerald-100 bg-emerald-50/40 p-3">
                    <input type="hidden" name="serviceOrderId" value={id} />
                    <input type="hidden" name="claimId" value={claim.id} />
                    <label className="grid gap-1 text-[11px] font-black text-emerald-900">
                      نتيجة المعالجة
                      <textarea
                        name="resolution"
                        required
                        minLength={3}
                        maxLength={4000}
                        className={textareaClass}
                        placeholder="تمت معالجة السبب واستبدال/إعادة تنفيذ..."
                      />
                    </label>
                    <Button type="submit" variant="outline" className="border-emerald-300 font-black text-emerald-800">
                      تسجيل المطالبة كمحلولة
                    </Button>
                  </form>
                ) : null}

                {canUpdate && ["REJECTED", "RESOLVED"].includes(claim.status) ? (
                  <form action={closeWarrantyClaimAction} className="mt-3 flex justify-end">
                    <input type="hidden" name="serviceOrderId" value={id} />
                    <input type="hidden" name="claimId" value={claim.id} />
                    <Button type="submit" variant="outline" size="sm" className="font-black">
                      إغلاق المطالبة نهائياً
                    </Button>
                  </form>
                ) : null}
              </article>
            ))
          ) : (
            <div className="py-8 text-center text-sm font-bold text-slate-400">
              لا توجد مطالبات ضمان أو عودة مسجلة لهذا الأمر.
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
