"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Smartphone,
  Lock,
  Mail,
  User,
  Store,
  Phone,
  Coins,
  MapPin,
  ArrowLeft,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  XCircle,
} from "lucide-react";
import { registerAction } from "@/app/actions/authActions";
import { Button } from "@/components/ui/button";
import { CURRENCY_OPTIONS } from "@/lib/format";
import { COUNTRY_DIAL_CODES, PHONE_DIAL_CODES, validatePhoneForCountry, findCountryByDialCode } from "@/lib/countries";

export default function RegisterPage() {
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [selectedCountryCode, setSelectedCountryCode] = useState("SA");
  const [selectedPhoneCountryCode, setSelectedPhoneCountryCode] = useState("SA");
  const [selectedCurrency, setSelectedCurrency] = useState("SAR");
  const [phoneValue, setPhoneValue] = useState("");

  function handleCountryChange(e: React.ChangeEvent<HTMLSelectElement>) {
    setSelectedCountryCode(e.target.value);
  }

  const phoneCountry = findCountryByDialCode(selectedPhoneCountryCode);
  const phoneValidation = validatePhoneForCountry(selectedPhoneCountryCode, phoneValue);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    if (!phoneValue.trim()) {
      setError(`يرجى إدخال رقم هاتف المتجر لدولة ${phoneCountry.name} (${phoneCountry.description})`);
      return;
    }

    if (!phoneValidation.isValid) {
      setError(phoneValidation.error || "رقم الهاتف غير صحيح لكود الدولة المحدد");
      return;
    }

    setLoading(true);

    const formData = new FormData(e.currentTarget);
    const result = await registerAction(formData);

    if (result && !result.success) {
      setError(result.error);
      setLoading(false);
    }
  }

  const currencies = CURRENCY_OPTIONS;

  return (
    <div className="relative min-h-screen w-full max-w-full bg-slate-950 text-slate-100 py-12 px-4 sm:px-6 lg:px-8 overflow-x-hidden selection:bg-teal-500 selection:text-white">
      <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden="true">
        <div className="absolute top-10 -right-20 w-96 h-96 bg-teal-500/10 rounded-full blur-3xl" />
        <div className="absolute bottom-10 -left-20 w-96 h-96 bg-cyan-500/10 rounded-full blur-3xl" />
      </div>

      <div className="max-w-2xl mx-auto relative z-10">
        <div className="text-center mb-8">
          <Link href="/" className="inline-flex items-center gap-3 group">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-teal-400 to-primary text-slate-950 shadow-lg shadow-teal-500/20 group-hover:scale-105 transition-transform duration-300">
              <Smartphone className="h-6 w-6" />
            </div>
            <div className="text-right">
              <span className="text-xl font-black tracking-tight text-white block">مسار</span>
              <span className="text-[10px] font-bold text-teal-400 tracking-wider">منظومة إدارة مراكز الصيانة</span>
            </div>
          </Link>

          <h2 className="mt-6 text-2xl sm:text-3xl font-black tracking-tight text-white">
            ابدأ إدارة مركز الصيانة الخاص بك الآن
          </h2>
          <p className="mt-2 text-xs sm:text-sm text-slate-400">
            سجّل بياناتك وبيانات متجرك وابدأ في استقبال الأجهزة وإصدار الفواتير فوراً
          </p>
        </div>

        <div className="bg-slate-900/80 backdrop-blur-xl border border-slate-800/80 p-6 sm:p-10 shadow-2xl rounded-3xl">
          {error && (
            <div className="mb-6 rounded-2xl bg-rose-500/10 border border-rose-500/20 p-4 text-xs font-bold text-rose-400 flex items-start gap-2.5">
              <XCircle className="h-4 w-4 shrink-0 mt-0.5" />
              <div className="flex-1 leading-relaxed">{error}</div>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-4">
              <div className="flex items-center gap-2 pb-2 border-b border-slate-800">
                <User className="h-4 w-4 text-teal-400" />
                <h3 className="text-xs font-black text-white uppercase tracking-wider">بيانات الحساب الشخصي (المالك)</h3>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-extrabold text-slate-300 mb-1.5">
                    الاسم الكامل <span className="text-rose-400">*</span>
                  </label>
                  <div className="relative">
                    <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3 text-slate-500">
                      <User className="h-4 w-4" />
                    </div>
                    <input
                      type="text"
                      name="name"
                      required
                      minLength={2}
                      placeholder="مثال: أحمد محمد"
                      className="w-full rounded-xl border border-slate-800 bg-slate-950/60 py-2.5 pr-9 pl-3 text-sm text-white placeholder-slate-600 focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500 transition"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-extrabold text-slate-300 mb-1.5">
                    البريد الإلكتروني <span className="text-rose-400">*</span>
                  </label>
                  <div className="relative">
                    <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3 text-slate-500">
                      <Mail className="h-4 w-4" />
                    </div>
                    <input
                      type="email"
                      name="email"
                      required
                      placeholder="name@example.com"
                      dir="ltr"
                      className="w-full rounded-xl border border-slate-800 bg-slate-950/60 py-2.5 pr-9 pl-3 text-sm text-white placeholder-slate-600 focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500 transition"
                    />
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-xs font-extrabold text-slate-300 mb-1.5">
                  كلمة المرور <span className="text-rose-400">*</span>
                </label>
                <div className="relative">
                  <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3 text-slate-500">
                    <Lock className="h-4 w-4" />
                  </div>
                  <input
                    type="password"
                    name="password"
                    required
                    minLength={8}
                    placeholder="لا تقل عن 8 خانات"
                    className="w-full rounded-xl border border-slate-800 bg-slate-950/60 py-2.5 pr-9 pl-3 text-sm text-white placeholder-slate-600 focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500 transition"
                  />
                </div>
              </div>
            </div>

            <div className="space-y-4 pt-2">
              <div className="flex items-center gap-2 pb-2 border-b border-slate-800">
                <Store className="h-4 w-4 text-teal-400" />
                <h3 className="text-xs font-black text-white uppercase tracking-wider">بيانات متجر / مركز الصيانة</h3>
              </div>

              <div>
                <label className="block text-xs font-extrabold text-slate-300 mb-1.5">
                  بلد المتجر <span className="text-rose-400">*</span>
                </label>
                <div className="relative">
                  <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3 text-slate-500">
                    <MapPin className="h-4 w-4" />
                  </div>
                  <select
                    name="countryCode"
                    required
                    value={selectedCountryCode}
                    onChange={handleCountryChange}
                    className="w-full rounded-xl border border-slate-800 bg-slate-950/60 py-2.5 pr-9 pl-3 text-sm text-white focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500 transition"
                  >
                    {COUNTRY_DIAL_CODES.map((country) => (
                      <option key={country.code} value={country.code} className="bg-slate-900 text-white">
                        {country.flag} {country.name}
                      </option>
                    ))}
                  </select>
                </div>
                <p className="mt-1.5 text-[10px] font-medium text-slate-500">
                  بلد المتجر مستقل عن العملة وكود هاتف الواتساب.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-extrabold text-slate-300 mb-1.5">
                    اسم المحل أو الورشة <span className="text-rose-400">*</span>
                  </label>
                  <div className="relative">
                    <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3 text-slate-500">
                      <Store className="h-4 w-4" />
                    </div>
                    <input
                      type="text"
                      name="shopName"
                      required
                      minLength={2}
                      placeholder="مثال: مركز النخبة لصيانة الهواتف"
                      className="w-full rounded-xl border border-slate-800 bg-slate-950/60 py-2.5 pr-9 pl-3 text-sm text-white placeholder-slate-600 focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500 transition"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-extrabold text-slate-300 mb-1.5">
                    العملة الرسمية للنظام <span className="text-rose-400">*</span>
                  </label>
                  <div className="relative">
                    <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3 text-slate-500">
                      <Coins className="h-4 w-4" />
                    </div>
                    <select
                      name="currency"
                      required
                      value={selectedCurrency}
                      onChange={(event) => setSelectedCurrency(event.target.value)}
                      className="w-full rounded-xl border border-slate-800 bg-slate-950/60 py-2.5 pr-9 pl-3 text-sm text-white focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500 transition"
                    >
                      {currencies.map((curr) => (
                        <option key={curr.code} value={curr.code} className="bg-slate-900 text-white">
                          {curr.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="block text-xs font-extrabold text-slate-300">
                      رقم هاتف المتجر / الواتساب <span className="text-rose-400">*</span>
                    </label>
                    <span className="text-[10px] text-teal-400 font-bold">
                      ({phoneCountry.description})
                    </span>
                  </div>
                  <div className="flex items-center gap-2" dir="ltr">
                    <select
                      name="phoneCountryCode"
                      required
                      value={selectedPhoneCountryCode}
                      onChange={(event) => {
                        setSelectedPhoneCountryCode(event.target.value);
                        setPhoneValue("");
                      }}
                      aria-label="كود دولة الهاتف"
                      className="h-[42px] w-[125px] shrink-0 rounded-xl border border-slate-800 bg-slate-950/80 px-2 text-xs font-bold text-teal-400 focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500"
                    >
                      {PHONE_DIAL_CODES.map((country) => (
                        <option key={`${country.code}-${country.dialCode}`} value={country.code} className="bg-slate-900 text-white">
                          {country.flag} {country.dialCode}
                        </option>
                      ))}
                    </select>

                    <div className="relative flex-1">
                      <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3 text-slate-500">
                        <Phone className="h-4 w-4" />
                      </div>
                      <input
                        type="tel"
                        name="phone"
                        required
                        value={phoneValue}
                        onChange={(e) => setPhoneValue(e.target.value)}
                        placeholder={`مثال: ${phoneCountry.placeholder}`}
                        className={`w-full rounded-xl border bg-slate-950/60 py-2.5 pr-9 pl-3 text-sm font-numeric text-white placeholder-slate-600 focus:outline-none focus:ring-1 transition ${
                          phoneValue.trim() && !phoneValidation.isValid
                            ? "border-rose-500/80 focus:border-rose-500 focus:ring-rose-500/20"
                            : phoneValue.trim() && phoneValidation.isValid
                            ? "border-emerald-500/80 focus:border-emerald-500 focus:ring-emerald-500/20"
                            : "border-slate-800 focus:border-teal-500 focus:ring-teal-500"
                        }`}
                      />
                    </div>
                  </div>

                  {phoneValue.trim() ? (
                    <div className="mt-1.5">
                      {phoneValidation.isValid ? (
                        <div className="flex items-center gap-1.5 text-[11px] font-bold text-emerald-400">
                          <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                          <span>رقم هاتف صحيح ({phoneValidation.formattedInternational})</span>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1.5 text-[11px] font-bold text-rose-400">
                          <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-rose-400" />
                          <span>
                            {phoneValidation.currentCount < phoneValidation.expectedCountMin
                              ? `ناقص ${phoneValidation.expectedCountMin - phoneValidation.currentCount} رقم (تم إدخال ${phoneValidation.currentCount} من ${phoneValidation.expectedCountMin})`
                              : phoneValidation.currentCount > phoneValidation.expectedCountMax
                              ? `زائد ${phoneValidation.currentCount - phoneValidation.expectedCountMax} رقم عن المطلوب`
                              : phoneValidation.error}
                          </span>
                        </div>
                      )}
                    </div>
                  ) : (
                    <p className="mt-1 text-[10px] text-slate-500 font-medium">
                      اختر كود دولة الهاتف ثم أدخل الرقم بدون الصفر المبدئي ({phoneCountry.description})
                    </p>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-extrabold text-slate-300 mb-1.5">
                    المدينة / العنوان
                  </label>
                  <div className="relative">
                    <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3 text-slate-500">
                      <MapPin className="h-4 w-4" />
                    </div>
                    <input
                      type="text"
                      name="address"
                      placeholder="مثال: الرياض - شارع التحلية"
                      className="w-full rounded-xl border border-slate-800 bg-slate-950/60 py-2.5 pr-9 pl-3 text-sm text-white placeholder-slate-600 focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500 transition"
                    />
                  </div>
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-slate-800 bg-slate-950/40 p-4 space-y-2">
              <div className="flex items-center gap-2 text-xs font-bold text-slate-300">
                <CheckCircle2 className="h-4 w-4 text-teal-400" />
                <span>عزل كامل لبيانات متجرك وسجلات عملائك وحساباتك</span>
              </div>
              <div className="flex items-center gap-2 text-xs font-bold text-slate-300">
                <CheckCircle2 className="h-4 w-4 text-teal-400" />
                <span>تجربة احترافية مجانية لمدة 10 أيام تبدأ فور إنشاء الحساب</span>
              </div>
            </div>

            <div className="pt-2">
              <Button
                type="submit"
                disabled={loading}
                className="w-full h-12 rounded-xl bg-gradient-to-r from-teal-500 to-primary text-slate-950 font-black text-sm shadow-lg shadow-teal-500/20 hover:from-teal-400 hover:to-teal-600 transition duration-200 border-0 cursor-pointer"
              >
                {loading ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  <span className="flex items-center justify-center gap-2">
                    إنشاء الحساب وبدء التجربة المجانية
                    <ArrowLeft className="h-4 w-4" />
                  </span>
                )}
              </Button>
            </div>
          </form>

          <div className="mt-8 border-t border-slate-800/80 pt-6 text-center">
            <p className="text-xs text-slate-400">
              لديك حساب بالفعل؟{" "}
              <Link href="/login" className="font-bold text-teal-400 hover:text-teal-300 transition">
                تسجيل الدخول هنا
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}