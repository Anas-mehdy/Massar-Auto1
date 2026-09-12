from pathlib import Path

# Vehicle history: include warranty/comeback/rework claims under the original visit.
vehicle_path = Path("app/vehicles/[id]/_vehicle-history.tsx")
text = vehicle_path.read_text()
replacements = [
    (
        'import { Banknote, CalendarDays, CarFront, CheckCircle2, ClipboardCheck, FileText, Gauge, Package, ReceiptText, RotateCcw, UserRoundCog, Wrench } from "lucide-react";',
        'import { Banknote, CalendarDays, CarFront, CheckCircle2, ClipboardCheck, FileText, Gauge, Package, ReceiptText, RotateCcw, ShieldCheck, UserRoundCog, Wrench } from "lucide-react";'
    ),
    (
        'import { vehiclePartCorrectionHistoryService } from "@/lib/services/vehiclePartCorrectionHistoryService";\n',
        'import { vehiclePartCorrectionHistoryService } from "@/lib/services/vehiclePartCorrectionHistoryService";\nimport type { VehicleWarrantyClaimHistoryRow } from "@/lib/services/vehicleWarrantyClaimHistoryService";\nimport { vehicleWarrantyClaimHistoryService } from "@/lib/services/vehicleWarrantyClaimHistoryService";\n'
    ),
    (
        'const correctionDispositionLabels: Record<string, string> = { RETURN_TO_STOCK: "أعيدت للمخزون", NO_STOCK_CHANGE: "توثيق بدون تغيير مخزون" };\n',
        'const correctionDispositionLabels: Record<string, string> = { RETURN_TO_STOCK: "أعيدت للمخزون", NO_STOCK_CHANGE: "توثيق بدون تغيير مخزون" };\nconst warrantyTypeLabels: Record<string, string> = { WARRANTY: "ضمان", COMEBACK: "عودة للمركز", REWORK: "إعادة عمل" };\nconst warrantyStatusLabels: Record<string, string> = { OPEN: "مفتوحة", APPROVED: "معتمدة", REJECTED: "مرفوضة", IN_SERVICE: "قيد المعالجة", RESOLVED: "محلولة", CLOSED: "مغلقة" };\nconst warrantyCoverageLabels: Record<string, string> = { PENDING: "بانتظار القرار", COVERED: "مغطاة", PARTIAL: "تغطية جزئية", CUSTOMER_PAY: "على حساب العميل", NOT_APPLICABLE: "لا ينطبق" };\n'
    ),
    (
        '  const [{ metrics, orders }, partCorrections] = await Promise.all([\n    vehicleHistoryService.getVehicleLifetimeHistory(shopId, vehicleId),\n    vehiclePartCorrectionHistoryService.getVehiclePartCorrectionHistory(shopId, vehicleId),\n  ]);',
        '  const [{ metrics, orders }, partCorrections, warrantyClaims] = await Promise.all([\n    vehicleHistoryService.getVehicleLifetimeHistory(shopId, vehicleId),\n    vehiclePartCorrectionHistoryService.getVehiclePartCorrectionHistory(shopId, vehicleId),\n    vehicleWarrantyClaimHistoryService.getVehicleWarrantyClaimHistory(shopId, vehicleId),\n  ]);'
    ),
    (
        '  for (const correction of partCorrections) {\n    const existing = correctionsByOrder.get(correction.serviceOrderId);\n    if (existing) existing.push(correction); else correctionsByOrder.set(correction.serviceOrderId, [correction]);\n  }\n',
        '  for (const correction of partCorrections) {\n    const existing = correctionsByOrder.get(correction.serviceOrderId);\n    if (existing) existing.push(correction); else correctionsByOrder.set(correction.serviceOrderId, [correction]);\n  }\n  const warrantyClaimsByOrder = new Map<string, VehicleWarrantyClaimHistoryRow[]>();\n  for (const claim of warrantyClaims) {\n    const existing = warrantyClaimsByOrder.get(claim.originalServiceOrderId);\n    if (existing) existing.push(claim); else warrantyClaimsByOrder.set(claim.originalServiceOrderId, [claim]);\n  }\n'
    ),
    (
        'كل أمر صيانة مع الفحص والأعمال والقطع وتصحيحات ما بعد التسليم والموافقات والفاتورة والدفعات.',
        'كل أمر صيانة مع الفحص والأعمال والقطع والضمان/العودة وتصحيحات ما بعد التسليم والموافقات والفاتورة والدفعات.'
    ),
    (
        '<OrderHistoryCard order={order} corrections={correctionsByOrder.get(order.id) ?? []} currency={currency} defaultOpen={index === 0} />',
        '<OrderHistoryCard order={order} corrections={correctionsByOrder.get(order.id) ?? []} warrantyClaims={warrantyClaimsByOrder.get(order.id) ?? []} currency={currency} defaultOpen={index === 0} />'
    ),
    (
        'function OrderHistoryCard({ order, corrections, currency, defaultOpen }: { order: VehicleHistoryOrder; corrections: VehicleHistoryPartCorrection[]; currency: string; defaultOpen: boolean }) {',
        'function OrderHistoryCard({ order, corrections, warrantyClaims, currency, defaultOpen }: { order: VehicleHistoryOrder; corrections: VehicleHistoryPartCorrection[]; warrantyClaims: VehicleWarrantyClaimHistoryRow[]; currency: string; defaultOpen: boolean }) {'
    ),
]
for old, new in replacements:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"vehicle warranty anchor mismatch ({count}): {old[:90]}")
    text = text.replace(old, new, 1)

