import { CheckCircle2, Gauge, LockKeyhole, Truck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { requirePermission } from "@/lib/auth/context";
import { formatAutoDate, formatAutoMoney } from "@/lib/auto/service-order-ui";
import { serviceDeliveryService } from "@/lib/services/serviceDeliveryService";
import { closeServiceOrderAction, deliverServiceOrderAction } from "../delivery-actions";

const inputClass = "h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:border-cyan-400 focus:ring-2 focus:ring-cyan-100";
const textareaClass = "min-h-24 w-full resize-y rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm leading-7 outline-none focus:border-cyan-400 focus:ring-2 focus:ring-cyan-100";

export async function ServiceDeliverySection({ serviceOrderId, currency }: { serviceOrderId: string; currency: string }) {
  const auth = await requirePermission("service_orders:read");
  const context = await serviceDeliveryService.getServiceDeliveryContext(auth.shop.id, serviceOrderId);
  if (!context || !["READY_FOR_DELIVERY", "DELIVERED", "CLOSED"].includes(context.status)) return null;

  const canManage = auth.permissions.includes("service_orders:update_status");
  const minimumOdometer = Math.max(context.odometerAtIntake ?? 0, context.currentOdometer ?? 0);

  if (context.status === "READY_FOR_DELIVERY") {
    return (
      <section className="overflow-hidden rounded-2xl border border-teal-200 bg-white shadow-sm">
        <div className="border-b border-teal-100 bg-teal-50/60 p-5">
          <h2 className="flex items-center gap-2 font-black text-teal-950"><Truck className="h-5 w-5" />تسليم المركبة</h2>
          <p className="mt-1 text-xs font-semibold text-teal-800">التسليم إجراء مستقل ومدقق؛ لا يغيّر رصيد العميل ولا يشترط سداد الفاتورة بالكامل.</p>
        </div>
        {!context.invoiceId ? (
          <div className="m-5 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm font-bold leading-7 text-amber-900">
            لا يمكن تسليم المركبة قبل إصدار فاتورة الصيانة. أصدر الفاتورة من قسم «الفاتورة والدفع» أعلاه أولاً؛ ويمكن ترك المتبقي على ذمة العميل.
          </div>
        ) : (
          <div className="grid gap-5 p-5 lg:grid-cols-[minmax(0,1fr)_320px]">
            <form action={deliverServiceOrderAction} className="grid gap-3 sm:grid-cols-2">
              <input type="hidden" name="serviceOrderId" value={serviceOrderId} />
              <label className="grid gap-1.5 text-xs font-black text-slate-700">
                عداد المركبة عند التسليم
                <div className="relative">
                  <Gauge className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input
                    name="odometerAtDelivery"
                    type="number"
                    min={minimumOdometer}
                    step="1"
                    defaultValue={context.currentOdometer ?? context.odometerAtIntake ?? undefined}
                    className={`${inputClass} pr-9`}
                    placeholder="اختياري"
                  />
                </div>
                <span className="font-semibold text-slate-400">لا يمكن أن تكون أقل من آخر قراءة مسجلة: {minimumOdometer.toLocaleString("ar")} كم</span>
              </label>
              <label className="grid gap-1.5 text-xs font-black text-slate-700 sm:col-span-2">
                ملاحظات التسليم
                <textarea name="deliveryNotes" maxLength={2000} className={textareaClass} placeholder="مثال: تم شرح الأعمال للعميل وتسليم المفاتيح والقطع القديمة..." />
              </label>
              <Button type="submit" disabled={!canManage} className="h-11 font-black sm:col-span-2">
                <Truck className="ml-1.5 h-4 w-4" />تأكيد تسليم المركبة
              </Button>
              {!canManage ? <p className="text-xs font-bold text-amber-700 sm:col-span-2">حسابك لا يملك صلاحية تغيير حالة أمر الصيانة.</p> : null}
            </form>

            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div className="text-xs font-black text-slate-500">فاتورة التسليم</div>
              <div className="mt-1 font-black text-slate-950">{context.invoiceNumber}</div>
              <div className="mt-4 grid gap-2">
                <div className="flex items-center justify-between text-xs"><span className="font-bold text-slate-500">إجمالي الفاتورة</span><span className="font-black text-slate-900">{formatAutoMoney(context.invoiceTotal, currency)}</span></div>
                <div className="flex items-center justify-between text-xs"><span className="font-bold text-slate-500">المتبقي على الذمة</span><span className={Number(context.invoiceBalanceDue ?? 0) > 0 ? "font-black text-amber-700" : "font-black text-emerald-700"}>{formatAutoMoney(context.invoiceBalanceDue, currency)}</span></div>
              </div>
              <div className="mt-4 rounded-xl border border-sky-100 bg-sky-50 p-3 text-[11px] font-bold leading-6 text-sky-900">
                {Number(context.invoiceBalanceDue ?? 0) > 0
                  ? "سيتم تسليم المركبة مع إبقاء هذا المبلغ كذمة على العميل. التسليم لا يسجّل دفعة مالية تلقائياً."
                  : "الفاتورة مسددة بالكامل، ويمكن تسجيل التسليم مباشرة."}
              </div>
            </div>
          </div>
        )}
      </section>
    );
  }

  return (
    <section className={`overflow-hidden rounded-2xl border bg-white shadow-sm ${context.status === "CLOSED" ? "border-slate-200" : "border-violet-200"}`}>
      <div className={`border-b p-5 ${context.status === "CLOSED" ? "border-slate-100 bg-slate-50" : "border-violet-100 bg-violet-50/60"}`}>
        <h2 className="flex items-center gap-2 font-black text-slate-950">
          {context.status === "CLOSED" ? <LockKeyhole className="h-5 w-5 text-slate-600" /> : <CheckCircle2 className="h-5 w-5 text-violet-700" />}
          {context.status === "CLOSED" ? "أمر الصيانة مغلق" : "تم تسليم المركبة"}
        </h2>
        <p className="mt-1 text-xs font-semibold text-slate-500">سجل التسليم والإغلاق محفوظ ضمن تاريخ أمر الصيانة.</p>
      </div>

      <div className="grid gap-4 p-5 md:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-xl bg-slate-50 p-3"><div className="text-[11px] font-black text-slate-400">وقت التسليم</div><div className="mt-1 text-sm font-black text-slate-900">{formatAutoDate(context.deliveredAt)}</div></div>
        <div className="rounded-xl bg-slate-50 p-3"><div className="text-[11px] font-black text-slate-400">سلّمها</div><div className="mt-1 text-sm font-black text-slate-900">{context.deliveredByName || "-"}</div></div>
        <div className="rounded-xl bg-slate-50 p-3"><div className="text-[11px] font-black text-slate-400">عداد التسليم</div><div className="mt-1 text-sm font-black text-slate-900">{context.odometerAtDelivery != null ? `${context.odometerAtDelivery.toLocaleString("ar")} كم` : "غير مسجل"}</div></div>
        <div className="rounded-xl bg-slate-50 p-3"><div className="text-[11px] font-black text-slate-400">المتبقي على الذمة</div><div className={Number(context.invoiceBalanceDue ?? 0) > 0 ? "mt-1 text-sm font-black text-amber-700" : "mt-1 text-sm font-black text-emerald-700"}>{formatAutoMoney(context.invoiceBalanceDue, currency)}</div></div>
      </div>

      {context.deliveryNotes ? <div className="mx-5 mb-5 rounded-xl border border-slate-100 bg-slate-50 p-3 text-xs font-semibold leading-6 text-slate-600"><span className="font-black text-slate-800">ملاحظات التسليم: </span>{context.deliveryNotes}</div> : null}

      {context.status === "DELIVERED" ? (
        <form action={closeServiceOrderAction} className="grid gap-3 border-t border-slate-100 bg-slate-50/60 p-5 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
          <input type="hidden" name="serviceOrderId" value={serviceOrderId} />
          <label className="grid gap-1.5 text-xs font-black text-slate-700">
            ملاحظة الإغلاق النهائية
            <textarea name="resolutionNotes" maxLength={3000} className={textareaClass} placeholder="اختياري: ملخص نهائي للحالة أو توصية للزيارة القادمة..." />
          </label>
          <Button type="submit" disabled={!canManage} className="h-11 font-black"><LockKeyhole className="ml-1.5 h-4 w-4" />إغلاق أمر الصيانة</Button>
        </form>
      ) : (
        <div className="border-t border-slate-100 bg-slate-50/60 p-5">
          <div className="grid gap-3 md:grid-cols-3">
            <div><div className="text-[11px] font-black text-slate-400">وقت الإغلاق</div><div className="mt-1 text-sm font-black text-slate-900">{formatAutoDate(context.closedAt)}</div></div>
            <div><div className="text-[11px] font-black text-slate-400">أغلقه</div><div className="mt-1 text-sm font-black text-slate-900">{context.closedByName || "-"}</div></div>
            <div><div className="text-[11px] font-black text-slate-400">الخلاصة النهائية</div><div className="mt-1 text-sm font-bold leading-6 text-slate-700">{context.resolutionNotes || "لا توجد ملاحظة إغلاق إضافية."}</div></div>
          </div>
        </div>
      )}
    </section>
  );
}
