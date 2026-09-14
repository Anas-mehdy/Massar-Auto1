"use client";

import { useActionState, useMemo, useState } from "react";
import { CheckCircle2, ShieldCheck, XCircle } from "lucide-react";
import { submitPublicQuotationDecision, type PublicQuotationApprovalState } from "@/app/track/[ticketNumber]/actions";
import { Button } from "@/components/ui/button";

export type PublicApprovalLine = {
  id: string;
  lineType: string;
  description: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
};

type Props = {
  quotationId: string;
  serviceOrderId: string;
  approvalToken: string;
  lines: PublicApprovalLine[];
  currency: string;
  subtotal: number;
  discountTotal: number;
  taxTotal: number;
  total: number;
  defaultPhone?: string;
};

const initialState: PublicQuotationApprovalState = { error: null };

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function formatMoney(value: number, currency: string) {
  try {
    return new Intl.NumberFormat("ar", {
      style: "currency",
      currency: currency || "SAR",
      maximumFractionDigits: 2,
    }).format(value);
  } catch {
    return `${value.toFixed(2)} ${currency || ""}`.trim();
  }
}

export function PublicQuotationApprovalForm({
  quotationId,
  serviceOrderId,
  approvalToken,
  lines,
  currency,
  subtotal,
  discountTotal,
  taxTotal,
  total,
  defaultPhone = "",
}: Props) {
  const [state, formAction, pending] = useActionState(submitPublicQuotationDecision, initialState);
  const [selectedIds, setSelectedIds] = useState(() => new Set(lines.map((line) => line.id)));

  const selectedSubtotal = useMemo(
    () => lines.reduce((sum, line) => selectedIds.has(line.id) ? sum + line.lineTotal : sum, 0),
    [lines, selectedIds],
  );
  const allSelected = selectedIds.size === lines.length;
  const ratio = subtotal > 0 ? Math.min(1, Math.max(0, selectedSubtotal / subtotal)) : 0;
  const selectedEstimate = allSelected
    ? total
    : roundMoney(Math.max(0, selectedSubtotal - discountTotal * ratio + taxTotal * ratio));

  function toggleLine(id: string) {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <form action={formAction} className="space-y-4 rounded-2xl border border-amber-500/30 bg-amber-500/5 p-4">
      <input type="hidden" name="quotationId" value={quotationId} />
      <input type="hidden" name="serviceOrderId" value={serviceOrderId} />
      <input type="hidden" name="approvalToken" value={approvalToken} />

      <div className="flex items-start gap-3">
        <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-amber-300" />
        <div>
          <h3 className="text-sm font-black text-white">قرار العميل على عرض السعر</h3>
          <p className="mt-1 text-[11px] font-semibold leading-5 text-slate-400">
            البنود محددة بالكامل افتراضياً. أزل علامة الصح عن أي بند لا تريد اعتماده، وعندها تُسجّل الموافقة كموافقة جزئية.
          </p>
        </div>
      </div>

      <div className="space-y-2">
        {lines.map((line) => (
          <label key={line.id} className="flex cursor-pointer items-start gap-3 rounded-xl border border-slate-700 bg-slate-950/60 p-3">
            <input
              type="checkbox"
              name="approvedLineIds"
              value={line.id}
              checked={selectedIds.has(line.id)}
              onChange={() => toggleLine(line.id)}
              className="mt-1 h-4 w-4 accent-teal-500"
            />
            <span className="min-w-0 flex-1">
              <span className="block text-xs font-black text-slate-100">{line.description}</span>
              <span className="mt-1 block text-[10px] font-semibold text-slate-500">
                {line.lineType === "LABOR" ? "أجرة عمل" : line.lineType === "PART" ? "قطعة غيار" : "بند"}
                {` • ${line.quantity} × ${formatMoney(line.unitPrice, currency)}`}
              </span>
            </span>
            <span className="shrink-0 text-xs font-black text-teal-300">{formatMoney(line.lineTotal, currency)}</span>
          </label>
        ))}
      </div>

      <div className="grid gap-2 rounded-xl border border-slate-700 bg-slate-950/70 p-3 text-xs sm:grid-cols-2">
        <div><span className="block text-[10px] font-bold text-slate-500">إجمالي عرض السعر</span><span className="mt-1 block font-black text-white">{formatMoney(total, currency)}</span></div>
        <div><span className="block text-[10px] font-bold text-slate-500">التقدير للبنود المحددة</span><span className="mt-1 block font-black text-amber-300">{formatMoney(selectedEstimate, currency)}</span></div>
      </div>
      {!allSelected ? <p className="text-[10px] font-semibold leading-5 text-slate-500">عند الموافقة الجزئية يوزّع النظام الخصم والضريبة على البنود المعتمدة بنسبة قيمتها، بنفس منطق الفاتورة النهائية.</p> : null}

      <div>
        <label className="mb-1.5 block text-[11px] font-black text-slate-300">رقم جوال العميل للتأكيد</label>
        <input
          type="tel"
          name="customerPhone"
          required
          minLength={8}
          maxLength={40}
          defaultValue={defaultPhone}
          placeholder="رقم الجوال المسجل مع أمر الصيانة"
          dir="ltr"
          autoComplete="tel"
          className="h-11 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 text-sm font-bold text-white outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500"
        />
      </div>

      <div>
        <label className="mb-1.5 block text-[11px] font-black text-slate-300">ملاحظة للورشة (اختياري)</label>
        <textarea
          name="note"
          maxLength={1000}
          rows={3}
          placeholder="مثال: أوافق على البنود المحددة فقط"
          className="w-full resize-y rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-xs font-semibold leading-6 text-white outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500"
        />
      </div>

      <label className="flex items-start gap-2 rounded-xl border border-slate-700 bg-slate-950/50 p-3 text-[11px] font-semibold leading-5 text-slate-300">
        <input type="checkbox" name="confirmed" value="yes" required className="mt-0.5 h-4 w-4 accent-teal-500" />
        <span>أؤكد أنني صاحب المركبة أو مخول بالقرار، وأن اختياري سيُسجل كقرار عميل موثق على عرض السعر الحالي.</span>
      </label>

      {state.error ? <div aria-live="polite" className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-xs font-bold leading-5 text-rose-200">{state.error}</div> : null}

      <div className="grid gap-2 sm:grid-cols-2">
        <Button
          type="submit"
          name="intent"
          value="APPROVE_SELECTED"
          disabled={pending || selectedIds.size === 0}
          className="h-11 bg-teal-500 font-black text-slate-950 hover:bg-teal-400"
        >
          <CheckCircle2 className="ml-1.5 h-4 w-4" />
          {pending ? "جارٍ تسجيل القرار..." : allSelected ? "أوافق على تنفيذ الصيانة" : "أوافق على البنود المحددة"}
        </Button>
        <Button
          type="submit"
          name="intent"
          value="REJECT_ALL"
          disabled={pending}
          variant="destructive"
          className="h-11 font-black"
        >
          <XCircle className="ml-1.5 h-4 w-4" />
          رفض العرض بالكامل
        </Button>
      </div>
    </form>
  );
}
