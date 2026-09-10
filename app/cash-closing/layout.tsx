import type { ReactNode } from "react";
import { CashClosingPrintReportLink } from "./_print-report-link";

export default function CashClosingLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <CashClosingPrintReportLink />
      {children}
    </>
  );
}
