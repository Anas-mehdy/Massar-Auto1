"use client";

import { useState } from "react";
import { Loader2, Store, UserPlus } from "lucide-react";
import { COUNTRY_DIAL_CODES } from "@/lib/countries";
import { CURRENCY_OPTIONS } from "@/lib/format";
import { partnerClientRegisterAction } from "./actions";

export function PartnerClientRegisterForm({
  mode,
  keyValue,
  partnerName,
  presetName = "",
  presetEmail = "",
  lockEmail = false,
}: {
  mode: "invite" | "public";
  keyValue: string;
  partnerName: string;
  presetName?: string;
  presetEmail?: string;
  lockEmail?: boolean;
}) {
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [countryCode, setCountryCode] = useState("SA");
  const defaultCountry = COUNTRY_DIAL_CODES.find((c) => c.code === countryCode) ?? COUNTRY_DIAL_CODES[0];
  const [currency, setCurrency] = useState(defaultCountry.currency);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setLoading(true);
    const result = await partnerClientRegisterAction(new FormData(event.currentTarget));
    if (result && !result.success) {
      setError(result.error || "تعذر إنشاء الحساب.");
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-950 px-4 py-10 text-slate-100" dir="rtl">
      <div className="mx-auto max-w-2xl">
        <div className="mb-6 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-teal-500 text-slate-950"><UserPlus className="h-6 w-6" /></div>
          <h1 className="mt-4 text-2xl font-black">إنشاء حساب متجر عبر الوكيل</h1>
          <p className="mt-2 text-sm font-bold text-slate-400">أنت تسجل عبر <span className="text-teal-300">{partnerName}</span></p>
          <p className="mt-1 text-xs text-slate-500">ستحصل على تجربة مسار لمدة 10 أيام، وإدارة الاشتراك لاحقاً تكون عن طريق وكيلك.</p>
        </div>

        <form onSubmit={submit} className="space-y-5 rounded-3xl border border-slate-800 bg-slate-900 p-6 sm:p-8">
          <input type="hidden" name="mode" value={mode} />
          <input type="hidden" name="key" value={keyValue} />
          {error ? <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-xs font-bold text-rose-300">{error}</div> : null}

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="text-xs font-black text-slate-300">اسم المالك
              <input name="ownerName" required minLength={2} defaultValue={presetName} className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-3 text-sm" />
            </label>
            <label className="text-xs font-black text-slate-300">البريد الإلكتروني
              <input name="email" type="email" required defaultValue={presetEmail} readOnly={lockEmail} className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-3 text-sm read-only:text-slate-400" dir="ltr" />
            </label>
          </div>

          <label className="block text-xs font-black text-slate-300">كلمة المرور
            <input name="password" type="password" required minLength={8} className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-3 text-sm" />
            <span className="mt-1.5 block text-[10px] font-semibold text-slate-500">استخدم 8 أحرف على الأقل.</span>
          </label>

          <div className="border-t border-slate-800 pt-5">
            <div className="mb-4 flex items-center gap-2 text-sm font-black"><Store className="h-4 w-4 text-teal-400" /> بيانات المتجر</div>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="text-xs font-black text-slate-300">اسم المتجر
                <input name="shopName" required minLength={2} className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-3 text-sm" />
              </label>
              <label className="text-xs font-black text-slate-300">الدولة
                <select name="countryCode" value={countryCode} onChange={(e) => { const code=e.target.value; setCountryCode(code); const c=COUNTRY_DIAL_CODES.find(x=>x.code===code); if(c) setCurrency(c.currency); }} className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-3 text-sm">
                  {COUNTRY_DIAL_CODES.map((c) => <option key={c.code} value={c.code}>{c.flag} {c.name}</option>)}
                </select>
              </label>
              <label className="text-xs font-black text-slate-300">رقم هاتف المتجر
                <input name="phone" required placeholder={defaultCountry.placeholder} className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-3 text-sm" dir="ltr" />
              </label>
              <label className="text-xs font-black text-slate-300">عملة النظام
                <select name="currency" value={currency} onChange={(e)=>setCurrency(e.target.value)} className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-3 text-sm">
                  {CURRENCY_OPTIONS.map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}
                </select>
              </label>
            </div>
            <label className="mt-4 block text-xs font-black text-slate-300">العنوان (اختياري)
              <input name="address" className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-3 text-sm" />
            </label>
          </div>

          <button disabled={loading} className="flex w-full items-center justify-center gap-2 rounded-xl bg-teal-500 py-3 text-sm font-black text-slate-950 disabled:opacity-50">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null} إنشاء حساب المتجر
          </button>
        </form>
      </div>
    </div>
  );
}
