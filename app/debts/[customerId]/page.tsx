import { requirePermission } from "@/lib/auth/context";
import { bankAccountService } from "@/lib/services/bankAccountService";
import { getCustomerDebtLedger } from "@/lib/services/debtLedgerService";
import { financialTransferService } from "@/lib/services/financialTransferService";
import { paymentSourceService } from "@/lib/services/paymentSourceService";
import { CustomerDebtLedger } from "./_customer-debt-ledger";
import { DebtActivationSuccess } from "./_activation-success";

export const dynamic = "force-dynamic";

export default async function CustomerDebtPage({
  params,
  searchParams,
}: {
  params: Promise<{ customerId: string }>;
  searchParams: Promise<{ onboarding?: string }>;
}) {
  const auth = await requirePermission("debts:manage");
  const [{ customerId }, query] = await Promise.all([params, searchParams]);
  const [ledger, paymentSources, wallets, bankAccounts] = await Promise.all([
    getCustomerDebtLedger(customerId),
    paymentSourceService.listPaymentSourceOptions(auth.shop.id),
    financialTransferService.listWallets(auth.shop.id),
    bankAccountService.listAccounts(auth.shop.id),
  ]);

  const hasDebt = ledger.entries.some((entry) =>
    !entry.isReversed && ["DEBT", "OPENING_BALANCE", "ADJUSTMENT_DEBIT"].includes(entry.type),
  );
  const hasPayment = ledger.entries.some((entry) =>
    !entry.isReversed && ["PAYMENT", "ADJUSTMENT_CREDIT"].includes(entry.type),
  );

  return (
    <div className="space-y-6">
      {query.onboarding === "1" ? (
        <DebtActivationSuccess
          customerId={customerId}
          balance={ledger.balance}
          currency={auth.shop.currency || "SAR"}
          hasDebt={hasDebt}
          hasPayment={hasPayment}
        />
      ) : null}
      <CustomerDebtLedger
        customer={ledger.customer}
        entries={ledger.entries.map((entry) => ({
          ...entry,
          occurredAt: entry.occurredAt.toISOString(),
          dueAt: entry.dueAt?.toISOString() ?? null,
        }))}
        paymentSources={paymentSources}
        wallets={wallets.map((wallet) => ({
          id: wallet.id,
          name: wallet.name,
          currentBalance: Number(wallet.currentBalance),
        }))}
        bankAccounts={bankAccounts.map((account) => ({
          id: account.id,
          name: account.name,
          bankName: account.bankName,
          currentBalance: Number(account.currentBalance),
        }))}
        balance={ledger.balance}
        currency={auth.shop.currency || "SAR"}
      />
    </div>
  );
}
