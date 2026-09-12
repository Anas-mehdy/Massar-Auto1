import { randomUUID } from "node:crypto";
import { InstallmentPlanStatus, InstallmentScheduleStatus, PaymentMethod } from "@prisma/client";
import { ArrowRight, CalendarDays, CheckCircle2, ExternalLink, MessageCircle, QrCode, Receipt, RefreshCw, UserRound, WalletCards } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import QRCode from "qrcode";

import { SubmitButton } from "@/components/submit-button";
import { PaymentSourceField } from "@/components/payment-source-field";
import { Button } from "@/components/ui/button";
import { can, requirePermission } from "@/lib/auth/context";
import { formatCurrency, formatDate, formatDateTime } from "@/lib/format";
import { createInstallmentPublicToken } from "@/lib/installment-public-link";
import { financialTransferService } from "@/lib/services/financialTransferService";
import { bankAccountService } from "@/lib/services/bankAccountService";
import { installmentService } from "@/lib/services/installmentService";
import { paymentSourceService } from "@/lib/services/paymentSourceService";
import { localDateString, timeZoneForCountry } from "@/lib/timezone";
import { addInstallmentPaymentAction, rotateInstallmentLinkAction } from "../actions";
import { PlanStatus } from "../_components";
import { CopyInstallmentLink } from "./_copy-link";
import { buildAppUrl } from "@/lib/app-url";

export const dynamic = "force-dynamic";

