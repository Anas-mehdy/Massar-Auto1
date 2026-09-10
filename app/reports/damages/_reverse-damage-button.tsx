"use client";

import { RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { reverseInventoryDamageAction } from "./actions";

export function ReverseDamageButton({
  damageId,
  itemName,
  quantity,
  returnTo,
}: {
  damageId: string;
  itemName: string;
  quantity: number;
  returnTo: string;
}) {
  return (
    <form
      action={reverseInventoryDamageAction}
      onSubmit={(event) => {
        const confirmed = window.confirm(
          `هل أنت متأكد من عكس هذا التالف؟\nسيتم إرجاع ${quantity} من ${itemName} إلى المخزون وتسجيل حركة عكس في السجل.`,
        );
        if (!confirmed) event.preventDefault();
      }}
    >
      <input type="hidden" name="damageId" value={damageId} />
      <input type="hidden" name="returnTo" value={returnTo} />
      <Button type="submit" size="sm" variant="outline" className="whitespace-nowrap rounded-lg border-emerald-200 text-emerald-700 hover:bg-emerald-50">
        <RotateCcw className="ml-1.5 h-3.5 w-3.5" />
        عكس التالف
      </Button>
    </form>
  );
}
