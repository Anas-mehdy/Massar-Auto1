import { Boxes, CircleDollarSign, Hash, PackageX, Search, Undo2, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/page-header";
import { requirePermission } from "@/lib/auth/context";
import { formatCurrency, formatDateTime } from "@/lib/format";
import { getInventoryDamageReport } from "@/lib/services/inventoryDamageReportService";
import { dateInputEndUtcForTimeZone, dateInputStartUtcForTimeZone, dateInputValueForTimeZone, dayUtcBoundsForTimeZone, localDateParts, monthUtcBoundsForTimeZone, timeZoneForCountry, yearUtcBoundsForTimeZone, zonedDateTimeToUtc } from "@/lib/timezone";

export const dynamic = "force-dynamic";

type DamagesPageProps = { searchParams: Promise<{ preset?: string; start?: string; end?: string; q?: string }> };
type ResolvedRange = { preset: "all" | "today" | "week" | "month" | "year" | "custom"; start?: Date; end?: Date; label: string };

function localDayShift(reference: Date, days: number, timeZone: string) {
  const local = localDateParts(reference, timeZone);
  const shifted = new Date(Date.UTC(local.year, local.month - 1, local.day + days));
  return zonedDateTimeToUtc({ year: shifted.getUTCFullYear(), month: shifted.getUTCMonth() + 1, day: shifted.getUTCDate() }, timeZone);
}

function resolveRange(params: Awaited<DamagesPageProps["searchParams"]>, timeZone: string): ResolvedRange {
  const now = new Date();
  const today = dayUtcBoundsForTimeZone(now, timeZone);
  const requestedPreset = params.preset;
  const preset: ResolvedRange["preset"] = ["all", "today", "week", "month", "year", "custom"].includes(requestedPreset ?? "") ? requestedPreset as ResolvedRange["preset"] : "all";
  if (preset === "today") return { preset, start: today.start, end: today.end, label: "اليوم" };
  if (preset === "week") return { preset, start: localDayShift(now, -6, timeZone), end: today.end, label: "آخر 7 أيام" };
  if (preset === "month") { const month = monthUtcBoundsForTimeZone(now, timeZone); return { preset, start: month.start, end: today.end, label: "هذا الشهر" }; }
  if (preset === "year") { const year = yearUtcBoundsForTimeZone(now, timeZone); return { preset, start: year.start, end: today.end, label: "هذه السنة" }; }
  if (preset === "custom" && params.start && params.end) {
    const start = dateInputStartUtcForTimeZone(params.start, timeZone); const end = dateInputEndUtcForTimeZone(params.end, timeZone);
    if (start && end && start < end) return { preset, start, end, label: "فترة مخصصة" };
  }
  return { preset: "all", label: "كل السجل" };
}

export default async function DamagesPage({ searchParams }: DamagesPageProps) {
  const params = await searchParams;
  const auth = await requirePermission("reports:read");
  const timeZone = timeZoneForCountry(auth.shop.countryCode);
  const range = resolveRange(params, timeZone);
  const q = params.q?.trim() ?? "";
  const currency = auth.shop.currency || "SAR";
  const report = await getInventoryDamageReport(auth.shop.id, { start: range.start, end: range.end, search: q || undefined });
  const month = monthUtcBoundsForTimeZone(new Date(), timeZone);
  const customStartInput = params.start || dateInputValueForTimeZone(month.start, timeZone);
  const customEndInput = params.end || dateInputValueForTimeZone(new Date(), timeZone);
  const clearSearch = new URLSearchParams({ preset: range.preset });
  if (range.preset === "custom" && params.start && params.end) { clearSearch.set("start", params.start); clearSearch.set("end", params.end); }

  return <div className="space-y-7">
    <PageHeader eyebrow="المخزون والتكاليف" title="سجل التوالف" description="سجل كامل لكل قطعة تم تسجيلها كتالف، مع الكمية والتكلفة وقت التلف والسبب والملاحظة والمستخدم الذي سجل العملية." actions={<Button asChild variant="outline" className="rounded-xl font-bold"><Link href="/reports"><Undo2 className="ml-2 h-4 w-4" />العودة للتقارير والأرباح</Link></Button>} />
    <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <SummaryCard label="إجمالي قيمة التوالف" value={formatCurrency(report.summary.totalValue, currency)} helper={`ضمن ${range.label}`} icon={CircleDollarSign} />
      <SummaryCard label="عدد القطع التالفة" value={String(report.summary.damagedUnits)} helper="مجموع الوحدات المسجلة كتالف" icon={PackageX} />
      <SummaryCard label="حركات التوالف" value={String(report.summary.movementCount)} helper="عدد عمليات تسجيل التلف" icon={Hash} />
      <SummaryCard label="أصناف متضررة" value={String(report.summary.itemCount)} helper="عدد أصناف المخزون المختلفة" icon={Boxes} />
    </section>
    <section className="erp-filter-card space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-xs font-black text-slate-800 dark:text-slate-100">الفترة المعروضة: {range.label}</p><p className="mt-1 text-[10px] font-bold text-slate-400">{range.start && range.end ? `${formatDateTime(range.start, timeZone)} — ${formatDateTime(new Date(range.end.getTime() - 1), timeZone)}` : "يعرض كامل تاريخ التوالف المسجل للمتجر"}</p></div><div className="flex flex-wrap gap-2">{[["all","الكل"],["today","اليوم"],["week","7 أيام"],["month","هذا الشهر"],["year","هذه السنة"]].map(([value,label])=>{const search=new URLSearchParams({preset:value});if(q)search.set("q",q);return <Button key={value} asChild size="sm" variant={range.preset===value?"default":"outline"} className="rounded-xl text-xs font-bold"><Link href={`/reports/damages?${search.toString()}`}>{label}</Link></Button>})}</div></div>
      <form className="grid gap-3 border-t border-slate-100 pt-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end"><input type="hidden" name="preset" value="custom" />{q?<input type="hidden" name="q" value={q}/>:null}<label className="grid gap-1.5 text-xs font-bold text-slate-600 dark:text-slate-300">من تاريخ<input className="erp-input" type="date" name="start" defaultValue={customStartInput} required /></label><label className="grid gap-1.5 text-xs font-bold text-slate-600 dark:text-slate-300">إلى تاريخ<input className="erp-input" type="date" name="end" defaultValue={customEndInput} required /></label><Button type="submit" className="h-11 rounded-xl font-bold">عرض الفترة</Button></form>
      <form className="grid gap-3 border-t border-slate-100 pt-4 sm:grid-cols-[1fr_auto_auto] sm:items-end"><input type="hidden" name="preset" value={range.preset}/>{range.preset==="custom"&&params.start&&params.end?<><input type="hidden" name="start" value={params.start}/><input type="hidden" name="end" value={params.end}/></>:null}<label className="grid gap-1.5 text-xs font-bold text-slate-600 dark:text-slate-300">بحث في السجل<input className="erp-input" type="search" name="q" defaultValue={q} placeholder="اسم القطعة، SKU، باركود، سبب التلف، ملاحظة أو اسم المستخدم..." /></label><Button type="submit" variant="secondary" className="h-11 rounded-xl font-bold"><Search className="ml-2 h-4 w-4"/>بحث</Button>{q?<Button asChild variant="outline" className="h-11 rounded-xl font-bold"><Link href={`/reports/damages?${clearSearch.toString()}`}>مسح البحث</Link></Button>:null}</form>
    </section>
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950"><div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-4 dark:border-slate-800"><div><h2 className="text-sm font-black text-slate-900 dark:text-slate-100">تفاصيل التوالف</h2><p className="mt-1 text-[10px] font-bold text-slate-400">{q?`نتائج البحث عن “${q}” — `:""}{report.rows.length} سجل</p></div><p className="text-[10px] font-bold text-rose-600">قيمة التالف تعتمد على تكلفة القطعة المحفوظة لحظة تسجيل التلف.</p></div>{report.rows.length===0?<div className="flex min-h-56 flex-col items-center justify-center gap-3 px-6 py-12 text-center"><span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-500 dark:bg-slate-900 dark:text-slate-400"><PackageX className="h-6 w-6"/></span><div><p className="text-sm font-black text-slate-800 dark:text-slate-100">لا توجد توالف ضمن هذه النتائج</p><p className="mt-1 text-xs font-medium text-slate-400">غيّر الفترة أو امسح البحث لعرض سجلات أخرى.</p></div></div>:<div className="overflow-x-auto"><table className="erp-table min-w-[1180px]"><thead><tr><th>التاريخ</th><th>القطعة</th><th className="text-center">الكمية</th><th>تكلفة الوحدة وقت التلف</th><th>إجمالي الخسارة</th><th>سبب التلف</th><th>الملاحظة</th><th>سجلها</th></tr></thead><tbody>{report.rows.map(row=><tr key={row.id} className="align-top"><td className="whitespace-nowrap font-numeric text-xs font-bold text-slate-500">{formatDateTime(row.createdAt,timeZone)}</td><td><Link href={`/inventory/${row.inventoryItemId}`} className="font-black text-slate-900 hover:text-primary hover:underline dark:text-slate-100">{row.itemName}</Link><div className="mt-1 flex max-w-[280px] flex-wrap gap-x-2 gap-y-1 text-[10px] font-bold text-slate-400">{row.category?<span>{row.category}</span>:null}{row.sku?<span>SKU: {row.sku}</span>:null}{row.barcode?<span>باركود: {row.barcode}</span>:null}</div></td><td className="text-center font-numeric text-sm font-black text-rose-700">{row.quantity}</td><td className="whitespace-nowrap font-numeric text-xs font-bold text-slate-700 dark:text-slate-300">{formatCurrency(row.unitCostSnapshot,currency)}</td><td className="whitespace-nowrap font-numeric text-xs font-black text-rose-700">{formatCurrency(row.totalValue,currency)}</td><td className="max-w-[220px] text-xs font-bold text-slate-700 dark:text-slate-300">{row.reason}</td><td className="max-w-[260px] text-xs font-medium text-slate-500 dark:text-slate-400">{row.note||"-"}</td><td className="max-w-[180px] text-xs font-bold text-slate-600 dark:text-slate-300">{row.createdByName||row.createdByEmail||"غير معروف"}</td></tr>)}</tbody></table></div>}</section>
  </div>;
}

function SummaryCard({label,value,helper,icon:Icon}:{label:string;value:string;helper:string;icon:LucideIcon}) { return <div className="rounded-2xl border border-rose-100 bg-rose-50 p-5 text-rose-700 shadow-sm dark:border-rose-900/60 dark:bg-rose-950/20 dark:text-rose-300"><div className="flex items-start justify-between gap-3"><div><p className="text-[11px] font-black opacity-80">{label}</p><p className="mt-2 break-words font-numeric text-xl font-black text-slate-900 dark:text-slate-100">{value}</p><p className="mt-2 text-[10px] font-bold opacity-70">{helper}</p></div><div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/80 shadow-sm dark:bg-slate-900/80"><Icon className="h-5 w-5"/></div></div></div> }
