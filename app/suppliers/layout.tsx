import type { ReactNode } from "react";
import { requirePermission } from "@/lib/auth/context";

export default async function SuppliersLayout({ children }: { children: ReactNode }) {
  await requirePermission("suppliers:manage");
  return <div className="suppliers-workspace">{children}</div>;
}
