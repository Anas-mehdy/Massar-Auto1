from pathlib import Path

repo = Path('.')
actions_path = repo / 'app/cash-drawer/actions.ts'
page_path = repo / 'app/cash-drawer/page.tsx'
component_path = repo / 'app/cash-drawer/_liquidity-transfer-form.tsx'

actions = actions_path.read_text()
needle = 'import { cashDrawerService } from "@/lib/services/cashDrawerService";\n'
replacement = needle + 'import { bankAccountService } from "@/lib/services/bankAccountService";\n'
assert needle in actions and 'bankAccountService' not in actions
actions = actions.replace(needle, replacement, 1)

actions = actions.replace(
    '  revalidatePath("/dashboard");\n',
    '  revalidatePath("/dashboard");\n  revalidatePath("/bank-accounts");\n',
    1,
)

start = actions.index('export async function transferCashWalletAction(formData: FormData) {')
new_tail = '''export async function transferCashWalletAction(formData: FormData) {
  const parsed = z.object({
    walletId: z.string().uuid("اختر محفظة صالحة").optional().or(z.literal("")),
    bankAccountId: z.string().uuid("اختر حساباً بنكياً صالحاً").optional().or(z.literal("")),
    direction: z.enum(["DRAWER_TO_WALLET", "WALLET_TO_DRAWER", "DRAWER_TO_BANK", "BANK_TO_DRAWER"]),
    amount: positiveMoneySchema,
    notes: z.string().trim().max(500, "الملاحظة طويلة جداً").optional(),
  }).safeParse({
    walletId: readString(formData, "walletId"),
    bankAccountId: readString(formData, "bankAccountId"),
    direction: readString(formData, "direction"),
    amount: readString(formData, "amount"),
    notes: readString(formData, "notes") || undefined,
  });
  if (!parsed.success) redirect(`/cash-drawer?error=${encodeURIComponent(errorMessage(parsed.error))}`);

  const isBankTransfer = parsed.data.direction === "DRAWER_TO_BANK" || parsed.data.direction === "BANK_TO_DRAWER";
  const auth = await requirePermission(isBankTransfer ? "expenses:manage" : "sales:create");

  try {
    if (parsed.data.direction === "DRAWER_TO_BANK" || parsed.data.direction === "BANK_TO_DRAWER") {
      const bankAccountId = parsed.data.bankAccountId || undefined;
      if (!bankAccountId) throw new Error("اختر حساباً بنكياً صالحاً.");
      const drawerToBank = parsed.data.direction === "DRAWER_TO_BANK";
      await bankAccountService.transferMoney(auth.shop.id, auth.user.id, {
        fromType: drawerToBank ? "DRAWER" : "BANK",
        fromId: drawerToBank ? undefined : bankAccountId,
        toType: drawerToBank ? "BANK" : "DRAWER",
        toId: drawerToBank ? bankAccountId : undefined,
        amount: parsed.data.amount,
        note: parsed.data.notes,
      });
    } else {
      const walletId = parsed.data.walletId || undefined;
      if (!walletId) throw new Error("اختر محفظة صالحة.");
      await cashDrawerService.transferWithWallet(auth.shop.id, auth.user.id, {
        walletId,
        direction: parsed.data.direction,
        amount: parsed.data.amount,
        notes: parsed.data.notes,
      });
    }
  } catch (error) {
    redirect(`/cash-drawer?error=${encodeURIComponent(errorMessage(error))}`);
  }
  refreshCashViews();
  redirect("/cash-drawer?transferSaved=1");
}
'''
actions = actions[:start] + new_tail
actions_path.write_text(actions)

