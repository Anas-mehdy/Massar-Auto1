"use client";

import Link from "next/link";
import { FileText, ReceiptText } from "lucide-react";
import { usePathname } from "next/navigation";

export function AutoPrintShortcuts() {
  const pathname = usePathname();
  const serviceOrderMatch = pathname.match(/^\/service-orders\/([^/]+)$/);
  const quotationMatch = pathname.match(/^\/quotations\/([^/]+)$/);

  const basePath = serviceOrderMatch
    ? `/service-orders/${serviceOrderMatch[1]}/print`
    : quotationMatch
      ? `/quotations/${quotationMatch[1]}/print`
      : null;

  if (!basePath) return null;

  return (
    <div className="fixed bottom-5 left-5 z-40 flex items-center gap-2 print:hidden">
      <Link
        href={basePath}
        target="_blank"
        className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-xs font-black text-slate-800 shadow-lg shadow-slate-900/10 transition hover:bg-slate-50"
        title="طباعة A4"
      >
        <FileText className="h-4 w-4" />
        طباعة A4
      </Link>
      <Link
        href={`${basePath}/thermal`}
        target="_blank"
        className="inline-flex h-10 items-center gap-2 rounded-xl bg-slate-900 px-3 text-xs font-black text-white shadow-lg shadow-slate-900/15 transition hover:bg-slate-800"
        title="طباعة حرارية 80mm"
      >
        <ReceiptText className="h-4 w-4" />
        حراري 80mm
      </Link>
    </div>
  );
}
