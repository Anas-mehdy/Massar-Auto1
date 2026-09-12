import type { ReactNode } from "react";
import { requirePermission } from "@/lib/auth/context";
import "./invoices-ui.css";
import "./invoices-kpi.css";
import "./invoices-finish.css";

export default async function InvoicesLayout({ children }: { children: ReactNode }) {
  await requirePermission("invoices:read");
  return <div className="invoices-workspace">{children}</div>;
}
