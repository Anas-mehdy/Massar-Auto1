"use client";

import { useState, useTransition } from "react";
import {
  Users,
  UserPlus,
  Shield,
  Copy,
  Check,
  Share2,
  Trash2,
  UserX,
  UserCheck,
  Edit3,
  Clock,
  AlertCircle,
  Loader2,
  X,
} from "lucide-react";
import { MembershipRole, MembershipStatus } from "@prisma/client";
import { Button } from "@/components/ui/button";
import {
  inviteTeamMemberAction,
  updateMemberRoleAction,
  toggleMemberStatusAction,
  removeMemberAction,
  revokeInvitationAction,
} from "@/app/actions/teamActions";
import Link from "next/link";
import { formatDate } from "@/lib/format";
import { buildAppUrl } from "@/lib/app-url";

export interface TeamMemberItem {
  id: string;
  role: MembershipRole;
  status: MembershipStatus;
  joinedAt: Date | string;
  createdAt: Date | string;
  user: {
    id: string;
    name: string;
    email: string;
    phone?: string | null;
    createdAt: Date | string;
  };
}

export interface PendingInviteItem {
  id: string;
  name?: string | null;
  email: string;
  role: MembershipRole;
  status: string;
  expiresAt: Date | string;
  createdAt: Date | string;
  invitedBy?: {
    name?: string | null;
    email?: string | null;
  } | null;
}

export interface SeatUsageData {
  usedSeats: number;
  activeMembersCount: number;
  pendingInvitesCount: number;
  maxSeats: number;
  remainingSeats: number;
  canInvite: boolean;
}

const ROLE_DISPLAY: Record<MembershipRole, { label: string; colorClass: string; bgClass: string; borderClass: string }> = {
  OWNER: {
    label: "المالك الأساسي",
    colorClass: "text-purple-800",
    bgClass: "bg-purple-50",
    borderClass: "border-purple-200",
  },
  ADMIN: {
    label: "مدير فرع",
    colorClass: "text-blue-800",
    bgClass: "bg-blue-50",
    borderClass: "border-blue-200",
  },
  TECHNICIAN: {
    label: "فني صيانة",
    colorClass: "text-teal-800",
    bgClass: "bg-teal-50",
    borderClass: "border-teal-200",
  },
  RECEPTIONIST: {
    label: "موظف استقبال",
    colorClass: "text-cyan-800",
    bgClass: "bg-cyan-50",
    borderClass: "border-cyan-200",
  },
  WAREHOUSE: {
    label: "أمين مستودع",
    colorClass: "text-amber-800",
    bgClass: "bg-amber-50",
    borderClass: "border-amber-200",
  },
  FINANCE: {
    label: "محاسب / مالية",
    colorClass: "text-emerald-800",
    bgClass: "bg-emerald-50",
    borderClass: "border-emerald-200",
  },
  VIEWER: {
    label: "مشاهد تقارير",
    colorClass: "text-slate-800",
    bgClass: "bg-slate-100",
    borderClass: "border-slate-300",
  },
};

