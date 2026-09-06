import { ArrowRight, Link2, PackageCheck } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/page-header";
import { requirePermission } from "@/lib/auth/context";
import { purchaseReceivingService } from "@/lib/services/purchaseReceivingService";

export const dynamic = "force-dynamic";

export default async function PendingCompatibilityPage() {
  const auth = await requirePermission("inventory:read");
  const items = await purchaseReceivingService.listCompatibilityPendingItems(auth.shop.id);
  const canManage = auth.permissions.includes("inventory:manage");

  return <div className="space-y-6">
    <PageHeader
      eyebrow="المخزون • استكمال البيانات"
      title="أصناف تحتاج إكمال توافقات"
      description="أصناف جديدة تم استلامها مع اختيار إكمال التوافقات لاحقاً. لا يتم اقتراح توافق تقني أو ربطه تلقائياً من تشابه الاسم."
      actions={<Button asChild variant="outline" className="font-bold"><Link href="/inventory/purchases"><ArrowRight className="ml-1.5 h-4 w-4" />فواتير المشتريات</Link></Button>}
    />

    <div className="rounded-2xl border border-violet-200 bg-violet-50/60 p-4 text-xs font-semibold leading-6 text-violet-900 dark:border-violet-900/60 dark:bg-violet-950/25 dark:text-violet-200">
      <Link2 className="ml-1.5 inline h-4 w-4" />الربط يتم من صفحة الصنف باستخدام دليل التوافقات الموجود في مسار وبعد تأكيد المستخدم. الأصناف الموجودة لا تتغير توافقاتها بسبب فواتير شراء جديدة.
    </div>

    {items.length === 0 ? <section className="rounded-2xl border border-emerald-200 bg-emerald-50/60 p-10 text-center dark:border-emerald-900/60 dark:bg-emerald-950/20">
      <PackageCheck className="mx-auto h-8 w-8 text-emerald-600 dark:text-emerald-300" />
      <h2 className="mt-3 font-black text-emerald-900 dark:text-emerald-100">لا توجد أصناف معلقة</h2>
      <p className="mt-1 text-xs font-semibold text-emerald-700 dark:text-emerald-300">كل الأصناف الجديدة التي طلبت استكمالها لاحقاً تمت مراجعتها، أو لم يتم تعليم أي صنف للمراجعة.</p>
    </section> : <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-5 py-4 dark:border-slate-800"><div><h2 className="font-black text-slate-900 dark:text-slate-100">قائمة المتابعة</h2><p className="mt-1 text-xs font-semibold text-slate-400">{items.length} صنف يحتاج مراجعة التوافقات.</p></div></div>
      <div className="hidden overflow-x-auto md:block"><table className="erp-table min-w-[760px]"><thead><tr><th>الصنف</th><th>الباركود</th><th>SKU</th><th>التصنيف</th><th>توافقات حالية</th><th>تاريخ الإنشاء</th><th>الإجراء</th></tr></thead><tbody>{items.map((item) => <tr key={item.id}><td className="font-black text-slate-900 dark:text-slate-100">{item.name}</td><td className="font-numeric text-slate-500">{item.barcode ?? "—"}</td><td className="font-numeric text-slate-500">{item.sku ?? "—"}</td><td>{item.category ?? "غير مصنف"}</td><td className="font-numeric">{item.compatibilityCount}</td><td>{new Intl.DateTimeFormat("ar", { dateStyle: "medium" }).format(item.createdAt)}</td><td>{canManage ? <Button asChild size="sm" variant="outline" className="font-bold"><Link href={`/inventory/${item.id}#edit-inventory`}>فتح الصنف</Link></Button> : <Button asChild size="sm" variant="outline"><Link href={`/inventory/${item.id}`}>عرض</Link></Button>}</td></tr>)}</tbody></table></div>
      <div className="divide-y divide-slate-100 md:hidden dark:divide-slate-800">{items.map((item) => <article key={item.id} className="p-4"><div className="flex items-start justify-between gap-3"><div><h3 className="font-black text-slate-900 dark:text-slate-100">{item.name}</h3><div className="mt-1 text-[10px] font-semibold text-slate-400">{item.barcode ? `باركود ${item.barcode}` : "بدون باركود"}{item.sku ? ` • SKU ${item.sku}` : ""}</div></div><span className="rounded-full bg-violet-50 px-2 py-1 text-[10px] font-black text-violet-700 dark:bg-violet-950/40 dark:text-violet-200">{item.compatibilityCount} توافق</span></div><div className="mt-3 flex items-center justify-between gap-3"><span className="text-[10px] font-bold text-slate-400">{item.category ?? "غير مصنف"} • {new Intl.DateTimeFormat("ar", { dateStyle: "medium" }).format(item.createdAt)}</span><Button asChild size="sm" variant="outline" className="font-bold"><Link href={canManage ? `/inventory/${item.id}#edit-inventory` : `/inventory/${item.id}`}>{canManage ? "إكمال البيانات" : "عرض"}</Link></Button></div></article>)}</div>
    </section>}
  </div>;
}
