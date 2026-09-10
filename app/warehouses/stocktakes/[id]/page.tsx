import Link from "next/link";
import { ArrowRight, CheckCircle2, ClipboardCheck } from "lucide-react";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { requirePermission } from "@/lib/auth/context";
import { warehouseQueryService } from "@/lib/services/warehouseQueryService";
import { postStockTakeAction, updateStockTakeLineAction } from "../../actions";

export const dynamic = "force-dynamic";
type PageProps = { params: Promise<{ id: string }> };

export default async function StockTakePage({ params }: PageProps) {
  const auth = await requirePermission("warehouse:stocktake");
  const { id } = await params;
  const stockTake = await warehouseQueryService.getStockTake(auth.shop.id, id);
  if (!stockTake) notFound();
  const editable = stockTake.status === "COUNTING" || stockTake.status === "DRAFT";
  const differences = stockTake.lines.filter((line) => Number(line.difference) !== 0);

  return <div className="space-y-6">
    <PageHeader
      title={stockTake.stockTakeNumber}
      description={`${stockTake.warehouseName} — ${editable ? "الجرد قيد العد" : "تم اعتماد الجرد"}`}
      actions={<Button asChild variant="outline" className="font-black"><Link href={`/warehouses?warehouse=${stockTake.warehouseId}`}><ArrowRight className="ml-1 h-4 w-4" />المستودعات</Link></Button>}
    />

    <div className="grid gap-3 sm:grid-cols-3">
      <div className="rounded-2xl border border-slate-200 bg-white p-4"><div className="text-xs font-black text-slate-500">عدد الأصناف</div><div className="mt-1 text-2xl font-black text-slate-950">{stockTake.lines.length}</div></div>
      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4"><div className="text-xs font-black text-amber-700">أصناف بفروقات</div><div className="mt-1 text-2xl font-black text-amber-900">{differences.length}</div></div>
      <div className="rounded-2xl border border-slate-200 bg-white p-4"><div className="text-xs font-black text-slate-500">الحالة</div><div className="mt-1 text-lg font-black text-slate-950">{stockTake.status}</div></div>
    </div>

    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-100 p-5"><h2 className="flex items-center gap-2 font-black text-slate-950"><ClipboardCheck className="h-4 w-4 text-emerald-700" />بنود الجرد</h2><p className="mt-1 text-xs font-semibold text-slate-500">أدخل الكمية الفعلية لكل قطعة. النظام يحسب الفرق عن Snapshot بداية الجرد.</p></div>
      <div className="overflow-x-auto">
        <table className="min-w-[760px] w-full text-sm">
          <thead className="bg-slate-50 text-xs text-slate-500"><tr><th className="p-3 text-right">القطعة</th><th className="p-3 text-right">SKU / باركود</th><th className="p-3 text-center">كمية النظام</th><th className="p-3 text-center">الكمية الفعلية</th><th className="p-3 text-center">الفرق</th><th className="p-3 text-center">حفظ</th></tr></thead>
          <tbody className="divide-y divide-slate-100">
            {stockTake.lines.map((line) => <tr key={line.id} className={Number(line.difference) !== 0 ? "bg-amber-50/40" : undefined}>
              <td className="p-3 font-black text-slate-900">{line.itemName}</td>
              <td className="p-3 text-xs text-slate-500">{line.sku || line.barcode || "-"}</td>
              <td className="p-3 text-center font-black">{line.systemQuantity}</td>
              <td className="p-3 text-center">{editable ? <form action={updateStockTakeLineAction} className="flex items-center justify-center gap-2"><input type="hidden" name="stockTakeId" value={stockTake.id} /><input type="hidden" name="inventoryItemId" value={line.inventoryItemId} /><input name="actualQuantity" type="number" min="0" step="1" defaultValue={line.actualQuantity} className="h-9 w-24 rounded-lg border border-slate-200 px-2 text-center font-black" /><Button type="submit" size="sm" variant="outline" className="font-black">حفظ</Button></form> : <span className="font-black">{line.actualQuantity}</span>}</td>
              <td className={`p-3 text-center font-black ${Number(line.difference) > 0 ? "text-emerald-700" : Number(line.difference) < 0 ? "text-red-700" : "text-slate-400"}`}>{Number(line.difference) > 0 ? `+${line.difference}` : line.difference}</td>
              <td className="p-3 text-center">{editable ? <span className="text-xs text-slate-400">—</span> : <CheckCircle2 className="mx-auto h-4 w-4 text-emerald-600" />}</td>
            </tr>)}
          </tbody>
        </table>
      </div>
    </section>

    {editable ? <section className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5"><div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"><div><div className="font-black text-emerald-950">اعتماد الجرد</div><p className="mt-1 max-w-2xl text-xs font-semibold leading-6 text-emerald-800">بعد الاعتماد سيتم تعديل أرصدة المستودع وإنشاء حركات زيادة/نقصان لكل فرق. إذا تغير أي رصيد بعد بدء الجرد سيرفض النظام الاعتماد ويطلب جردًا جديدًا.</p></div><form action={postStockTakeAction}><input type="hidden" name="stockTakeId" value={stockTake.id} /><Button type="submit" className="font-black"><CheckCircle2 className="ml-1 h-4 w-4" />اعتماد الجرد</Button></form></div></section> : null}
  </div>;
}
