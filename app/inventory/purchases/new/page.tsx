import { AlertTriangle, ArrowRight, CopyCheck, PackageCheck } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/page-header";
import { requirePermission } from "@/lib/auth/context";
import { bankAccountService } from "@/lib/services/bankAccountService";
import { inventoryCategoryService } from "@/lib/services/inventoryCategoryService";
import { purchaseReceivingService } from "@/lib/services/purchaseReceivingService";
import { supplierService } from "@/lib/services/supplierService";
import { PurchaseReceivingForm } from "../_purchase-form";

export const dynamic = "force-dynamic";

type NewPurchasePageProps = { searchParams: Promise<{ draft?: string; copied?: string }> };

export default async function NewPurchasePage({ searchParams }: NewPurchasePageProps) {
  const params = await searchParams;
  const auth = await requirePermission("inventory:manage");
  const [suppliers, wallets, bankAccounts, drawerBalance, categories, draft] = await Promise.all([
    supplierService.listSuppliers(auth.shop.id),
    purchaseReceivingService.listPurchaseFinancialWallets(auth.shop.id),
    bankAccountService.listAccounts(auth.shop.id),
    purchaseReceivingService.getPurchaseDrawerBalance(auth.shop.id),
    inventoryCategoryService.listInventoryCategories(auth.shop.id),
    params.draft ? purchaseReceivingService.getPurchaseInvoice(auth.shop.id, params.draft).catch(() => null) : Promise.resolve(null),
  ]);
  const editableDraft = draft?.status === "DRAFT" ? draft : null;

  return <div className="space-y-6">
    <PageHeader
      eyebrow="المخزون • المشتريات"
      title={editableDraft ? "تعديل مسودة استلام بضاعة" : "استلام بضاعة"}
      description="نظام إدخال فاتورة متعددة الأصناف بسرعة ودقة وباستخدام الـ AI"
      actions={<Button asChild variant="outline" className="font-bold"><Link href="/inventory/purchases"><ArrowRight className="ml-1.5 h-4 w-4" />فواتير المشتريات</Link></Button>}
    />

    {params.copied === "1" && editableDraft && <div className="rounded-2xl border border-amber-200 bg-amber-50/80 p-4 text-xs font-semibold leading-6 text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/25 dark:text-amber-200">
      <div className="flex items-start gap-2"><CopyCheck className="mt-0.5 h-4 w-4 shrink-0" /><span><strong>هذه مسودة جديدة بتاريخ اليوم.</strong> تم نسخ المورد والبنود فقط لتسريع التكرار. لم تُنسخ الدفعات أو حركات المخزون أو رقم فاتورة المورد القديمة. راجع الكميات والتكاليف والأسعار قبل الاعتماد.</span></div>
    </div>}

    {!editableDraft && params.draft && <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-xs font-bold text-rose-700 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-200"><AlertTriangle className="ml-1.5 inline h-4 w-4" />المسودة المطلوبة غير موجودة أو لم تعد قابلة للتعديل.</div>}

    <div className="rounded-2xl border border-emerald-200 bg-emerald-50/70 p-4 text-xs font-semibold leading-6 text-emerald-900 dark:border-emerald-900/60 dark:bg-emerald-950/25 dark:text-emerald-200">
      <div className="flex items-start gap-2"><PackageCheck className="mt-0.5 h-4 w-4 shrink-0" /><span>المسودة تحفظ تلقائياً ولا تسجل حركة مخزون أو دفعة أو مستحقاً. اللصق من Excel ومسح الباركود يضيفان بنوداً إلى نفس المسودة فقط؛ عند الاعتماد تُثبت الفاتورة، ويُضاف للمخزون فقط ما اخترت أنه مستلم. أي استلام لاحق يبقى مرتبطاً بالفاتورة نفسها.</span></div>
    </div>

    <PurchaseReceivingForm
      suppliers={suppliers.map((supplier) => ({ id: supplier.id, name: supplier.name, phone: supplier.phone }))}
      wallets={wallets.map(wallet => ({ id: wallet.id, name: wallet.name, currentBalance: wallet.currentBalance.toString() }))}
      bankAccounts={bankAccounts.map(account => ({ id: account.id, name: account.name, bankName: account.bankName, currentBalance: account.currentBalance.toString() }))}
      drawerBalance={drawerBalance.toString()}
      categories={categories}
      currency={auth.shop.currency}
      initialDraft={editableDraft ? {
        id: editableDraft.id,
        version: editableDraft.version,
        supplierId: editableDraft.supplierId,
        supplierNameSnapshot: editableDraft.supplierNameSnapshot,
        supplierInvoiceNumber: editableDraft.supplierInvoiceNumber,
        invoiceDate: editableDraft.invoiceDate.toISOString(),
        notes: editableDraft.notes,
        discountTotal: editableDraft.discountTotal.toString(),
        extraCostsTotal: editableDraft.extraCostsTotal.toString(),
        amountPaid: editableDraft.amountPaid.toString(),
        paymentMethod: editableDraft.paymentMethod,
        paymentAccountType: editableDraft.paymentAccountType,
        paymentWalletId: editableDraft.paymentWalletId,
        paymentBankAccountId: editableDraft.paymentBankAccountId,
        paymentSourceName: editableDraft.paymentSourceName,
        paymentReference: editableDraft.paymentReference,
        lines: editableDraft.items.map((item) => ({
          id: item.id,
          inventoryItemId: item.inventoryItemId,
          inventoryItemName: item.inventoryItemName,
          inventoryItemSku: item.inventoryItemSku,
          inventoryItemBarcode: item.inventoryItemBarcode,
          inventoryItemCategory: item.inventoryItemCategory,
          inventoryItemDescription: item.inventoryItemDescription,
          inventoryCurrentSalePrice: item.inventoryCurrentSalePrice?.toString() ?? null,
          lastPurchaseCost: item.lastPurchaseCost?.toString() ?? null,
          lastPurchaseAt: item.lastPurchaseAt?.toISOString() ?? null,
          lastPurchaseSupplierName: item.lastPurchaseSupplierName,
          newItemName: item.inventoryItemId ? null : item.newItemName,
          newItemSku: item.inventoryItemId ? null : item.newItemSku,
          newItemBarcode: item.inventoryItemId ? null : item.newItemBarcode,
          newItemCategoryId: item.inventoryItemId ? null : item.newItemCategoryId,
          newItemCategory: item.inventoryItemId ? null : item.newItemCategory,
          newItemDescription: item.inventoryItemId ? null : item.newItemDescription,
          importedSourceText: item.importedSourceText,
          importSourceId: item.importSourceId,
          importRowKey: item.importRowKey,
          importedPurchaseUnit: item.importedPurchaseUnit,
          matchReviewRequired: item.matchReviewRequired,
          compatibilityGroupIds: item.compatibilityGroupIds,
          compatibilityReviewNeeded: item.compatibilityReviewNeeded,
          updateSalePrice: item.updateSalePrice,
          orderedQuantity: item.orderedQuantity,
          unitCost: item.unitCost.toString(),
          manualExtraCostAllocation: item.manualExtraCostAllocation?.toString() ?? null,
          salePriceSnapshot: item.salePriceSnapshot?.toString() ?? null,
        })),
      } : null}
    />
  </div>;
}
