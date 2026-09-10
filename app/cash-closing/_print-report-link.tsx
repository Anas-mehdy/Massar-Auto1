"use client";

import Link from "next/link";
import { Printer } from "lucide-react";
import { usePathname, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";

export function CashClosingPrintReportLink() {
  const pathname = usePathname();
  const params = useSearchParams();
  if (pathname !== "/cash-closing") return null;

  const date = params.get("date");
  const href = date && /^\d{4}-\d{2}-\d{2}$/.test(date)
    ? `/cash-closing/print?date=${encodeURIComponent(date)}`
    : "/cash-closing/print";

  return (
    <div className="mb-4 flex justify-end print:hidden">
      <Button asChild variant="outline" className="font-black">
        <Link href={href}>
          <Printer className="ml-1 h-4 w-4" />
          تقرير الإغلاق للطباعة
        </Link>
      </Button>
    </div>
  );
}
