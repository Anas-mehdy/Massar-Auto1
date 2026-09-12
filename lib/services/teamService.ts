import crypto from "crypto";
import { InvitationStatus, MembershipRole, MembershipStatus } from "@prisma/client";
import { hashPassword, verifyPassword } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { entitlementService } from "@/lib/services/subscriptionEntitlementService";

export interface CreateInvitationInput {
  name: string;
  email: string;
  role: MembershipRole;
}

export interface AcceptInvitationInput {
  name?: string;
  password: string;
}

export interface SeatUsageInfo {
  usedSeats: number;
  activeMembersCount: number;
  pendingInvitesCount: number;
  maxSeats: number;
  remainingSeats: number;
  canInvite: boolean;
  isUnlimited: boolean;
}

/**
 * Seat information is derived from the Subscription Entitlement Service.
 * Shop.maxSeats is legacy metadata and is not an authorization source.
 */
export async function getShopSeatUsage(shopId: string): Promise<SeatUsageInfo> {
  const [entitlement, pendingInvitesCount] = await Promise.all([
    entitlementService.getEntitlementContext(shopId),
    prisma.shopInvitation.count({
      where: {
        shopId,
        status: InvitationStatus.PENDING,
        deletedAt: null,
        expiresAt: { gt: new Date() },
      },
    }),
  ]);

  const usedSeats = entitlement.usage.activeSeats;
  const activeMembersCount = Math.max(0, usedSeats - pendingInvitesCount);
  const limit = entitlement.limits.totalSeats ?? 5;

  return {
    usedSeats,
    activeMembersCount,
    pendingInvitesCount,
    maxSeats: limit,
    remainingSeats: Math.max(0, limit - usedSeats),
    canInvite: entitlement.canAddEmployee,
    isUnlimited: false,
  };
}