anchor = '''      {corrections.length ? <HistoryGroup title="تصحيحات ما بعد التسليم"'''
warranty_block = '''      {warrantyClaims.length ? <HistoryGroup title="الضمان والعودة للصيانة" icon={<ShieldCheck className="h-4 w-4" />} count={warrantyClaims.length}><div className="space-y-2">{warrantyClaims.map((claim) => <div key={claim.id} className="rounded-xl border border-cyan-100 bg-cyan-50/30 p-3"><div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between"><div><div className="flex flex-wrap items-center gap-2"><span className="font-numeric text-xs font-black text-cyan-900">{claim.claimNumber}</span><span className="rounded-full border border-cyan-200 bg-white px-2 py-0.5 text-[9px] font-black text-cyan-800">{warrantyTypeLabels[claim.claimType] ?? claim.claimType}</span><span className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[9px] font-black text-slate-600">{warrantyStatusLabels[claim.status] ?? claim.status}</span><span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[9px] font-black text-emerald-700">{warrantyCoverageLabels[claim.coverageDecision] ?? claim.coverageDecision}</span></div><p className="mt-2 text-xs font-bold leading-6 text-slate-700">{claim.reportedIssue}</p><div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[10px] font-semibold text-slate-500">{claim.partName ? <span>قطعة: {claim.partName}</span> : null}{claim.laborDescription ? <span>عمل: {claim.laborDescription}</span> : null}{claim.warrantyEndsAt ? <span>الضمان حتى: {formatAutoDate(claim.warrantyEndsAt)}</span> : null}{claim.createdByName ? <span>سجلها: {claim.createdByName}</span> : null}</div>{claim.assessment ? <div className="mt-2 text-[10px] leading-5 text-slate-500"><span className="font-black">التقييم: </span>{claim.assessment}</div> : null}{claim.resolution ? <div className="mt-1 text-[10px] leading-5 text-emerald-700"><span className="font-black">الحل: </span>{claim.resolution}</div> : null}</div><div className="shrink-0 text-left"><div className="text-[10px] font-bold text-slate-400">فتح {formatAutoDate(claim.openedAt)}</div>{claim.customerCharge > 0 ? <div className="mt-1 font-numeric text-xs font-black text-amber-700">على العميل: {formatAutoMoney(claim.customerCharge, currency)}</div> : null}{claim.followUpServiceOrderId ? <Button asChild variant="outline" size="sm" className="mt-2 text-[10px] font-black"><Link href={`/service-orders/${claim.followUpServiceOrderId}`}>{claim.followUpOrderNumber ?? "أمر المتابعة"}</Link></Button> : null}</div></div></div>)}</div><div className="mt-3 flex justify-end"><Button asChild variant="outline" size="sm" className="text-xs font-black"><Link href={`/service-orders/${order.id}/warranty`}><ShieldCheck className="ml-1.5 h-3.5 w-3.5" />فتح سجل الضمان والعودة</Link></Button></div></HistoryGroup> : null}\n\n'''
count = text.count(anchor)
if count != 1:
    raise SystemExit(f"vehicle warranty insertion anchor mismatch: {count}")
