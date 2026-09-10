import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { getCurrentShopContext } from "@/lib/current-shop";
import { bankAccountService } from "@/lib/services/bankAccountService";
import { financialTransferService } from "@/lib/services/financialTransferService";
import { softwareServiceService } from "@/lib/services/softwareServiceService";
import { SoftwareServiceForm } from "../_software-service-form";

export const dynamic = "force-dynamic";

type Props = { searchParams: Promise<{ error?: string }> };

export default async function NewSoftwareServicePage({ searchParams }: Props) {
  const query = await searchParams;
  const context = await getCurrentShopContext();
  const [catalog, wallets, bankAccounts] = await Promise.all([
    softwareServiceService.listCatalog(context.shopId),
    financialTransferService.listWallets(context.shopId),
    bankAccountService.listAccounts(context.shopId),
  ]);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <PageHeader
          eyebrow="بيع خدمة غير مخزنية"
          title="إضافة خدمة سوفتوير"
          description="سجّل الخدمة وسوِّ المبلغ مثل نقطة البيع: درج، محفظة إلكترونية أو دفتر ديون العميل."
        />
        <Button asChild variant="outline" className="shrink-0 rounded-xl">
          <Link href="/software-services"><ArrowRight className="ml-1 h-4 w-4" />رجوع</Link>
        </Button>
      </div>
      {query.error ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs font-bold text-rose-700">
          {query.error}
        </div>
      ) : null}
      <SoftwareServiceForm
        catalog={catalog.map((item) => ({
          id: item.id,
          name: item.name,
          defaultPrice: item.defaultPrice?.toString() ?? null,
          defaultCost: item.defaultCost?.toString() ?? null,
        }))}
        wallets={wallets.map((wallet) => ({ id: wallet.id, name: wallet.name, balance: Number(wallet.currentBalance) }))}
        bankAccounts={bankAccounts.map((account) => ({ id: account.id, name: account.name, bankName: account.bankName, balance: Number(account.currentBalance) }))}
        currency={context.currency || "SAR"}
      />
    </div>
  );
}
