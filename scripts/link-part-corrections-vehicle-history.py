from pathlib import Path

path = Path("app/vehicles/[id]/_vehicle-history.tsx")
text = path.read_text()

replacements = [
    (
        'import { Banknote, CalendarDays, CarFront, CheckCircle2, ClipboardCheck, FileText, Gauge, Package, ReceiptText, UserRoundCog, Wrench } from "lucide-react";',
        'import { Banknote, CalendarDays, CarFront, CheckCircle2, ClipboardCheck, FileText, Gauge, Package, ReceiptText, RotateCcw, UserRoundCog, Wrench } from "lucide-react";'
    ),
    (
        'import { vehicleHistoryService } from "@/lib/services/vehicleHistoryService";\n',
        'import { vehicleHistoryService } from "@/lib/services/vehicleHistoryService";\nimport type { VehicleHistoryPartCorrection } from "@/lib/services/vehiclePartCorrectionHistoryService";\nimport { vehiclePartCorrectionHistoryService } from "@/lib/services/vehiclePartCorrectionHistoryService";\n'
    ),
    (
        'const paymentMethodLabels: Record<string, string> = { CASH: "نقدي", CARD: "بطاقة", BANK_TRANSFER: "تحويل بنكي", E_WALLET: "محفظة إلكترونية", WALLET: "محفظة", OTHER: "أخرى" };\n',
        'const paymentMethodLabels: Record<string, string> = { CASH: "نقدي", CARD: "بطاقة", BANK_TRANSFER: "تحويل بنكي", E_WALLET: "محفظة إلكترونية", WALLET: "محفظة", OTHER: "أخرى" };\nconst correctionReasonLabels: Record<string, string> = { CUSTOMER_RETURN: "إرجاع من العميل", DEFECTIVE: "قطعة معيبة", WARRANTY: "ضمان", REWORK: "إعادة عمل", REPLACEMENT: "استبدال", OTHER: "سبب آخر" };\nconst correctionDispositionLabels: Record<string, string> = { RETURN_TO_STOCK: "أعيدت للمخزون", NO_STOCK_CHANGE: "توثيق بدون تغيير مخزون" };\n'
    ),
    (
        '  const { metrics, orders } = await vehicleHistoryService.getVehicleLifetimeHistory(shopId, vehicleId);\n',
        '  const [{ metrics, orders }, partCorrections] = await Promise.all([\n    vehicleHistoryService.getVehicleLifetimeHistory(shopId, vehicleId),\n    vehiclePartCorrectionHistoryService.getVehiclePartCorrectionHistory(shopId, vehicleId),\n  ]);\n  const correctionsByOrder = new Map<string, VehicleHistoryPartCorrection[]>();\n  for (const correction of partCorrections) {\n    const existing = correctionsByOrder.get(correction.serviceOrderId);\n    if (existing) existing.push(correction); else correctionsByOrder.set(correction.serviceOrderId, [correction]);\n  }\n'
    ),
    (
        'كل أمر صيانة مع الفحص والأعمال والقطع والموافقات والفاتورة والدفعات.',
        'كل أمر صيانة مع الفحص والأعمال والقطع وتصحيحات ما بعد التسليم والموافقات والفاتورة والدفعات.'
    ),
    (
        '<OrderHistoryCard order={order} currency={currency} defaultOpen={index === 0} />',
        '<OrderHistoryCard order={order} corrections={correctionsByOrder.get(order.id) ?? []} currency={currency} defaultOpen={index === 0} />'
    ),
    (
        'function OrderHistoryCard({ order, currency, defaultOpen }: { order: VehicleHistoryOrder; currency: string; defaultOpen: boolean }) {',
        'function OrderHistoryCard({ order, corrections, currency, defaultOpen }: { order: VehicleHistoryOrder; corrections: VehicleHistoryPartCorrection[]; currency: string; defaultOpen: boolean }) {'
    ),
]

for old, new in replacements:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"vehicle history anchor mismatch ({count}): {old[:80]}")
    text = text.replace(old, new, 1)

anchor = '''      </div>\n\n      {(order.quotations.length || order.approvals.length) ?'''
insert = '''      </div>\n\n      {corrections.length ? <HistoryGroup title="تصحيحات ما بعد التسليم" icon={<RotateCcw className="h-4 w-4" />} count={corrections.length}><div className="space-y-2">{corrections.map((correction) => <div key={correction.id} className="rounded-xl border border-violet-100 bg-violet-50/30 p-3"><div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between"><div><div className="flex flex-wrap items-center gap-2"><span className="font-numeric text-xs font-black text-violet-800">{correction.correctionNumber}</span><span className="rounded-full border border-violet-200 bg-white px-2 py-0.5 text-[9px] font-black text-violet-700">{correctionReasonLabels[correction.reasonCode] ?? correction.reasonCode}</span><span className={`rounded-full border px-2 py-0.5 text-[9px] font-black ${correction.inventoryDisposition === "RETURN_TO_STOCK" ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-slate-200 bg-slate-50 text-slate-600"}`}>{correctionDispositionLabels[correction.inventoryDisposition] ?? correction.inventoryDisposition}</span></div><div className="mt-1 text-xs font-black text-slate-800">{correction.partName} • كمية {correction.quantity}</div><p className="mt-1 text-[10px] font-semibold leading-5 text-slate-600">{correction.reason}</p>{correction.notes ? <div className="mt-1 text-[10px] text-slate-400">{correction.notes}</div> : null}<div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[10px] font-bold text-slate-400"><span>{formatAutoDate(correction.createdAt)}</span>{correction.createdByName ? <span>سجلها: {correction.createdByName}</span> : null}{correction.warehouseName && correction.inventoryDisposition === "RETURN_TO_STOCK" ? <span>المستودع: {correction.warehouseName}</span> : null}{correction.creditNoteNumber ? <span className="text-violet-700">إشعار دائن: {correction.creditNoteNumber}</span> : null}</div></div><div className="shrink-0 text-left"><div className="font-numeric text-xs font-black text-slate-900">{formatAutoMoney(correction.grossAmountSnapshot, currency)}</div><div className="mt-1 text-[9px] font-bold text-slate-400">قيمة البند المتأثر</div></div></div></div>)}</div><div className="mt-3 flex justify-end"><Button asChild variant="outline" size="sm" className="text-xs font-black"><Link href={`/service-orders/${order.id}/corrections`}><RotateCcw className="ml-1.5 h-3.5 w-3.5" />فتح سجل التصحيحات</Link></Button></div></HistoryGroup> : null}\n\n      {(order.quotations.length || order.approvals.length) ?'''
count = text.count(anchor)
if count != 1:
    raise SystemExit(f"corrections insertion anchor mismatch: {count}")
text = text.replace(anchor, insert, 1)

path.write_text(text)
