"use client";

import { useMemo, useState } from "react";
import { RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createSalesReturnAction } from "./actions";

type SaleItem = {
  id: string;
  description: string;
  quantity: number;
  returnedQuantity: number;
  returnableQuantity: number;
  unitPriceSnapshot: string | number;
  lineTotal: string | number;
  inventoryItem: { id: string; name: string } | null;
};
type Option = { id: string; name: string };
type RowState = { enabled: boolean; quantity: string; restock: boolean; warehouseId: string; reason: string };
type AccountType = "DRAWER" | "WALLET" | "BANK" | "OTHER";

const field = "h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:border-rose-400 focus:ring-2 focus:ring-rose-100";

function money(value: number, currency: string) {
  return new Intl.NumberFormat("ar", { style: "currency", currency, maximumFractionDigits: 2 }).format(value);
}

export function SalesReturnForm({
  saleId,
  currency,
  items,
  warehouses,
  wallets,
  banks,
}: {
  saleId: string;
  currency: string;
  items: SaleItem[];
  warehouses: Option[];
  wallets: Option[];
  banks: Option[];
}) {
  const [accountType, setAccountType] = useState<AccountType>("DRAWER");
  const [rows, setRows] = useState<Record<string, RowState>>(() => Object.fromEntries(items.map((item) => [item.id, {
    enabled: false,
    quantity: item.returnableQuantity > 0 ? "1" : "0",
    restock: Boolean(item.inventoryItem),
    warehouseId: warehouses[0]?.id ?? "",
    reason: "",
  }])));

  const selectedLines = useMemo(() => items.flatMap((item) => {
    const row = rows[item.id];
    if (!row?.enabled) return [];
    const quantity = Number(row.quantity);
    if (!Number.isInteger(quantity) || quantity <= 0 || quantity > item.returnableQuantity) return [];
    return [{
      saleItemId: item.id,
      quantity,
      restock: row.restock && Boolean(item.inventoryItem),
      warehouseId: row.restock && item.inventoryItem && row.warehouseId ? row.warehouseId : null,
      reason: row.reason || null,
    }];
  }), [items, rows]);

  const estimatedTotal = useMemo(() => selectedLines.reduce((sum, selected) => {
    const item = items.find((candidate) => candidate.id === selected.saleItemId);
    if (!item) return sum;
    const unitEffective = Number(item.lineTotal) / item.quantity;
    return sum + unitEffective * selected.quantity;
  }, 0), [items, selectedLines]);

  function patch(id: string, data: Partial<RowState>) {
    setRows((current) => ({ ...current, [id]: { ...current[id], ...data } }));
  }

  return <form action={createSalesReturnAction} className="space-y-5">
    <input type="hidden" name="saleId" value={saleId} />
    <input type="hidden" name="lines" value={JSON.stringify(selectedLines)} />

    <div className="space-y-3">
      {items.map((item) => {
        const row = rows[item.id];
        const disabled = item.returnableQuantity <= 0;
        return <div key={item.id} className={`rounded-2xl border p-4 ${row?.enabled ? "border-rose-200 bg-rose-50/30" : "border-slate-200 bg-white"}`}>
          <div className="flex items-start gap-3">
            <input type="checkbox" checked={row?.enabled ?? false} disabled={disabled} onChange={(e) => patch(item.id, { enabled: e.target.checked })} className="mt-1 h-4 w-4" />
            <div className="min-w-0 flex-1">
              <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between"><div><div className="font-black text-slate-900">{item.description}</div><div className="mt-1 text-xs font-semibold text-slate-500">{item.inventoryItem?.name ?? "بند غير مخزني"} • مباع {item.quantity} • مرتجع سابقًا {item.returnedQuantity} • متاح {item.returnableQuantity}</div></div><div className="shrink-0 font-black text-slate-800">{money(Number(item.lineTotal), currency)}</div></div>
              {row?.enabled ? <div className="mt-4 grid gap-3 md:grid-cols-4">
                <label className="grid gap-1.5 text-xs font-black text-slate-600"><span>كمية المرتجع</span><input className={field} type="number" min="1" max={item.returnableQuantity} step="1" value={row.quantity} onChange={(e) => patch(item.id, { quantity: e.target.value })} /></label>
                {item.inventoryItem ? <label className="grid gap-1.5 text-xs font-black text-slate-600"><span>إرجاع للمخزون</span><select className={field} value={row.restock ? "YES" : "NO"} onChange={(e) => patch(item.id, { restock: e.target.value === "YES" })}><option value="YES">نعم</option><option value="NO">لا — تالف/غير قابل للبيع</option></select></label> : null}
                {item.inventoryItem && row.restock && warehouses.length ? <label className="grid gap-1.5 text-xs font-black text-slate-600"><span>المستودع</span><select className={field} value={row.warehouseId} onChange={(e) => patch(item.id, { warehouseId: e.target.value })}>{warehouses.map((warehouse) => <option key={warehouse.id} value={warehouse.id}>{warehouse.name}</option>)}</select></label> : null}
                <label className="grid gap-1.5 text-xs font-black text-slate-600"><span>سبب البند</span><input className={field} value={row.reason} onChange={(e) => patch(item.id, { reason: e.target.value })} placeholder="اختياري" /></label>
              </div> : null}
            </div>
          </div>
        </div>;
      })}
    </div>

    <section className="rounded-2xl border border-slate-200 bg-slate-50/60 p-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="grid gap-2 text-xs font-black text-slate-700 sm:col-span-2"><span>سبب المرتجع</span><input name="reason" required className={field} placeholder="مثال: المنتج غير مناسب للعميل" /></label>
        <label className="grid gap-2 text-xs font-black text-slate-700"><span>طريقة رد المبلغ</span><select name="refundAccountType" value={accountType} onChange={(e) => setAccountType(e.target.value as AccountType)} className={field}><option value="DRAWER">الدرج النقدي</option><option value="WALLET">محفظة إلكترونية</option><option value="BANK">حساب بنكي</option><option value="OTHER">مصدر خارجي غير مربوط</option></select></label>
        {accountType === "WALLET" ? <label className="grid gap-2 text-xs font-black text-slate-700"><span>المحفظة</span><select name="refundWalletId" required className={field} defaultValue=""><option value="" disabled>اختر المحفظة</option>{wallets.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label> : null}
        {accountType === "BANK" ? <label className="grid gap-2 text-xs font-black text-slate-700"><span>الحساب البنكي</span><select name="refundBankAccountId" required className={field} defaultValue=""><option value="" disabled>اختر الحساب</option>{banks.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label> : null}
        {accountType === "OTHER" ? <label className="grid gap-2 text-xs font-black text-slate-700"><span>اسم مصدر الرد</span><input name="refundSourceName" className={field} placeholder="مثال: حوالة خارجية" /></label> : null}
        <label className="grid gap-2 text-xs font-black text-slate-700 sm:col-span-2"><span>ملاحظات</span><input name="notes" className={field} /></label>
      </div>
    </section>

    <div className="flex flex-col gap-3 rounded-2xl border border-rose-200 bg-rose-50 p-4 sm:flex-row sm:items-center sm:justify-between"><div><div className="text-xs font-black text-rose-700">القيمة التقديرية للمرتجع</div><div className="mt-1 text-2xl font-black text-rose-950">{money(estimatedTotal, currency)}</div></div><Button type="submit" disabled={!selectedLines.length} variant="destructive" className="font-black"><RotateCcw className="ml-1 h-4 w-4" />تنفيذ المرتجع</Button></div>
  </form>;
}
