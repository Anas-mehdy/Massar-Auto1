import { ArrowRight, Eye, Phone, Save, Trash2, Truck, Wrench, Receipt, Boxes } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { DatabaseUnavailable } from "@/components/database-unavailable";
import { PageHeader } from "@/components/page-header";
import { RepairStatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { SubmitButton } from "@/components/submit-button";
import { getCurrentShopContext } from "@/lib/current-shop";
import { isDatabaseConnectionError } from "@/lib/database-errors";
import { formatCurrency, formatDate } from "@/lib/format";
import { SupplierPurchaseAccount } from "./_purchase-account";
import { SupplierLedgerPanel } from "./_supplier-ledger";
import { purchaseReceivingService } from "@/lib/services/purchaseReceivingService";
import { supplierLedgerService } from "@/lib/services/supplierLedgerService";
import { supplierService } from "@/lib/services/supplierService";
import { dateInputValueForTimeZone } from "@/lib/timezone";
import { updateSupplierAction, deleteSupplierAction } from "../actions";

export const dynamic = "force-dynamic";

const inputClassName =
  "h-10 rounded-md border bg-background px-3 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20";

type SupplierDetailsPageProps = {
  params: Promise<{
    id: string;
  }>;
};

export default async function SupplierDetailsPage({
  params,
}: SupplierDetailsPageProps) {
  const { id } = await params;
  let supplier: Awaited<ReturnType<typeof supplierService.getSupplierById>>;
  let currency = "SAR";
  const context = await getCurrentShopContext();

  try {

    currency = context.currency;
    supplier = await supplierService.getSupplierById(context.shopId, id);
  } catch (error) {
    if (isDatabaseConnectionError(error)) {
      return <DatabaseUnavailable />;
    }

    throw error;
  }

  if (!supplier) {
    notFound();
  }

  const canReadPurchases = context.permissions.includes("inventory:read");
  const canPayPurchases = context.permissions.includes("inventory:manage");
  const [purchaseAccount, wallets, drawerBalance, supplierLedger] = await Promise.all([
    canReadPurchases ? purchaseReceivingService.getSupplierPurchaseAccount(context.shopId, id) : null,
    canReadPurchases && canPayPurchases ? purchaseReceivingService.listPurchaseFinancialWallets(context.shopId) : [],
    canReadPurchases && canPayPurchases ? purchaseReceivingService.getPurchaseDrawerBalance(context.shopId) : null,
    canReadPurchases ? supplierLedgerService.getSupplierLedger(context.shopId, id) : null,
  ]);
  const todayInput = dateInputValueForTimeZone(new Date(), context.timeZone);

  const totalPartsCost = supplier.repairOrders.reduce((sum, ro) => {
    return sum + (Number(ro.partCost) || 0);
  }, 0);
  const totalStockUnits = supplier.stockReceipts.reduce((sum, receipt) => sum + receipt.quantity, 0);
  const totalStockValue = supplier.stockReceipts.reduce(
    (sum, receipt) => sum + receipt.quantity * Number(receipt.unitCostSnapshot ?? 0),
    0,
  );
  const lastStockReceipt = supplier.stockReceipts[0] ?? null;

  return (
    <div className="space-y-6">
      <PageHeader
        title={supplier.name}
        description="تفاصيل المورد وسجل قطع الغيار وتوريدات المخزون"
        actions={
          <Button asChild variant="outline">
            <Link href="/suppliers">
              <ArrowRight className="h-4 w-4 ml-1.5" aria-hidden="true" />
              رجوع للموردين
            </Link>
          </Button>
        }
      />

      {supplierLedger && <SupplierLedgerPanel
        supplierId={id}
        currency={currency}
        today={todayInput}
        canManage={canPayPurchases}
        manualOutstanding={supplierLedger.manualOutstanding}
        purchaseOutstanding={supplierLedger.purchaseOutstanding}
        supplierCredit={supplierLedger.supplierCredit}
        totalPayable={supplierLedger.totalPayable}
        netBalance={supplierLedger.netBalance}
        drawerBalance={Number(drawerBalance ?? 0)}
        wallets={wallets.map(wallet => ({ id: wallet.id, name: wallet.name, currentBalance: Number(wallet.currentBalance) }))}
        events={supplierLedger.events.map(({ occurredAt, dueAt, ...event }) => ({ ...event, occurredAt: occurredAt.toISOString(), occurredLabel: formatDate(occurredAt, context.timeZone), dueLabel: dueAt ? formatDate(dueAt, context.timeZone) : null }))}
      />}

      {purchaseAccount && <SupplierPurchaseAccount currency={currency} canPay={canPayPurchases} outstanding={purchaseAccount.outstanding.toString()} credit={purchaseAccount.credit.toString()} drawerBalance={drawerBalance?.toString() ?? "0"} wallets={wallets.map(wallet => ({ id: wallet.id, name: wallet.name, currentBalance: wallet.currentBalance.toString() }))} invoices={purchaseAccount.invoices.map(invoice => ({ id: invoice.id, number: invoice.number, date: invoice.date.toISOString(), total: invoice.total.toString(), paid: invoice.paid.toString(), due: invoice.due.toString() }))} />}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="erp-section flex items-center gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-teal-50 text-teal-700 ring-1 ring-teal-200">
            <Truck className="h-6 w-6" />
          </div>
          <div>
            <p className="text-xs font-bold text-slate-500">عمليات توريد المخزون</p>
            <p className="mt-0.5 text-2xl font-black font-numeric text-slate-900">{supplier.stockReceipts.length}</p>
          </div>
        </div>

        <div className="erp-section flex items-center gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-700 ring-1 ring-indigo-200">
            <Boxes className="h-6 w-6" />
          </div>
          <div>
            <p className="text-xs font-bold text-slate-500">إجمالي الوحدات الموردة</p>
            <p className="mt-0.5 text-2xl font-black font-numeric text-slate-900">{totalStockUnits}</p>
          </div>
        </div>

        <div className="erp-section flex items-center gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-amber-50 text-amber-700 ring-1 ring-amber-200">
            <Receipt className="h-6 w-6" />
          </div>
          <div>
            <p className="text-xs font-bold text-slate-500">قيمة توريدات المخزون</p>
            <p className="mt-0.5 text-xl font-black font-numeric text-slate-900">{formatCurrency(totalStockValue, currency)}</p>
          </div>
        </div>

        <div className="erp-section flex items-center gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-slate-50 text-slate-700 ring-1 ring-slate-200">
            <Phone className="h-6 w-6" />
          </div>
          <div>
            <p className="text-xs font-bold text-slate-500">رقم الهاتف</p>
            <p className="mt-0.5 text-sm font-black font-numeric text-slate-900" dir="ltr">{supplier.phone || "غير مسجل"}</p>
            {lastStockReceipt ? <p className="mt-1 text-[10px] font-semibold text-slate-400">آخر توريد: {formatDate(lastStockReceipt.createdAt)}</p> : null}
          </div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <div className="space-y-4">
          <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm">
            <div className="flex items-center justify-between border-b border-slate-100/60 p-4">
              <h3 className="flex items-center gap-2 text-sm font-bold text-slate-800">
                <Truck className="h-4 w-4 text-indigo-600" />
                توريدات المخزون من هذا المورد
              </h3>
              <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-bold font-numeric text-slate-500">{supplier.stockReceipts.length} حركة</span>
            </div>

            {supplier.stockReceipts.length === 0 ? (
              <div className="p-8 text-center text-xs font-medium text-slate-400">لا توجد حركات توريد مخزون مرتبطة بهذا المورد بعد.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="erp-table min-w-[820px]">
                  <thead>
                    <tr>
                      <th>القطعة</th>
                      <th>SKU</th>
                      <th>التصنيف</th>
                      <th className="text-center">الكمية</th>
                      <th>تكلفة الوحدة</th>
                      <th>إجمالي الدفعة</th>
                      <th>الملاحظة</th>
                      <th>التاريخ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {supplier.stockReceipts.map((receipt) => {
                      const batchTotal = receipt.quantity * Number(receipt.unitCostSnapshot ?? 0);
                      return (
                        <tr key={receipt.id} className="align-middle">
                          <td className="font-bold text-slate-900"><Link className="text-teal-700 hover:underline" href={`/inventory/${receipt.inventoryItemId}`}>{receipt.itemName}</Link></td>
                          <td className="font-numeric text-xs text-slate-500">{receipt.sku ?? "-"}</td>
                          <td className="text-xs font-medium text-slate-600">{receipt.category ?? "غير مصنف"}</td>
                          <td className="text-center font-black font-numeric text-slate-900">+{receipt.quantity}</td>
                          <td className="font-black font-numeric text-slate-900">{formatCurrency(Number(receipt.unitCostSnapshot ?? 0), currency)}</td>
                          <td className="font-black font-numeric text-indigo-700">{formatCurrency(batchTotal, currency)}</td>
                          <td className="max-w-[220px] text-xs font-medium text-slate-500">{receipt.note ?? "-"}</td>
                          <td className="font-numeric text-xs text-slate-600">{formatDate(receipt.createdAt)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm">
            <div className="border-b border-slate-100/60 p-4 flex items-center justify-between">
              <h3 className="font-bold text-slate-800 text-sm flex items-center gap-2">
                <Wrench className="h-4 w-4 text-teal-600" />
                سجل الأجهزة وقطع الغيار الموردة للصيانة
              </h3>
              <span className="text-xs font-bold font-numeric text-slate-500 bg-slate-100 px-2.5 py-0.5 rounded-full">
                {supplier.repairOrders.length} تذكرة
              </span>
            </div>

            {supplier.repairOrders.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-400 font-medium">
                لم يتم تسجيل أي طلب صيانة مرتبط بهذا المورد بعد.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="erp-table min-w-[700px]">
                  <thead>
                    <tr>
                      <th className="text-slate-800">رقم التذكرة</th>
                      <th className="text-slate-800">العميل</th>
                      <th className="text-slate-800">الجهاز</th>
                      <th className="text-slate-800">القطعة المشتراة</th>
                      <th className="text-slate-800">تكلفة القطعة</th>
                      <th className="text-slate-800">الحالة</th>
                      <th className="text-slate-800">التاريخ</th>
                      <th className="w-20 text-slate-800 text-center">عرض</th>
                    </tr>
                  </thead>
                  <tbody>
                    {supplier.repairOrders.map((ro) => (
                      <tr key={ro.id} className="align-middle">
                        <td className="font-black font-numeric text-slate-900">{ro.ticketNumber}</td>
                        <td className="font-bold text-slate-900">{ro.customer?.name ?? "-"}</td>
                        <td className="font-semibold text-slate-800">{[ro.deviceBrand, ro.deviceModel].filter(Boolean).join(" ") || "-"}</td>
                        <td className="font-medium text-teal-900 text-xs">{ro.partName || "-"}</td>
                        <td className="font-numeric font-black text-slate-900">{ro.partCost ? formatCurrency(ro.partCost, currency) : "-"}</td>
                        <td><RepairStatusBadge status={ro.status} /></td>
                        <td className="font-numeric text-slate-600 text-xs">{formatDate(ro.createdAt)}</td>
                        <td className="text-center">
                          <Button asChild variant="outline" size="sm" className="font-bold shadow-xs border-slate-300 rounded-lg">
                            <Link href={`/repair-orders/${ro.id}`}><Eye className="h-3.5 w-3.5 ml-1" />عرض</Link>
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {supplier.repairOrders.length > 0 ? (
            <div className="rounded-xl border border-slate-200 bg-slate-50/50 px-4 py-3 text-xs font-semibold text-slate-500">
              إجمالي تكلفة القطع المسجلة ضمن تذاكر الصيانة: <span className="font-black font-numeric text-slate-800">{formatCurrency(totalPartsCost, currency)}</span>
            </div>
          ) : null}
        </div>

        <div>
          <form action={updateSupplierAction} className="erp-section space-y-4">
            <input type="hidden" name="supplierId" value={supplier.id} />
            <div className="border-b border-slate-100/60 pb-3"><h3 className="font-bold text-slate-800 text-sm">تعديل بيانات المورد</h3></div>

            <div className="space-y-3">
              <div>
                <label className="text-xs font-extrabold text-slate-800 block mb-1.5">اسم المورد <span className="text-rose-500">*</span></label>
                <input name="name" required defaultValue={supplier.name} className={`${inputClassName} w-full`} />
              </div>
              <div>
                <label className="text-xs font-extrabold text-slate-800 block mb-1.5">رقم الهاتف</label>
                <input name="phone" inputMode="tel" defaultValue={supplier.phone ?? ""} className={`${inputClassName} w-full font-numeric`} />
              </div>
              <div>
                <label className="text-xs font-extrabold text-slate-800 block mb-1.5">العنوان / الموقع</label>
                <input name="address" defaultValue={supplier.address ?? ""} className={`${inputClassName} w-full`} />
              </div>
              <div>
                <label className="text-xs font-extrabold text-slate-800 block mb-1.5">ملاحظات</label>
                <textarea name="notes" rows={3} defaultValue={supplier.notes ?? ""} className="erp-textarea w-full text-xs" />
              </div>
              <div className="pt-2 flex flex-col gap-2">
                <SubmitButton className="w-full font-bold shadow-sm h-11 rounded-xl" loadingText="جاري الحفظ...">
                  <Save className="h-4 w-4 ml-1.5" />حفظ التعديلات
                </SubmitButton>
              </div>
            </div>
          </form>

          <form action={deleteSupplierAction} className="mt-4">
            <input type="hidden" name="supplierId" value={supplier.id} />
            <Button type="submit" variant="outline" className="w-full text-rose-600 border-rose-200 hover:bg-rose-50 font-bold text-xs h-10 rounded-xl">
              <Trash2 className="h-3.5 w-3.5 ml-1.5" />حذف المورد
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