export default async function InstallmentDetailsPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string; created?: string; paid?: string; linkReset?: string; updated?: string }> }) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const auth = await requirePermission("invoices:read");
  const canCollect = can(auth, "invoices:pay");
  const timeZone = timeZoneForCountry(auth.shop.countryCode);
  const todayKey = localDateString(new Date(), timeZone);
  const plan = await installmentService.getPlanById(auth.shop.id, id);
  if (!plan) notFound();

  const [paymentSources, wallets, bankAccounts] = canCollect
    ? await Promise.all([
        paymentSourceService.listPaymentSourceOptions(auth.shop.id),
        financialTransferService.listWallets(auth.shop.id),
        bankAccountService.listAccounts(auth.shop.id),
      ])
    : [[], [], []];

  const token = await createInstallmentPublicToken(plan.id, plan.publicTokenVersion);
  const publicUrl = buildAppUrl(`/installment-track/${token}`);
  const qrData = await QRCode.toDataURL(publicUrl, { width: 220, margin: 1, errorCorrectionLevel: "M" });
  const next = plan.schedules.find((item) => item.status !== InstallmentScheduleStatus.PAID && item.status !== InstallmentScheduleStatus.CANCELLED);
  const overdue = plan.status === InstallmentPlanStatus.ACTIVE && Boolean(next && localDateString(next.dueAt, timeZone) < todayKey);
  const whatsappUrl = plan.customer.phone ? `https://wa.me/${plan.customer.phone.replace(/\D/g, "")}?text=${encodeURIComponent(`مرحباً ${plan.customer.name}، هذا رابط متابعة الأقساط: ${publicUrl}`)}` : null;

  return <div className="space-y-6">
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div><Link href="/installments" className="mb-2 inline-flex items-center text-xs font-bold text-slate-500 hover:text-teal-700"><ArrowRight className="ml-1 h-4 w-4" />الدفعات والأقساط</Link><div className="flex items-center gap-3"><h1 className="text-2xl font-black text-slate-950">{plan.planNumber}</h1><PlanStatus status={plan.status} overdue={overdue} /></div><p className="mt-1 text-sm text-slate-500">{plan.title}</p></div>
      {canCollect && <Button asChild variant="outline"><Link href="/installments/new">خطة جديدة</Link></Button>}
    </div>

    {(query.created || query.paid || query.linkReset || query.updated) && <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-bold text-emerald-700">{query.created ? "تم إنشاء الخطة وجدول الأقساط بنجاح." : query.paid ? "تم تسجيل الدفعة وتوزيعها على الأقساط وتحديث رصيد المال بنجاح." : query.updated ? "تم حفظ تعديلات خطة الأقساط بنجاح." : "تم إلغاء الرابط السابق وإصدار رابط جديد."}</div>}
    {query.error && <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm font-bold text-rose-700">{query.error}</div>}

    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <Metric label="المبلغ الإجمالي" value={formatCurrency(plan.totalAmount, auth.shop.currency)} icon={Receipt} />
      <Metric label="المدفوع" value={formatCurrency(plan.amountPaid, auth.shop.currency)} icon={CheckCircle2} accent="emerald" />
      <Metric label="المتبقي" value={formatCurrency(plan.balanceDue, auth.shop.currency)} icon={WalletCards} accent="amber" />
      <Metric label="القسط القادم" value={next ? formatCurrency(Number(next.amount) - Number(next.amountPaid), auth.shop.currency) : "مكتمل"} helper={next ? formatDate(next.dueAt, timeZone) : undefined} icon={CalendarDays} accent={overdue ? "rose" : "teal"} />
    </div>

    <div className="grid gap-6 xl:grid-cols-[1fr_340px]">
      <div className="space-y-6">
        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 p-5"><h2 className="font-black text-slate-900">جدول الأقساط</h2><p className="mt-1 text-xs text-slate-500">{plan.installmentCount} أقساط — {plan.frequency === "MONTHLY" ? "شهري" : "أسبوعي"}</p></div>
          <div className="overflow-x-auto"><table className="erp-table min-w-[650px]"><thead><tr><th>#</th><th>موعد الاستحقاق</th><th>قيمة القسط</th><th>المدفوع منه</th><th>المتبقي</th><th>الحالة</th></tr></thead><tbody>{plan.schedules.map((item) => {
            const itemOverdue = item.status !== InstallmentScheduleStatus.PAID && localDateString(item.dueAt, timeZone) < todayKey;
            return <tr key={item.id}><td className="font-black">{item.installmentNo}</td><td className={itemOverdue ? "font-bold text-rose-700" : "font-medium text-slate-700"}>{formatDate(item.dueAt, timeZone)}</td><td className="font-numeric font-black">{formatCurrency(item.amount, auth.shop.currency)}</td><td className="font-numeric text-emerald-700">{formatCurrency(item.amountPaid, auth.shop.currency)}</td><td className="font-numeric font-bold text-amber-700">{formatCurrency(Number(item.amount) - Number(item.amountPaid), auth.shop.currency)}</td><td><ScheduleStatus status={item.status} overdue={itemOverdue} /></td></tr>;
          })}</tbody></table></div>
        </section>

        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 p-5"><h2 className="font-black text-slate-900">سجل الدفعات</h2></div>
          {plan.payments.length === 0 ? <div className="p-8 text-center text-sm text-slate-400">لا توجد دفعات مسجلة بعد.</div> : <div className="overflow-x-auto"><table className="erp-table min-w-[720px]"><thead><tr><th>التاريخ</th><th>المبلغ</th><th>الطريقة</th><th>مصدر الدفع</th><th>المرجع</th><th>ملاحظات</th></tr></thead><tbody>{plan.payments.map((payment) => <tr key={payment.id}><td>{formatDateTime(payment.paidAt, timeZone)}</td><td className="font-numeric font-black text-emerald-700">{formatCurrency(payment.amount, auth.shop.currency)}</td><td>{paymentMethod(payment.method)}</td><td className="font-bold text-indigo-700">{payment.sourceName || "-"}</td><td>{payment.reference || "-"}</td><td>{payment.isDownPayment ? "دفعة أولى" : payment.note || "-"}</td></tr>)}</tbody></table></div>}
        </section>
      </div>

      <aside className="space-y-6">
        <section className="erp-section">
          <div className="mb-4 flex items-center gap-2"><UserRound className="h-5 w-5 text-teal-600" /><h2 className="font-black text-slate-900">بيانات الاتفاق</h2></div>
          <dl className="space-y-3 text-xs"><Info label="العميل" value={plan.customer.name} /><Info label="الهاتف" value={plan.customer.phone || "-"} /><Info label="المصدر" value={plan.invoice ? `الفاتورة ${plan.invoice.invoiceNumber}` : "اتفاق مستقل"} /><Info label="الدفعة الأولى" value={formatCurrency(plan.downPayment, auth.shop.currency)} /><Info label="تاريخ الإنشاء" value={formatDate(plan.createdAt, timeZone)} /></dl>
          {plan.notes && <p className="mt-4 rounded-xl bg-slate-50 p-3 text-xs leading-6 text-slate-600">{plan.notes}</p>}
        </section>

        {canCollect && plan.status === InstallmentPlanStatus.ACTIVE && <form action={addInstallmentPaymentAction} className="erp-section space-y-4">
          <input type="hidden" name="planId" value={plan.id} /><input type="hidden" name="clientGeneratedId" value={randomUUID()} />
          <h2 className="font-black text-slate-900">تسجيل دفعة جديدة</h2>
          <label className="grid gap-2"><span className="text-xs font-bold">المبلغ</span><input name="amount" className="erp-input" type="number" min="0.01" max={plan.balanceDue.toString()} step="0.01" required /></label>
          <label className="grid gap-2"><span className="text-xs font-bold">طريقة الدفع</span><select name="method" className="erp-input" defaultValue={PaymentMethod.CASH}><option value="CASH">نقدي</option><option value="CARD">بطاقة</option><option value="BANK_TRANSFER">تحويل بنكي</option><option value="OTHER">أخرى</option></select></label>
          <div className="grid gap-3 rounded-xl border border-teal-100 bg-teal-50/40 p-3"><label className="grid gap-2"><span className="text-xs font-bold text-slate-700">مكان وصول المال</span><select name="moneyDestination" className="erp-input" defaultValue="DRAWER"><option value="DRAWER">الدرج النقدي</option><option value="WALLET">محفظة إلكترونية</option><option value="BANK">حساب بنكي</option><option value="OTHER">بدون تحديث رصيد</option></select></label><label className="grid gap-2"><span className="text-xs font-bold text-slate-700">المحفظة</span><select name="walletId" className="erp-input" defaultValue=""><option value="">اخترها فقط عند التحصيل على محفظة</option>{wallets.map((wallet) => <option key={wallet.id} value={wallet.id}>{wallet.name} — {formatCurrency(wallet.currentBalance, auth.shop.currency)}</option>)}</select></label><label className="grid gap-2"><span className="text-xs font-bold text-slate-700">الحساب البنكي</span><select name="bankAccountId" className="erp-input" defaultValue=""><option value="">اختره فقط عند التحصيل على البنك</option>{bankAccounts.map((account) => <option key={account.id} value={account.id}>{account.name}{account.bankName ? ` — ${account.bankName}` : ""} — {formatCurrency(account.currentBalance, auth.shop.currency)}</option>)}</select></label><p className="text-[11px] font-semibold leading-5 text-teal-700">القسط يبقى دفعة واحدة محاسبياً؛ الاختيار هنا يحدد فقط أين أصبح المال فعلياً.</p></div>
          <PaymentSourceField options={paymentSources} />
          <label className="grid gap-2"><span className="text-xs font-bold">المرجع</span><input name="reference" className="erp-input" placeholder="اختياري" /></label>
          <label className="grid gap-2"><span className="text-xs font-bold">تاريخ الدفع</span><input name="paidAt" className="erp-input" type="date" /></label>
          <label className="grid gap-2"><span className="text-xs font-bold">ملاحظات</span><textarea name="note" className="erp-textarea" /></label>
          <SubmitButton className="h-11 w-full rounded-xl font-black" loadingText="جاري تسجيل الدفعة...">تسجيل وتوزيع الدفعة</SubmitButton>
        </form>}

        <section className="erp-section text-center">
          <QrCode className="mx-auto h-5 w-5 text-violet-600" /><h2 className="mt-2 font-black text-slate-900">رابط متابعة العميل</h2>
          <Image src={qrData} width={180} height={180} alt={`QR ${plan.planNumber}`} className="mx-auto my-4 rounded-xl border border-slate-100" unoptimized />
          <div className="grid gap-2"><CopyInstallmentLink value={publicUrl} /><Button asChild variant="outline" className="h-10 text-xs font-black"><a href={publicUrl} target="_blank" rel="noreferrer"><ExternalLink className="ml-2 h-4 w-4" />فتح صفحة العميل</a></Button>{whatsappUrl && <Button asChild variant="outline" className="h-10 text-xs font-black text-emerald-700"><a href={whatsappUrl} target="_blank" rel="noreferrer"><MessageCircle className="ml-2 h-4 w-4" />إرسال عبر WhatsApp</a></Button>}</div>
          {canCollect && <form action={rotateInstallmentLinkAction} className="mt-3"><input type="hidden" name="planId" value={plan.id} /><SubmitButton variant="ghost" className="h-9 w-full text-[11px] text-slate-500" loadingText="جاري التغيير..."><RefreshCw className="ml-1 h-3.5 w-3.5" />إلغاء الرابط السابق وإصدار جديد</SubmitButton></form>}
        </section>
      </aside>
    </div>
  </div>;
}

