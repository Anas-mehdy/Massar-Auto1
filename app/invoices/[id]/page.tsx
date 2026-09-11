import { InvoiceStatus, InvoiceType } from "@prisma/client";
import { Ban, MessageCircle, Printer, ArrowRight, FileText, WalletCards } from "lucide-react";
import { cn } from "@/lib/utils";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ConfirmSubmitButton } from "@/components/confirm-submit-button";
import { DatabaseUnavailable } from "@/components/database-unavailable";
import { InvoiceStatusBadge, PaymentMethodBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { SubmitButton } from "@/components/submit-button";
import { PaymentSourceField } from "@/components/payment-source-field";
import { MoneyDestinationField } from "@/components/money-destination-field";
import { getCurrentShopContext } from "@/lib/current-shop";
import { isDatabaseConnectionError } from "@/lib/database-errors";
import { financialTransferService } from "@/lib/services/financialTransferService";
import { bankAccountService } from "@/lib/services/bankAccountService";
import { invoiceService } from "@/lib/services/invoiceService";
import { paymentSourceService } from "@/lib/services/paymentSourceService";
import { whatsappService } from "@/lib/services/whatsappService";
import { Field, formatDate, formatMoney, getInvoiceTypeLabel, inputClassName, paymentMethodOptions, selectClassName, textareaClassName } from "../_components";
import { addPaymentAction, voidInvoiceAction } from "../actions";
import { AutoServiceInvoiceDetails } from "./_auto-service-details";

export const dynamic = "force-dynamic";

type InvoiceDetailsPageProps = { params: Promise<{ id: string }>; searchParams: Promise<{ paymentError?: string; invoiceError?: string }> };

export default async function InvoiceDetailsPage({ params, searchParams }: InvoiceDetailsPageProps) {
  const { id } = await params;
  const query = await searchParams;
  let invoice: Awaited<ReturnType<typeof invoiceService.getInvoiceById>>;
  let paymentSources: Awaited<ReturnType<typeof paymentSourceService.listPaymentSourceOptions>> = [];
  let wallets: Awaited<ReturnType<typeof financialTransferService.listWallets>> = [];
  let bankAccounts: Awaited<ReturnType<typeof bankAccountService.listAccounts>> = [];
  let currency = "SAR";
  let shopName = "";
  let timeZone = "UTC";
  try {
    const context = await getCurrentShopContext();
    currency = context.currency;
    shopName = context.shopName;
    timeZone = context.timeZone;
    [invoice, paymentSources, wallets, bankAccounts] = await Promise.all([
      invoiceService.getInvoiceById(context.shopId, id),
      paymentSourceService.listPaymentSourceOptions(context.shopId),
      financialTransferService.listWallets(context.shopId),
      bankAccountService.listAccounts(context.shopId),
    ]);
  } catch (error) {
    if (isDatabaseConnectionError(error)) return <DatabaseUnavailable />;
    throw error;
  }

  if (!invoice) notFound();
  const whatsappShare = whatsappService.buildInvoiceShareLinkFromData(invoice, shopName, currency);
  const canAddPayment = invoice.status !== InvoiceStatus.VOID && invoice.status !== InvoiceStatus.PAID && Number(invoice.balanceDue) > 0 && !invoice.installmentPlan;
  const autoInvoiceLocked = Boolean(invoice.autoServiceOrder && ["DELIVERED", "CLOSED"].includes(invoice.autoServiceOrder.status));
  const canVoid = invoice.status !== InvoiceStatus.VOID && !invoice.installmentPlan && !autoInvoiceLocked;
  const hasPayments = invoice.payments.length > 0;

  return <div className="space-y-6">
    <div className="rounded-3xl border border-slate-200/50 bg-white/95 p-6 shadow-sm shadow-slate-100/40">
      <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4"><div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-primary to-indigo-900 text-white shadow-md shadow-primary/10"><FileText className="h-6 w-6" /></div><div><div className="flex items-center gap-2 flex-wrap"><span className="text-[10px] font-black text-slate-400 uppercase tracking-wider">{getInvoiceTypeLabel(invoice.type)}</span><span className="text-[10px] font-bold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-200/50">فاتورة ضريبية</span></div><h2 className="text-2xl font-black text-slate-800 font-numeric mt-1 flex items-center gap-2">{invoice.invoiceNumber}</h2><p className="text-xs font-medium text-slate-400 mt-1">العميل المرتبط: <span className="font-semibold text-slate-700">{invoice.customer?.name ?? "عميل نقدي"}</span></p></div></div>
        <div className="flex flex-wrap gap-2.5"><Button asChild variant="outline" className="font-bold shadow-sm border-slate-200 hover:bg-slate-50 rounded-xl px-5 h-11"><Link href={`/invoices/${invoice.id}/print`} target="_blank"><Printer className="h-4 w-4 ml-1.5 text-slate-700" />طباعة الفاتورة</Link></Button><Button asChild variant="outline" className="font-bold shadow-sm border-slate-200 hover:bg-slate-50 rounded-xl px-5 h-11"><Link href="/invoices"><ArrowRight className="h-4 w-4 ml-1.5" />رجوع للقائمة</Link></Button></div>
      </div>
    </div>

    {query.paymentError ? <ErrorBox message={query.paymentError} /> : null}
    {query.invoiceError ? <ErrorBox message={query.invoiceError} /> : null}

    <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
      <div className="space-y-6">
        <div className="erp-section">
          <div className="border-b border-slate-100/60 pb-3 mb-5 flex items-center justify-between"><h3 className="font-bold text-slate-800 text-sm">الملخص المالي للفاتورة</h3><InvoiceStatusBadge status={invoice.status} /></div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Info label="حالة السداد" value={<InvoiceStatusBadge status={invoice.status} />} /><Info label="العميل" value={invoice.customer?.name ?? "-"} /><Info label="الهاتف" value={<span className="font-numeric">{invoice.customer?.phone ?? "-"}</span>} /><Info label="الإجمالي قبل الخصم" value={<span className="font-numeric">{formatMoney(invoice.subtotal, currency)}</span>} /><Info label="الخصم الإجمالي" value={<span className="font-numeric text-rose-600">{Number(invoice.discountTotal) > 0 ? formatMoney(-Number(invoice.discountTotal), currency) : formatMoney(0, currency)}</span>} /><Info label="الضريبة المضافة" value={<span className="font-numeric">{formatMoney(invoice.taxTotal, currency)}</span>} /><Info label="الإجمالي النهائي" value={<span className="font-numeric text-slate-800 font-bold">{formatMoney(invoice.total, currency)}</span>} /><Info label="المبلغ المدفوع" value={<span className="font-numeric text-emerald-600 font-bold">{formatMoney(invoice.amountPaid, currency)}</span>} /><Info label="المبلغ المتبقي" value={<span className={cn("font-numeric font-bold", Number(invoice.balanceDue) > 0 ? "text-amber-600" : "text-slate-500")}>{formatMoney(invoice.balanceDue, currency)}</span>} /><Info label="تاريخ الإصدار" value={<span className="font-numeric">{formatDate(invoice.issuedAt, timeZone)}</span>} /><Info label="تاريخ الاستحقاق" value={<span className="font-numeric">{formatDate(invoice.dueAt, timeZone)}</span>} /><Info label="تاريخ السداد الكامل" value={<span className="font-numeric">{formatDate(invoice.paidAt, timeZone)}</span>} />
            {invoice.type === InvoiceType.REPAIR && invoice.repairOrder ? <Info label="رقم تذكرة الصيانة" value={<Link href={`/repair-orders/${invoice.repairOrder.id}`} className="font-numeric text-primary hover:underline font-bold">{invoice.repairOrder.ticketNumber}</Link>} /> : null}
            {invoice.type === InvoiceType.SALE ? <Info label="رقم إيصال البيع" value={<Link href={`/sales/${invoice.sale?.id}`} className="font-numeric text-primary hover:underline font-bold">{invoice.sale?.receiptNumber ?? "-"}</Link>} /> : null}
          </div>
        </div>

        <AutoServiceInvoiceDetails invoiceId={invoice.id} />

        <div className="erp-section">
          <div className="border-b border-slate-100/60 pb-3 mb-4"><h3 className="font-bold text-slate-800 text-sm">سجل وحركات المدفوعات</h3></div>
          {invoice.payments.length === 0 ? <p className="text-xs text-slate-400 font-medium py-6 text-center">لا توجد دفعات أو سندات قبض مسجلة لهذه الفاتورة بعد.</p> : <div className="overflow-hidden rounded-xl border border-slate-200/50"><div className="overflow-x-auto"><table className="erp-table min-w-[620px]"><thead><tr><th className="text-slate-700">المبلغ المدفوع</th><th className="text-slate-700">طريقة الدفع</th><th className="text-slate-700">مصدر الدفع</th><th className="text-slate-700">المرجع / السند</th><th className="text-slate-700">الملاحظة</th><th className="text-slate-700">تاريخ الدفع</th></tr></thead><tbody>{invoice.payments.map((payment) => <tr key={payment.id} className="align-middle"><td className="font-extrabold font-numeric text-slate-800">{formatMoney(payment.amount, currency)}</td><td><PaymentMethodBadge method={payment.method} /></td><td className="font-bold text-indigo-700">{payment.sourceName ?? "-"}</td><td className="font-numeric text-slate-500 font-medium">{payment.reference ?? "-"}</td><td className="text-slate-500 text-xs font-medium">{payment.note ?? "-"}</td><td className="font-numeric text-slate-500 font-medium">{formatDate(payment.paidAt, timeZone)}</td></tr>)}</tbody></table></div></div>}
        </div>
      </div>

      <div className="space-y-6">
        <form action={addPaymentAction} className="erp-section">
          <input type="hidden" name="invoiceId" value={invoice.id} />
          <div className="border-b border-slate-100/60 pb-3 mb-4"><h3 className="font-bold text-slate-800 text-sm">تسجيل سند قبض / دفعة</h3></div>
          <div className="grid gap-4">
            <Field label="المبلغ المدفوع"><input className={`${inputClassName} font-numeric`} name="amount" min="0.01" max={invoice.balanceDue.toString()} required step="0.01" type="number" placeholder="0.00" disabled={!canAddPayment} /></Field>
            <Field label="طريقة الدفع"><select className={selectClassName} name="method" defaultValue="CASH" disabled={!canAddPayment}>{paymentMethodOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></Field>
            <MoneyDestinationField
              wallets={wallets.map((wallet) => ({ id: wallet.id, name: wallet.name, balance: Number(wallet.currentBalance) }))}
              bankAccounts={bankAccounts.map((account) => ({ id: account.id, name: account.name, bankName: account.bankName, balance: Number(account.currentBalance) }))}
              currency={currency}
              disabled={!canAddPayment}
            />
            <PaymentSourceField options={paymentSources} disabled={!canAddPayment} />
            <Field label="رقم المرجع (سند القبض)"><input className={inputClassName} name="reference" placeholder="مثال: تحويل بنكي، شبكة، كاش..." disabled={!canAddPayment} /></Field>
            <Field label="تاريخ الدفع" helper="اتركه فارغاً للاستخدام التلقائي لتاريخ اليوم"><input className={`${inputClassName} font-numeric`} name="paidAt" type="date" disabled={!canAddPayment} /></Field>
            <Field label="ملاحظات الحركة"><textarea className={textareaClassName} name="note" placeholder="ملاحظات إضافية حول الدفعة المسددة..." disabled={!canAddPayment} /></Field>
            <SubmitButton disabled={!canAddPayment} className="font-bold shadow-sm w-full h-11 rounded-xl" loadingText="جاري تسجيل الدفعة...">إضافة دفعة قبض جديدة</SubmitButton>
          </div>
        </form>

        <div className="erp-section space-y-4">
          <div className="border-b border-slate-100/60 pb-3"><h3 className="font-bold text-slate-800 text-sm font-numeric">خيارات وإجراءات الفاتورة</h3></div>
          <div className="grid gap-3">
            {invoice.installmentPlan ? <Button asChild className="w-full h-11 rounded-xl text-xs font-black"><Link href={`/installments/${invoice.installmentPlan.id}`}><WalletCards className="h-4 w-4 ml-1.5" />عرض خطة الأقساط {invoice.installmentPlan.planNumber}</Link></Button> : canAddPayment && invoice.customer ? <Button asChild variant="outline" className="w-full h-11 rounded-xl text-xs font-black border-teal-300 text-teal-700 hover:bg-teal-50"><Link href={`/installments/new?invoiceId=${invoice.id}`}><WalletCards className="h-4 w-4 ml-1.5" />تحويل الرصيد المتبقي إلى أقساط</Link></Button> : null}
            <Button asChild variant="outline" className="w-full font-bold shadow-sm border-slate-200/80 hover:bg-slate-50 rounded-xl h-11 text-xs justify-center"><Link href={`/invoices/${invoice.id}/print`} target="_blank"><Printer className="h-4 w-4 ml-1.5 shrink-0 text-slate-700" />طباعة الفاتورة (حراري 80mm)</Link></Button>
            {whatsappShare.ok ? <Button asChild variant="outline" className="w-full font-bold shadow-sm border-slate-200 hover:bg-emerald-50 hover:text-emerald-700 rounded-xl h-11 text-xs justify-center"><a href={whatsappShare.url} target="_blank" rel="noreferrer"><MessageCircle className="h-4.5 w-4.5 ml-2 text-emerald-600 shrink-0" />إرسال الفاتورة عبر واتساب</a></Button> : <div className="rounded-xl border border-slate-100 bg-slate-50/50 p-3.5 text-[10px] text-slate-400 font-bold leading-normal text-right">⚠️ {whatsappShare.message}</div>}
            <form action={voidInvoiceAction}><input type="hidden" name="invoiceId" value={invoice.id} /><ConfirmSubmitButton type="submit" variant="destructive" disabled={!canVoid} className="w-full font-bold shadow-sm rounded-xl h-11 text-xs justify-center" message={hasPayments ? "سيتم إلغاء الفاتورة وعكس جميع الدفعات وسندات القبض المسجلة عليها. هل تريد المتابعة؟" : "هل تريد إلغاء هذه الفاتورة؟"}><Ban className="h-4 w-4 ml-1.5 shrink-0" />{hasPayments ? "إلغاء الفاتورة وعكس الدفعات" : "إلغاء الفاتورة (Void)"}</ConfirmSubmitButton></form>
            {autoInvoiceLocked ? <p className="rounded-xl border border-violet-200/70 bg-violet-50/70 p-3 text-right text-[10px] font-bold leading-relaxed text-violet-800">تم تسليم المركبة، لذلك تم قفل إلغاء الفاتورة المباشر حفاظاً على سجل التسليم والذمم. أي تصحيح لاحق يجب أن يتم عبر مسار إشعار دائن/تسوية مالية.</p> : null}
            {hasPayments && canVoid ? <p className="text-[10px] leading-relaxed text-amber-700 font-bold bg-amber-50/70 p-3 rounded-xl border border-amber-200/70 text-right">⚠️ سيتم عكس أثر {invoice.payments.length} دفعة/سند قبض وحفظ سجلاتها تاريخياً، ثم تحويل الفاتورة إلى ملغاة. بعدها يمكن حذف تذكرة الصيانة المرتبطة إذا لم يوجد مانع آخر.</p> : null}
            {invoice.installmentPlan && invoice.status !== InvoiceStatus.VOID ? <p className="text-[10px] leading-relaxed text-slate-400 font-bold bg-slate-50/50 p-3 rounded-xl border border-slate-100/50 text-right">⚠️ هذه الفاتورة مرتبطة بخطة أقساط. يجب إلغاء أو معالجة خطة الأقساط أولاً قبل إلغاء الفاتورة.</p> : null}
          </div>
        </div>
      </div>
    </div>
  </div>;
}

function Info({ label, value }: { label: string; value: React.ReactNode }) { return <div className="rounded-xl border border-slate-100/50 bg-slate-50/20 p-4 transition duration-200 hover:bg-slate-50/40"><p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{label}</p><div className="mt-1.5 text-sm font-bold text-slate-700 leading-normal">{value}</div></div>; }
function ErrorBox({ message }: { message: string }) { return <div className="rounded-xl border border-rose-100 bg-rose-50/50 p-4 text-xs font-semibold text-rose-600">{message}</div>; }