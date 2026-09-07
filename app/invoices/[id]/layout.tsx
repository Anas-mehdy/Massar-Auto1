import type { ReactNode } from "react";
import { BadgePercent } from "lucide-react";
import { InvoiceStatus } from "@prisma/client";
import { notFound } from "next/navigation";
import { SubmitButton } from "@/components/submit-button";
import { getCurrentShopContext } from "@/lib/current-shop";
import { invoiceService } from "@/lib/services/invoiceService";
import { formatMoney, inputClassName } from "../_components";
import { updateInvoiceDiscountAction } from "../discount-actions";

export const dynamic = "force-dynamic";

export default async function InvoiceDetailsLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const context = await getCurrentShopContext();
  const invoice = await invoiceService.getInvoiceById(context.shopId, id);

  if (!invoice) notFound();

  const hasPermission = context.permissions.includes("invoices:pay");
  const canEditDiscount =
    hasPermission &&
    invoice.status !== InvoiceStatus.VOID &&
    !invoice.installmentPlan;

  const minimumAllowedTotal = Number(invoice.amountPaid);
  const maximumDiscountFromPayments = Math.max(
    0,
    Number(invoice.subtotal) + Number(invoice.taxTotal) - minimumAllowedTotal,
  );
  const maximumDiscount = Math.min(Number(invoice.subtotal), maximumDiscountFromPayments);

  let disabledReason = "";
  if (!hasPermission) disabledReason = "ليس لديك صلاحية تعديل خصم الفاتورة.";
  else if (invoice.status === InvoiceStatus.VOID) disabledReason = "الفاتورة ملغاة ولا يمكن تعديل الخصم عليها.";
  else if (invoice.installmentPlan) disabledReason = "الفاتورة مرتبطة بخطة أقساط؛ عالج خطة الأقساط أولاً قبل تغيير الخصم.";

  return (
    <div className="space-y-5">
      <section className="no-print rounded-2xl border border-amber-200/80 bg-gradient-to-l from-amber-50/70 via-white to-white p-4 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-700 ring-1 ring-amber-200">
              <BadgePercent className="h-5 w-5" aria-hidden="true" />
            </div>
            <div>
              <h3 className="text-sm font-black text-slate-900">خصم الفاتورة</h3>
              <p className="mt-1 text-xs font-medium leading-5 text-slate-500">
                أدخل قيمة الخصم النقدية التي تريد منحها للعميل. سيتم تحديث الإجمالي النهائي والرصيد المتبقي وحالة السداد تلقائياً.
              </p>
              <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] font-bold text-slate-500">
                <span>قبل الخصم: {formatMoney(invoice.subtotal, context.currency)}</span>
                <span>الخصم الحالي: {formatMoney(invoice.discountTotal, context.currency)}</span>
                <span>الإجمالي الحالي: {formatMoney(invoice.total, context.currency)}</span>
              </div>
            </div>
          </div>

          <form action={updateInvoiceDiscountAction} className="flex w-full flex-col gap-2 sm:flex-row sm:items-end lg:w-auto">
            <input type="hidden" name="invoiceId" value={invoice.id} />
            <div className="min-w-0 sm:w-56">
              <label className="mb-1.5 block text-xs font-extrabold text-slate-700">قيمة الخصم</label>
              <input
                className={`${inputClassName} w-full font-numeric`}
                name="discountTotal"
                type="number"
                inputMode="decimal"
                min="0"
                max={maximumDiscount.toFixed(2)}
                step="0.01"
                required
                defaultValue={invoice.discountTotal.toString()}
                disabled={!canEditDiscount}
              />
              {canEditDiscount ? (
                <p className="mt-1 text-[10px] font-medium text-slate-400">الحد الأقصى المتاح الآن: {formatMoney(maximumDiscount, context.currency)}</p>
              ) : null}
            </div>
            <SubmitButton
              disabled={!canEditDiscount}
              className="h-10 rounded-xl px-5 text-xs font-black"
              loadingText="جاري تحديث الخصم..."
            >
              حفظ الخصم
            </SubmitButton>
          </form>
        </div>
        {disabledReason ? <p className="mt-3 rounded-xl bg-slate-50 px-3 py-2 text-xs font-bold text-slate-500">{disabledReason}</p> : null}
      </section>

      {children}
    </div>
  );
}