page = page_path.read_text()
page = page.replace('  ArrowLeftRight,\n', '', 1)
page = page.replace(
    'import { requirePermission } from "@/lib/auth/context";\n',
    'import { can, requirePermission } from "@/lib/auth/context";\n',
    1,
)
page = page.replace(
    'import { cashDrawerService, type CashDrawerMovementRow } from "@/lib/services/cashDrawerService";\n',
    'import { cashDrawerService, type CashDrawerMovementRow } from "@/lib/services/cashDrawerService";\nimport { bankAccountService } from "@/lib/services/bankAccountService";\n',
    1,
)
page = page.replace(
    'import { addCashMovementAction, setOpeningBalanceAction, transferCashWalletAction, updateOpeningBalanceAction } from "./actions";\n',
    'import { addCashMovementAction, setOpeningBalanceAction, updateOpeningBalanceAction } from "./actions";\nimport { CashLiquidityTransferForm } from "./_liquidity-transfer-form";\n',
    1,
)
old_load = '''  const auth = await requirePermission("sales:create");
  const wallets = await financialTransferService.listWallets(auth.shop.id);
  const drawer = await cashDrawerService.getAuditSnapshot(auth.shop.id, 150);
'''
new_load = '''  const auth = await requirePermission("sales:create");
  const canManageBankAccounts = can(auth, "expenses:manage");
  const [wallets, drawer, bankAccounts] = await Promise.all([
    financialTransferService.listWallets(auth.shop.id),
    cashDrawerService.getAuditSnapshot(auth.shop.id, 150),
    canManageBankAccounts ? bankAccountService.listAccounts(auth.shop.id) : Promise.resolve([]),
  ]);
'''
assert old_load in page
page = page.replace(old_load, new_load, 1)
page = page.replace('تم التحويل بين الدرج والمحفظة بنجاح.', 'تم تحويل السيولة بنجاح.', 1)

form_start = page.index('      <form action={transferCashWalletAction}')
form_end = page.index('</form>', form_start) + len('</form>')
form_replacement = '''      <CashLiquidityTransferForm
        wallets={wallets.map((wallet) => ({ id: wallet.id, name: wallet.name, balance: Number(wallet.currentBalance) }))}
        bankAccounts={bankAccounts.map((account) => ({ id: account.id, name: account.name, bankName: account.bankName, balance: Number(account.currentBalance) }))}
        currency={currency}
        canManageBank={canManageBankAccounts}
      />'''
page = page[:form_start] + form_replacement + page[form_end:]
page_path.write_text(page)

