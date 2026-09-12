import type { ReactNode } from "react";
import { can, requirePermission } from "@/lib/auth/context";
import { cashDrawerService } from "@/lib/services/cashDrawerService";
import { financialTransferService } from "@/lib/services/financialTransferService";
import { CashDrawerPanel } from "./_cash-drawer-panel";
import "./transfers-position.css";
import "./dark-mode-preview-transfers.css";

export default async function TransfersLayout({ children }: { children: ReactNode }) {
  const auth = await requirePermission("sales:create");
  const wallets = await financialTransferService.listWallets(auth.shop.id);
  const canManageFinance = can(auth, "finance:vouchers");
  const drawer = canManageFinance ? await cashDrawerService.getSnapshot(auth.shop.id) : null;

  return (
    <div className="transfers-workspace space-y-6">
      {children}
      {canManageFinance && drawer ? (
        <CashDrawerPanel
          drawer={drawer}
          wallets={wallets.map((wallet) => ({ id: wallet.id, name: wallet.name }))}
          currency={auth.shop.currency || "SAR"}
        />
      ) : null}
    </div>
  );
}