export async function listTeamMembers(shopId: string) {
  const [memberships, pendingInvitations, entitlement] = await Promise.all([
    prisma.membership.findMany({
      where: {
        shopId,
        status: { not: MembershipStatus.REMOVED },
        deletedAt: null,
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            phone: true,
            createdAt: true,
          },
        },
      },
      orderBy: [{ role: "asc" }, { createdAt: "asc" }],
    }),
    prisma.shopInvitation.findMany({
      where: {
        shopId,
        status: InvitationStatus.PENDING,
        deletedAt: null,
        expiresAt: { gt: new Date() },
      },
      include: {
        invitedBy: {
          select: {
            name: true,
            email: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
    }),
    entitlementService.getEntitlementContext(shopId),
  ]);

  const pendingInvitesCount = pendingInvitations.length;
  const usedSeats = entitlement.usage.activeSeats;
  const activeMembersCount = Math.max(0, usedSeats - pendingInvitesCount);
  const limit = entitlement.limits.totalSeats ?? 5;

  const seatUsage: SeatUsageInfo = {
    usedSeats,
    activeMembersCount,
    pendingInvitesCount,
    maxSeats: limit,
    remainingSeats: Math.max(0, limit - usedSeats),
    canInvite: entitlement.canAddEmployee,
    isUnlimited: false,
  };

  return {
    memberships,
    pendingInvitations,
    seatUsage,
  };
}

export async function createInvitation(
  shopId: string,
  input: CreateInvitationInput,
  invitedByUserId: string,
) {
  const name = input.name.trim();
  const email = input.email.trim().toLowerCase();

  if (!name || name.length < 2) {
    throw new Error("اسم الموظف مطلوب (حرفان على الأقل).");
  }

  if (input.role === MembershipRole.OWNER) {
    throw new Error("لا يمكن إنشاء أو دعوة مالك جديد. اختر مديراً أو استقبالاً أو فنياً أو مستودعاً أو محاسباً أو مشاهداً.");
  }

  const allowedRoles: MembershipRole[] = [
    MembershipRole.ADMIN,
    MembershipRole.RECEPTIONIST,
    MembershipRole.TECHNICIAN,
    MembershipRole.WAREHOUSE,
    MembershipRole.FINANCE,
    MembershipRole.VIEWER,
  ];

  if (!allowedRoles.includes(input.role)) {
    throw new Error("الدور المحدد غير صالح.");
  }

  const rawToken = crypto.randomBytes(32).toString("hex");
  const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  const guarded = await entitlementService.withSeatLimitGuard(
    shopId,
    async (tx) => {
      const existingMember = await tx.membership.findFirst({
        where: {
          shopId,
          user: { email },
          deletedAt: null,
          status: { not: MembershipStatus.REMOVED },
        },
      });

      if (existingMember) {
        throw new Error("المستخدم مسجل كعضو بالفعل في هذا المتجر.");
      }

      await tx.shopInvitation.updateMany({
        where: {
          shopId,
          email,
          status: InvitationStatus.PENDING,
        },
        data: {
          status: InvitationStatus.REVOKED,
          deletedAt: new Date(),
        },
      });

      const invitation = await tx.shopInvitation.create({
        data: {
          shopId,
          name,
          email,
          role: input.role,
          tokenHash,
          status: InvitationStatus.PENDING,
          invitedByUserId,
          expiresAt,
        },
        include: {
          shop: {
            select: { name: true },
          },
        },
      });

      return {
        invitation,
        rawToken,
      };
    },
  );

  if ("denied" in guarded) {
    throw new Error(guarded.message);
  }

  return guarded.result;
}

export async function updateMemberRole(
  shopId: string,
  membershipId: string,
  newRole: MembershipRole,
  actorUserId: string,
) {
  if (newRole === MembershipRole.OWNER) {
    throw new Error("لا يمكن ترقية موظف إلى رتبة مالك متجر.");
  }

  const allowedRoles: MembershipRole[] = [
    MembershipRole.ADMIN,
    MembershipRole.RECEPTIONIST,
    MembershipRole.TECHNICIAN,
    MembershipRole.WAREHOUSE,
    MembershipRole.FINANCE,
    MembershipRole.VIEWER,
  ];

  if (!allowedRoles.includes(newRole)) {
    throw new Error("الدور المحدد غير صالح.");
  }

  const target = await prisma.membership.findFirst({
    where: {
      id: membershipId,
      shopId,
      deletedAt: null,
    },
  });

  if (!target) {
    throw new Error("العضوية المطلوبة غير موجودة في هذا المتجر.");
  }

  if (target.role === MembershipRole.OWNER) {
    throw new Error("لا يمكن تعديل دور مالك المتجر الأساسي.");
  }

  if (target.userId === actorUserId) {
    throw new Error("لا يمكنك تعديل دورك الخاص بنفسك.");
  }

  return prisma.membership.update({
    where: { id: membershipId },
    data: { role: newRole },
  });
}

export async function toggleMemberStatus(
  shopId: string,
  membershipId: string,
  newStatus: MembershipStatus,
  actorUserId: string,
) {
  if (newStatus !== MembershipStatus.ACTIVE && newStatus !== MembershipStatus.SUSPENDED) {
    throw new Error("الحالة المحددة غير صالحة.");
  }

  const target = await prisma.membership.findFirst({
    where: {
      id: membershipId,
      shopId,
      deletedAt: null,
    },
  });

  if (!target) {
    throw new Error("العضوية المطلوبة غير موجودة في هذا المتجر.");
  }

  if (target.role === MembershipRole.OWNER) {
    throw new Error("لا يمكن تجميد حساب مالك المتجر.");
  }

  if (target.userId === actorUserId) {
    throw new Error("لا يمكنك تجميد حسابك الخاص بنفسك.");
  }

  // Reactivating a suspended worker is a new active seat and therefore must
  // obey the transactional seat limit guard. Suspending remains allowed at all times.
  if (newStatus === MembershipStatus.ACTIVE && target.status !== MembershipStatus.ACTIVE) {
    const guarded = await entitlementService.withSeatLimitGuard(
      shopId,
      async (tx) => {
        return tx.membership.update({
          where: { id: membershipId },
          data: { status: newStatus },
        });
      },
    );

    if ("denied" in guarded) {
      throw new Error(guarded.message);
    }

    return guarded.result;
  }

  return prisma.membership.update({
    where: { id: membershipId },
    data: { status: newStatus },
  });
}

export async function removeMember(
  shopId: string,
  membershipId: string,
  actorUserId: string,
) {
  const target = await prisma.membership.findFirst({
    where: {
      id: membershipId,
      shopId,
      deletedAt: null,
    },
  });

  if (!target) {
    throw new Error("العضوية المطلوبة غير موجودة في هذا المتجر.");
  }

  if (target.role === MembershipRole.OWNER) {
    throw new Error("لا يمكن إزالة مالك المتجر.");
  }

  if (target.userId === actorUserId) {
    throw new Error("لا يمكنك إزالة نفسك من المتجر.");
  }

  const result = await prisma.$transaction(async (tx) => {
    const updated = await tx.membership.update({
      where: { id: membershipId },
      data: {
        status: MembershipStatus.REMOVED,
        deletedAt: new Date(),
      },
    });

    const activeMemberships = await tx.membership.count({
      where: {
        userId: target.userId,
        status: { not: MembershipStatus.REMOVED },
        deletedAt: null,
      },
    });

    if (activeMemberships === 0) {
      await tx.user.update({
        where: { id: target.userId },
        data: {
          deletedAt: new Date(),
          version: { increment: 1 },
        },
      });
    }

    return updated;
  });

  return result;
}

export async function revokeInvitation(shopId: string, invitationId: string) {
  const invitation = await prisma.shopInvitation.findFirst({
    where: {
      id: invitationId,
      shopId,
      status: InvitationStatus.PENDING,
      deletedAt: null,
    },
  });

  if (!invitation) {
    throw new Error("الدعوة غير موجودة أو لم تعد قيد الانتظار.");
  }

  return prisma.shopInvitation.update({
    where: { id: invitationId },
    data: {
      status: InvitationStatus.REVOKED,
      deletedAt: new Date(),
    },
  });
}

export async function getInvitationByToken(rawToken: string) {
  const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");

  const invitation = await prisma.shopInvitation.findUnique({
    where: { tokenHash },
    include: {
      shop: {
        select: {
          id: true,
          name: true,
          currency: true,
          countryCode: true,
        },
      },
      invitedBy: {
        select: {
          name: true,
          email: true,
        },
      },
    },
  });

  if (!invitation || invitation.deletedAt) {
    return {
      valid: false,
      error: "رابط الدعوة غير صالح أو تم حذفه.",
      invitation: null,
    };
  }

  if (invitation.status !== InvitationStatus.PENDING) {
    return {
      valid: false,
      error: "رابط الدعوة تم استخدامه مسبقاً أو تم إلغاؤه.",
      invitation: null,
    };
  }

  if (invitation.expiresAt < new Date()) {
    return {
      valid: false,
      error: "رابط الدعوة منتهي الصلاحية.",
      invitation: null,
    };
  }

  return {
    valid: true,
    error: null,
    invitation,
  };
}

export async function acceptInvitation(
  token: string,
  input: AcceptInvitationInput,
) {
  const check = await getInvitationByToken(token);

  if (!check.valid || !check.invitation) {
    throw new Error(check.error || "رابط الدعوة غير صالح.");
  }

  const invitation = check.invitation;
  const name = (input.name?.trim() || invitation.name?.trim()) || "عضو فريق العمل";
  const password = input.password;

  if (!name) {
    throw new Error("الاسم مطلوب.");
  }

  if (!password || password.length > 128) {
    throw new Error("كلمة المرور مطلوبة ويجب ألا تتجاوز 128 حرفاً.");
  }

  // Pre-compute a candidate hash only when it could be used for a brand-new
  // account. Existing accounts are authenticated against their current hash
  // and their password is never replaced by accepting a shop invitation.
  const newUserPasswordHash = password.length >= 8 ? await hashPassword(password) : null;

  const guarded = await entitlementService.withSeatLimitGuard(
    invitation.shopId,
    async (tx) => {
      // Re-read the invitation inside the mutation transaction so a revoked or
      // already-accepted token cannot race with this acceptance.
      const liveInvitation = await tx.shopInvitation.findFirst({
        where: {
          id: invitation.id,
          shopId: invitation.shopId,
          status: InvitationStatus.PENDING,
          deletedAt: null,
          expiresAt: { gt: new Date() },
        },
      });

      if (!liveInvitation) {
        throw new Error("رابط الدعوة لم يعد صالحاً أو تم استخدامه بالفعل.");
      }

      let user = await tx.user.findUnique({
        where: { email: invitation.email.toLowerCase() },
      });

      if (user) {
        if (!user.passwordHash || !(await verifyPassword(password, user.passwordHash))) {
          throw new Error("هذا البريد مرتبط بحساب موجود. أدخل كلمة مرور الحساب الحالية لقبول الدعوة.");
        }

        // Accepting a new shop invitation must never mutate an existing
        // account's password or profile. A previously soft-deleted account may
        // be reactivated after proving possession of its current password.
        if (user.deletedAt) {
          user = await tx.user.update({
            where: { id: user.id },
            data: {
              deletedAt: null,
              version: { increment: 1 },
            },
          });
        }
      } else {
        if (!newUserPasswordHash) {
          throw new Error("كلمة المرور للحساب الجديد يجب ألا تقل عن 8 أحرف.");
        }

        user = await tx.user.create({
          data: {
            email: invitation.email.toLowerCase(),
            name,
            passwordHash: newUserPasswordHash,
            shopId: invitation.shopId,
            role: "STAFF",
          },
        });
      }

      const membership = await tx.membership.upsert({
        where: {
          shopId_userId: {
            shopId: invitation.shopId,
            userId: user.id,
          },
        },
        create: {
          shopId: invitation.shopId,
          userId: user.id,
          role: invitation.role,
          status: MembershipStatus.ACTIVE,
        },
        update: {
          role: invitation.role,
          status: MembershipStatus.ACTIVE,
          deletedAt: null,
        },
      });

      await tx.shopInvitation.update({
        where: { id: invitation.id },
        data: {
          status: InvitationStatus.ACCEPTED,
          acceptedAt: new Date(),
        },
      });

      return {
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          version: user.version,
        },
        shop: invitation.shop,
        membership,
      };
    },
    { acceptingInvitationId: invitation.id },
  );

  if ("denied" in guarded) {
    throw new Error(guarded.message);
  }

  return guarded.result;
}

export const teamService = {
  getShopSeatUsage,
  listTeamMembers,
  createInvitation,
  updateMemberRole,
  toggleMemberStatus,
  removeMember,
  revokeInvitation,
  getInvitationByToken,
  acceptInvitation,
};