text = text.replace(anchor, warranty_block + anchor, 1)
vehicle_path.write_text(text)

# Follow-up ServiceOrder: show its warranty claim and original order context.
order_path = Path("app/service-orders/[id]/page.tsx")
text = order_path.read_text()
old = 'import { servicePartInventoryService } from "@/lib/services/servicePartInventoryService";\n'
new = old + 'import { serviceWarrantyLinkService } from "@/lib/services/serviceWarrantyLinkService";\n'
if text.count(old) != 1:
    raise SystemExit(f"order import anchor mismatch: {text.count(old)}")
text = text.replace(old, new, 1)

old = '''  const [order, inspections, inventoryChoices, technicians, invoice] = await Promise.all([
    autoServiceOrderService.getServiceOrderById(auth.shop.id, id),
    serviceInspectionService.listServiceInspections(auth.shop.id, id),
    servicePartInventoryService.listServicePartInventoryChoices(auth.shop.id),
    serviceOrderWorkflowService.listAssignableTechnicians(auth.shop.id),
    autoInvoiceService.getServiceOrderInvoice(auth.shop.id, id),
  ]);'''
new = '''  const [order, inspections, inventoryChoices, technicians, invoice, warrantyFollowUpLink] = await Promise.all([
    autoServiceOrderService.getServiceOrderById(auth.shop.id, id),
    serviceInspectionService.listServiceInspections(auth.shop.id, id),
    servicePartInventoryService.listServicePartInventoryChoices(auth.shop.id),
    serviceOrderWorkflowService.listAssignableTechnicians(auth.shop.id),
    autoInvoiceService.getServiceOrderInvoice(auth.shop.id, id),
    serviceWarrantyLinkService.getWarrantyFollowUpLink(auth.shop.id, id),
  ]);'''
if text.count(old) != 1:
    raise SystemExit(f"order promise anchor mismatch: {text.count(old)}")
text = text.replace(old, new, 1)

anchor = '''      />\n\n      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">'''
banner = '''      />\n\n      {warrantyFollowUpLink ? <section className="rounded-2xl border border-cyan-200 bg-cyan-50/70 p-4 shadow-sm"><div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div className="flex items-start gap-3"><ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-cyan-700" /><div><div className="font-black text-cyan-950">أمر متابعة ضمان / عودة للصيانة</div><div className="mt-1 text-xs font-bold leading-6 text-cyan-800">هذا الأمر مرتبط بالمطالبة {warrantyFollowUpLink.claimNumber} وبالأمر الأصلي {warrantyFollowUpLink.originalOrderNumber}. التغطية: {warrantyFollowUpLink.coverageDecision}.</div></div></div><div className="flex flex-wrap gap-2"><Button asChild size="sm" variant="outline" className="border-cyan-300 font-black text-cyan-800"><Link href={`/service-orders/${warrantyFollowUpLink.originalServiceOrderId}/warranty`}><ShieldCheck className="ml-1.5 h-4 w-4" />المطالبة</Link></Button><Button asChild size="sm" variant="outline" className="font-black"><Link href={`/service-orders/${warrantyFollowUpLink.originalServiceOrderId}`}>الأمر الأصلي</Link></Button></div></div></section> : null}\n\n      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">'''
if text.count(anchor) != 1:
    raise SystemExit(f"order banner anchor mismatch: {text.count(anchor)}")
text = text.replace(anchor, banner, 1)
order_path.write_text(text)
