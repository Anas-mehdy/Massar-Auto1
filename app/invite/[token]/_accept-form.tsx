"use client";

import { useState, useTransition } from "react";
import { ShieldCheck, Lock, User, Loader2, AlertCircle } from "lucide-react";
import { acceptInvitationAction } from "@/app/actions/teamActions";
import { Button } from "@/components/ui/button";

export function AcceptInvitationForm({
  token,
  email,
  defaultName = "",
  existingAccount = false,
}: {
  token: string;
  email: string;
  defaultName?: string;
  existingAccount?: boolean;
}) {
  const [isPending, startTransition] = useTransition();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (isPending) return;

    setErrorMessage(null);
    const form = e.currentTarget;
    const formData = new FormData(form);

    startTransition(async () => {
      const result = await acceptInvitationAction(token, formData);
      if (result && !result.success && result.error) {
        setErrorMessage(result.error);
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 pt-2">
      {errorMessage ? (
        <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-xs font-bold text-rose-400 flex items-center gap-2">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{errorMessage}</span>
        </div>
      ) : null}

      <div>
        <label className="block text-xs font-bold text-slate-400 mb-1.5">
          البريد الإلكتروني المدعو
        </label>
        <input
          type="email"
          disabled
          value={email}
          dir="ltr"
          className="w-full rounded-xl border border-slate-800 bg-slate-950/60 px-3.5 py-2.5 text-xs font-bold text-slate-400 cursor-not-allowed"
        />
      </div>

      {!existingAccount ? (
        <div>
          <label className="block text-xs font-bold text-slate-300 mb-1.5">
            الاسم الكامل
          </label>
          <div className="relative">
            <input
              type="text"
              name="name"
              required
              defaultValue={defaultName}
              disabled={isPending}
              placeholder="أدخل اسمك الكريم"
              className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3.5 py-2.5 text-xs font-bold text-white placeholder:text-slate-600 focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500"
            />
            <User className="absolute left-3 top-2.5 h-4 w-4 text-slate-500" />
          </div>
        </div>
      ) : (
        <input type="hidden" name="name" value={defaultName} />
      )}

      <div>
        <label className="block text-xs font-bold text-slate-300 mb-1.5">
          {existingAccount ? "كلمة مرور حسابك الحالية" : "إنشاء كلمة مرور"}
        </label>
        <div className="relative">
          <input
            type="password"
            name="password"
            required
            minLength={existingAccount ? 1 : 8}
            maxLength={128}
            autoComplete={existingAccount ? "current-password" : "new-password"}
            disabled={isPending}
            placeholder={existingAccount ? "أدخل كلمة مرور حسابك الحالية" : "8 أحرف على الأقل"}
            dir="ltr"
            className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3.5 py-2.5 text-xs font-bold text-white placeholder:text-slate-600 focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500 font-numeric"
          />
          <Lock className="absolute left-3 top-2.5 h-4 w-4 text-slate-500" />
        </div>
        <p className="mt-1.5 text-[10px] font-semibold leading-5 text-slate-500">
          {existingAccount
            ? "هذا البريد مرتبط بحساب مسار موجود. لن يتم تغيير كلمة مرورك؛ نتحقق منها فقط لإثبات ملكية الحساب قبل إضافة العضوية الجديدة."
            : "سيتم إنشاء حسابك بهذه الكلمة. استخدم 8 أحرف على الأقل."}
        </p>
      </div>

      <Button
        type="submit"
        disabled={isPending}
        className="w-full h-11 rounded-xl bg-teal-500 hover:bg-teal-400 text-slate-950 font-black text-xs shadow-lg shadow-teal-500/10 transition-all mt-2"
      >
        {isPending ? (
          <>
            <Loader2 className="h-4 w-4 ml-1.5 animate-spin" />
            جاري التحقق وتفعيل العضوية...
          </>
        ) : (
          <>
            <ShieldCheck className="h-4 w-4 ml-1.5" />
            قبول الدعوة والانضمام
          </>
        )}
      </Button>
    </form>
  );
}
