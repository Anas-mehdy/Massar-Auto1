"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { MembershipRole, MembershipStatus } from "@prisma/client";
import {
  requirePermission,
  AuthorizationError,
  AuthenticationError,
  MembershipInactiveError,
} from "@/lib/auth/context";
import { teamService } from "@/lib/services/teamService";
import { setSessionCookie, verifyPassword } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const inviteSchema = z.object({
  name: z.string().trim().min(2, "اسم الموظف مطلوب (حرفان على الأقل)"),
  email: z.string().email("البريد الإلكتروني غير صحيح"),
  role: z.nativeEnum(MembershipRole).refine((r) => r !== MembershipRole.OWNER, {
    message: "لا يمكن دعوة مالك جديد للمتجر",
  }),
});

const updateRoleSchema = z.object({
  membershipId: z.string().uuid("معرف العضوية غير صالح"),
  role: z.nativeEnum(MembershipRole).refine((r) => r !== MembershipRole.OWNER, {
    message: "لا يمكن تعيين رتبة المالك لأي موظف",
  }),
});

const toggleStatusSchema = z.object({
  membershipId: z.string().uuid("معرف العضوية غير صالح"),
  status: z.nativeEnum(MembershipStatus),
});

const removeMemberSchema = z.object({
  membershipId: z.string().uuid("معرف العضوية غير صالح"),
});

const revokeInvitationSchema = z.object({
  invitationId: z.string().uuid("معرف الدعوة غير صالح"),
});

const acceptInvitationSchema = z.object({
  name: z.string().optional(),
  password: z.string().min(1, "كلمة المرور مطلوبة").max(128, "كلمة المرور طويلة جداً"),
});

export async function inviteTeamMemberAction(formData: FormData) {
  try {
    const auth = await requirePermission("team:invite");

    const parsed = inviteSchema.safeParse({
      name: formData.get("name"),
      email: formData.get("email"),
      role: formData.get("role"),
    });

    if (!parsed.success) {
      return {
        success: false,
        error: parsed.error.issues[0]?.message || "بيانات الدعوة غير صالحة",
      };
    }

    const { invitation, rawToken } = await teamService.createInvitation(
      auth.shop.id,
      parsed.data,
      auth.user.id
    );

    revalidatePath("/settings");
    return {
      success: true,
      rawToken,
      invitationId: invitation.id,
      email: invitation.email,
      role: invitation.role,
    };
  } catch (error) {
    if (
      error instanceof AuthorizationError ||
      error instanceof AuthenticationError ||
      error instanceof MembershipInactiveError
    ) {
      return { success: false, error: error.message };
    }

    console.error("[TeamAction Error: inviteTeamMemberAction]", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "تعذر إرسال الدعوة",
    };
  }
}

export async function updateMemberRoleAction(formData: FormData) {
  try {
    const auth = await requirePermission("team:manage");

    const parsed = updateRoleSchema.safeParse({
      membershipId: formData.get("membershipId"),
      role: formData.get("role"),
    });

    if (!parsed.success) {
      return {
        success: false,
        error: parsed.error.issues[0]?.message || "بيانات الدور غير صالحة",
      };
    }

    await teamService.updateMemberRole(
      auth.shop.id,
      parsed.data.membershipId,
      parsed.data.role,
      auth.user.id
    );

    revalidatePath("/settings");
    return { success: true };
  } catch (error) {
    if (
      error instanceof AuthorizationError ||
      error instanceof AuthenticationError ||
      error instanceof MembershipInactiveError
    ) {
      return { success: false, error: error.message };
    }

    console.error("[TeamAction Error: updateMemberRoleAction]", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "تعذر تحديث الدور",
    };
  }
}

