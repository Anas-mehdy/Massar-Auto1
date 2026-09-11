"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requirePermission } from "@/lib/auth/context";
import { autoInvoiceService } from "@/lib/services/autoInvoiceService";
import { entitlementService } from "@/lib/services/subscriptionEntitlementService";

export async function createServiceOrderInvoiceAction(formData: FormData) {
  const serviceOrderId = z.string().uuid().parse(formData.get("serviceOrderId"));
  const auth = await requirePermission("quotes:manage");
  const entitlement = await entitlementService.getEntitlementContext(auth.shop.id);
  if (!entitlement.isOperationallyActive) {
    throw new Error("انتهت فترة استخدامك. بياناتك محفوظة بالكامل، اختر خطة لمتابعة إنشاء عمليات جديدة.");
  }

  const invoice = await autoInvoiceService.createInvoiceFromServiceOrder(
    auth.shop.id,
    serviceOrderId,
    auth.user.id,
  );

  revalidatePath("/invoices");
  revalidatePath(`/invoices/${invoice.id}`);
  revalidatePath("/service-orders");
  revalidatePath(`/service-orders/${serviceOrderId}`);
  revalidatePath("/vehicles");
  redirect(`/invoices/${invoice.id}`);
}
