"use client";

import { useMemo, useState } from "react";
import { ArrowLeftRight, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createStockTransferAction } from "./actions";

type Warehouse = { id: string; name: string };
type Item = { id: string; name: string; sku: string | null; barcode: string | null; availableQuantity: number };
type Row = { key: string; inventoryItemId: string; quantity: string };

function newRow(): Row {
  return { key: `${Date.now()}-${Math.random().toString(36).slice(2)}`, inventoryItemId: "", quantity: "1" };
}

const field = "h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-100";

export function WarehouseTransferForm({ warehouses, sourceWarehouseId, items }: { warehouses: Warehouse[]; sourceWarehouseId: string; items: Item[] }) {
  const [rows, setRows] = useState<Row[]>([newRow()]);
  const serialized = useMemo(() => JSON.stringify(rows.filter((row) => row.inventoryItemId).map((row) => ({ inventoryItemId: row.inventoryItemId, quantity: Number(row.quantity) || 0 }))), [rows]);
  const destinationOptions = warehouses.filter((warehouse) => warehouse.id !== sourceWarehouseId);

  function patch(key: string, data: Partial<Row>) {
    setRows((current) => current.map((row) => row.key === key ? { ...row, ...data } : row));
  }

  return (
    <form action={createStockTransferAction} className="space-y-4">
      <input type="hidden" name="fromWarehouseId" value={sourceWarehouseId} />
      <input type="hidden" name="items" value={serialized} />
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="grid gap-2 text-xs font-black text-slate-700"><span>إلى المستودع</span><select name="toWarehouseId" required className={field} defaultValue=""><option value="" disabled>اختر المستودع المستلم</option>{destinationOptions.map((warehouse) => <option key={warehouse.id} value={warehouse.id}>{warehouse.name}</option>)}</select></label>
        <label className="grid gap-2 text-xs font-black text-slate-700"><span>ملاحظة</span><input name="notes" className={field} placeholder="سبب أو ملاحظة التحويل" /></label>
      </div>

      <div className="space-y-2">
        {rows.map((row, index) => {
          const selected = items.find((item) => item.id === row.inventoryItemId);
          return <div key={row.key} className="grid gap-2 rounded-xl border border-slate-200 bg-slate-50/60 p-3 sm:grid-cols-[1fr_120px_auto] sm:items-end">
            <label className="grid gap-1.5 text-xs font-black text-slate-600"><span>القطعة {index + 1}</span><select value={row.inventoryItemId} onChange={(e) => patch(row.key, { inventoryItemId: e.target.value })} className={field} required={index === 0}><option value="">اختر قطعة</option>{items.map((item) => <option key={item.id} value={item.id}>{item.name}{item.sku ? ` — ${item.sku}` : ""} — متاح ${item.availableQuantity}</option>)}</select></label>
            <label className="grid gap-1.5 text-xs font-black text-slate-600"><span>الكمية</span><input value={row.quantity} onChange={(e) => patch(row.key, { quantity: e.target.value })} className={field} type="number" min="1" max={selected?.availableQuantity} step="1" /></label>
            <button type="button" onClick={() => setRows((current) => current.length === 1 ? [newRow()] : current.filter((entry) => entry.key !== row.key))} className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-400 hover:border-red-200 hover:bg-red-50 hover:text-red-600" aria-label="حذف البند"><Trash2 className="h-4 w-4" /></button>
          </div>;
        })}
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:justify-between">
        <Button type="button" variant="outline" className="font-black" onClick={() => setRows((current) => [...current, newRow()])}><Plus className="ml-1 h-4 w-4" />إضافة قطعة</Button>
        <Button type="submit" disabled={!destinationOptions.length || !rows.some((row) => row.inventoryItemId)} className="font-black"><ArrowLeftRight className="ml-1 h-4 w-4" />تنفيذ التحويل</Button>
      </div>
    </form>
  );
}
