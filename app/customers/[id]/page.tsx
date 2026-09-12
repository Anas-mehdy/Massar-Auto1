import {
  ArrowRight,
  Ban,
  Banknote,
  Car,
  FileText,
  Receipt,
  Save,
  WalletCards,
  Wrench,
} from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Children, type ReactNode } from "react";
import { DatabaseUnavailable } from "@/components/database-unavailable";
import { ConfirmSubmitButton } from "@/components/confirm-submit-button";
import { Button } from "@/components/ui/button";
import { getAuthContext } from "@/lib/auth/context";
import { isDatabaseConnectionError } from "@/lib/database-errors";
import { formatCurrency, formatDateTime } from "@/lib/format";
import { customerService } from "@/lib/services/customerService";
import {
  getCustomerDebtOverview,
  getCustomerInstallmentOverview,
} from "@/lib/services/customerOverviewService";
import { softDeleteCustomerAction, updateCustomerAction } from "../actions";

export const dynamic = "force-dynamic";

const inputClassName =
  "h-10 rounded-md border bg-background px-3 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20";
const textareaClassName =
  "min-h-24 rounded-md border bg-background px-3 py-2 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20";

type CustomerDetailsPageProps = { params: Promise<{ id: string }> };

export default async function CustomerDetailsPage({ params }: CustomerDetailsPageProps) {
  const { id } = await params;
  let customer: Awaited<ReturnType<typeof customerService.getCustomerById>>;
  let currency = "SAR";
  let canSeeDebt = false;
  let canSeeInstallments = false;
  let canSeeVehicles = false;
  let canSeeServiceOrders = false;
  let canManage = false;
  let canDeleteCustomer = false;
  let debt: Awaited<ReturnType<typeof getCustomerDebtOverview>> | null = null;
  let installments: Awaited<ReturnType<typeof getCustomerInstallmentOverview>> | null = null;

  try {
    const auth = await getAuthContext();
    currency = auth.shop.currency;
    canSeeDebt = auth.permissions.includes("debts:manage");
    canSeeInstallments = auth.permissions.includes("invoices:read");
    canSeeVehicles = auth.permissions.includes("vehicles:read");
    canSeeServiceOrders = auth.permissions.includes("service_orders:read");
    canManage = auth.permissions.includes("customers:manage");
    canDeleteCustomer = auth.permissions.includes("customers:delete");

    customer = await customerService.getCustomerById(auth.shop.id, id);
    if (customer) {
      [debt, installments] = await Promise.all([
        canSeeDebt ? getCustomerDebtOverview(auth.shop.id, id) : Promise.resolve(null),
        canSeeInstallments ? getCustomerInstallmentOverview(auth.shop.id, id) : Promise.resolve(null),
      ]);
    }
  } catch (error) {
    if (isDatabaseConnectionError(error)) return <DatabaseUnavailable />;
    throw error;
  }

  if (!customer) notFound();

  const vehicleCount = customer._count.vehicles;
  const serviceOrderCount = customer._count.autoServiceOrders;
  const legacyRepairCount = customer._count.repairOrders;
  const salesCount = customer._count.sales;
  const invoiceCount = customer._count.invoices;
  const installmentCount = installments?.plans.length ?? 0;
  const debtRecordCount = debt?.entryCount ?? 0;
  const linkedRecords =
    (canSeeVehicles ? vehicleCount : 0) +
    (canSeeServiceOrders ? serviceOrderCount : 0) +
    salesCount +
    invoiceCount +
    installmentCount +
    debtRecordCount;

  const salesTotal = customer.sales.reduce((sum, sale) => sum + Number(sale.total), 0);
  const invoiceTotal = customer.invoices.reduce((sum, invoice) => sum + Number(invoice.total), 0);
  const invoiceBalance = customer.invoices.reduce((sum, invoice) => sum + Number(invoice.balanceDue), 0);
  const hasFinancialLinks = Boolean(debt?.accountExists || installmentCount > 0);
  const canDelete = canDeleteCustomer && vehicleCount + serviceOrderCount + legacyRepairCount + salesCount + invoiceCount === 0 && !hasFinancialLinks;

  return (
    <div className="space-y-6">
      <div className="rounded-3xl border border-slate-200/60 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-4">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-primary to-indigo-900 text-xl text-white shadow-md">👤</div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">ملف العميل الشامل</span>
                <span className="rounded-full border border-indigo-200 bg-indigo-50 px-2.5 py-1 text-[10px] font-black text-indigo-700">{linkedRecords} سجلات متاحة</span>
              </div>
              <h1 className="mt-1 text-2xl font-black text-slate-900">{customer.name}</h1>
              <p className="mt-1 text-xs font-semibold text-slate-500">{customer.phone || "بدون رقم هاتف"}{customer.email ? ` · ${customer.email}` : ""}</p>
            </div>
          </div>
          <Button asChild variant="outline" className="h-11 rounded-xl px-5 font-bold">
            <Link href="/customers"><ArrowRight className="ml-1.5 h-4 w-4" />رجوع للقائمة</Link>
          </Button>
        </div>
      </div>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {canSeeVehicles && <SummaryCard label="المركبات" value={String(vehicleCount)} hint="المركبات المسجلة للعميل" tone="sky" />}
        {canSeeServiceOrders && <SummaryCard label="أوامر الصيانة" value={String(serviceOrderCount)} hint="سجل صيانة مركبات العميل" tone="teal" />}
        <SummaryCard label="إجمالي المبيعات" value={formatCurrency(salesTotal, currency)} hint={`${salesCount} عملية بيع / POS`} tone="amber" />
        <SummaryCard label="رصيد الفواتير" value={formatCurrency(invoiceBalance, currency)} hint={`${invoiceCount} فاتورة · إجمالي ${formatCurrency(invoiceTotal, currency)}`} tone="violet" />
        {canSeeDebt ? (
          <SummaryCard
            label="دفتر الديون"
            value={formatCurrency(debt?.balance ?? 0, currency)}
            hint={debt?.accountExists ? ((debt.balance ?? 0) > 0.005 ? "باقي عليه دين" : "مسدد بالكامل") : "لا يوجد دفتر دين"}
            tone={(debt?.balance ?? 0) > 0.005 ? "rose" : "emerald"}
          />
        ) : (
          <SummaryCard label="السجل المالي" value="—" hint="حسب صلاحيات الحساب" tone="slate" />
        )}
      </section>

      {canSeeInstallments && installments ? (
        <section className="grid gap-3 sm:grid-cols-3">
          <SummaryCard label="خطط الأقساط" value={String(installments.plans.length)} hint={`${installments.activeCount} خطة نشطة`} tone="teal" />
          <SummaryCard label="مدفوع من الأقساط" value={formatCurrency(installments.amountPaid, currency)} hint={`من أصل ${formatCurrency(installments.totalAmount, currency)}`} tone="emerald" />
          <SummaryCard label="متبقي بالأقساط" value={formatCurrency(installments.balanceDue, currency)} hint="إجمالي الرصيد المتبقي" tone={installments.balanceDue > 0.005 ? "rose" : "emerald"} />
        </section>
      ) : null}

      <div className={canManage ? "grid gap-6 lg:grid-cols-[1fr_340px]" : "grid gap-6"}>
        <div className="space-y-6">
          <div className="erp-section">
            <div className="mb-4 border-b border-slate-100 pb-3"><h2 className="text-sm font-black text-slate-800">بيانات العميل</h2></div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Info label="الاسم الكامل" value={customer.name} />
              <Info label="رقم الهاتف" value={customer.phone ?? "-"} />
              <Info label="البريد الإلكتروني" value={customer.email ?? "-"} />
              <Info label="تاريخ تسجيل العميل" value={formatDateTime(customer.createdAt)} />
              <div className="sm:col-span-2"><Info label="ملاحظات العميل" value={customer.notes ?? "-"} /></div>
            </div>
          </div>

          <div className="grid gap-6 xl:grid-cols-2 2xl:grid-cols-4">
            {canSeeVehicles && (
              <RelatedCard title={`المركبات (${vehicleCount})`} empty="لا توجد مركبات مسجلة." icon={<Car className="h-4 w-4 text-sky-600" />}>
                {customer.vehicles.map((vehicle) => <RelatedLink key={vehicle.id} href={`/vehicles/${vehicle.id}`} title={`${vehicle.make} ${vehicle.model}`} description={[vehicle.plateNumber, vehicle.year ? String(vehicle.year) : null].filter(Boolean).join(" · ") || "بدون لوحة أو سنة مسجلة"} meta={formatDateTime(vehicle.updatedAt)} />)}
              </RelatedCard>
            )}

            {canSeeServiceOrders && (
              <RelatedCard title={`أوامر الصيانة (${serviceOrderCount})`} empty="لا توجد أوامر صيانة." icon={<Wrench className="h-4 w-4 text-primary" />}>
                {customer.autoServiceOrders.map((order) => <RelatedLink key={order.id} href={`/service-orders/${order.id}`} title={order.orderNumber} description={`${order.vehicle.make} ${order.vehicle.model}${order.vehicle.plateNumber ? ` · ${order.vehicle.plateNumber}` : ""} — ${order.reportedIssue}`} meta={formatDateTime(order.receivedAt)} />)}
              </RelatedCard>
            )}

            <RelatedCard title={`المبيعات والـ POS (${salesCount})`} empty="لا توجد عمليات بيع." icon={<Receipt className="h-4 w-4 text-amber-500" />}>
              {customer.sales.map((sale) => <RelatedLink key={sale.id} href={`/sales/${sale.id}`} title={sale.receiptNumber ?? "عملية بيع"} description={formatCurrency(Number(sale.total), currency)} meta={formatDateTime(sale.soldAt)} />)}
            </RelatedCard>

            <RelatedCard title={`الفواتير (${invoiceCount})`} empty="لا توجد فواتير." icon={<FileText className="h-4 w-4 text-indigo-500" />}>
              {customer.invoices.map((invoice) => <RelatedLink key={invoice.id} href={`/invoices/${invoice.id}`} title={invoice.invoiceNumber} description={`${formatCurrency(Number(invoice.total), currency)} · متبقي ${formatCurrency(Number(invoice.balanceDue), currency)}`} meta={formatDateTime(invoice.issuedAt)} />)}
            </RelatedCard>
          </div>

          {canSeeDebt && debt ? (
            <div className="erp-section">
              <div className="mb-4 flex flex-col gap-3 border-b border-slate-100 pb-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-2"><Banknote className="h-5 w-5 text-rose-600" /><div><h2 className="text-sm font-black text-slate-900">دفتر الديون</h2><p className="mt-1 text-[11px] font-semibold text-slate-500">إجمالي الدين {formatCurrency(debt.totalDebt, currency)} · المحصل {formatCurrency(debt.totalCollected, currency)}</p></div></div>
                {debt.accountExists ? <Button asChild size="sm" variant="outline" className="rounded-xl font-black"><Link href={`/debts/${customer.id}`}>فتح دفتر الدين</Link></Button> : null}
              </div>
              {!debt.accountExists ? <p className="py-4 text-xs font-semibold text-slate-400">لا يوجد دفتر دين لهذا العميل.</p> : (
                <div className="space-y-2">
                  {debt.entries.map((entry) => {
                    const credit = entry.type === "PAYMENT" || entry.type === "ADJUSTMENT_CREDIT";
                    return <div key={entry.id} className={`flex flex-col gap-2 rounded-xl border p-3 sm:flex-row sm:items-center sm:justify-between ${entry.isReversed ? "opacity-40 line-through" : "border-slate-100 bg-slate-50/40"}`}>
                      <div><div className="text-xs font-black text-slate-800">{credit ? "تحصيل" : entry.type === "OPENING_BALANCE" ? "رصيد افتتاحي" : "دين"}</div><div className="mt-1 text-[10px] font-semibold text-slate-500">{entry.description || entry.sourceName || entry.reference || "بدون بيان"} · {formatDateTime(entry.occurredAt)}</div></div>
                      <div className={`font-numeric text-sm font-black ${credit ? "text-emerald-700" : "text-rose-700"}`}>{credit ? "−" : "+"}{formatCurrency(entry.amount, currency)}</div>
                    </div>;
                  })}
                </div>
              )}
            </div>
          ) : null}

          {canSeeInstallments && installments ? (
            <div className="erp-section">
              <div className="mb-4 flex items-center gap-2 border-b border-slate-100 pb-4"><WalletCards className="h-5 w-5 text-teal-600" /><div><h2 className="text-sm font-black text-slate-900">الأقساط والدفعات</h2><p className="mt-1 text-[11px] font-semibold text-slate-500">كل خطط التقسيط المرتبطة بهذا العميل، بما فيها المكتملة.</p></div></div>
              {installments.plans.length === 0 ? <p className="py-4 text-xs font-semibold text-slate-400">لا توجد خطط أقساط لهذا العميل.</p> : (
                <div className="grid gap-3 md:grid-cols-2">
                  {installments.plans.map((plan) => <Link key={plan.id} href={`/installments/${plan.id}`} className="rounded-xl border border-slate-100 bg-white p-4 transition hover:border-teal-200 hover:shadow-sm">
                    <div className="flex items-start justify-between gap-3"><div><div className="font-numeric text-xs font-black text-slate-900">{plan.planNumber}</div><div className="mt-1 text-xs font-bold text-slate-600">{plan.title}</div></div><span className={`rounded-full px-2 py-1 text-[10px] font-black ${plan.balanceDue > 0.005 ? "bg-amber-50 text-amber-700" : "bg-emerald-50 text-emerald-700"}`}>{plan.balanceDue > 0.005 ? "باقي عليه" : "مكتمل"}</span></div>
                    <div className="mt-3 grid grid-cols-2 gap-2 text-[10px] font-bold text-slate-500"><div>المدفوع<br/><span className="font-numeric text-xs text-emerald-700">{formatCurrency(plan.amountPaid, currency)}</span></div><div>المتبقي<br/><span className="font-numeric text-xs text-rose-700">{formatCurrency(plan.balanceDue, currency)}</span></div></div>
                    {plan.nextDueAt ? <div className="mt-3 border-t border-slate-100 pt-2 text-[10px] font-semibold text-slate-500">القسط القادم: {formatCurrency(plan.nextDueAmount ?? 0, currency)} · {formatDateTime(plan.nextDueAt)}</div> : null}
                  </Link>)}
                </div>
              )}
            </div>
          ) : null}

          {canDeleteCustomer && (
            <div className="erp-section border-rose-200 bg-rose-50/10">
              <div className="mb-4 border-b border-rose-100 pb-3"><h3 className="text-sm font-bold text-rose-800">منطقة الخطر | حذف العميل</h3></div>
              <p className="text-xs font-medium leading-relaxed text-slate-500">لا يمكن حذف عميل لديه أي مركبة أو أمر صيانة أو مبيعات أو فواتير أو أقساط أو دفتر ديون مرتبط.</p>
              <form action={softDeleteCustomerAction} className="mt-5">
                <input type="hidden" name="customerId" value={customer.id} />
                <ConfirmSubmitButton type="submit" variant="destructive" disabled={!canDelete} className="h-11 rounded-xl px-6 text-xs font-bold" message="هل تريد حذف هذا العميل؟ لا يمكن التراجع عن هذه العملية من الواجهة."><Ban className="ml-1.5 h-4 w-4" />حذف العميل نهائياً</ConfirmSubmitButton>
              </form>
            </div>
          )}
        </div>

        {canManage && (
          <div className="space-y-6">
            <form id="edit-customer" action={updateCustomerAction} className="erp-section scroll-mt-6">
              <input type="hidden" name="customerId" value={customer.id} />
              <div className="mb-4 border-b border-slate-100 pb-3"><h3 className="text-sm font-bold text-slate-800">تعديل بيانات العميل</h3></div>
              <div className="grid gap-4">
                <Field label="اسم العميل"><input className={inputClassName} name="name" required defaultValue={customer.name} /></Field>
                <Field label="الهاتف"><input className={`${inputClassName} font-numeric`} name="phone" defaultValue={customer.phone ?? ""} /></Field>
                <Field label="البريد الإلكتروني"><input className={inputClassName} name="email" type="email" defaultValue={customer.email ?? ""} /></Field>
                <Field label="ملاحظات"><textarea className={textareaClassName} name="notes" defaultValue={customer.notes ?? ""} /></Field>
                <Button type="submit" className="h-11 w-full rounded-xl font-bold"><Save className="ml-1.5 h-4 w-4" />حفظ التعديلات</Button>
              </div>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}

function SummaryCard({ label, value, hint, tone }: { label: string; value: string; hint: string; tone: "sky" | "amber" | "violet" | "rose" | "emerald" | "teal" | "slate" }) {
  const tones = { sky: "border-sky-200 bg-sky-50/60 text-sky-800", amber: "border-amber-200 bg-amber-50/60 text-amber-800", violet: "border-violet-200 bg-violet-50/60 text-violet-800", rose: "border-rose-200 bg-rose-50/60 text-rose-800", emerald: "border-emerald-200 bg-emerald-50/60 text-emerald-800", teal: "border-teal-200 bg-teal-50/60 text-teal-800", slate: "border-slate-200 bg-slate-50 text-slate-700" };
  return <div className={`rounded-2xl border p-4 ${tones[tone]}`}><div className="text-[10px] font-black opacity-70">{label}</div><div className="mt-2 font-numeric text-xl font-black">{value}</div><div className="mt-1 text-[10px] font-bold opacity-70">{hint}</div></div>;
}

function Field({ label, children }: { label: string; children: ReactNode }) { return <label className="grid gap-2 text-xs font-bold text-slate-500"><span className="text-xs font-bold text-slate-600">{label}</span>{children}</label>; }
function Info({ label, value }: { label: string; value: ReactNode }) { return <div className="rounded-xl border border-slate-100 bg-slate-50/30 p-4"><p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{label}</p><div className="mt-1.5 text-sm font-bold text-slate-700">{value}</div></div>; }
function RelatedCard({ title, empty, icon, children }: { title: string; empty: string; icon: ReactNode; children: ReactNode }) { const hasChildren = Children.count(children) > 0; return <div className="erp-section h-full"><div className="mb-4 flex items-center gap-2 border-b border-slate-100 pb-3.5">{icon}<h3 className="text-sm font-bold text-slate-800">{title}</h3></div><div className="space-y-3">{hasChildren ? children : <p className="py-2 text-xs font-medium text-slate-400">{empty}</p>}</div></div>; }
function RelatedLink({ href, title, description, meta }: { href: string; title: string; description: string; meta: string }) { return <Link href={href} className="block rounded-xl border border-slate-100 bg-white p-3.5 transition hover:border-primary/20 hover:shadow-sm"><div className="flex items-center justify-between gap-3"><p className="font-numeric text-sm font-bold text-slate-800">{title}</p><p className="shrink-0 font-numeric text-[9px] font-semibold text-slate-400">{meta}</p></div><p className="mt-1 line-clamp-2 text-xs leading-relaxed text-slate-500">{description}</p></Link>; }
