import type { ReactNode } from "react";
import { PurchaseBulkCategorySyncBridge } from "./_bulk-category-sync-bridge";

export default function PurchaseLayout({ children }: { children: ReactNode }) {
  return <><PurchaseBulkCategorySyncBridge />{children}</>;
}
