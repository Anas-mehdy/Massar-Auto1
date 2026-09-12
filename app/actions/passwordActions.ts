"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { clearSessionCookie } from "@/lib/auth";
import { getAuthContext } from "@/lib/auth/context";
import { getRequestFingerprint } from "@/lib/auth/requestFingerprint";
import { passwordResetService } from "@/lib/services/passwordResetService";

export type PasswordActionState = { success?: string; error?: string };

const emailSchema = z.string().trim().email("يرجى إدخال بريد إلكتروني صحيح.");
const passwordSchema = z.string().min(8, "كلمة المرور يجب ألا تقل عن 8 أحرف.").max(128, "كلمة المرور طويلة جداً.");

export async function requestPasswordResetAction(
  _previousState: PasswordActionState,
  formData: FormData
): Promise<PasswordActionState> {
  const parsed = emailSchema.safeParse(formData.get("email"));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };

  try {
    await passwordResetService.requestReset(parsed.data, await getRequestFingerprint());
  } catch (error) {
    console.error("[PasswordReset] Failed to issue reset email", error);
  }

  return {
    success: "إذا كان البريد مسجلاً في مسار، ستصلك رسالة الاستعادة خلال دقائق قليلة.",
  };
}

export async function resetPasswordAction(
  _previousState: PasswordActionState,
  formData: FormData
): Promise<PasswordActionState> {
  const token = String(formData.get("token") || "");
  const password = String(formData.get("password") || "");
  const confirmation = String(formData.get("passwordConfirmation") || "");
  const parsed = passwordSchema.safeParse(password);

  if (!parsed.success) return { error: parsed.error.issues[0]?.message };
  if (password !== confirmation) return { error: "تأكيد كلمة المرور غير مطابق." };

  try {
    await passwordResetService.resetPassword(token, password);
    await clearSessionCookie();
  } catch (error) {
    return { error: error instanceof Error ? error.message : "تعذر تغيير كلمة المرور." };
  }

  redirect("/login?passwordChanged=1");
}

export async function changePasswordAction(
  _previousState: PasswordActionState,
  formData: FormData
): Promise<PasswordActionState> {
  const auth = await getAuthContext();
  const currentPassword = String(formData.get("currentPassword") || "");
  const newPassword = String(formData.get("newPassword") || "");
  const confirmation = String(formData.get("passwordConfirmation") || "");
  const parsed = passwordSchema.safeParse(newPassword);

  if (!currentPassword) return { error: "يرجى إدخال كلمة المرور الحالية." };
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };
  if (newPassword !== confirmation) return { error: "تأكيد كلمة المرور غير مطابق." };

  try {
    await passwordResetService.changePassword(auth.user.id, currentPassword, newPassword);
    await clearSessionCookie();
  } catch (error) {
    return { error: error instanceof Error ? error.message : "تعذر تغيير كلمة المرور." };
  }

  redirect("/login?passwordChanged=1");
}
