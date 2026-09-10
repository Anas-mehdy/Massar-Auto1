"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requirePermission } from "@/lib/auth/context";
import { vehicleService } from "@/lib/services/vehicleService";

const optionalText = z.string().trim().optional().transform((value) => value || null);
const optionalYear = z.union([z.string(), z.number()]).optional().transform((value, ctx) => {
  if (value === undefined || value === "") return null;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1886 || parsed > 2200) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "سنة الصنع غير صالحة" });
    return z.NEVER;
  }
  return parsed;
});
const optionalOdometer = z.union([z.string(), z.number()]).optional().transform((value, ctx) => {
  if (value === undefined || value === "") return null;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "قراءة العداد غير صالحة" });
    return z.NEVER;
  }
  return parsed;
});

const vehicleSchema = z.object({
  customerId: z.string().uuid("العميل المحدد غير صالح"),
  plateNumber: optionalText,
  vin: optionalText,
  make: z.string().trim().min(1, "ماركة المركبة مطلوبة").max(100),
  model: z.string().trim().min(1, "موديل المركبة مطلوب").max(120),
  year: optionalYear,
  color: optionalText,
  engineNumber: optionalText,
  fuelType: optionalText,
  transmission: optionalText,
  engineDetails: optionalText,
  currentOdometer: optionalOdometer,
  notes: optionalText,
});

function readString(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

function parseVehicleForm(formData: FormData) {
  return vehicleSchema.parse({
    customerId: readString(formData, "customerId"),
    plateNumber: readString(formData, "plateNumber"),
    vin: readString(formData, "vin"),
    make: readString(formData, "make"),
    model: readString(formData, "model"),
    year: readString(formData, "year"),
    color: readString(formData, "color"),
    engineNumber: readString(formData, "engineNumber"),
    fuelType: readString(formData, "fuelType"),
    transmission: readString(formData, "transmission"),
    engineDetails: readString(formData, "engineDetails"),
    currentOdometer: readString(formData, "currentOdometer"),
    notes: readString(formData, "notes"),
  });
}

export async function createVehicleAction(formData: FormData) {
  const auth = await requirePermission("vehicles:manage");
  const input = parseVehicleForm(formData);
  const vehicle = await vehicleService.createVehicle(auth.shop.id, input);
  revalidatePath("/vehicles");
  revalidatePath("/customers");
  redirect(`/vehicles/${vehicle.id}`);
}

export async function updateVehicleAction(formData: FormData) {
  const auth = await requirePermission("vehicles:manage");
  const vehicleId = z.string().uuid().parse(readString(formData, "vehicleId"));
  const input = parseVehicleForm(formData);
  await vehicleService.updateVehicle(auth.shop.id, vehicleId, input);
  revalidatePath("/vehicles");
  revalidatePath(`/vehicles/${vehicleId}`);
  revalidatePath("/customers");
}

export async function deleteVehicleAction(formData: FormData) {
  const auth = await requirePermission("vehicles:delete");
  const vehicleId = z.string().uuid().parse(readString(formData, "vehicleId"));
  await vehicleService.softDeleteVehicle(auth.shop.id, vehicleId);
  revalidatePath("/vehicles");
  revalidatePath("/customers");
  redirect("/vehicles");
}
