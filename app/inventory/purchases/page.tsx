import { Eye, Link2, PackageCheck, Plus, Search } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/page-header";
import { requirePermission } from "@/lib/auth/context";
import { formatCurrency } from "@/lib/format";
import { purchaseReceivingService } from "@/lib/services/purchaseReceivingService";

export const dynamic = "force-dynamic";
type PurchaseListPageProps = { searchParams: Promise<{ search?: string; status?: string; deleted?: string }> };

function statusLabel(status: string, paid: number, balance: number) {
  if (status === "DRAFT") return { label: "مسودة", cls: "border-slate-200 bg-slate-100 text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200" };
  if (balance <= 0.009) return { label: "معتمدة • مدفوعة", cls: "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/35 dark:text-emerald-300" };
  if (paid > 0) return { label: "معتمدة • جزئي", cls: "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950/35 dark:text-amber-300" };
  return { label: "معتمدة • آجلة", cls: "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900 dark:bg-rose-950/35 dark:text-rose-300" };
}

function receiptStatusView(status: "NONE" | "PARTIAL" | "COMPLETE", invoiceStatus: string) {
  if (invoiceStatus === "DRAFT") return { label: "لم يُعتمد", cls: "border-slate-200 bg-white text-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400" };
  if (status === "COMPLETE") return { label: "مستلمة بالكامل", cls: "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/35 dark:text-emerald-300" };
  if (status === "PARTIAL") return { label: "استلام جزئي", cls: "border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-900 dark:bg-sky-950/35 dark:text-sky-300" };
  return { label: "لم تُستلم", cls: "border-violet-200 bg-violet-50 text-violet-700 dark:border-violet-900 dark:bg-violet-950/35 dark:text-violet-300" };
}

