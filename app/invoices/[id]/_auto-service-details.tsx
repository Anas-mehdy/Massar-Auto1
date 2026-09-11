import Link from "next/link";
import { CarFront, Gauge, Package, Wrench } from "lucide-react";
import { Button } from "@/components/ui/button";
import { autoInvoiceDetailService } from "@/lib/services/autoInvoiceDetailService";
import { formatDate, formatMoney } from "../_components";

export async function AutoServiceInvoiceDetails({
  shopId,
  invoiceId,
  currency,
  timeZone,
}: {
  shopId: string;
  invoiceId: string;
  currency: string;
  timeZone: string;
}) {
  const context = await autoInvoiceDetailService.getAutoInvoiceServiceContext(shopId, invoiceId);
  if (!context) return null;

  const vehicleName = `${context.vehicleMake} ${context.vehicleModel}${context.vehicleYear ? ` • ${context.vehicleYear}` : ""}`;

  return (
    <div className="erp-section space-y-5">
      <div className="flex flex-col gap-3 border-b border-slate-100/60 pb-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="flex items-center gap-2 text-sm font-black text-slate-800"><CarFront className="h-4 w-4 text-cyan-700" />تفاصيل صيانة المركبة</h3>
          <p className="mt-1 text-xs font-semibold text-slate-400">البنود الفعلية التي بُنيت عليها فاتورة أمر الصيانة.</p>
        </div>
        <Button asChild variant="outline" size="sm" className="font-black">
          <Link href={`/service-orders/${context.serviceOrderId}`}>فتح أمر الصيانة {context.orderNumber}</Link>
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Info label="المركبة" value={vehicleName} />
        <Info label="اللوحة / VIN" value={context.plateNumber || context.vin || "-"} />
        <Info label="رقم أمر الصيانة" value={context.orderNumber} />
        <Info label="حالة الأمر" value={context.orderStatus} />
        <Info label="تاريخ الاستلام" value={formatDate(context.receivedAt, timeZone)} />
        <Info label="تاريخ التسليم" value={formatDate(context.deliveredAt, timeZone)} />
        <Info label="عداد الدخول" value={context.odometerAtIntake != null ? `${context.odometerAtIntake.toLocaleString("ar")} كم` : "-"} />
        <Info label="عداد التسليم" value={context.odometerAtDelivery != null ? `${context.odometerAtDelivery.toLocaleString("ar")} كم` : "-"} />
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <div className="rounded-xl border border-slate-100 bg-slate-50/40 p-4">
          <div className="text-[10px] font-black uppercase tracking-wider text-slate-400">شكوى العميل / سبب الدخول</div>
          <p className="mt-2 text-sm font-bold leading-7 text-slate-700">{context.reportedIssue}</p>
        </div>
        <div className="rounded-xl border border-slate-100 bg-slate-50/40 p-4">
          <div className="text-[10px] font-black uppercase tracking-wider text-slate-400">التشخيص</div>
          <p className="mt-2 text-sm font-bold leading-7 text-slate-700">{context.diagnosis || "لم يتم تسجيل تشخيص نصي."}</p>
        </div>
      </div>

      <div className="grid gap-5 xl:grid-cols-2">
        <div className="overflow-hidden rounded-2xl border border-slate-200/70">
          <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50/60 px-4 py-3">
            <h4 className="flex items-center gap-2 text-xs font-black text-slate-800"><Wrench className="h-4 w-4 text-indigo-700" />أجور وأعمال الصيانة</h4>
            <span className="font-numeric text-xs font-black text-slate-700">{formatMoney(context.laborTotal, currency)}</span>
          </div>
          <div className="divide-y divide-slate-100">
            {context.laborLines.length ? context.laborLines.map((line) => (
              <div key={line.id} className="grid grid-cols-[1fr_auto] gap-3 px-4 py-3 text-xs">
                <div>
                  <div className="font-black text-slate-800">{line.description}</div>
                  <div className="mt-1 font-semibold text-slate-400">{line.quantity} × {formatMoney(line.unitPrice, currency)}{line.hours != null ? ` • ${line.hours} ساعة` : ""}</div>
                </div>
                <div className="font-numeric font-black text-slate-900">{formatMoney(line.lineTotal, currency)}</div>
              </div>
            )) : <div className="p-5 text-center text-xs font-bold text-slate-400">لا توجد أجور عمل مفوترة.</div>}
          </div>
        </div>

        <div className="overflow-hidden rounded-2xl border border-slate-200/70">
          <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50/60 px-4 py-3">
            <h4 className="flex items-center gap-2 text-xs font-black text-slate-800"><Package className="h-4 w-4 text-amber-700" />قطع الغيار</h4>
            <span className="font-numeric text-xs font-black text-slate-700">{formatMoney(context.partsTotal, currency)}</span>
          </div>
          <div className="divide-y divide-slate-100">
            {context.partLines.length ? context.partLines.map((line) => (
              <div key={line.id} className="grid grid-cols-[1fr_auto] gap-3 px-4 py-3 text-xs">
                <div>
                  <div className="font-black text-slate-800">{line.partName}</div>
                  <div className="mt-1 font-semibold text-slate-400">{line.quantity} × {formatMoney(line.unitPrice, currency)}{line.warehouseName ? ` • ${line.warehouseName}` : ""}{line.sku ? ` • ${line.sku}` : ""}</div>
                </div>
                <div className="font-numeric font-black text-slate-900">{formatMoney(line.lineTotal, currency)}</div>
              </div>
            )) : <div className="p-5 text-center text-xs font-bold text-slate-400">لا توجد قطع غيار مفوترة.</div>}
          </div>
        </div>
      </div>

      {context.deliveryNotes ? (
        <div className="rounded-xl border border-emerald-100 bg-emerald-50/50 p-4 text-xs font-bold leading-6 text-emerald-900">
          <span className="ml-1 inline-flex items-center gap-1 font-black"><Gauge className="h-3.5 w-3.5" />ملاحظات التسليم:</span>
          {context.deliveryNotes}
        </div>
      ) : null}
    </div>
  );
}

function Info({ label, value }: { label: string; value: React.ReactNode }) {
  return <div className="rounded-xl border border-slate-100 bg-slate-50/30 p-3"><div className="text-[10px] font-black uppercase tracking-wider text-slate-400">{label}</div><div className="mt-1.5 text-xs font-black text-slate-700">{value}</div></div>;
}
