import type { ReactNode } from "react";
import { requirePermission } from "@/lib/auth/context";
import "./dark-mode-preview-cash-drawer.css";

export default async function CashDrawerLayout({ children }: { children: ReactNode }) {
  await requirePermission("finance:vouchers");
  return <div className="cash-drawer-workspace">{children}</div>;
}
