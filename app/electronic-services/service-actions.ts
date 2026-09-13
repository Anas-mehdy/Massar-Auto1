"use server";

import { redirect } from "next/navigation";

// FEATURE_RETIRED: phone-era electronic-service transactions are disabled in Massar Auto.
// These named exports remain only for build compatibility with legacy route files. They fail
// closed before templates, transactions, provider balances, debt, or money-account writes run.
function retireElectronicServices(formData: FormData): never {
  void formData;
  redirect("/dashboard");
}

export async function createElectronicServiceTemplateAction(formData: FormData) {
  retireElectronicServices(formData);
}

export async function setElectronicServiceTemplateStatusAction(formData: FormData) {
  retireElectronicServices(formData);
}

export async function createElectronicServiceTransactionAction(formData: FormData) {
  retireElectronicServices(formData);
}

export async function voidElectronicServiceTransactionAction(formData: FormData) {
  retireElectronicServices(formData);
}