export async function toggleMemberStatusAction(formData: FormData) {
  try {
    const auth = await requirePermission("team:manage");

    const parsed = toggleStatusSchema.safeParse({
      membershipId: formData.get("membershipId"),
      status: formData.get("status"),
    });

    if (!parsed.success) {
      return {
        success: false,
        error: parsed.error.issues[0]?.message || "الحالة غير صالحة",
      };
    }

    await teamService.toggleMemberStatus(
      auth.shop.id,
      parsed.data.membershipId,
      parsed.data.status,
      auth.user.id
    );

    revalidatePath("/settings");
    return { success: true };
  } catch (error) {
    if (
      error instanceof AuthorizationError ||
      error instanceof AuthenticationError ||
      error instanceof MembershipInactiveError
    ) {
      return { success: false, error: error.message };
    }

    console.error("[TeamAction Error: toggleMemberStatusAction]", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "تعذر تغيير حالة العضوية",
    };
  }
}

export async function removeMemberAction(formData: FormData) {
  try {
    const auth = await requirePermission("team:manage");

    const parsed = removeMemberSchema.safeParse({
      membershipId: formData.get("membershipId"),
    });

    if (!parsed.success) {
      return {
        success: false,
        error: parsed.error.issues[0]?.message || "معرف العضوية غير صالح",
      };
    }

    await teamService.removeMember(
      auth.shop.id,
      parsed.data.membershipId,
      auth.user.id
    );

    revalidatePath("/settings");
    return { success: true };
  } catch (error) {
    if (
      error instanceof AuthorizationError ||
      error instanceof AuthenticationError ||
      error instanceof MembershipInactiveError
    ) {
      return { success: false, error: error.message };
    }

    console.error("[TeamAction Error: removeMemberAction]", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "تعذر إزالة العضو",
    };
  }
}

export async function revokeInvitationAction(formData: FormData) {
  try {
    const auth = await requirePermission("team:manage");

    const parsed = revokeInvitationSchema.safeParse({
      invitationId: formData.get("invitationId"),
    });

    if (!parsed.success) {
      return {
        success: false,
        error: parsed.error.issues[0]?.message || "معرف الدعوة غير صالح",
      };
    }

    await teamService.revokeInvitation(auth.shop.id, parsed.data.invitationId);
    revalidatePath("/settings");
    return { success: true };
  } catch (error) {
    if (
      error instanceof AuthorizationError ||
      error instanceof AuthenticationError ||
      error instanceof MembershipInactiveError
    ) {
      return { success: false, error: error.message };
    }

    console.error("[TeamAction Error: revokeInvitationAction]", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "تعذر إلغاء الدعوة",
    };
  }
}

export async function acceptInvitationAction(rawToken: string, formData: FormData) {
  const parsed = acceptInvitationSchema.safeParse({
    name: formData.get("name"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message || "البيانات المدخلة غير مكتملة",
    };
  }

  try {
    const invitationCheck = await teamService.getInvitationByToken(rawToken);
    if (!invitationCheck.valid || !invitationCheck.invitation) {
      return { success: false, error: invitationCheck.error || "رابط الدعوة غير صالح." };
    }

    const normalizedEmail = invitationCheck.invitation.email.toLowerCase();
    const existingUser = await prisma.user.findUnique({
      where: { email: normalizedEmail },
      select: { passwordHash: true },
    });

    if (existingUser) {
      if (!existingUser.passwordHash || !(await verifyPassword(parsed.data.password, existingUser.passwordHash))) {
        return {
          success: false,
          error: "هذا البريد مرتبط بحساب موجود. أدخل كلمة مرور الحساب الحالية لقبول الدعوة.",
        };
      }
    } else if (parsed.data.password.length < 8) {
      return { success: false, error: "كلمة المرور للحساب الجديد يجب ألا تقل عن 8 أحرف." };
    }

    const result = await teamService.acceptInvitation(rawToken, parsed.data);

    await setSessionCookie({
      userId: result.user.id,
      shopId: result.shop.id,
      email: result.user.email,
      name: result.user.name,
      role: result.membership.role,
      shopName: result.shop.name,
      currency: result.shop.currency || "SAR",
      sessionVersion: result.user.version,
    });
  } catch (error) {
    console.error("[TeamAction Error: acceptInvitationAction]", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "تعذر قبول الدعوة",
    };
  }

  redirect("/dashboard");
}