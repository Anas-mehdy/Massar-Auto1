import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { DatabaseUnavailable } from "@/components/database-unavailable";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { getCurrentShopContext } from "@/lib/current-shop";
import { isDatabaseConnectionError } from "@/lib/database-errors";
import { financialTransferService } from "@/lib/services/financialTransferService";
import { bankAccountService } from "@/lib/services/bankAccountService";
import { inventoryService } from "@/lib/services/inventoryService";
import { SaleForm } from "../sale-form";

export const dynamic = "force-dynamic";

export default async function NewSalePage() {
  let inventoryItems: Awaited<ReturnType<typeof inventoryService.listInventoryItems>>;
  let wallets: Awaited<ReturnType<typeof financialTransferService.listWallets>> = [];
  let bankAccounts: Awaited<ReturnType<typeof bankAccountService.listAccounts>> = [];
  let currency = "SAR";

  try {
    const context = await getCurrentShopContext();
    currency = context.currency;
    [inventoryItems, wallets, bankAccounts] = await Promise.all([
      inventoryService.listInventoryItems(context.shopId),
      financialTransferService.listWallets(context.shopId),
      bankAccountService.listAccounts(context.shopId),
    ]);
  } catch (error) {
    if (isDatabaseConnectionError(error)) return <DatabaseUnavailable />;
    throw error;
  }

  return <div className="space-y-6">
    <PageHeader title="عملية بيع جديدة" description="أضف بنود بيع من المخزون أو بنوداً يدوية للخدمات والرسوم" actions={<Button asChild variant="outline"><Link href="/sales"><ArrowRight className="h-4 w-4" aria-hidden="true" />رجوع</Link></Button>} />
    <SaleForm
      currency={currency}
      inventoryItems={inventoryItems.map((item) => ({ id: item.id, name: item.name, sku: item.sku, quantity: item.quantity, unitPrice: item.unitPrice.toString() }))}
      wallets={wallets.map((wallet) => ({ id: wallet.id, name: wallet.name, balance: Number(wallet.currentBalance) }))}
      bankAccounts={bankAccounts.map((account) => ({ id: account.id, name: account.name, bankName: account.bankName, balance: Number(account.currentBalance) }))}
    />
  </div>;
}
