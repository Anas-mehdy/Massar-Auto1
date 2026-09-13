"use server";

import { redirect } from "next/navigation";

// FEATURE_RETIRED: provider reconciliation belongs to the phone-era electronic-service module.
// Keep the export for legacy page build compatibility, but fail closed before any balance or
// reconciliation mutation can execute in Massar Auto.
export async function reconcileElectronicServiceProviderAction(formData: FormData) {
  void formData;
  redirect("/dashboard");
}
