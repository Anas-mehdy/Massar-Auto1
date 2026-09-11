import { getCurrentShopContext } from "@/lib/current-shop";
import { autoInvoiceDetailService } from "@/lib/services/autoInvoiceDetailService";
import { formatCurrency } from "@/lib/format";

export async function AutoServiceInvoicePrint({ invoiceId }: { invoiceId: string }) {
  const shop = await getCurrentShopContext();
  const context = await autoInvoiceDetailService.getAutoInvoiceServiceContext(shop.shopId, invoiceId);
  if (!context) return null;

  const currency = shop.currency || "SAR";
  const vehicleName = `${context.vehicleMake} ${context.vehicleModel}${context.vehicleYear ? ` ${context.vehicleYear}` : ""}`;

  return (
    <div className="border-b border-slate-300 py-2 text-[10px]">
      <div className="mb-1.5 text-center text-[11px] font-black text-slate-900">تفاصيل صيانة المركبة</div>
      <div className="space-y-0.5">
        <Row label="أمر الصيانة" value={context.orderNumber} />
        <Row label="المركبة" value={vehicleName} />
        <Row label="اللوحة / VIN" value={context.plateNumber || context.vin || "-"} />
        <Row label="عداد الدخول" value={context.odometerAtIntake != null ? `${context.odometerAtIntake} كم` : "-"} />
        {context.odometerAtDelivery != null ? <Row label="عداد التسليم" value={`${context.odometerAtDelivery} كم`} /> : null}
      </div>

      <div className="mt-2 border-t border-dotted border-slate-300 pt-1.5">
        <div className="mb-1 font-black text-slate-800">أجور العمل</div>
        {context.laborLines.length ? context.laborLines.map((line) => (
          <div key={line.id} className="mb-1 flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <div className="font-bold text-slate-800">{line.description}</div>
              <div className="text-[8.5px] text-slate-500">{line.quantity} × {formatCurrency(line.unitPrice, currency)}</div>
            </div>
            <div className="shrink-0 font-numeric font-black text-slate-900">{formatCurrency(line.lineTotal, currency)}</div>
          </div>
        )) : <div className="text-[9px] text-slate-500">لا توجد أجور عمل.</div>}
      </div>

      <div className="mt-2 border-t border-dotted border-slate-300 pt-1.5">
        <div className="mb-1 font-black text-slate-800">قطع الغيار</div>
        {context.partLines.length ? context.partLines.map((line) => (
          <div key={line.id} className="mb-1 flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <div className="font-bold text-slate-800">{line.partName}</div>
              <div className="text-[8.5px] text-slate-500">{line.quantity} × {formatCurrency(line.unitPrice, currency)}</div>
            </div>
            <div className="shrink-0 font-numeric font-black text-slate-900">{formatCurrency(line.lineTotal, currency)}</div>
          </div>
        )) : <div className="text-[9px] text-slate-500">لا توجد قطع غيار.</div>}
      </div>

      {context.diagnosis ? (
        <div className="mt-2 border-t border-dotted border-slate-300 pt-1.5">
          <span className="font-black text-slate-800">التشخيص: </span>
          <span className="font-medium leading-tight text-slate-600">{context.diagnosis}</span>
        </div>
      ) : null}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return <div className="flex items-baseline justify-between gap-2"><span className="font-bold text-slate-600">{label}:</span><span className="text-left font-bold text-slate-900">{value}</span></div>;
}
