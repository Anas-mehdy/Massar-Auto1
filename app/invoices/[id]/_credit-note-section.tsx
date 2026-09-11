import Link from "next/link";
import { BadgeDollarSign, CircleDollarSign, FileMinus2, Printer, ReceiptText, ShieldCheck } from "lucide-react";
import { ConfirmSubmitButton } from "@/components/confirm-submit-button";
import { MoneyDestinationField } from "@/components/money-destination-field";
import { Button } from "@/components/ui/button";
import { getCurrentShopContext } from "@/lib/current-shop";
import {
  CREDIT_NOTE_REASON_CODES,
  invoiceCreditNoteService,
  type CreditNoteReasonCode,
} from "@/lib/services/invoiceCreditNoteService";
import { formatDate, formatMoney, inputClassName, selectClassName, textareaClassName } from "../_components";
import { createInvoiceCreditNoteAction, refundInvoiceCreditAction } from "../credit-actions";

const reasonLabels: Record<CreditNoteReasonCode, string> = {
  PRICE_ADJUSTMENT: "تصحيح سعر",
  CUSTOMER_COMPENSATION: "تعويض للعميل",
  SERVICE_CORRECTION: "تصحيح على خدمة الصيانة",
  DISCOUNT_AFTER_DELIVERY: "خصم بعد التسليم",
  OTHER: "سبب آخر",
};

type WalletOption = { id: string; name: string; balance: number };
type BankOption = { id: string; name: string; bankName?: string | null; balance: number };

