"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requirePermission } from "@/lib/auth/context";
import { purchaseInitialWarehouseReceiptService } from "@/lib/services/purchaseInitialWarehouseReceiptService";
import { purchaseReceivingService } from "@/lib/services/purchaseReceivingService";

function errorMessage(error: unknown) {
  if (error instanceof z.ZodError) return error.issues[0]?.message ?? "تحقق من بيانات الاعتماد.";
  if (error instanceof Error) return error.message;
  return "تعذر اعتماد فاتورة الشراء.";
}

function revalidatePurchasePaths(purchaseId: string) {
  revalidatePath("/inventory");
  revalidatePath("/inventory/purchases");
  revalidatePath(`/inventory/purchases/${purchaseId}`);
  revalidatePath("/inventory/purchases/pending-compatibility");
  revalidatePath("/inventory/warehouses");
  revalidatePath("/suppliers");
  revalidatePath("/suppliers/[id]", "page");
  revalidatePath("/cash-drawer");
  revalidatePath("/bank-accounts");
  revalidatePath("/financial-transfers");
  revalidatePath("/reports");
}

export async function postPurchaseInvoiceToWarehouseAction(input: {
  purchaseId: string;
  warehouseId: string;
  postingKey: string;
  receiptMode?: "FULL" | "PARTIAL";
  initialReceipt?: Array<{ sortOrder: number; quantity: number }>;
}) {
  const auth = await requirePermission("inventory:manage");
  let parsed: {
    purchaseId: string;
    warehouseId: string;
    postingKey: string;
    receiptMode: "FULL" | "PARTIAL";
    initialReceipt: Array<{ sortOrder: number; quantity: number }>;
  };
  try {
    parsed = z.object({
      purchaseId: z.string().uuid(),
      warehouseId: z.string().uuid("اختر مستودع الاستلام."),
      postingKey: z.string().trim().min(12).max(80),
      receiptMode: z.enum(["FULL", "PARTIAL"]).default("FULL"),
      initialReceipt: z.array(z.object({
        sortOrder: z.number().int().nonnegative(),
        quantity: z.number().int().nonnegative(),
      })).max(250).default([]),
    }).parse({
      ...input,
      receiptMode: input.receiptMode ?? "FULL",
      initialReceipt: input.initialReceipt ?? [],
    });
  } catch (error) {
    return { ok: false as const, posted: false as const, error: errorMessage(error) };
  }

  try {
    // Post the invoice with zero stock receipt first. This guarantees that an
    // explicitly selected warehouse is never silently replaced by the default
    // warehouse. The stock receipt below is independently idempotent and can be
    // recovered from the posted invoice if it fails after financial posting.
    const posted = await purchaseReceivingService.postPurchaseInvoice(
      auth.shop.id,
      auth.user.id,
      parsed.purchaseId,
      parsed.postingKey,
      { receiptMode: "PARTIAL", initialReceipt: [] },
    );

    try {
      const receipt = await purchaseInitialWarehouseReceiptService.recordInitialWarehousePurchaseReceipt(
        auth.shop.id,
        auth.user.id,
        parsed.purchaseId,
        {
          warehouseId: parsed.warehouseId,
          requestKey: `${parsed.postingKey}:warehouse-receipt`,
          receiptMode: parsed.receiptMode,
          initialReceipt: parsed.initialReceipt,
        },
      );
      revalidatePurchasePaths(parsed.purchaseId);
      return {
        ok: true as const,
        posted: true as const,
        id: posted.id,
        alreadyPosted: posted.alreadyPosted,
        receiptRecorded: !receipt.skipped,
        receiptAlreadyApplied: "alreadyApplied" in receipt ? receipt.alreadyApplied : false,
        receiptError: null,
      };
    } catch (receiptError) {
      // The invoice is already posted, but no fallback to the default warehouse
      // is allowed. Surface a recoverable warning so the user can finish receipt
      // from the posted invoice using the chosen warehouse explicitly.
      revalidatePurchasePaths(parsed.purchaseId);
      return {
        ok: true as const,
        posted: true as const,
        id: posted.id,
        alreadyPosted: posted.alreadyPosted,
        receiptRecorded: false,
        receiptAlreadyApplied: false,
        receiptError: errorMessage(receiptError),
      };
    }
  } catch (error) {
    return { ok: false as const, posted: false as const, error: errorMessage(error) };
  }
}
