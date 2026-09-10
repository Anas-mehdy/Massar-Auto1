import type { ReactNode } from "react";
import { CashDrawerReportPanel } from "./_cash-drawer-report";
import { DamageCardLinker } from "./_damage-card-linker";
import "./reports-ui.css";
import "./dark-mode-preview-reports.css";

export default function ReportsLayout({ children }: { children: ReactNode }) {
  return <div className="masar-reports"><DamageCardLinker />{children}<CashDrawerReportPanel /></div>;
}
