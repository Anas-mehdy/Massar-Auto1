"use server";

import { redirect } from "next/navigation";

// FEATURE_RETIRED: phone-era electronic-service providers are disabled in Massar Auto.
// Preserve the legacy action exports only so old route files continue to compile. Every action
// redirects before any provider, balance, analytics, or financial mutation can execute.
function retireElectronicServices(formData: FormData): never {
  void formData;
  redirect("/dashboard");
}

export async function createElectronicServiceProviderAction(formData: FormData) {
  retireElectronicServices(formData);
}

export async function updateElectronicServiceProviderAction(formData: FormData) {
  retireElectronicServices(formData);
}

export async function setElectronicServiceProviderStatusAction(formData: FormData) {
  retireElectronicServices(formData);
}

export async function recordElectronicServiceProviderBalanceAction(formData: FormData) {
  retireElectronicServices(formData);
}
