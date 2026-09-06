"use client";

import { CopyPlus, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { clonePurchaseToDraftAction } from "./actions";

export function ClonePurchaseButton({ purchaseId }: { purchaseId: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function clone() {
    if (loading) return;
    setLoading(true);
    setError("");
    const result = await clonePurchaseToDraftAction(purchaseId);
    if (!result.ok) {
      setError("error" in result ? result.error : "تعذر إنشاء المسودة الجديدة.");
      setLoading(false);
      return;
    }
    router.push(`/inventory/purchases/new?draft=${encodeURIComponent(result.id)}&copied=1`);
    router.refresh();
  }

  return <div className="flex flex-col items-start gap-1">
    <Button type="button" variant="outline" disabled={loading} onClick={() => void clone()} className="font-black">
      {loading ? <Loader2 className="ml-1.5 h-4 w-4 animate-spin" /> : <CopyPlus className="ml-1.5 h-4 w-4" />}
      استخدام كمسودة جديدة
    </Button>
    {error && <span className="max-w-72 text-[10px] font-bold text-rose-600 dark:text-rose-300">{error}</span>}
  </div>;
}
