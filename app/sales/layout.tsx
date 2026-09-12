import type { ReactNode } from "react";
import { requirePermission } from "@/lib/auth/context";

export default async function SalesLayout({ children }: { children: ReactNode }) {
  await requirePermission("sales:read");
  return <div className="sales-workspace">{children}</div>;
}
