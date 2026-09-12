import type { ReactNode } from "react";
import { PlusCircle } from "lucide-react";
import Link from "next/link";
import { requirePermission } from "@/lib/auth/context";

export const dynamic = "force-dynamic";

export default async function InventoryItemLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ id: string }>;
}) {
  await requirePermission("inventory:read");
  const { id } = await params;

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 rounded-2xl border border-teal-200 bg-gradient-to-l from-teal-50 to-white p-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-black text-slate-900">توريد من مورد مع فاتورة</p>
          <p className="mt-1 text-xs font-medium text-slate-500">أضف كمية جديدة وارفع صورة الفاتورة أو ملف PDF واحفظها مع حركة المخزون.</p>
        </div>
        <Link href={`/inventory/${id}/receive`} className="inline-flex h-10 items-center justify-center rounded-xl bg-teal-700 px-4 text-sm font-bold text-white shadow-sm hover:bg-teal-800">
          <PlusCircle className="ml-1.5 h-4 w-4" />توريد بفاتورة
        </Link>
      </div>

      {children}
    </div>
  );
}
