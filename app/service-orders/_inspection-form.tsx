"use client";

import { useMemo, useState } from "react";
import { ClipboardCheck, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createServiceInspectionAction } from "./actions";

type InspectionResult = "OK" | "WARNING" | "FAIL" | "NOT_CHECKED";
type Row = {
  key: string;
  component: string;
  result: InspectionResult;
  notes: string;
  recommendedAction: string;
  estimatedCost: string;
};

function newRow(): Row {
  return {
    key: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    component: "",
    result: "NOT_CHECKED",
    notes: "",
    recommendedAction: "",
    estimatedCost: "",
  };
}

const inputClass = "h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100";

export function InspectionForm({ serviceOrderId }: { serviceOrderId: string }) {
  const [rows, setRows] = useState<Row[]>([newRow()]);

  const serialized = useMemo(() => JSON.stringify(rows
    .filter((row) => row.component.trim())
    .map((row) => ({
      component: row.component.trim(),
      result: row.result,
      notes: row.notes.trim() || null,
      recommendedAction: row.recommendedAction.trim() || null,
      estimatedCost: row.estimatedCost.trim() ? Number(row.estimatedCost) : null,
    }))), [rows]);

  function patchRow(key: string, patch: Partial<Row>) {
    setRows((current) => current.map((row) => row.key === key ? { ...row, ...patch } : row));
  }

  function removeRow(key: string) {
    setRows((current) => current.length === 1 ? [newRow()] : current.filter((row) => row.key !== key));
  }

  return (
    <form action={createServiceInspectionAction} className="space-y-4">
      <input type="hidden" name="serviceOrderId" value={serviceOrderId} />
      <input type="hidden" name="items" value={serialized} />

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="grid gap-2 text-xs font-black text-slate-700">
          <span>نوع الفحص</span>
          <select name="inspectionType" defaultValue="INITIAL" className={inputClass}>
            <option value="INITIAL">فحص أولي</option>
            <option value="FINAL">فحص نهائي</option>
            <option value="OTHER">فحص إضافي</option>
          </select>
        </label>
        <label className="grid gap-2 text-xs font-black text-slate-700">
          <span>ملخص الفحص</span>
          <input name="summary" className={inputClass} placeholder="مثال: يحتاج صيانة فرامل وتغيير زيت" />
        </label>
      </div>

      <div className="space-y-3">
        {rows.map((row, index) => (
          <div key={row.key} className="rounded-2xl border border-slate-200 bg-slate-50/60 p-3">
            <div className="mb-3 flex items-center justify-between gap-2">
              <span className="text-xs font-black text-slate-500">بند الفحص {index + 1}</span>
              <button type="button" onClick={() => removeRow(row.key)} className="rounded-lg p-2 text-slate-400 transition hover:bg-red-50 hover:text-red-600" aria-label="حذف البند">
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <input value={row.component} onChange={(e) => patchRow(row.key, { component: e.target.value })} required={index === 0} className={inputClass} placeholder="المكوّن: فرامل، بطارية..." />
              <select value={row.result} onChange={(e) => patchRow(row.key, { result: e.target.value as InspectionResult })} className={inputClass}>
                <option value="NOT_CHECKED">لم يفحص</option>
                <option value="OK">سليم</option>
                <option value="WARNING">يحتاج انتباه</option>
                <option value="FAIL">يحتاج إصلاح/تبديل</option>
              </select>
              <input value={row.recommendedAction} onChange={(e) => patchRow(row.key, { recommendedAction: e.target.value })} className={inputClass} placeholder="الإجراء المقترح" />
              <input value={row.estimatedCost} onChange={(e) => patchRow(row.key, { estimatedCost: e.target.value })} type="number" min="0" step="0.01" className={inputClass} placeholder="تكلفة تقديرية" />
              <input value={row.notes} onChange={(e) => patchRow(row.key, { notes: e.target.value })} className={`${inputClass} sm:col-span-2 xl:col-span-4`} placeholder="ملاحظات فنية على هذا البند" />
            </div>
          </div>
        ))}
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:justify-between">
        <Button type="button" variant="outline" onClick={() => setRows((current) => [...current, newRow()])} className="font-black">
          <Plus className="ml-1.5 h-4 w-4" />إضافة بند فحص
        </Button>
        <Button type="submit" disabled={!rows.some((row) => row.component.trim())} className="font-black">
          <ClipboardCheck className="ml-1.5 h-4 w-4" />حفظ الفحص
        </Button>
      </div>
    </form>
  );
}
