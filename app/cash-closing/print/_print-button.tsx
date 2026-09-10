"use client";

import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";

export function CashClosingPrintButton() {
  return (
    <Button type="button" onClick={() => window.print()} className="font-black print:hidden">
      <Printer className="ml-1 h-4 w-4" />
      طباعة التقرير
    </Button>
  );
}
