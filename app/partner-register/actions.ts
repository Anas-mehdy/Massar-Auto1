"use server";

import { redirect } from "next/navigation";
import { getRequestNetworkFingerprint } from "@/lib/auth/requestFingerprint";
import {
  registerFromPartnerInvitation,
  registerFromPartnerPublicLink,
  type PartnerClientRegistrationInput,
} from "@/lib/services/partnerClientOnboardingService";

export async function partnerClientRegisterAction(formData: FormData) {
  const mode = String(formData.get("mode") || "");
  const key = String(formData.get("key") || "").trim();
  const input: PartnerClientRegistrationInput = {
    ownerName: String(formData.get("ownerName") || "").trim(),
    email: String(formData.get("email") || "").trim(),
    password: String(formData.get("password") || ""),
    shopName: String(formData.get("shopName") || "").trim(),
    phone: String(formData.get("phone") || "").trim(),
    countryCode: String(formData.get("countryCode") || "").trim(),
    currency: String(formData.get("currency") || "").trim(),
    address: String(formData.get("address") || "").trim(),
  };

  try {
    const requestFingerprint = await getRequestNetworkFingerprint();
    if (mode === "invite") {
      await registerFromPartnerInvitation(key, input, requestFingerprint);
    } else if (mode === "public") {
      await registerFromPartnerPublicLink(key, input, requestFingerprint);
    } else {
      return { success: false, error: "مسار التسجيل غير صالح." };
    }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "تعذر إنشاء الحساب." };
  }

  redirect("/dashboard");
}
