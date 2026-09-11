import Link from "next/link";
import { ArrowRight, ClipboardCheck, FileText, Gauge, PackagePlus, Plus, RotateCcw, Truck, UserRound, Wrench } from "lucide-react";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { requirePermission } from "@/lib/auth/context";
import {
  SERVICE_ORDER_ALLOWED_TRANSITIONS,
  SERVICE_ORDER_STATUS_CLASSES,
  SERVICE_ORDER_STATUS_LABELS,
  formatAutoDate,
  formatAutoMoney,
} from "@/lib/auto/service-order-ui";
import { autoInvoiceService } from "@/lib/services/autoInvoiceService";
import { autoServiceOrderService } from "@/lib/services/autoServiceOrderService";
import { serviceInspectionService } from "@/lib/services/serviceInspectionService";
import { serviceOrderWorkflowService } from "@/lib/services/serviceOrderWorkflowService";
import { servicePartInventoryService } from "@/lib/services/servicePartInventoryService";
import { InspectionForm } from "../_inspection-form";
import {
  addServiceLaborLineAction,
  addServicePartLineAction,
  assignServiceOrderTechnicianAction,
  createQuotationAction,
  returnUsedServicePartAction,
  updateServiceOrderDiagnosisAction,
  updateServiceOrderStatusAction,
} from "../actions";
import { createServiceOrderInvoiceAction } from "../invoice-actions";

export const dynamic = "force-dynamic";

type PageProps = { params: Promise<{ id: string }> };

type LaborRow = { id: string; description: string; quantity: string | number; unitPrice: string | number; lineTotal: string | number; status: string; notes?: string | null };
type PartRow = { id: string; inventoryItemId?: string | null; warehouseId?: string | null; partName: string; quantity: number; unitCost: string | number | null; unitPrice: string | number; lineTotal: string | number; status: string; notes?: string | null; warehouseName?: string | null; sku?: string | null; barcode?: string | null };
type QuoteRow = { id: string; quoteNumber: string; revision: number; status: string; total: string | number; createdAt: Date };

const inputClass = "h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:border-cyan-400 focus:ring-2 focus:ring-cyan-100";
const textareaClass = "min-h-32 w-full resize-y rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm leading-7 outline-none focus:border-cyan-400 focus:ring-2 focus:ring-cyan-100";

const inspectionTypeLabels: Record<string, string> = {
  INITIAL: "فحص أولي",
  FINAL: "فحص نهائي",
  OTHER: "فحص إضافي",
};

const inspectionResultLabels: Record<string, string> = {
  OK: "سليم",
  WARNING: "يحتاج انتباه",
  FAIL: "يحتاج إصلاح/تبديل",
  NOT_CHECKED: "لم يفحص",
};

const inspectionResultClasses: Record<string, string> = {
  OK: "border-emerald-200 bg-emerald-50 text-emerald-800",
  WARNING: "border-amber-200 bg-amber-50 text-amber-800",
  FAIL: "border-red-200 bg-red-50 text-red-800",
  NOT_CHECKED: "border-slate-200 bg-slate-50 text-slate-600",
};

const partStatusLabels: Record<string, string> = {
  PLANNED: "مخطط",
  APPROVED: "معتمد",
  RESERVED: "محجوز",
  USED: "مستخدم",
  RETURNED: "مُعاد للمخزون",
  CANCELLED: "ملغي",
};

