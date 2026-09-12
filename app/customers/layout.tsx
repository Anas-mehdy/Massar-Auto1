import type { ReactNode } from "react";
import { requirePermission } from "@/lib/auth/context";

export default async function CustomersLayout({ children }: { children: ReactNode }) {
  await requirePermission("customers:read");
  return <div className="customers-workspace">{children}</div>;
}