export default async function PurchaseListPage({ searchParams }: PurchaseListPageProps) {
  const params = await searchParams;
  const auth = await requirePermission("inventory:read");
  const canManage = auth.permissions.includes("inventory:manage");
  const status = ["DRAFT","POSTED","PAID","PARTIAL","UNPAID"].includes(params.status ?? "") ? params.status as "DRAFT"|"POSTED"|"PAID"|"PARTIAL"|"UNPAID" : "";
  const invoices = await purchaseReceivingService.listPurchaseInvoices(auth.shop.id, { search: params.search, status });

  return <div className="space-y-6">
    <PageHeader
      eyebrow="المخزون • التوريد"
      title="فواتير المشتريات"
      description="مسودات واستلامات الموردين، مع فصل حالة السداد عن حالة وصول البضاعة."
      actions={<div className="flex flex-wrap gap-2"><Button asChild variant="outline" className="font-bold"><Link href="/inventory/purchases/pending-compatibility"><Link2 className="ml-1.5 h-4 w-4" />تحتاج إكمال توافقات</Link></Button>{canManage ? <Button asChild className="font-black"><Link href="/inventory/purchases/new"><Plus className="ml-1.5 h-4 w-4" />استلام بضاعة</Link></Button> : null}</div>}
    />
    {params.deleted && <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-bold text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200">تم حذف المسودة بدون أي أثر على المخزون أو الحسابات.</div>}
    <form className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:grid-cols-[1fr_220px_auto] sm:items-end dark:border-slate-800 dark:bg-slate-900">
      <label className="grid gap-1.5 text-xs font-black text-slate-600 dark:text-slate-300">بحث بالمورد أو رقم الفاتورة<div className="relative"><Search className="absolute right-3 top-3.5 h-4 w-4 text-slate-400" /><input name="search" defaultValue={params.search ?? ""} className="erp-input pr-10" placeholder="اسم المورد أو رقم فاتورته…" /></div></label>
      <label className="grid gap-1.5 text-xs font-black text-slate-600 dark:text-slate-300">الحالة<select name="status" defaultValue={status} className="erp-input"><option value="">كل الحالات</option><option value="DRAFT">مسودة</option><option value="POSTED">كل المعتمدة</option><option value="PAID">مدفوعة بالكامل</option><option value="PARTIAL">مدفوعة جزئياً</option><option value="UNPAID">آجلة بالكامل</option></select></label>
      <Button type="submit" variant="outline" className="h-11 font-bold"><Search className="ml-1.5 h-4 w-4" />بحث</Button>
    </form>

    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
      {invoices.length === 0 ? <div className="p-12 text-center"><PackageCheck className="mx-auto h-9 w-9 text-slate-300" /><h2 className="mt-3 text-sm font-black text-slate-700 dark:text-slate-200">لا توجد فواتير مشتريات مطابقة</h2>{canManage && <Button asChild className="mt-4"><Link href="/inventory/purchases/new">إنشاء أول استلام</Link></Button>}</div> : <>
        <div className="hidden overflow-x-auto md:block"><table className="erp-table min-w-[980px]"><thead><tr><th>المورد</th><th>رقم فاتورة المورد</th><th>التاريخ</th><th>البنود</th><th>الإجمالي</th><th>المدفوع</th><th>المتبقي</th><th>السداد</th><th>الاستلام</th><th></th></tr></thead><tbody>{invoices.map((invoice) => { const statusView = statusLabel(invoice.status, Number(invoice.amountPaid), Number(invoice.balanceDue)); const receiptView = receiptStatusView(invoice.receiptStatus, invoice.status); return <tr key={invoice.id}><td className="font-black text-slate-900 dark:text-slate-100">{invoice.supplierName ?? "مورد نقدي غير مسجل"}</td><td className="font-numeric text-slate-600 dark:text-slate-300">{invoice.supplierInvoiceNumber ?? "—"}</td><td className="font-numeric text-slate-600 dark:text-slate-300">{new Intl.DateTimeFormat("ar", { dateStyle: "medium" }).format(invoice.invoiceDate)}</td><td className="font-numeric font-bold">{invoice.itemCount}</td><td className="font-numeric font-black">{formatCurrency(Number(invoice.total), invoice.currency)}</td><td className="font-numeric">{formatCurrency(Number(invoice.amountPaid), invoice.currency)}</td><td className="font-numeric font-black">{formatCurrency(Number(invoice.balanceDue), invoice.currency)}</td><td><span className={`rounded-full border px-2.5 py-1 text-[10px] font-black ${statusView.cls}`}>{statusView.label}</span></td><td><span className={`rounded-full border px-2.5 py-1 text-[10px] font-black ${receiptView.cls}`}>{receiptView.label}</span></td><td><Button asChild variant="outline" size="sm"><Link href={invoice.status === "DRAFT" && canManage ? `/inventory/purchases/new?draft=${invoice.id}` : `/inventory/purchases/${invoice.id}`}><Eye className="ml-1 h-3.5 w-3.5" />{invoice.status === "DRAFT" && canManage ? "متابعة" : "تفاصيل"}</Link></Button></td></tr>; })}</tbody></table></div>
        <div className="divide-y divide-slate-100 md:hidden dark:divide-slate-800">{invoices.map((invoice) => { const statusView = statusLabel(invoice.status, Number(invoice.amountPaid), Number(invoice.balanceDue)); const receiptView = receiptStatusView(invoice.receiptStatus, invoice.status); return <article key={invoice.id} className="space-y-3 p-4"><div className="flex items-start justify-between gap-3"><div><div className="font-black text-slate-900 dark:text-slate-100">{invoice.supplierName ?? "مورد نقدي غير مسجل"}</div><div className="mt-1 text-xs font-semibold text-slate-400">{invoice.supplierInvoiceNumber ? `فاتورة ${invoice.supplierInvoiceNumber}` : "بدون رقم فاتورة"} • {invoice.itemCount} بند</div></div><div className="flex shrink-0 flex-col items-end gap-1"><span className={`rounded-full border px-2 py-1 text-[9px] font-black ${statusView.cls}`}>{statusView.label}</span><span className={`rounded-full border px-2 py-1 text-[9px] font-black ${receiptView.cls}`}>{receiptView.label}</span></div></div><div className="grid grid-cols-3 gap-2 rounded-xl bg-slate-50 p-3 text-center dark:bg-slate-950/50"><Mini label="الإجمالي" value={formatCurrency(Number(invoice.total), invoice.currency)} /><Mini label="المدفوع" value={formatCurrency(Number(invoice.amountPaid), invoice.currency)} /><Mini label="المتبقي" value={formatCurrency(Number(invoice.balanceDue), invoice.currency)} /></div><Button asChild variant="outline" className="w-full"><Link href={invoice.status === "DRAFT" && canManage ? `/inventory/purchases/new?draft=${invoice.id}` : `/inventory/purchases/${invoice.id}`}>{invoice.status === "DRAFT" && canManage ? "متابعة المسودة" : "فتح التفاصيل"}</Link></Button></article>; })}</div>
      </>}
    </section>
  </div>;
}

function Mini({ label, value }: { label: string; value: string }) { return <div><div className="text-[9px] font-bold text-slate-400">{label}</div><div className="mt-1 truncate font-numeric text-[10px] font-black text-slate-700 dark:text-slate-200">{value}</div></div>; }
