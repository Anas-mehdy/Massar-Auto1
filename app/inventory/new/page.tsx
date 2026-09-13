import { ArrowRight, Save } from "lucide-react";
import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { getCurrentShopContext } from "@/lib/current-shop";
import { inventoryCategoryService } from "@/lib/services/inventoryCategoryService";
import { createInventoryItemAction } from "../actions";
import { Field, inputClassName, textareaClassName } from "../_components";
import { InventoryCategoryField } from "../_category-field";
import { OnboardingInventoryItemForm } from "./_onboarding-inventory-form";

export default async function NewInventoryItemPage({
  searchParams,
}: {
  searchParams: Promise<{ name?: string; categoryId?: string; error?: string; onboarding?: string; full?: string }>;
}) {
  const params = await searchParams;
  const context = await getCurrentShopContext();

  if (params.onboarding === "1" && params.full !== "1") {
    return (
      <div className="pb-8 pt-1">
        {params.error ? <div role="alert" className="mx-auto mb-4 max-w-3xl rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-[11px] font-bold leading-5 text-rose-700 dark:border-rose-900/70 dark:bg-rose-950/30 dark:text-rose-200">{params.error}</div> : null}
        <OnboardingInventoryItemForm currency={context.currency || "SAR"} />
      </div>
    );
  }

  const categories = await inventoryCategoryService.listInventoryCategories(context.shopId);

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <PageHeader
        title="إضافة قطعة جديدة"
        description="أدخل بيانات قطعة الغيار واختر تصنيفاً محفوظاً أو أنشئ تصنيفاً جديداً مرة واحدة"
        actions={
          <Button asChild variant="outline">
            <Link href="/inventory">
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
              رجوع
            </Link>
          </Button>
        }
      />

      {params.error ? (
        <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm font-bold text-rose-700">
          {params.error}
        </div>
      ) : null}

      <form action={createInventoryItemAction} className="erp-section">
        {params.onboarding === "1" ? <input type="hidden" name="onboarding" value="1" /> : null}
        <div className="mb-5 border-b border-slate-100/60 pb-3">
          <h3 className="text-sm font-bold text-slate-800">بيانات قطعة الغيار / المنتج</h3>
          <p className="mt-1 text-xs font-medium text-slate-400">
            التصنيفات المحفوظة تمنع تكرار الكتابة وتحافظ على تنظيم المستودع.
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="اسم القطعة">
            <input className={inputClassName} name="name" required placeholder="مثال: فلتر زيت تويوتا كورولا" defaultValue={params.name || ""} />
          </Field>
          <Field label="التصنيف">
            <InventoryCategoryField categories={categories} defaultCategoryId={params.categoryId} />
          </Field>
          <Field label="SKU / رمز المنتج" helper="كود تتبع فريد للقطعة">
            <input className={`${inputClassName} font-numeric`} name="sku" placeholder="مثال: OIL-FLT-COR-001" />
          </Field>
          <Field label="تكلفة الشراء (لكل وحدة)">
            <input className={`${inputClassName} font-numeric`} name="unitCost" inputMode="decimal" min="0" step="0.01" type="number" placeholder="0.00" />
          </Field>
          <Field label="سعر البيع (للعميل)">
            <input className={`${inputClassName} font-numeric`} name="unitPrice" inputMode="decimal" min="0" required step="0.01" type="number" placeholder="0.00" />
          </Field>
          <Field label="الكمية الافتتاحية">
            <input className={`${inputClassName} font-numeric`} name="quantity" defaultValue="0" min="0" step="1" type="number" />
          </Field>
          <Field label="حد إعادة الطلب (تنبيه نقص المخزون)">
            <input className={`${inputClassName} font-numeric`} name="reorderLevel" defaultValue="0" min="0" step="1" type="number" />
          </Field>
          <div className="sm:col-span-2">
            <Field label="الوصف والتفاصيل">
              <textarea className={textareaClassName} name="description" placeholder="مثال: رقم القطعة، الشركة المصنعة، المقاسات أو أي ملاحظات فنية مهمة..." />
            </Field>
          </div>
        </div>
        <div className="mt-6 flex justify-end">
          <Button type="submit" size="lg" className="px-6 font-semibold shadow-md">
            <Save className="ml-1.5 h-4.5 w-4.5" aria-hidden="true" />
            حفظ القطعة بالمخزون
          </Button>
        </div>
      </form>
    </div>
  );
}