function Metric({ label, value, helper, icon: Icon, accent = "teal" }: { label: string; value: string; helper?: string; icon: typeof Receipt; accent?: "teal" | "emerald" | "amber" | "rose" }) { const colors = { teal: "text-teal-700 bg-teal-50", emerald: "text-emerald-700 bg-emerald-50", amber: "text-amber-700 bg-amber-50", rose: "text-rose-700 bg-rose-50" }; return <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><span className={`flex h-9 w-9 items-center justify-center rounded-xl ${colors[accent]}`}><Icon className="h-4 w-4" /></span><div className="mt-3 text-xs font-bold text-slate-500">{label}</div><div className="mt-1 text-lg font-black font-numeric text-slate-900">{value}</div>{helper && <div className="mt-1 text-[10px] font-bold text-slate-400">{helper}</div>}</div>; }
function Info({ label, value }: { label: string; value: string }) { return <div className="flex items-start justify-between gap-3 border-b border-slate-100 pb-2"><dt className="text-slate-500">{label}</dt><dd className="text-left font-bold text-slate-800">{value}</dd></div>; }
function ScheduleStatus({ status, overdue }: { status: InstallmentScheduleStatus; overdue: boolean }) { if (status === InstallmentScheduleStatus.PAID) return <span className="text-xs font-black text-emerald-700">مدفوع</span>; if (status === InstallmentScheduleStatus.PARTIALLY_PAID) return <span className="text-xs font-black text-amber-700">مدفوع جزئياً</span>; return <span className={`text-xs font-black ${overdue ? "text-rose-700" : "text-slate-600"}`}>{overdue ? "متأخر" : "قادم"}</span>; }
function paymentMethod(method: PaymentMethod) { return { CASH: "نقدي", CARD: "بطاقة", BANK_TRANSFER: "تحويل بنكي", OTHER: "أخرى" }[method]; }
