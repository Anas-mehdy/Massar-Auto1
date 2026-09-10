import Link from "next/link";
import { ArrowRight, RotateCcw, ShoppingCart } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { requirePermission } from "@/lib/auth/context";
import { bankAccountService } from "@/lib/services/bankAccountService";
import { financialTransferService } from "@/lib/services/financialTransferService";
import { salesReturnService } from "@/lib/services/salesReturnService";
import { warehouseService } from "@/lib/services/warehouseService";
import { SalesReturnForm } from "../_return-form";

export const dynamic = "force-dynamic";

type PageProps = { searchParams: Promise<{ saleId?: string; error?: string }> };

function money(value: string | number, currency: string) {
  return new Intl.NumberFormat("ar", { style: "currency", currency, maximumFractionDigits: 2 }).format(Number(value));
}

export default async function NewSalesReturnPage({ searchParams }: PageProps) {
  const auth = await requirePermission("sales_returns:manage");
  const params = await searchParams;
  const saleId = params.saleId ?? "";
  const sale = saleId ? await salesReturnService.getReturnableSale(auth.shop.id, saleId) : null;
  const [warehouses, wallets, banks] = await Promise.all([
    warehouseService.listWarehouses(auth.shop.id),
    financialTransferService.listWallets(auth.shop.id),
    bankAccountService.listAccounts(auth.shop.id),
  ]);

  return <div className="space-y-6">
    <PageHeader title="مرتجع بيع جزئي" description="اختر الكميات المرتجعة فقط؛ النظام يمنع تجاوز الكمية المباعة ويعيد المخزون والمال بشكل مترابط." actions={<Button asChild variant="outline" className="font-black"><Link href="/sales/returns"><ArrowRight className="ml-1 h-4 w-4" />المرتجعات</Link></Button>} />

    {params.error ? <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-black text-red-800">{params.error}</div> : null}

    {!saleId ? <section className="rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm"><ShoppingCart className="mx-auto h-9 w-9 text-slate-300" /><div className="mt-3 font-black text-slate-800">اختر عملية بيع من صفحة المرتجعات أولًا</div><Button asChild className="mt-4 font-black"><Link href="/sales/returns">اختيار مبيعة</Link></Button></section> : !sale ? <section className="rounded-2xl border border-red-200 bg-red-50 p-6 text-center"><div className="font-black text-red-800">عملية البيع غير موجودة أو غير متاحة.</div></section> : <>
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div><div className="flex items-center gap-2 font-black text-slate-950"><RotateCcw className="h-4 w-4 text-rose-700" />{sale.receiptNumber || sale.id.slice(0, 8)}</div><div className="mt-1 text-xs font-semibold text-slate-500">{sale.customer?.name || "عميل نقدي"} • {sale.items.length} بنود</div></div><div className="text-xl font-black text-slate-950">{money(sale.total.toString(), auth.shop.currency)}</div></div>
      </section>
      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
        <SalesReturnForm
          saleId={sale.id}
          currency={auth.shop.currency}
          items={sale.items.map((item) => ({
            id: item.id,
            description: item.description,
            quantity: item.quantity,
            returnedQuantity: item.returnedQuantity,
            returnableQuantity: item.returnableQuantity,
            unitPriceSnapshot: item.unitPriceSnapshot.toString(),
            lineTotal: item.lineTotal.toString(),
            inventoryItem: item.inventoryItem ? { id: item.inventoryItem.id, name: item.inventoryItem.name } : null,
          }))}
          warehouses={warehouses.map((warehouse) => ({ id: warehouse.id, name: warehouse.name }))}
          wallets={wallets.map((wallet) => ({ id: wallet.id, name: wallet.name }))}
          banks={banks.map((bank) => ({ id: bank.id, name: bank.name }))}
        />
      </section>
    </>}
  </div>;
}
