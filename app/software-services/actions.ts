"use server";

import { redirect } from "next/navigation";

// FEATURE_RETIRED: phone-era software services are intentionally disabled in Massar Auto.
// Keep these named exports while legacy pages remain in the repository so imports still compile,
// but fail closed before any database, invoice, payment, debt, or money-account mutation can run.
function retireSoftwareServices(formData: FormData): never {
  void formData;
  redirect("/dashboard");
}

export async function createSoftwareServiceSaleAction(formData: FormData) {
  retireSoftwareServices(formData);
}

export async function createSoftwareServiceCatalogAction(formData: FormData) {
  retireSoftwareServices(formData);
}

export async function markSoftwareDeviceDeliveredAction(formData: FormData) {
  retireSoftwareServices(formData);
}

export async function cancelSoftwareServiceSaleAction(formData: FormData) {
  retireSoftwareServices(formData);
}
