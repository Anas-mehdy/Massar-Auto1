"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requirePermission } from "@/lib/auth/context";
import { customerService } from "@/lib/services/customerService";
import { vehicleService } from "@/lib/services/vehicleService";
import { autoServiceOrderService } from "@/lib/services/autoServiceOrderService";

function readString(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function optionalNumber(value: string) {
  if (!value) return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) throw new Error("القيمة الرقمية غير صالحة.");
  return parsed;
}

function optionalInteger(value: string) {
  if (!value) return null;
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) throw new Error("القيمة يجب أن تكون رقماً صحيحاً.");
  return parsed;
}

export async function createIntakeServiceOrderAction(formData: FormData) {
  const auth = await requirePermission("service_orders:create");

  const existingVehicleId = readString(formData, "vehicleId");
  let vehicleId = existingVehicleId ? z.string().uuid().parse(existingVehicleId) : "";

  if (!vehicleId) {
    await requirePermission("vehicles:manage");

    const existingCustomerId = readString(formData, "existingCustomerId");
    let customerId = existingCustomerId ? z.string().uuid().parse(existingCustomerId) : "";

    if (!customerId) {
      await requirePermission("customers:manage");

      const customerName = readString(formData, "newCustomerName");
      const customerPhone = readString(formData, "newCustomerPhone");
      const customerEmail = readString(formData, "newCustomerEmail");

      if (!customerName) throw new Error("اكتب اسم العميل الجديد أو اختر عميلاً موجوداً.");
      if (!customerPhone) throw new Error("رقم هاتف العميل الجديد مطلوب عند فتح أمر الصيانة.");

      const customer = await customerService.createCustomer(auth.shop.id, {
        name: customerName,
        phone: customerPhone,
        email: customerEmail || null,
      });
      customerId = customer.id;
    }

    const make = readString(formData, "newVehicleMake");
    const model = readString(formData, "newVehicleModel");
    if (!make) throw new Error("ماركة المركبة الجديدة مطلوبة.");
    if (!model) throw new Error("موديل المركبة الجديدة مطلوب.");

    const intakeOdometer = optionalInteger(readString(formData, "odometerAtIntake"));
    const vehicle = await vehicleService.createVehicle(auth.shop.id, {
      customerId,
      make,
      model,
      year: optionalInteger(readString(formData, "newVehicleYear")),
      plateNumber: readString(formData, "newVehiclePlateNumber") || null,
      vin: readString(formData, "newVehicleVin") || null,
      color: readString(formData, "newVehicleColor") || null,
      currentOdometer: intakeOdometer,
    });
    vehicleId = vehicle.id;
  }

  const reportedIssue = readString(formData, "reportedIssue");
  if (!reportedIssue) throw new Error("شكوى العميل أو سبب دخول المركبة مطلوب.");

  const order = await autoServiceOrderService.createServiceOrder(auth.shop.id, auth.user.id, {
    vehicleId,
    reportedIssue,
    receptionNotes: readString(formData, "receptionNotes") || null,
    exteriorCondition: readString(formData, "exteriorCondition") || null,
    keysAndItems: readString(formData, "keysAndItems") || null,
    odometerAtIntake: optionalInteger(readString(formData, "odometerAtIntake")),
    fuelLevelPercent: optionalNumber(readString(formData, "fuelLevelPercent")),
    estimatedTotal: optionalNumber(readString(formData, "estimatedTotal")),
    promisedAt: readString(formData, "promisedAt") || null,
    receptionistUserId: auth.user.id,
  });

  revalidatePath("/customers");
  revalidatePath("/vehicles");
  revalidatePath("/service-orders");
  revalidatePath(`/vehicles/${order.vehicleId}`);
  redirect(`/service-orders/${order.id}`);
}
