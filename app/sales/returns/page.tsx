import Link from "next/link";
import { RotateCcw, Search, ShoppingCart } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { requirePermission } from "@/lib/auth/context";
import { salesReturnService } from "@/lib/services/salesReturnService";
import { salesService } from "@/lib/services/salesService";
import { salesWarehouseSourceService } from "@/lib/services/salesWarehouseSourceService";

export const dynamic = "force-dynamic";

type PageProps = { searchParams: Promise<{ q?: string; created?: string }> };
const field = "h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:border-rose-400 focus:ring-2 focus:ring-rose-100";

function money(value: string | number | { toString(): string }, currency: string) {
  return new Intl.NumberFormat("ar", { style: "currency", currency, maximumFractionDigits: 2 }).format(Number(value.toString()));
}

function date(value: Date) {
  return new Intl.DateTimeFormat("ar", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

export default async function SalesReturnsPage({ searchParams }: PageProps) {
  const auth = await requirePermission("sales:return");
  const params = await searchParams;
  const q = params.q?.trim() ?? "";
  const [returns, sales, warehouseSummaries] = await Promise.all([
    salesReturnService.listSalesReturns(auth.shop.id, 100),
    salesService.listSales(auth.shop.id, { search: q || undefined }),
    salesWarehouseSourceService.listSalesReturnWarehouseSummaries(auth.shop.id),
  ]);
  const warehouseSummaryByReturnId = new Map(warehouseSummaries.map((summary) => [summary.salesReturnId, summary]));
  const eligibleSales = sales.filter((sale) => sale.status === "COMPLETED" || sale.status === "REFUNDED").slice(0, 30);

  return <div className="space-y-6">
    <PageHeader title="مرتجعات المبيعات" description="مرتجع جزئي أو كامل مع إعادة الكمية للمخزون ورد المبلغ من الحساب المالي المحدد." actions={<Button asChild variant="outline" className="font-black"><Link href="/sales"><ShoppingCart className="ml-1 h-4 w-4" />المبيعات</Link></Button>} />

    {params.created ? <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-black text-emerald-800">تم تنفيذ المرتجع بنجاح: {params.created}</div> : null}

    <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-100 p-5"><h2 className="font-black text-slate-950">اختيار عملية البيع</h2><p className="mt-1 text-xs font-semibold text-slate-500">ابحث برقم الإيصال أو اسم العميل ثم افتح نموذج المرتجع.</p></div>
      <form className="flex gap-2 p-4"><div className="relative flex-1"><Search className="absolute right-3 top-3 h-4 w-4 text-slate-400" /><input name="q" className={`${field} pr-9`} defaultValue={q} placeholder="رقم الإيصال أو اسم العميل" /></div><Button type="submit" variant="outline" className="font-black">بحث</Button></form>
      <div className="divide-y divide-slate-100">
        {eligibleSales.map((sale) => <div key={sale.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between"><div><div className="font-black text-slate-900">{sale.receiptNumber || sale.id.slice(0, 8)}</div><div className="mt-1 text-xs font-bold text-slate-500">{sale.customer?.name || "عميل نقدي"} • {sale._count.items} بنود • {money(sale.total, auth.shop.currency)}</div></div><Button asChild size="sm" className="font-black"><Link href={`/sales/returns/new?saleId=${sale.id}`}><RotateCcw className="ml-1 h-4 w-4" />إنشاء مرتجع</Link></Button></div>)}
      </div>
      {!eligibleSales.length ? <div className="p-8 text-center text-sm font-bold text-slate-400">لا توجد مبيعات مطابقة قابلة للمرتجع.</div> : null}
    </section>

    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-100 p-4 font-black text-slate-950">سجل المرتجعات</div>
      <div className="overflow-x-auto"><table className="min-w-[1000px] w-full text-sm"><thead className="bg-slate-50 text-xs text-slate-500"><tr><th className="p-3 text-right">رقم المرتجع</th><th className="p-3 text-right">الإيصال</th><th className="p-3 text-right">العميل</th><th className="p-3 text-right">السبب</th><th className="p-3 text-center">الكمية</th><th className="p-3 text-right">المستودع</th><th className="p-3 text-right">القيمة</th><th className="p-3 text-right">طريقة الرد</th><th className="p-3 text-right">التاريخ</th></tr></thead><tbody className="divide-y divide-slate-100">{returns.map((row) => {
        const warehouseSummary = warehouseSummaryByReturnId.get(row.id);
        const warehouseText = warehouseSummary?.warehouseNames.length ? warehouseSummary.warehouseNames.join("، ") : warehouseSummary?.nonRestockedCount ? "بدون إعادة للمخزون" : "غير موثق";
        return <tr key={row.id}><td className="p-3 font-black text-rose-700">{row.returnNumber}</td><td className="p-3 font-bold text-slate-800">{row.receiptNumber || "-"}</td><td className="p-3 text-slate-600">{row.customerName || "عميل نقدي"}</td><td className="p-3 text-xs font-semibold text-slate-600">{row.reason}</td><td className="p-3 text-center font-black">{row.totalQuantity}</td><td className="p-3 text-xs font-black text-slate-600"><div>{warehouseText}</div>{warehouseSummary && warehouseSummary.nonRestockedCount > 0 && warehouseSummary.warehouseNames.length > 0 ? <div className="mt-1 text-[10px] font-semibold text-amber-700">{warehouseSummary.nonRestockedCount} بند بدون إعادة للمخزون</div> : null}</td><td className="p-3 font-black text-slate-900">{money(row.total, auth.shop.currency)}</td><td className="p-3 text-xs font-black text-slate-600">{row.refundAccountType || "-"}</td><td className="p-3 text-xs text-slate-500">{date(row.returnedAt)}</td></tr>;
      })}</tbody></table></div>
      {!returns.length ? <div className="p-8 text-center text-sm font-bold text-slate-400">لا توجد مرتجعات مسجلة بعد.</div> : null}
    </section>
  </div>;
}
