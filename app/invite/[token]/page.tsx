import { Metadata } from "next";
import Link from "next/link";
import { UserCheck, AlertTriangle, ArrowRight } from "lucide-react";
import { teamService } from "@/lib/services/teamService";
import { prisma } from "@/lib/prisma";
import { Button } from "@/components/ui/button";
import { AcceptInvitationForm } from "./_accept-form";

export const metadata: Metadata = {
  title: "قبول دعوة الانضمام لفريق العمل",
};

const ROLE_LABELS: Record<string, string> = {
  ADMIN: "مدير فرع",
  RECEPTIONIST: "موظف استقبال",
  TECHNICIAN: "فني صيانة",
  WAREHOUSE: "مسؤول مستودع",
  FINANCE: "محاسب / مالية",
  VIEWER: "مشاهد",
};

export default async function InviteAcceptancePage(props: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await props.params;
  const check = await teamService.getInvitationByToken(token);

  if (!check.valid || !check.invitation) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col justify-center items-center px-4 py-12">
        <div className="w-full max-w-md text-center space-y-6 bg-slate-900/90 p-8 rounded-3xl border border-slate-800 shadow-2xl">
          <div className="flex h-14 w-14 mx-auto items-center justify-center rounded-2xl bg-rose-500/10 text-rose-400 border border-rose-500/20">
            <AlertTriangle className="h-7 w-7" />
          </div>
          <div>
            <h2 className="text-xl font-black text-white">رابط الدعوة غير متاح</h2>
            <p className="text-xs text-slate-400 leading-relaxed font-medium mt-2">
              {check.error || "رابط الدعوة غير صالح أو قد انتهت صلاحيته."}
            </p>
          </div>
          <Button asChild className="w-full bg-slate-800 hover:bg-slate-700 text-white font-bold rounded-xl h-11">
            <Link href="/login">
              <ArrowRight className="h-4 w-4 ml-1.5" />
              الذهاب لصفحة تسجيل الدخول
            </Link>
          </Button>
        </div>
      </div>
    );
  }

  const invitation = check.invitation;
  const roleLabel = ROLE_LABELS[invitation.role] || invitation.role;
  const existingAccount = Boolean(await prisma.user.findUnique({
    where: { email: invitation.email.toLowerCase() },
    select: { id: true },
  }));

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col justify-center items-center px-4 py-12 text-slate-100">
      <div className="w-full max-w-md space-y-6 bg-slate-900/95 p-8 rounded-3xl border border-slate-800 shadow-2xl">
        <div className="text-center space-y-3">
          <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-teal-500/10 text-teal-400 border border-teal-500/20 shadow-inner">
            <UserCheck className="h-6 w-6" />
          </div>
          <div>
            <span className="text-[10px] font-extrabold uppercase tracking-widest text-teal-400 bg-teal-950/80 px-3 py-1 rounded-full border border-teal-800/60">
              دعوة انضمام لفريق العمل
            </span>
            <h1 className="text-xl font-black text-white mt-2">
              انضم إلى متجر {invitation.shop.name}
            </h1>
            <p className="text-xs text-slate-400 font-medium mt-1">
              تمت دعوتك للانضمام بدور <span className="font-bold text-teal-300">&quot;{roleLabel}&quot;</span>
            </p>
          </div>
        </div>

        <AcceptInvitationForm
          token={token}
          email={invitation.email}
          defaultName={invitation.name || ""}
          existingAccount={existingAccount}
        />

        <div className="text-center pt-2 border-t border-slate-800/80">
          <p className="text-[11px] text-slate-500">
            لديك حساب بالفعل؟{" "}
            <Link href="/login" className="font-bold text-teal-400 hover:underline">
              تسجيل الدخول
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