export function TeamManagementSection({
  memberships,
  pendingInvitations,
  seatUsage,
  currentUserId,
  canManageTeam,
  canInviteTeam,
}: {
  memberships: TeamMemberItem[];
  pendingInvitations: PendingInviteItem[];
  seatUsage: SeatUsageData;
  currentUserId: string;
  isOwner?: boolean;
  canManageTeam: boolean;
  canInviteTeam: boolean;
}) {
  const [isPending, startTransition] = useTransition();

  // Modal states
  const [isInviteModalOpen, setIsInviteModalOpen] = useState(false);
  const [generatedInviteUrl, setGeneratedInviteUrl] = useState<string | null>(null);
  const [generatedInviteEmail, setGeneratedInviteEmail] = useState<string>("");
  const [isCopied, setIsCopied] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Edit Role Modal State
  const [editingMember, setEditingMember] = useState<TeamMemberItem | null>(null);

  // 1. Submit New Invitation
  async function handleInviteSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (isPending) return;

    setFormError(null);
    const form = e.currentTarget;
    const formData = new FormData(form);

    startTransition(async () => {
      const result = await inviteTeamMemberAction(formData);
      if (result.success && result.rawToken) {
        const fullUrl = buildAppUrl(`/invite/${result.rawToken}`);
        setGeneratedInviteUrl(fullUrl);
        setGeneratedInviteEmail(result.email || "");
      } else {
        setFormError(result.error || "تعذر إرسال الدعوة");
      }
    });
  }

  // 2. Copy Invite Link
  async function handleCopyLink() {
    if (!generatedInviteUrl) return;
    try {
      await navigator.clipboard.writeText(generatedInviteUrl);
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 3000);
    } catch {
      // Fallback
    }
  }

  // 3. Update Member Role
  async function handleUpdateRole(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!editingMember || isPending) return;

    const form = e.currentTarget;
    const formData = new FormData(form);
    formData.append("membershipId", editingMember.id);

    startTransition(async () => {
      const result = await updateMemberRoleAction(formData);
      if (result.success) {
        setEditingMember(null);
      } else {
        alert(result.error || "تعذر تحديث الدور");
      }
    });
  }

  // 4. Toggle Status (Active ↔ Suspended)
  async function handleToggleStatus(member: TeamMemberItem) {
    if (isPending) return;
    const newStatus =
      member.status === MembershipStatus.ACTIVE
        ? MembershipStatus.SUSPENDED
        : MembershipStatus.ACTIVE;

    const confirmMsg =
      newStatus === MembershipStatus.SUSPENDED
        ? `هل أنت متأكد من تجميد حساب الموظف "${member.user.name}"؟ سيفقد إمكانية الوصول للنظام فورياً.`
        : `هل ترغب في إعادة تنشيط حساب الموظف "${member.user.name}"؟`;

    if (!window.confirm(confirmMsg)) return;

    const formData = new FormData();
    formData.append("membershipId", member.id);
    formData.append("status", newStatus);

    startTransition(async () => {
      const result = await toggleMemberStatusAction(formData);
      if (!result.success) {
        alert(result.error || "تعذر تغيير الحالة");
      }
    });
  }

  // 5. Remove Member
  async function handleRemoveMember(member: TeamMemberItem) {
    if (isPending) return;
    const confirmMsg = `هل أنت متأكد من إزالة الموظف "${member.user.name}" من هذا المتجر نهائياً؟`;
    if (!window.confirm(confirmMsg)) return;

    const formData = new FormData();
    formData.append("membershipId", member.id);

    startTransition(async () => {
      const result = await removeMemberAction(formData);
      if (!result.success) {
        alert(result.error || "تعذر إزالة الموظف");
      }
    });
  }

  // 6. Revoke Invitation
  async function handleRevokeInvite(invitation: PendingInviteItem) {
    if (isPending) return;
    if (!window.confirm(`هل أنت متأكد من إلغاء دعوة البريد "${invitation.email}"؟`)) return;

    const formData = new FormData();
    formData.append("invitationId", invitation.id);

    startTransition(async () => {
      const result = await revokeInvitationAction(formData);
      if (!result.success) {
        alert(result.error || "تعذر إلغاء الدعوة");
      }
    });
  }

  return (
    <section className="erp-card p-6 space-y-6">
      {/* Header & Seat Gauge */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-5">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-teal-500/10 text-teal-800 ring-1 ring-teal-500/20">
            <Users className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-bold text-slate-800 text-sm">فريق العمل والموظفون</h3>
              <span className="inline-flex items-center gap-1 bg-slate-100 text-slate-700 px-2.5 py-0.5 rounded-full text-[11px] font-extrabold border border-slate-200">
                <span className="h-1.5 w-1.5 rounded-full bg-teal-500"></span>
                المقاعد: {seatUsage.usedSeats} / {seatUsage.maxSeats}
              </span>
            </div>
            <p className="text-[11px] text-slate-400 font-semibold mt-0.5">
              إدارة الاستقبال والفنيين والمستودع والمالية والصلاحيات المرتبطة بهذا الفرع
            </p>
          </div>
        </div>

        {/* Action Button */}
        {canInviteTeam ? (
          <Button
            type="button"
            onClick={() => {
              setGeneratedInviteUrl(null);
              setFormError(null);
              setIsInviteModalOpen(true);
            }}
            disabled={!seatUsage.canInvite || isPending}
            className="h-10 px-4 rounded-xl bg-teal-800 hover:bg-teal-900 text-white font-bold text-xs shadow-md shadow-teal-800/15"
          >
            <UserPlus className="h-4 w-4 ml-1.5" />
            دعوة موظف جديد
          </Button>
        ) : null}
      </div>

      {/* Seat limit warning alert */}
      {!seatUsage.canInvite && canInviteTeam ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-3.5 text-xs text-amber-800 font-bold flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <AlertCircle className="h-4 w-4 shrink-0 text-amber-600" />
            <span>
              تم استخدام جميع المقاعد المتاحة ({seatUsage.usedSeats} من {seatUsage.maxSeats}).
            </span>
          </div>
          <Button
            asChild
            size="sm"
            variant="outline"
            className="h-8 rounded-lg border-amber-300 bg-white text-[11px] font-black text-amber-900 hover:bg-amber-100/50 shrink-0 self-start sm:self-center"
          >
            <Link href="/support">التواصل مع الدعم</Link>
          </Button>
        </div>
      ) : null}

      {/* Active Team Members List */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h4 className="text-xs font-extrabold text-slate-700 uppercase tracking-wider">
            المستخدمون النشطون ({memberships.length})
          </h4>
        </div>

        <div className="overflow-x-auto rounded-2xl border border-slate-100">
          <table className="w-full text-right text-xs">
            <thead>
              <tr className="bg-slate-50/60 border-b border-slate-100 text-slate-500 font-extrabold">
                <th className="py-3 pr-4">الموظف</th>
                <th className="py-3">البريد الإلكتروني</th>
                <th className="py-3">الدور / الصلاحية</th>
                <th className="py-3">الحالة</th>
                <th className="py-3">تاريخ الانضمام</th>
                {canManageTeam ? <th className="py-3 pl-4 text-center">الإجراءات</th> : null}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {memberships.map((member) => {
                const roleConfig = ROLE_DISPLAY[member.role] || ROLE_DISPLAY.TECHNICIAN;
                const isTargetOwner = member.role === MembershipRole.OWNER;
                const isSelf = member.user.id === currentUserId;

                return (
                  <tr key={member.id} className="hover:bg-slate-50/50 transition-colors">
                    {/* User Profile */}
                    <td className="py-3.5 pr-4">
                      <div className="flex items-center gap-2.5">
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-slate-100 to-slate-200 text-xs font-black text-slate-700 border border-slate-200/80">
                          {member.user.name.charAt(0)}
                        </div>
                        <div>
                          <div className="font-bold text-slate-900 flex items-center gap-1.5">
                            {member.user.name}
                            {isSelf ? (
                              <span className="text-[9px] font-extrabold bg-slate-100 text-slate-600 px-1.5 py-0.2 rounded">
                                (حسابك)
                              </span>
                            ) : null}
                          </div>
                          {member.user.phone ? (
                            <span className="text-[10px] text-slate-400 font-numeric block" dir="ltr">
                              {member.user.phone}
                            </span>
                          ) : null}
                        </div>
                      </div>
                    </td>

                    {/* Email */}
                    <td className="py-3.5 font-medium text-slate-600" dir="ltr">
                      {member.user.email}
                    </td>

                    {/* Role */}
                    <td className="py-3.5">
                      <span
                        className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-[11px] font-bold border ${roleConfig.bgClass} ${roleConfig.colorClass} ${roleConfig.borderClass}`}
                      >
                        <Shield className="h-3 w-3" />
                        {roleConfig.label}
                      </span>
                    </td>

                    {/* Status */}
                    <td className="py-3.5">
                      {member.status === MembershipStatus.ACTIVE ? (
                        <span className="inline-flex items-center gap-1 text-[11px] font-bold text-teal-700 bg-teal-50 border border-teal-200/80 px-2 py-0.5 rounded-md">
                          <span className="h-1.5 w-1.5 rounded-full bg-teal-600 animate-pulse"></span>
                          نشط
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[11px] font-bold text-rose-700 bg-rose-50 border border-rose-200/80 px-2 py-0.5 rounded-md">
                          <span className="h-1.5 w-1.5 rounded-full bg-rose-600"></span>
                          مجمد
                        </span>
                      )}
                    </td>

                    {/* Date */}
                    <td className="py-3.5 font-numeric text-slate-500 text-[11px]">
                      {formatDate(member.joinedAt || member.createdAt)}
                    </td>

                    {/* Actions */}
                    {canManageTeam ? (
                      <td className="py-3.5 pl-4 text-center">
                        {isTargetOwner ? (
                          <span className="text-[10px] font-bold text-slate-400">
                            مالك رئيسي (محمي)
                          </span>
                        ) : isSelf ? (
                          <span className="text-[10px] font-bold text-slate-400">-</span>
                        ) : (
                          <div className="flex items-center justify-center gap-1">
                            {/* Change Role Button */}
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => setEditingMember(member)}
                              disabled={isPending}
                              className="h-8 px-2.5 rounded-lg text-[11px] font-bold border-slate-200 hover:bg-slate-100"
                            >
                              <Edit3 className="h-3 w-3 ml-1 text-slate-600" />
                              الدور
                            </Button>

                            {/* Suspend / Reactivate Button */}
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => handleToggleStatus(member)}
                              disabled={isPending}
                              className={`h-8 px-2.5 rounded-lg text-[11px] font-bold border-slate-200 ${
                                member.status === MembershipStatus.ACTIVE
                                  ? "hover:bg-amber-50 text-amber-700"
                                  : "hover:bg-teal-50 text-teal-700"
                              }`}
                            >
                              {member.status === MembershipStatus.ACTIVE ? (
                                <>
                                  <UserX className="h-3 w-3 ml-1" />
                                  تجميد
                                </>
                              ) : (
                                <>
                                  <UserCheck className="h-3 w-3 ml-1" />
                                  تنشيط
                                </>
                              )}
                            </Button>

                            {/* Remove Button */}
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => handleRemoveMember(member)}
                              disabled={isPending}
                              className="h-8 px-2 rounded-lg text-[11px] font-bold text-rose-600 border-rose-200 hover:bg-rose-50"
                            >
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </div>
                        )}
                      </td>
                    ) : null}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pending Invitations Section */}
      {pendingInvitations.length > 0 ? (
        <div className="space-y-3 pt-2">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-extrabold text-amber-700 uppercase tracking-wider flex items-center gap-1.5">
              <Clock className="h-3.5 w-3.5" />
              الدعوات المعلقة بانتظار الانضمام ({pendingInvitations.length})
            </h4>
          </div>

          <div className="overflow-x-auto rounded-2xl border border-amber-200/60 bg-amber-50/20">
            <table className="w-full text-right text-xs">
              <thead>
                <tr className="border-b border-amber-100 text-slate-500 font-extrabold">
                  <th className="py-2.5 pr-4">الموظف المدعو</th>
                  <th className="py-2.5">الدور المحدد</th>
                  <th className="py-2.5">تاريخ الدعوة</th>
                  <th className="py-2.5">الانتهاء</th>
                  {canManageTeam ? <th className="py-2.5 pl-4 text-center">إلغاء</th> : null}
                </tr>
              </thead>
              <tbody className="divide-y divide-amber-100/60">
                {pendingInvitations.map((inv) => {
                  const roleConfig = ROLE_DISPLAY[inv.role] || ROLE_DISPLAY.TECHNICIAN;
                  return (
                    <tr key={inv.id}>
                      <td className="py-3 pr-4">
                        <div className="font-bold text-slate-900">{inv.name || "عضو جديد"}</div>
                        <div className="text-[11px] text-slate-500 font-medium" dir="ltr">{inv.email}</div>
                      </td>
                      <td className="py-3">
                        <span
                          className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[10px] font-bold border ${roleConfig.bgClass} ${roleConfig.colorClass} ${roleConfig.borderClass}`}
                        >
                          {roleConfig.label}
                        </span>
                      </td>
                      <td className="py-3 font-numeric text-slate-500 text-[11px]">
                        {formatDate(inv.createdAt)}
                      </td>
                      <td className="py-3 text-[11px] text-amber-700 font-bold font-numeric">
                        خلال 7 أيام
                      </td>
                      {canManageTeam ? (
                        <td className="py-3 pl-4 text-center">
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => handleRevokeInvite(inv)}
                            disabled={isPending}
                            className="h-7 px-2 rounded-lg text-rose-600 hover:bg-rose-100 text-[11px] font-bold"
                          >
                            <X className="h-3.5 w-3.5 ml-1" />
                            إلغاء
                          </Button>
                        </td>
                      ) : null}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {/* ========================================================================= */}
      {/* 1. Modal: Invite Team Member */}
      {/* ========================================================================= */}
      {isInviteModalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-xs p-4">
          <div className="w-full max-w-md bg-white rounded-3xl p-6 shadow-2xl border border-slate-100 space-y-5 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-teal-50 text-teal-800">
                  <UserPlus className="h-4 w-4" />
                </div>
                <h3 className="font-bold text-slate-900 text-sm">دعوة موظف جديد للمتجر</h3>
              </div>
              <button
                type="button"
                onClick={() => setIsInviteModalOpen(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* If Link Generated Successfully */}
            {generatedInviteUrl ? (
              <div className="space-y-4">
                <div className="rounded-2xl border border-teal-200 bg-teal-50/70 p-4 text-center space-y-2">
                  <div className="flex h-10 w-10 mx-auto items-center justify-center rounded-full bg-teal-500 text-white shadow-sm">
                    <Check className="h-5 w-5" />
                  </div>
                  <h4 className="font-bold text-teal-950 text-sm">تم إنشاء رابط الدعوة بنجاح!</h4>
                  <p className="text-xs text-teal-800 font-medium">
                    تم تجهيز الدعوة للبريد <span className="font-bold text-teal-950" dir="ltr">{generatedInviteEmail}</span>. انسخ الرابط وأرسله للموظف للانضمام.
                  </p>
                </div>

                <div className="space-y-1.5">
                  <label className="block text-[11px] font-bold text-slate-600">رابط الدعوة المباشر:</label>
                  <div className="flex items-center gap-2" dir="ltr">
                    <input
                      type="text"
                      readOnly
                      value={generatedInviteUrl}
                      className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold text-slate-700 select-all"
                    />
                    <Button
                      type="button"
                      onClick={handleCopyLink}
                      className={`h-9 px-3 rounded-xl font-bold text-xs shrink-0 ${
                        isCopied ? "bg-teal-600 text-white" : "bg-slate-900 text-white hover:bg-slate-800"
                      }`}
                    >
                      {isCopied ? <Check className="h-3.5 w-3.5 mr-1" /> : <Copy className="h-3.5 w-3.5 mr-1" />}
                      {isCopied ? "تم النسخ" : "نسخ الرابط"}
                    </Button>
                  </div>
                </div>

                {/* WhatsApp Share Option */}
                <div className="pt-2">
                  <a
                    href={`https://wa.me/?text=${encodeURIComponent(
                      `مرحباً، تفضل رابط الانضمام لفريق العمل في نظام الصيانة:\n${generatedInviteUrl}`
                    )}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-full flex items-center justify-center gap-2 h-10 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-xs"
                  >
                    <Share2 className="h-4 w-4" />
                    مشاركة الرابط عبر واتساب
                  </a>
                </div>

                <div className="flex justify-end pt-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setIsInviteModalOpen(false)}
                    className="w-full h-10 rounded-xl font-bold text-xs"
                  >
                    إغلاق
                  </Button>
                </div>
              </div>
            ) : (
              /* Invitation Input Form */
              <form onSubmit={handleInviteSubmit} className="space-y-4">
                {formError ? (
                  <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs font-bold text-rose-700 flex items-center gap-2">
                    <AlertCircle className="h-4 w-4 shrink-0" />
                    <span>{formError}</span>
                  </div>
                ) : null}

                <div>
                  <label className="block text-xs font-extrabold text-slate-700 mb-1.5">
                    اسم الموظف الكامل
                  </label>
                  <input
                    type="text"
                    name="name"
                    required
                    minLength={2}
                    disabled={isPending}
                    placeholder="مثال: أحمد عبد الله"
                    className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-xs font-bold text-slate-900 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary shadow-xs"
                  />
                </div>

                <div>
                  <label className="block text-xs font-extrabold text-slate-700 mb-1.5">
                    البريد الإلكتروني للموظف
                  </label>
                  <input
                    type="email"
                    name="email"
                    required
                    disabled={isPending}
                    placeholder="employee@example.com"
                    dir="ltr"
                    className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-xs font-bold text-slate-900 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary shadow-xs"
                  />
                </div>

                <div>
                  <label className="block text-xs font-extrabold text-slate-700 mb-1.5">
                    الدور والصلاحيات
                  </label>
                  <select
                    name="role"
                    defaultValue={MembershipRole.TECHNICIAN}
                    disabled={isPending}
                    className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-xs font-bold text-slate-900 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary shadow-xs"
                  >
                    <option value={MembershipRole.RECEPTIONIST}>موظف استقبال (RECEPTIONIST) — العملاء والمركبات وأوامر الصيانة وعروض الأسعار</option>
                    <option value={MembershipRole.TECHNICIAN}>فني صيانة (TECHNICIAN) — تنفيذ وتحديث أوامر الصيانة واستخدام القطع</option>
                    <option value={MembershipRole.WAREHOUSE}>أمين مستودع (WAREHOUSE) — المخزون والمستودعات والجرد</option>
                    <option value={MembershipRole.FINANCE}>محاسب / مالية (FINANCE) — الفواتير والذمم والمصروفات والإقفال</option>
                    <option value={MembershipRole.ADMIN}>مدير فرع (ADMIN) — إدارة كاملة للعمليات والمخزون والفريق</option>
                    <option value={MembershipRole.VIEWER}>مشاهد تقارير (VIEWER) — قراءة فقط دون تعديل أو حذف</option>
                  </select>
                </div>

                <div className="rounded-xl bg-slate-50 p-3 border border-slate-100 text-[11px] text-slate-500 font-medium leading-relaxed">
                  💡 <strong>ملاحظة:</strong> سيتم توليد رابط دعوة فوري يمكنك نسخه وإرساله للموظف عبر الواتساب أو البريد ليقوم بإنشاء حسابه وتعيين كلمة المرور الخاصة به.
                </div>

                <div className="flex justify-end gap-2 pt-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setIsInviteModalOpen(false)}
                    disabled={isPending}
                    className="h-10 px-4 rounded-xl text-xs font-bold"
                  >
                    إلغاء
                  </Button>
                  <Button
                    type="submit"
                    disabled={isPending}
                    className="h-10 px-5 rounded-xl bg-teal-800 hover:bg-teal-900 text-white text-xs font-bold shadow-md shadow-teal-800/15"
                  >
                    {isPending ? (
                      <>
                        <Loader2 className="h-3.5 w-3.5 ml-1.5 animate-spin" />
                        جاري الإنشاء...
                      </>
                    ) : (
                      "توليد رابط الدعوة"
                    )}
                  </Button>
                </div>
              </form>
            )}
          </div>
        </div>
      ) : null}

      {/* ========================================================================= */}
      {/* 2. Modal: Edit Member Role */}
      {/* ========================================================================= */}
      {editingMember ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-xs p-4">
          <div className="w-full max-w-sm bg-white rounded-3xl p-6 shadow-2xl border border-slate-100 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="font-bold text-slate-900 text-sm">تعديل دور الموظف</h3>
              <button type="button" onClick={() => setEditingMember(null)} className="text-slate-400 hover:text-slate-600">
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleUpdateRole} className="space-y-4">
              <div>
                <span className="text-[11px] font-bold text-slate-500 block mb-1">الموظف:</span>
                <span className="text-xs font-extrabold text-slate-900">{editingMember.user.name}</span>
                <span className="text-[10px] text-slate-400 block" dir="ltr">{editingMember.user.email}</span>
              </div>

              <div>
                <label className="block text-xs font-extrabold text-slate-700 mb-1.5">اختر الدور الجديد:</label>
                <select
                  name="role"
                  defaultValue={editingMember.role}
                  disabled={isPending}
                  className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-xs font-bold text-slate-900 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary shadow-xs"
                >
                  <option value={MembershipRole.ADMIN}>مدير فرع (ADMIN)</option>
                  <option value={MembershipRole.RECEPTIONIST}>موظف استقبال (RECEPTIONIST)</option>
                  <option value={MembershipRole.TECHNICIAN}>فني صيانة (TECHNICIAN)</option>
                  <option value={MembershipRole.WAREHOUSE}>أمين مستودع (WAREHOUSE)</option>
                  <option value={MembershipRole.FINANCE}>محاسب / مالية (FINANCE)</option>
                  <option value={MembershipRole.VIEWER}>مشاهد تقارير (VIEWER)</option>
                </select>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setEditingMember(null)}
                  disabled={isPending}
                  className="h-9 px-3.5 rounded-xl text-xs font-bold"
                >
                  إلغاء
                </Button>
                <Button
                  type="submit"
                  disabled={isPending}
                  className="h-9 px-4 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold"
                >
                  {isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "حفظ الدور"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </section>
  );
}