component = '''"use client";

import { useMemo, useState } from "react";
import { ArrowLeftRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/format";
import { transferCashWalletAction } from "./actions";

type Direction = "DRAWER_TO_WALLET" | "WALLET_TO_DRAWER" | "DRAWER_TO_BANK" | "BANK_TO_DRAWER";
type WalletOption = { id: string; name: string; balance: number };
type BankOption = { id: string; name: string; bankName: string | null; balance: number };

type Props = {
  wallets: WalletOption[];
  bankAccounts: BankOption[];
  currency: string;
  canManageBank: boolean;
};

export function CashLiquidityTransferForm({ wallets, bankAccounts, currency, canManageBank }: Props) {
  const hasWallets = wallets.length > 0;
  const hasBanks = canManageBank && bankAccounts.length > 0;
  const [direction, setDirection] = useState<Direction>(() => hasWallets ? "DRAWER_TO_WALLET" : "DRAWER_TO_BANK");
  const [walletId, setWalletId] = useState(wallets[0]?.id ?? "");
  const [bankAccountId, setBankAccountId] = useState(bankAccounts[0]?.id ?? "");

  const usesWallet = direction === "DRAWER_TO_WALLET" || direction === "WALLET_TO_DRAWER";
  const usesBank = direction === "DRAWER_TO_BANK" || direction === "BANK_TO_DRAWER";
  const helper = useMemo(() => {
    if (usesBank) return "التحويل البنكي يُسجل على الطرفين كحركة سيولة ولا يدخل في الإيرادات أو المصروفات.";
    return "نقل سيولة فقط؛ لا يُحسب كدخل أو مصروف.";
  }, [usesBank]);

  return <form action={transferCashWalletAction} className="rounded-[22px] border border-cyan-100 bg-gradient-to-b from-cyan-50/60 to-white p-5 shadow-sm">
    <div className="mb-5 flex items-center gap-3">
      <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-cyan-100 text-cyan-700"><ArrowLeftRight className="h-5 w-5" /></span>
      <div><h2 className="text-base font-black text-slate-900">تحويل سيولة</h2><p className="mt-0.5 text-sm font-semibold text-slate-400">الدرج ↔ محفظة / حساب بنكي.</p></div>
    </div>

    {!hasWallets && !hasBanks ? <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm font-bold text-amber-800">لا توجد محفظة أو حساب بنكي متاح للتحويل حالياً.</div> : <>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="grid gap-1.5 text-sm font-bold text-slate-700">اتجاه التحويل
          <select name="direction" value={direction} onChange={(event) => setDirection(event.target.value as Direction)} className="erp-input">
            {hasWallets && <option value="DRAWER_TO_WALLET">من الدرج إلى المحفظة</option>}
            {hasWallets && <option value="WALLET_TO_DRAWER">من المحفظة إلى الدرج</option>}
            {hasBanks && <option value="DRAWER_TO_BANK">من الدرج إلى الحساب البنكي</option>}
            {hasBanks && <option value="BANK_TO_DRAWER">من الحساب البنكي إلى الدرج</option>}
          </select>
        </label>

        {usesWallet ? <label className="grid gap-1.5 text-sm font-bold text-slate-700">المحفظة
          <select name="walletId" value={walletId} onChange={(event) => setWalletId(event.target.value)} className="erp-input" required>
            <option value="" disabled>اختر المحفظة</option>
            {wallets.map((wallet) => <option key={wallet.id} value={wallet.id}>{wallet.name} — {formatCurrency(wallet.balance, currency)}</option>)}
          </select>
        </label> : <input type="hidden" name="walletId" value="" />}

        {usesBank ? <label className="grid gap-1.5 text-sm font-bold text-slate-700">الحساب البنكي
          <select name="bankAccountId" value={bankAccountId} onChange={(event) => setBankAccountId(event.target.value)} className="erp-input" required>
            <option value="" disabled>اختر الحساب البنكي</option>
            {bankAccounts.map((account) => <option key={account.id} value={account.id}>{account.name}{account.bankName ? ` — ${account.bankName}` : ""} — {formatCurrency(account.balance, currency)}</option>)}
          </select>
        </label> : <input type="hidden" name="bankAccountId" value="" />}

        <label className="grid gap-1.5 text-sm font-bold text-slate-700">المبلغ<input name="amount" type="number" min="0.01" step="0.01" required className="erp-input font-numeric" /></label>
        <label className="grid gap-1.5 text-sm font-bold text-slate-700">ملاحظة<input name="notes" className="erp-input" placeholder="اختياري" /></label>
      </div>
      <p className="mt-3 text-[11px] font-bold text-cyan-800">{helper}</p>
      <Button type="submit" className="mt-4 h-11 w-full rounded-xl bg-cyan-700 font-black hover:bg-cyan-800">تنفيذ التحويل</Button>
    </>}
  </form>;
}
'''
component_path.write_text(component)

# Static safety checks: keep bank account balances hidden from users without bank-management permission,
# and guarantee both new directions are wired through the central bank transfer service.
assert 'canManageBankAccounts ? bankAccountService.listAccounts' in page
assert 'DRAWER_TO_BANK' in actions and 'BANK_TO_DRAWER' in actions
assert 'bankAccountService.transferMoney' in actions
assert 'expenses:manage' in actions
assert 'من الدرج إلى الحساب البنكي' in component and 'من الحساب البنكي إلى الدرج' in component
print('CASH_DRAWER_BANK_TRANSFER_FIX_APPLIED')