export async function InvoiceCreditNoteSection({
  invoiceId,
  wallets,
  bankAccounts,
  currency,
}: {
  invoiceId: string;
  wallets: WalletOption[];
  bankAccounts: BankOption[];
  currency: string;
}) {
  const shop = await getCurrentShopContext();
  const context = await invoiceCreditNoteService.getAutoInvoiceCreditContext(shop.shopId, invoiceId);
  if (!context) return null;

  const orderIsFinal = ["DELIVERED", "CLOSED"].includes(context.orderStatus);
  const invoiceIsVoid = context.invoiceStatus === "VOID";
  const canCreateCredit = orderIsFinal && !invoiceIsVoid && context.remainingCreditable > 0.005 && !context.activeInstallmentPlanId;
  const canRefund = orderIsFinal && !invoiceIsVoid && context.refundableDue > 0.005;

  return (
    <section className="erp-section space-y-5">
      <div className="flex flex-col gap-3 border-b border-slate-100/70 pb-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3 className="flex items-center gap-2 text-sm font-black text-slate-900">
            <FileMinus2 className="h-4 w-4 text-rose-700" />
            الإشعارات الدائنة وتصحيحات ما بعد التسليم
          </h3>
          <p className="mt-1 max-w-3xl text-xs font-semibold leading-6 text-slate-500">
            الفاتورة الأصلية تبقى محفوظة كما صدرت. أي تخفيض بعد تسليم المركبة يُسجل كمستند مستقل غير قابل للتعديل أو الحذف، وأي مبلغ مدفوع بالزيادة يُرد بحركة مالية منفصلة.
          </p>
        </div>
        <div className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-[10px] font-black text-emerald-800">
          <ShieldCheck className="h-3.5 w-3.5" /> سجل مالي محفوظ
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <Metric label="قيمة الفاتورة الأصلية" value={formatMoney(context.originalTotal, currency)} />
        <Metric label="إجمالي الإشعارات الدائنة" value={formatMoney(context.creditTotal, currency)} tone="rose" />
        <Metric label="الصافي بعد التصحيح" value={formatMoney(context.effectiveTotal, currency)} tone="indigo" />
        <Metric label="المقبوض تاريخيًا" value={formatMoney(context.amountPaid, currency)} tone="emerald" />
        <Metric label="واجب رده للعميل" value={formatMoney(context.refundableDue, currency)} tone={context.refundableDue > 0 ? "amber" : undefined} />
      </div>

      {context.activeInstallmentPlanId ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-xs font-bold leading-6 text-amber-950">
          هذه الفاتورة مرتبطة بخطة أقساط نشطة
          {context.activeInstallmentPlanNumber ? ` (${context.activeInstallmentPlanNumber})` : ""}. حفاظًا على تطابق جدول الأقساط لا يمكن إصدار إشعار دائن قبل تسوية الخطة.
          <Button asChild variant="outline" size="sm" className="mr-3 h-8 border-amber-300 bg-white text-[11px] font-black text-amber-900">
            <Link href={`/installments/${context.activeInstallmentPlanId}`}>فتح خطة الأقساط</Link>
          </Button>
        </div>
      ) : null}

      {!orderIsFinal ? (
        <div className="rounded-2xl border border-sky-200 bg-sky-50 p-4 text-xs font-bold leading-6 text-sky-950">
          أمر الصيانة لم يُسلّم بعد. قبل التسليم استخدم إلغاء الفاتورة وإعادة إصدارها بدل إنشاء إشعار دائن.
        </div>
      ) : null}

      <div className="grid gap-5 xl:grid-cols-2">
        <form action={createInvoiceCreditNoteAction} className="rounded-2xl border border-rose-100 bg-rose-50/30 p-4">
          <input type="hidden" name="invoiceId" value={invoiceId} />
          <div className="mb-4 flex items-center gap-2">
            <ReceiptText className="h-4 w-4 text-rose-700" />
            <div>
              <h4 className="text-xs font-black text-slate-900">إصدار إشعار دائن</h4>
              <p className="mt-0.5 text-[10px] font-semibold text-slate-500">أقصى قيمة متبقية قابلة للتصحيح: {formatMoney(context.remainingCreditable, currency)}</p>
            </div>
          </div>
          <div className="grid gap-3">
            <label className="grid gap-1.5 text-xs font-black text-slate-700">
              <span>قيمة التخفيض *</span>
              <input name="amount" type="number" min="0.01" max={context.remainingCreditable} step="0.01" required disabled={!canCreateCredit} className={inputClassName} />
            </label>
            <label className="grid gap-1.5 text-xs font-black text-slate-700">
              <span>نوع السبب *</span>
              <select name="reasonCode" defaultValue="PRICE_ADJUSTMENT" disabled={!canCreateCredit} className={selectClassName}>
                {CREDIT_NOTE_REASON_CODES.map((code) => <option key={code} value={code}>{reasonLabels[code]}</option>)}
              </select>
            </label>
            <label className="grid gap-1.5 text-xs font-black text-slate-700">
              <span>سبب التصحيح *</span>
              <textarea name="reason" rows={3} required disabled={!canCreateCredit} className={textareaClassName} placeholder="مثال: خصم متفق عليه مع العميل بعد التسليم بسبب..." />
            </label>
            <label className="grid gap-1.5 text-xs font-black text-slate-700">
              <span>تاريخ الإشعار</span>
              <input name="issuedAt" type="date" disabled={!canCreateCredit} className={inputClassName} />
            </label>
            <label className="grid gap-1.5 text-xs font-black text-slate-700">
              <span>ملاحظات داخلية</span>
              <textarea name="notes" rows={2} disabled={!canCreateCredit} className={textareaClassName} />
            </label>
            <ConfirmSubmitButton
              type="submit"
              variant="destructive"
              disabled={!canCreateCredit}
              className="h-11 w-full rounded-xl text-xs font-black"
              message="سيتم إنشاء إشعار دائن مالي دائم مرتبط بالفاتورة. لا يمكن تعديل أو حذف الإشعار بعد الإصدار. هل تريد المتابعة؟"
            >
              إصدار الإشعار الدائن
            </ConfirmSubmitButton>
          </div>
        </form>

        <form action={refundInvoiceCreditAction} className="rounded-2xl border border-amber-100 bg-amber-50/30 p-4">
          <input type="hidden" name="invoiceId" value={invoiceId} />
          <div className="mb-4 flex items-center gap-2">
            <CircleDollarSign className="h-4 w-4 text-amber-700" />
            <div>
              <h4 className="text-xs font-black text-slate-900">رد المبلغ المدفوع بالزيادة</h4>
              <p className="mt-0.5 text-[10px] font-semibold text-slate-500">المبلغ الواجب رده حاليًا: {formatMoney(context.refundableDue, currency)}</p>
            </div>
          </div>
          <div className="grid gap-3">
            <label className="grid gap-1.5 text-xs font-black text-slate-700">
              <span>قيمة الاسترداد *</span>
              <input name="amount" type="number" min="0.01" max={context.refundableDue} step="0.01" defaultValue={context.refundableDue > 0 ? context.refundableDue.toFixed(2) : ""} required disabled={!canRefund} className={inputClassName} />
            </label>
            <MoneyDestinationField
              wallets={wallets}
              bankAccounts={bankAccounts}
              currency={currency}
              disabled={!canRefund}
              allowOther
              destinationName="refundAccountType"
              walletName="refundWalletId"
              bankAccountName="refundBankAccountId"
              title="من أين سيخرج مبلغ الاسترداد؟"
              incoming={false}
            />
            <label className="grid gap-1.5 text-xs font-black text-slate-700">
              <span>وصف وسيلة الاسترداد الخارجية</span>
              <input name="refundSourceName" disabled={!canRefund} className={inputClassName} placeholder="اختياري — يستخدم عند اختيار بدون تحديث رصيد" />
            </label>
            <label className="grid gap-1.5 text-xs font-black text-slate-700">
              <span>مرجع الاسترداد</span>
              <input name="refundReference" disabled={!canRefund} className={inputClassName} placeholder="رقم تحويل أو سند..." />
            </label>
            <label className="grid gap-1.5 text-xs font-black text-slate-700">
              <span>تاريخ الاسترداد</span>
              <input name="refundedAt" type="date" disabled={!canRefund} className={inputClassName} />
            </label>
            <label className="grid gap-1.5 text-xs font-black text-slate-700">
              <span>ملاحظات</span>
              <textarea name="refundNotes" rows={2} disabled={!canRefund} className={textareaClassName} />
            </label>
            <ConfirmSubmitButton
              type="submit"
              disabled={!canRefund}
              className="h-11 w-full rounded-xl bg-amber-600 text-xs font-black text-white hover:bg-amber-700"
              message={`سيتم تسجيل استرداد بقيمة تصل إلى ${formatMoney(context.refundableDue, currency)} وخفض الرصيد الفعلي للحساب المحدد. هل تريد المتابعة؟`}
            >
              تسجيل الاسترداد
            </ConfirmSubmitButton>
          </div>
        </form>
      </div>

      {context.creditNotes.length ? (
        <div className="space-y-3">
          <h4 className="flex items-center gap-2 text-xs font-black text-slate-800"><BadgeDollarSign className="h-4 w-4 text-rose-700" />سجل الإشعارات الدائنة</h4>
          <div className="overflow-hidden rounded-2xl border border-slate-200/70">
            <div className="overflow-x-auto">
              <table className="erp-table min-w-[860px]">
                <thead><tr><th>رقم الإشعار</th><th>التاريخ</th><th>السبب</th><th>قبل الضريبة</th><th>الضريبة</th><th>الإجمالي</th><th>الصافي بعده</th><th>أصدره</th><th /></tr></thead>
                <tbody>{context.creditNotes.map((note) => (
                  <tr key={note.id}>
                    <td className="font-numeric font-black text-rose-700">{note.creditNoteNumber}</td>
                    <td className="font-numeric text-slate-500">{formatDate(note.issuedAt, shop.timeZone)}</td>
                    <td><div className="font-black text-slate-800">{reasonLabels[note.reasonCode]}</div><div className="mt-1 max-w-[260px] text-[10px] font-semibold leading-5 text-slate-500">{note.reason}</div></td>
                    <td className="font-numeric">{formatMoney(note.netAmount, currency)}</td>
                    <td className="font-numeric">{formatMoney(note.taxAmount, currency)}</td>
                    <td className="font-numeric font-black text-rose-700">-{formatMoney(note.amount, currency)}</td>
                    <td className="font-numeric font-black">{formatMoney(note.effectiveInvoiceTotalAfter, currency)}</td>
                    <td className="text-xs font-bold text-slate-500">{note.createdByName || "-"}</td>
                    <td><Button asChild variant="outline" size="sm" className="h-8 text-[10px] font-black"><Link target="_blank" href={`/invoices/${invoiceId}/credit-notes/${note.id}/print`}><Printer className="ml-1 h-3.5 w-3.5" />طباعة</Link></Button></td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          </div>
        </div>
      ) : null}

      {context.refunds.length ? (
        <div className="space-y-3">
          <h4 className="text-xs font-black text-slate-800">سجل مبالغ الاسترداد للعميل</h4>
          <div className="overflow-hidden rounded-2xl border border-slate-200/70">
            <div className="overflow-x-auto">
              <table className="erp-table min-w-[720px]">
                <thead><tr><th>رقم الاسترداد</th><th>التاريخ</th><th>المبلغ</th><th>خرج من</th><th>المرجع</th><th>سجله</th></tr></thead>
                <tbody>{context.refunds.map((refund) => (
                  <tr key={refund.id}>
                    <td className="font-numeric font-black">{refund.refundNumber}</td>
                    <td className="font-numeric text-slate-500">{formatDate(refund.refundedAt, shop.timeZone)}</td>
                    <td className="font-numeric font-black text-amber-700">{formatMoney(refund.amount, currency)}</td>
                    <td className="font-bold text-slate-700">{refund.sourceName || refund.accountType}</td>
                    <td className="text-xs text-slate-500">{refund.reference || "-"}</td>
                    <td className="text-xs text-slate-500">{refund.createdByName || "-"}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function Metric({ label, value, tone }: { label: string; value: string; tone?: "rose" | "indigo" | "emerald" | "amber" }) {
  const toneClass = tone === "rose" ? "text-rose-700" : tone === "indigo" ? "text-indigo-700" : tone === "emerald" ? "text-emerald-700" : tone === "amber" ? "text-amber-700" : "text-slate-900";
  return <div className="rounded-2xl border border-slate-100 bg-slate-50/50 p-3"><div className="text-[10px] font-black text-slate-400">{label}</div><div className={`mt-1 font-numeric text-sm font-black ${toneClass}`}>{value}</div></div>;
}
