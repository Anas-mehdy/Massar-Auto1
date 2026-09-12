import type { ReactNode } from "react";
import { requirePermission } from "@/lib/auth/context";

export default async function InventoryStockLayout({ children }: { children: ReactNode }) {
  await requirePermission("inventory:read");
  return children;
}
