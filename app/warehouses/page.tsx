import Link from "next/link";
import { ArrowLeftRight, Boxes, ClipboardCheck, Plus, Search, Warehouse as WarehouseIcon } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { requirePermission } from "@/lib/auth/context";
import { warehouseService } from "@/lib/services/warehouseService";
import { warehouseQueryService } from "@/lib/services/warehouseQueryService";
import { createStockTakeAction, createWarehouseAction } from "./actions";
import { WarehouseTransferForm } from "./_transfer-form";

export const dynamic = "force-dynamic";

type PageProps = { searchParams: Promise<{ warehouse?: string; search?: string; transfer?: string }> };
const field = "h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-100";

function money(value: string | number | null | undefined, currency: string) {
  return new Intl.NumberFormat("ar", { style: "currency", currency, maximumFractionDigits: 2 }).format(Number(value ?? 0));
}

export default async function WarehousesPage({ searchParams }: PageProps) {
  const auth = await requirePermission("warehouse:read");
  const params = await searchParams;
  const warehouses = await warehouseService.listWarehouses(auth.shop.id);
  const selected = warehouses.find((warehouse) => warehouse.id === params.warehouse) ?? warehouses.find((warehouse) => warehouse.isDefault) ?? warehouses[0] ?? null;
  const stock = selected ? await warehouseQueryService.listWarehouseStock(auth.shop.id, selected.id, params.search) : [];
  const transferableItems = selected ? await warehouseQueryService.listTransferableInventory(auth.shop.id, selected.id) : [];
  const [transfers, stockTakes] = await Promise.all([
    warehouseQueryService.listStockTransfers(auth.shop.id, 20),
    warehouseQueryService.listStockTakes(auth.shop.id, 20),
  ]);
  const totalUnits = stock.reduce((sum, row) => sum + Number(row.quantity), 0);
  const totalValue = stock.reduce((sum, row) => sum + Number(row.quantity) * Number(row.averageCost ?? row.unitCost ?? 0), 0);

  return <div className="space-y-6">
    <PageHeader title="المستودعات والجرد" description="إدارة أكثر من مستودع، التحويل بين المواقع، ومطابقة الرصيد الفعلي مع النظام." />

    {params.transfer ? <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-black text-emerald-800">تم تنفيذ التحويل بنجاح: {params.transfer}</div> : null}

    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
      <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-col gap-3 border-b border-slate-100 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div><h2 className="flex items-center gap-2 font-black text-slate-950"><WarehouseIcon className="h-4 w-4 text-amber-700" />المستودعات</h2><p className="mt-1 text-xs font-semibold text-slate-500">اختر مستودعًا لمشاهدة رصيده وحركاته.</p></div>
          <div className="flex flex-wrap gap-2">{warehouses.map((warehouse) => <Button key={warehouse.id} asChild variant={selected?.id === warehouse.id ? "default" : "outline"} size="sm" className="font-black"><Link href={`/warehouses?warehouse=${warehouse.id}`}>{warehouse.name}{warehouse.isDefault ? " • رئيسي" : ""}</Link></Button>)}</div>
        </div>
        {selected ? <>
          <div className="grid gap-3 border-b border-slate-100 p-4 sm:grid-cols-3">
            <div className="rounded-xl bg-slate-50 p-3"><div className="text-[11px] font-black text-slate-500">عدد الأصناف</div><div className="mt-1 text-xl font-black text-slate-950">{stock.length}</div></div>
            <div className="rounded-xl bg-slate-50 p-3"><div className="text-[11px] font-black text-slate-500">إجمالي الوحدات</div><div className="mt-1 text-xl font-black text-slate-950">{totalUnits.toLocaleString("ar")}</div></div>
            <div className="rounded-xl bg-slate-50 p-3"><div className="text-[11px] font-black text-slate-500">قيمة المخزون بالتكلفة</div><div className="mt-1 text-lg font-black text-slate-950">{money(totalValue, auth.shop.currency)}</div></div>
          </div>
          <form className="flex gap-2 border-b border-slate-100 p-4"><input type="hidden" name="warehouse" value={selected.id} /><div className="relative flex-1"><Search className="absolute right-3 top-3 h-4 w-4 text-slate-400" /><input name="search" defaultValue={params.search ?? ""} className={`${field} pr-9`} placeholder="اسم القطعة، SKU أو الباركود" /></div><Button type="submit" variant="outline" className="font-black">بحث</Button></form>
          <div className="overflow-x-auto"><table className="min-w-[760px] w-full text-sm"><thead className="bg-slate-50 text-xs text-slate-500"><tr><th className="p-3 text-right">القطعة</th><th className="p-3 text-right">SKU</th><th className="p-3 text-center">الرصيد</th><th className="p-3 text-center">محجوز</th><th className="p-3 text-center">متاح</th><th className="p-3 text-right">متوسط التكلفة</th><th className="p-3 text-right">حد الطلب</th></tr></thead><tbody className="divide-y divide-slate-100">{stock.map((row) => <tr key={row.inventoryItemId}><td className="p-3 font-black text-slate-900">{row.itemName}</td><td className="p-3 text-slate-500">{row.sku || "-"}</td><td className="p-3 text-center font-black">{row.quantity}</td><td className="p-3 text-center text-amber-700">{row.reservedQuantity}</td><td className="p-3 text-center font-black text-emerald-700">{row.availableQuantity}</td><td className="p-3 font-bold">{money(row.averageCost ?? row.unitCost, auth.shop.currency)}</td><td className="p-3 text-center">{row.reorderLevel}</td></tr>)}</tbody></table>{!stock.length ? <div className="p-10 text-center text-sm font-bold text-slate-400">لا يوجد مخزون في هذا المستودع بعد.</div> : null}</div>
        </> : <div className="p-10 text-center text-sm font-bold text-slate-400">أنشئ أول مستودع للبدء.</div>}
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="font-black text-slate-950">إضافة مستودع</h2>
        <form action={createWarehouseAction} className="mt-4 grid gap-3">
          <input name="name" required className={field} placeholder="اسم المستودع" />
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1"><input name="code" className={field} placeholder="الكود - اختياري" /><input name="location" className={field} placeholder="الموقع - اختياري" /></div>
          <label className="flex items-center gap-2 text-xs font-black text-slate-600"><input type="checkbox" name="isDefault" />تعيينه كمستودع رئيسي</label>
          <Button type="submit" className="font-black"><Plus className="ml-1 h-4 w-4" />إضافة المستودع</Button>
        </form>
      </section>
    </div>

    {selected && warehouses.length > 1 ? <section className="rounded-2xl border border-slate-200 bg-white shadow-sm"><div className="border-b border-slate-100 p-5"><h2 className="flex items-center gap-2 font-black text-slate-950"><ArrowLeftRight className="h-4 w-4 text-indigo-700" />تحويل بين المستودعات</h2><p className="mt-1 text-xs text-slate-500">التحويل ينفذ داخل Transaction واحدة ويُرفض إذا كان الرصيد المتاح غير كافٍ.</p></div><div className="p-4 sm:p-5"><WarehouseTransferForm warehouses={warehouses.map(({ id, name }) => ({ id, name }))} sourceWarehouseId={selected.id} items={transferableItems} /></div></section> : null}

    {selected ? <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="flex items-center gap-2 font-black text-slate-950"><ClipboardCheck className="h-4 w-4 text-emerald-700" />جرد المستودع</h2><p className="mt-1 text-xs text-slate-500">يتم أخذ Snapshot للرصيد، ثم إدخال الكميات الفعلية قبل الاعتماد.</p></div><form action={createStockTakeAction} className="flex gap-2"><input type="hidden" name="warehouseId" value={selected.id} /><input name="notes" className="h-9 rounded-lg border border-slate-200 px-2 text-xs" placeholder="ملاحظة الجرد" /><Button type="submit" size="sm" className="font-black"><ClipboardCheck className="ml-1 h-4 w-4" />بدء جرد جديد</Button></form></div></section> : null}

    <div className="grid gap-6 xl:grid-cols-2">
      <section className="rounded-2xl border border-slate-200 bg-white shadow-sm"><div className="border-b border-slate-100 p-4 font-black text-slate-950">آخر التحويلات</div><div className="divide-y divide-slate-100">{transfers.map((transfer) => <div key={transfer.id} className="p-4"><div className="flex items-start justify-between gap-3"><div><div className="font-black text-slate-900">{transfer.transferNumber}</div><div className="mt-1 text-xs font-bold text-slate-500">{transfer.fromWarehouseName} ← {transfer.toWarehouseName}</div></div><div className="text-left"><div className="text-xs font-black text-emerald-700">{transfer.status}</div><div className="mt-1 text-xs text-slate-500">{transfer.itemCount} أصناف • {transfer.totalQuantity} وحدات</div></div></div></div>)}</div>{!transfers.length ? <div className="p-8 text-center text-sm font-bold text-slate-400">لا توجد تحويلات بعد.</div> : null}</section>
      <section className="rounded-2xl border border-slate-200 bg-white shadow-sm"><div className="border-b border-slate-100 p-4 font-black text-slate-950">جلسات الجرد</div><div className="divide-y divide-slate-100">{stockTakes.map((take) => <Link key={take.id} href={`/warehouses/stocktakes/${take.id}`} className="flex items-center justify-between gap-3 p-4 hover:bg-slate-50"><div><div className="font-black text-slate-900">{take.stockTakeNumber}</div><div className="mt-1 text-xs font-bold text-slate-500">{take.warehouseName} • {take.lineCount} أصناف</div></div><div className="text-left"><div className="text-xs font-black text-slate-700">{take.status}</div><div className="mt-1 text-xs text-slate-500">فروقات: {take.differenceCount}</div></div></Link>)}</div>{!stockTakes.length ? <div className="p-8 text-center text-sm font-bold text-slate-400">لا توجد جلسات جرد بعد.</div> : null}</section>
    </div>
  </div>;
}
