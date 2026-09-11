import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { DatabaseUnavailable } from "@/components/database-unavailable";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { getCurrentShopContext } from "@/lib/current-shop";
import { isDatabaseConnectionError } from "@/lib/database-errors";
import { financialTransferService } from "@/lib/services/financialTransferService";
import { bankAccountService } from "@/lib/services/bankAccountService";
import { salesInventorySearchService } from "@/lib/services/salesInventorySearchService";
import { SaleForm } from "../sale-form";

export const dynamic = "force-dynamic";

export default async function NewSalePage() {
  let inventoryItems: Awaited<ReturnType<typeof salesInventorySearchService.listInventoryForSale>> = [];
  let warehouses: Awaited<ReturnType<typeof salesInventorySearchService.listActiveSaleWarehouses>> = [];
  let wallets: Awaited<ReturnType<typeof financialTransferService.listWallets>> = [];
  let bankAccounts: Awaited<ReturnType<typeof bankAccountService.listAccounts>> = [];
  let currency = "SAR";

  try {
    const context = await getCurrentShopContext();
    currency = context.currency;
    [inventoryItems, warehouses, wallets, bankAccounts] = await Promise.all([
      salesInventorySearchService.listInventoryForSale(context.shopId, null, 300),
      salesInventorySearchService.listActiveSaleWarehouses(context.shopId),
      financialTransferService.listWallets(context.shopId),
      bankAccountService.listAccounts(context.shopId),
    ]);
  } catch (error) {
    if (isDatabaseConnectionError(error)) return <DatabaseUnavailable />;
    throw error;
  }

  return <div className="space-y-6">
    <PageHeader title="عملية بيع جديدة" description="اختر مستودع البيع ثم أضف البنود من الرصيد المتاح غير المحجوز" actions={<Button asChild variant="outline"><Link href="/sales"><ArrowRight className="h-4 w-4" aria-hidden="true" />رجوع</Link></Button>} />
    <SaleForm
      currency={currency}
      warehouses={warehouses}
      inventoryItems={inventoryItems}
      wallets={wallets.map((wallet) => ({ id: wallet.id, name: wallet.name, balance: Number(wallet.currentBalance) }))}
      bankAccounts={bankAccounts.map((account) => ({ id: account.id, name: account.name, bankName: account.bankName, balance: Number(account.currentBalance) }))}
    />
  </div>;
}
