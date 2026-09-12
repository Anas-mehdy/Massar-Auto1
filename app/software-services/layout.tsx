import type { ReactNode } from "react";
import { requirePermission } from "@/lib/auth/context";
import "./software-services-ui.css";
import "./dark-mode-final-details.css";

export default async function SoftwareServicesLayout({ children }: { children: ReactNode }) {
  await requirePermission("sales:read");
  return <div className="software-services-workspace">{children}</div>;
}