export default async function ServiceOrderPage({ params }: PageProps) {
  const auth = await requirePermission("service_orders:read");
  const { id } = await params;
  const [order, inspections, inventoryChoices, technicians, invoice] = await Promise.all([
    autoServiceOrderService.getServiceOrderById(auth.shop.id, id),
    serviceInspectionService.listServiceInspections(auth.shop.id, id),
    servicePartInventoryService.listServicePartInventoryChoices(auth.shop.id),
    serviceOrderWorkflowService.listAssignableTechnicians(auth.shop.id),
    autoInvoiceService.getServiceOrderInvoice(auth.shop.id, id),
  ]);
  if (!order) notFound();

  const laborLines = order.laborLines as LaborRow[];
  const partLines = order.partLines as PartRow[];
  const quotations = order.quotations as QuoteRow[];
  const transitions = SERVICE_ORDER_ALLOWED_TRANSITIONS[order.status] ?? [];
  const partsTotal = partLines.filter((line) => !["CANCELLED", "RETURNED"].includes(line.status)).reduce((sum, line) => sum + Number(line.lineTotal || 0), 0);
  const laborTotal = laborLines.filter((line) => line.status !== "CANCELLED").reduce((sum, line) => sum + Number(line.lineTotal || 0), 0);
  const assignedTechnician = technicians.find((technician) => technician.userId === order.assignedToUserId) ?? null;
  const workflowLocked = ["DELIVERED", "CLOSED", "CANCELLED", "REJECTED"].includes(order.status);
  const canIssueInvoice = ["READY_FOR_DELIVERY", "DELIVERED", "CLOSED"].includes(order.status);
  const canReturnParts = auth.permissions.includes("service_orders:update") && auth.permissions.includes("inventory:use_parts");

  return (
    <div className="space-y-6">
      <PageHeader
        title={order.orderNumber}
        description={`${order.vehicleMake} ${order.vehicleModel}${order.vehicleYear ? ` • ${order.vehicleYear}` : ""} — ${order.customerName}`}
        actions={<div className="flex flex-wrap gap-2"><Button asChild variant="outline" className="font-bold"><Link href="/service-orders"><ArrowRight className="ml-1.5 h-4 w-4" />الأوامر</Link></Button><Button asChild variant="outline" className="font-bold"><Link href={`/vehicles/${order.vehicleId}`}><Truck className="ml-1.5 h-4 w-4" />ملف المركبة</Link></Button></div>}
      />

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0 space-y-3">
            <div className="flex flex-wrap items-center gap-2"><span className={`rounded-full border px-3 py-1.5 text-xs font-black ${SERVICE_ORDER_STATUS_CLASSES[order.status]}`}>{SERVICE_ORDER_STATUS_LABELS[order.status]}</span><span className="text-xs font-bold text-slate-400">استلام: {formatAutoDate(order.receivedAt)}</span></div>
            <div className="text-sm font-semibold leading-7 text-slate-700">{order.reportedIssue}</div>
          </div>
          {transitions.length ? (
            <form action={updateServiceOrderStatusAction} className="flex w-full shrink-0 flex-col gap-2 rounded-xl bg-slate-50 p-3 sm:w-auto sm:min-w-[290px]">
              <input type="hidden" name="serviceOrderId" value={order.id} />
              <select name="status" required className={inputClass} defaultValue="">
                <option value="" disabled>نقل إلى حالة...</option>
                {transitions.map((status) => <option key={status} value={status}>{SERVICE_ORDER_STATUS_LABELS[status]}</option>)}
              </select>
              <input name="note" className={inputClass} placeholder="ملاحظة على تغيير الحالة (اختياري)" />
              <Button type="submit" className="h-10 font-black">تحديث الحالة</Button>
            </form>
          ) : null}
        </div>
      </section>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-2xl border border-sky-100 bg-sky-50/60 p-4"><div className="flex items-center gap-2 text-xs font-black text-sky-800"><UserRound className="h-4 w-4" />العميل</div><div className="mt-2 font-black text-slate-950">{order.customerName}</div><div className="text-xs text-slate-500">{order.customerPhone || "-"}</div></div>
        <div className="rounded-2xl border border-teal-100 bg-teal-50/60 p-4"><div className="flex items-center gap-2 text-xs font-black text-teal-800"><Truck className="h-4 w-4" />المركبة</div><div className="mt-2 font-black text-slate-950">{order.vehicleMake} {order.vehicleModel}</div><div className="text-xs text-slate-500">{order.plateNumber || order.vin || "-"}</div></div>
        <div className="rounded-2xl border border-amber-100 bg-amber-50/60 p-4"><div className="flex items-center gap-2 text-xs font-black text-amber-800"><Gauge className="h-4 w-4" />العداد عند الدخول</div><div className="mt-2 text-lg font-black text-slate-950">{order.odometerAtIntake != null ? `${order.odometerAtIntake.toLocaleString("ar")} كم` : "-"}</div><div className="text-xs text-slate-500">وقود: {order.fuelLevelPercent != null ? `${Number(order.fuelLevelPercent)}%` : "-"}</div></div>
        <div className="rounded-2xl border border-violet-100 bg-violet-50/60 p-4"><div className="text-xs font-black text-violet-800">التكلفة الحالية</div><div className="mt-2 text-lg font-black text-slate-950">{formatAutoMoney(partsTotal + laborTotal, auth.shop.currency)}</div><div className="text-xs text-slate-500">قطع {formatAutoMoney(partsTotal, auth.shop.currency)} • عمل {formatAutoMoney(laborTotal, auth.shop.currency)}</div></div>
      </div>

      <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-col gap-3 border-b border-slate-100 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="flex items-center gap-2 font-black text-slate-950"><FileText className="h-4 w-4 text-emerald-700" />الفاتورة والدفع</h2>
            <p className="mt-1 text-xs font-semibold text-slate-500">بعد اكتمال الصيانة تُصدر فاتورة مرتبطة مباشرة بأمر الصيانة. يمكن تحصيلها الآن أو إبقاء الرصيد على الذمة.</p>
          </div>
          {invoice ? <Button asChild className="font-black"><Link href={`/invoices/${invoice.id}`}>فتح الفاتورة</Link></Button> : null}
        </div>
        <div className="p-4 sm:p-5">
          {invoice ? (
            <div className="grid gap-3 md:grid-cols-4">
              <div className="rounded-xl bg-slate-50 p-3"><div className="text-[11px] font-black text-slate-400">رقم الفاتورة</div><div className="mt-1 font-black text-slate-900">{invoice.invoiceNumber}</div></div>
              <div className="rounded-xl bg-slate-50 p-3"><div className="text-[11px] font-black text-slate-400">الحالة</div><div className="mt-1 font-black text-slate-900">{invoice.status}</div></div>
              <div className="rounded-xl bg-slate-50 p-3"><div className="text-[11px] font-black text-slate-400">الإجمالي</div><div className="mt-1 font-black text-slate-900">{formatAutoMoney(invoice.total, auth.shop.currency)}</div></div>
              <div className="rounded-xl bg-slate-50 p-3"><div className="text-[11px] font-black text-slate-400">المتبقي / الذمة</div><div className="mt-1 font-black text-amber-700">{formatAutoMoney(invoice.balanceDue, auth.shop.currency)}</div></div>
            </div>
          ) : canIssueInvoice ? (
            <div className="flex flex-col gap-3 rounded-2xl border border-emerald-100 bg-emerald-50/50 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div><div className="font-black text-emerald-950">الصيانة جاهزة للفوترة</div><div className="mt-1 text-xs font-semibold text-emerald-800">سيتم احتساب أجور العمل والقطع الفعلية مع خصم وضريبة عرض السعر الموافق عليه.</div></div>
              <form action={createServiceOrderInvoiceAction}><input type="hidden" name="serviceOrderId" value={order.id} /><Button type="submit" className="font-black">إصدار فاتورة الصيانة</Button></form>
            </div>
          ) : (
            <div className="rounded-xl bg-slate-50 p-4 text-sm font-bold text-slate-500">ستتاح الفوترة عندما يصل أمر الصيانة إلى حالة «جاهزة للتسليم».</div>
          )}
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-2">
        <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 p-5">
            <h2 className="flex items-center gap-2 font-black text-slate-950"><Wrench className="h-4 w-4 text-cyan-700" />التشخيص</h2>
            <p className="mt-1 text-xs font-semibold text-slate-500">ثبّت نتيجة الفحص والتشخيص قبل اعتماد عرض السعر أو بدء التنفيذ.</p>
          </div>
          <form action={updateServiceOrderDiagnosisAction} className="space-y-3 p-4 sm:p-5">
            <input type="hidden" name="serviceOrderId" value={order.id} />
            <textarea name="diagnosis" defaultValue={order.diagnosis ?? ""} maxLength={6000} disabled={workflowLocked} className={textareaClass} placeholder="مثال: تلف في طرمبة الماء مع تهريب من الخرطوم العلوي..." />
            <Button type="submit" disabled={workflowLocked} className="font-black">حفظ التشخيص</Button>
          </form>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 p-5">
            <h2 className="flex items-center gap-2 font-black text-slate-950"><UserRound className="h-4 w-4 text-indigo-700" />الفني المسؤول</h2>
            <p className="mt-1 text-xs font-semibold text-slate-500">يظهر هنا الموظفون النشطون بدور فني صيانة فقط.</p>
          </div>
          <form action={assignServiceOrderTechnicianAction} className="space-y-3 p-4 sm:p-5">
            <input type="hidden" name="serviceOrderId" value={order.id} />
            <select name="technicianUserId" defaultValue={order.assignedToUserId ?? ""} disabled={workflowLocked} className={inputClass}>
              <option value="">بدون فني محدد</option>
              {technicians.map((technician) => <option key={technician.userId} value={technician.userId}>{technician.name}</option>)}
            </select>
            <div className="text-xs font-semibold text-slate-500">
              {assignedTechnician ? `المسؤول حاليًا: ${assignedTechnician.name}` : technicians.length ? "لم يتم تحديد فني مسؤول بعد." : "لا يوجد فني نشط. أضف موظفًا بدور فني صيانة من إعدادات الفريق."}
            </div>
            <Button type="submit" disabled={workflowLocked || !technicians.length} className="font-black">حفظ الفني المسؤول</Button>
          </form>
        </section>
      </div>

      <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 p-5">
          <h2 className="flex items-center gap-2 font-black text-slate-950"><ClipboardCheck className="h-4 w-4 text-emerald-700" />الفحص الفني</h2>
          <p className="mt-1 text-xs font-semibold text-slate-500">سجّل الفحص الأولي أو النهائي ببنود واضحة تبقى محفوظة ضمن تاريخ أمر الصيانة.</p>
        </div>
        <div className="p-4 sm:p-5"><InspectionForm serviceOrderId={order.id} /></div>
        {inspections.length ? (
          <div className="border-t border-slate-100 p-4 sm:p-5">
            <h3 className="mb-4 text-sm font-black text-slate-800">الفحوصات السابقة</h3>
            <div className="space-y-4">
              {inspections.map((inspection) => (
                <div key={inspection.id} className="rounded-2xl border border-slate-200 bg-slate-50/50 p-4">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <div className="font-black text-slate-900">{inspectionTypeLabels[inspection.inspectionType] ?? inspection.inspectionType}</div>
                      <div className="mt-1 text-xs font-semibold text-slate-500">{inspection.inspectorName ? `بواسطة ${inspection.inspectorName} • ` : ""}{formatAutoDate(inspection.inspectedAt ?? inspection.createdAt)}</div>
                    </div>
                    {inspection.summary ? <div className="max-w-xl text-xs font-bold leading-6 text-slate-600">{inspection.summary}</div> : null}
                  </div>
                  <div className="mt-4 grid gap-2">
                    {inspection.items.map((item) => (
                      <div key={item.id} className="grid gap-2 rounded-xl border border-slate-100 bg-white p-3 md:grid-cols-[minmax(140px,1fr)_auto_minmax(180px,1.4fr)_auto] md:items-center">
                        <div className="font-black text-slate-800">{item.component}</div>
                        <span className={`w-fit rounded-full border px-2.5 py-1 text-[11px] font-black ${inspectionResultClasses[item.result] ?? inspectionResultClasses.NOT_CHECKED}`}>{inspectionResultLabels[item.result] ?? item.result}</span>
                        <div className="text-xs leading-6 text-slate-600">{item.recommendedAction || item.notes || "لا توجد ملاحظات إضافية"}</div>
                        <div className="text-xs font-black text-slate-700">{item.estimatedCost != null ? formatAutoMoney(item.estimatedCost, auth.shop.currency) : "-"}</div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </section>

      <div className="grid gap-6 xl:grid-cols-2">
        <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 p-5"><h2 className="flex items-center gap-2 font-black text-slate-950"><Wrench className="h-4 w-4 text-cyan-700" />أجور وأعمال الصيانة</h2></div>
          <div className="space-y-3 p-4">
            {laborLines.length ? laborLines.map((line) => <div key={line.id} className="rounded-xl border border-slate-100 p-3"><div className="flex items-start justify-between gap-3"><div className="font-bold text-slate-800">{line.description}</div><div className="shrink-0 font-black text-slate-950">{formatAutoMoney(line.lineTotal, auth.shop.currency)}</div></div><div className="mt-1 text-xs text-slate-500">{Number(line.quantity)} × {formatAutoMoney(line.unitPrice, auth.shop.currency)} • {line.status}</div></div>) : <div className="py-5 text-center text-sm font-bold text-slate-400">لا توجد أجور عمل بعد</div>}
          </div>
          <form action={addServiceLaborLineAction} className="grid gap-3 border-t border-slate-100 bg-slate-50/60 p-4 sm:grid-cols-2">
            <input type="hidden" name="serviceOrderId" value={order.id} />
            <input name="description" required className={`${inputClass} sm:col-span-2`} placeholder="وصف العمل: تغيير زيت، فحص فرامل..." />
            <input name="quantity" type="number" min="0.01" step="0.01" defaultValue="1" className={inputClass} placeholder="الكمية" />
            <input name="unitPrice" type="number" min="0" step="0.01" required className={inputClass} placeholder="سعر العمل" />
            <input name="hours" type="number" min="0" step="0.25" className={inputClass} placeholder="الساعات (اختياري)" />
            <input name="costAmount" type="number" min="0" step="0.01" className={inputClass} placeholder="تكلفة العمل (اختياري)" />
            <Button type="submit" className="font-black sm:col-span-2"><Plus className="ml-1 h-4 w-4" />إضافة أجرة عمل</Button>
          </form>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 p-5"><h2 className="flex items-center gap-2 font-black text-slate-950"><PackagePlus className="h-4 w-4 text-amber-700" />قطع الغيار</h2></div>
          <div className="space-y-3 p-4">
            {partLines.length ? partLines.map((line) => {
              const canReturnThisLine = canReturnParts && !workflowLocked && !invoice && line.status === "USED" && Boolean(line.inventoryItemId && line.warehouseId);
              return <div key={line.id} className={`rounded-xl border p-3 ${line.status === "RETURNED" ? "border-slate-200 bg-slate-50/70" : "border-slate-100"}`}>
                <div className="flex items-start justify-between gap-3"><div><div className="font-bold text-slate-800">{line.partName}</div>{line.warehouseName ? <div className="mt-1 text-[11px] font-bold text-slate-400">{line.warehouseName}{line.sku ? ` • SKU ${line.sku}` : ""}</div> : null}</div><div className={`shrink-0 font-black ${line.status === "RETURNED" ? "text-slate-400 line-through" : "text-slate-950"}`}>{formatAutoMoney(line.lineTotal, auth.shop.currency)}</div></div>
                <div className="mt-1 text-xs text-slate-500">{line.quantity} × {formatAutoMoney(line.unitPrice, auth.shop.currency)} • <span className={line.status === "RETURNED" ? "font-black text-emerald-700" : ""}>{partStatusLabels[line.status] ?? line.status}</span></div>
                {canReturnThisLine ? <form action={returnUsedServicePartAction} className="mt-3 grid gap-2 rounded-xl border border-emerald-100 bg-emerald-50/50 p-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end"><input type="hidden" name="serviceOrderId" value={order.id} /><input type="hidden" name="servicePartLineId" value={line.id} /><label className="grid gap-1 text-[10px] font-black text-emerald-900">سبب/ملاحظة الإرجاع <span className="font-semibold text-emerald-700">اختياري</span><input name="note" maxLength={500} className="h-9 rounded-lg border border-emerald-200 bg-white px-3 text-xs outline-none focus:border-emerald-400" placeholder="مثال: لم تُركب، تم استبدالها بقطعة أخرى" /></label><Button type="submit" variant="outline" className="border-emerald-300 font-black text-emerald-800 hover:bg-emerald-100"><RotateCcw className="ml-1.5 h-4 w-4" />إرجاع للمخزون</Button></form> : null}
              </div>;
            }) : <div className="py-5 text-center text-sm font-bold text-slate-400">لا توجد قطع مضافة بعد</div>}
          </div>
          <form action={addServicePartLineAction} className="grid gap-3 border-t border-slate-100 bg-slate-50/60 p-4 sm:grid-cols-2">
            <input type="hidden" name="serviceOrderId" value={order.id} />
            <select name="inventorySelection" defaultValue="" className={`${inputClass} sm:col-span-2`}>
              <option value="">قطعة يدوية / غير مرتبطة بالمخزون</option>
              {inventoryChoices.map((choice) => (
                <option key={`${choice.inventoryItemId}-${choice.warehouseId}`} value={`${choice.inventoryItemId}|${choice.warehouseId}`}>
                  {choice.itemName} — {choice.warehouseName} — متاح {choice.availableQuantity}
                </option>
              ))}
            </select>
            <input name="partName" className={`${inputClass} sm:col-span-2`} placeholder="اسم قطعة يدوية، أو اتركه فارغاً عند اختيار قطعة من المخزون" />
            <input name="quantity" type="number" min="1" step="1" defaultValue="1" className={inputClass} />
            <input name="unitPrice" type="number" min="0" step="0.01" className={inputClass} placeholder="سعر البيع (يؤخذ من المخزون إذا ترك فارغاً)" />
            <input name="unitCost" type="number" min="0" step="0.000001" className={inputClass} placeholder="التكلفة (تؤخذ من المستودع تلقائياً)" />
            <input name="notes" className={inputClass} placeholder="ملاحظة (اختياري)" />
            <Button type="submit" className="font-black sm:col-span-2"><Plus className="ml-1 h-4 w-4" />إضافة قطعة</Button>
          </form>
        </section>
      </div>

      <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-col gap-3 border-b border-slate-100 p-5 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="flex items-center gap-2 font-black text-slate-950"><FileText className="h-4 w-4 text-violet-700" />عروض الأسعار</h2><p className="mt-1 text-xs text-slate-500">كل نسخة من العرض تبقى محفوظة للمراجعة</p></div>{laborLines.length || partLines.length ? <form action={createQuotationAction} className="flex flex-wrap gap-2"><input type="hidden" name="serviceOrderId" value={order.id} /><input name="discountTotal" type="number" min="0" step="0.01" className="h-9 w-28 rounded-lg border border-slate-200 px-2 text-xs" placeholder="خصم" /><Button type="submit" size="sm" className="font-black">إنشاء عرض سعر</Button></form> : null}</div>
        {quotations.length ? <div className="divide-y divide-slate-100">{quotations.map((quote) => <Link key={quote.id} href={`/quotations/${quote.id}`} className="flex items-center justify-between gap-3 p-4 transition hover:bg-slate-50 sm:p-5"><div><div className="font-black text-slate-950">{quote.quoteNumber} <span className="text-xs text-slate-400">نسخة {quote.revision}</span></div><div className="mt-1 text-xs font-bold text-slate-500">{quote.status} • {formatAutoDate(quote.createdAt)}</div></div><div className="font-black text-slate-950">{formatAutoMoney(quote.total, auth.shop.currency)}</div></Link>)}</div> : <div className="p-8 text-center text-sm font-bold text-slate-400">لم يتم إنشاء عرض سعر بعد.</div>}
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="flex items-center gap-2 font-black text-slate-950"><ClipboardCheck className="h-4 w-4 text-emerald-700" />سجل الحالات</h2>
        <div className="mt-4 space-y-3">{order.history.map((entry) => <div key={entry.id} className="flex gap-3 text-sm"><span className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full bg-cyan-500" /><div><div className="font-black text-slate-800">{SERVICE_ORDER_STATUS_LABELS[entry.toStatus as keyof typeof SERVICE_ORDER_STATUS_LABELS] ?? entry.toStatus}</div><div className="text-xs text-slate-500">{formatAutoDate(entry.createdAt)}{entry.note ? ` • ${entry.note}` : ""}</div></div></div>)}</div>
      </section>
    </div>
  );
}
