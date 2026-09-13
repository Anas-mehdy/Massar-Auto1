"use client";

import Image from "next/image";
import { useActionState, useMemo, useState, useTransition } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Boxes,
  Check,
  HandCoins,
  ShoppingCart,
  WalletCards,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import {
  completeOnboardingAction,
  skipOnboardingAction,
} from "@/app/actions/onboardingActions";
import {
  normalizeOnboardingJobs,
  type OnboardingJob,
} from "@/lib/onboarding/jobs";
import type { OnboardingValueCopyVariant } from "@/lib/experiments/catalog";
import { cn } from "@/lib/utils";

type JobCard = {
  job: OnboardingJob;
  title: string;
  description: string;
  icon: LucideIcon;
  iconClass: string;
  surfaceClass: string;
};

const JOBS: JobCard[] = [
  {
    job: "REPAIRS",
    title: "الصيانة",
    description: "استقبال المركبات، الفحص والتشخيص والصيانة حتى التسليم.",
    icon: Wrench,
    iconClass: "text-teal-700 dark:text-teal-300",
    surfaceClass: "bg-teal-50 border-teal-100 dark:bg-teal-950/35 dark:border-teal-900/70",
  },
  {
    job: "SALES",
    title: "المبيعات ونقطة البيع",
    description: "بيع قطع الغيار والخدمات المباشرة وتسجيل عمليات البيع اليومية.",
    icon: ShoppingCart,
    iconClass: "text-indigo-700 dark:text-indigo-300",
    surfaceClass: "bg-indigo-50 border-indigo-100 dark:bg-indigo-950/35 dark:border-indigo-900/70",
  },
  {
    job: "INVENTORY",
    title: "المخزون",
    description: "إدارة قطع الغيار والكميات والتكلفة والتنبيه عند النقص.",
    icon: Boxes,
    iconClass: "text-amber-700 dark:text-amber-300",
    surfaceClass: "bg-amber-50 border-amber-100 dark:bg-amber-950/35 dark:border-amber-900/70",
  },
  {
    job: "WALLETS",
    title: "المحافظ والتحويلات",
    description: "إدارة الأرصدة والإيداع والسحب والتحويلات المالية.",
    icon: WalletCards,
    iconClass: "text-emerald-700 dark:text-emerald-300",
    surfaceClass: "bg-emerald-50 border-emerald-100 dark:bg-emerald-950/35 dark:border-emerald-900/70",
  },
  {
    job: "DEBTS",
    title: "الديون والأقساط",
    description: "تسجيل مستحقات العملاء والتحصيل ومتابعة الأرصدة.",
    icon: HandCoins,
    iconClass: "text-rose-700 dark:text-rose-300",
    surfaceClass: "bg-rose-50 border-rose-100 dark:bg-rose-950/35 dark:border-rose-900/70",
  },
];

function JobOption({ card, selected, radio, onClick }: {
  card: JobCard;
  selected: boolean;
  radio?: boolean;
  onClick: () => void;
}) {
  const Icon = card.icon;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={cn(
        "group relative flex min-h-[128px] w-full items-start gap-3 rounded-2xl border bg-white p-4 text-right shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-teal-200 hover:shadow-md dark:bg-slate-900",
        selected
          ? "border-teal-500 ring-2 ring-teal-500/15 dark:border-teal-400"
          : "border-slate-200 dark:border-slate-800",
      )}
    >
      <span className={cn("flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border", card.surfaceClass)}>
        <Icon className={cn("h-5 w-5", card.iconClass)} />
      </span>
      <span className="min-w-0 flex-1">
        <strong className="block text-[14px] font-black text-slate-950 dark:text-slate-50">{card.title}</strong>
        <span className="mt-1.5 block text-[11px] font-semibold leading-5 text-slate-500 dark:text-slate-400">{card.description}</span>
      </span>
      <span
        className={cn(
          "mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center border transition",
          radio ? "rounded-full" : "rounded-lg",
          selected
            ? "border-teal-600 bg-teal-600 text-white"
            : "border-slate-200 bg-slate-50 text-transparent dark:border-slate-700 dark:bg-slate-800",
        )}
        aria-hidden
      >
        <Check className="h-3.5 w-3.5" />
      </span>
    </button>
  );
}

export function OnboardingWizard({
  userName,
  initialSelectedJobs,
  initialPrimaryJob,
  experimentVariant,
}: {
  userName: string;
  initialSelectedJobs: OnboardingJob[];
  initialPrimaryJob: OnboardingJob | null;
  experimentVariant: OnboardingValueCopyVariant;
}) {
  const normalizedInitial = normalizeOnboardingJobs(initialSelectedJobs);
  const [step, setStep] = useState<1 | 2>(initialPrimaryJob ? 2 : 1);
  const [selectedJobs, setSelectedJobs] = useState<OnboardingJob[]>(normalizedInitial);
  const [primaryJob, setPrimaryJob] = useState<OnboardingJob | null>(
    initialPrimaryJob && normalizedInitial.includes(initialPrimaryJob) ? initialPrimaryJob : null,
  );
  const [state, formAction, isSaving] = useActionState(completeOnboardingAction, { error: null });
  const [isSkipping, startSkipTransition] = useTransition();

  const valueFocusedCopy = experimentVariant === "VALUE_FOCUSED";

  const primaryOptions = useMemo(
    () => JOBS.filter((card) => selectedJobs.includes(card.job)),
    [selectedJobs],
  );

  function toggleJob(job: OnboardingJob) {
    setSelectedJobs((current) => {
      const next = current.includes(job)
        ? current.filter((candidate) => candidate !== job)
        : [...current, job];
      if (primaryJob && !next.includes(primaryJob)) setPrimaryJob(null);
      return normalizeOnboardingJobs(next);
    });
  }

  function goNext() {
    if (selectedJobs.length === 0) return;
    if (selectedJobs.length === 1) setPrimaryJob(selectedJobs[0]);
    setStep(2);
  }

  return (
    <main className="relative min-h-screen overflow-hidden bg-slate-50 px-4 py-7 sm:px-6 sm:py-10 dark:bg-slate-950">
      <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -right-24 -top-24 h-80 w-80 rounded-full bg-teal-200/35 blur-3xl dark:bg-teal-900/15" />
        <div className="absolute -bottom-28 -left-20 h-80 w-80 rounded-full bg-cyan-200/30 blur-3xl dark:bg-cyan-900/15" />
      </div>

      <div className="relative mx-auto w-full max-w-4xl">
        <div className="mb-5 flex items-center justify-center">
          <Image src="/masar-logo.png" alt="مسار" width={150} height={135} priority className="h-16 w-auto object-contain sm:h-20" />
        </div>

        <section className="overflow-hidden rounded-[28px] border border-slate-200/80 bg-white shadow-[0_28px_80px_-46px_rgba(15,23,42,0.45)] dark:border-slate-800 dark:bg-slate-900">
          <div className="border-b border-slate-100 bg-gradient-to-l from-teal-50/80 via-white to-cyan-50/70 px-5 py-5 sm:px-8 dark:border-slate-800 dark:from-teal-950/25 dark:via-slate-900 dark:to-cyan-950/20">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <p className="text-[11px] font-black text-teal-700 dark:text-teal-300">أهلاً {userName} 👋</p>
                <h1 className="mt-1 text-xl font-black tracking-tight text-slate-950 sm:text-2xl dark:text-slate-50">{valueFocusedCopy ? "وصل لأول قيمة من مسار بأقل خطوات" : "خلينا نجهّز مسار حسب شغلك"}</h1>
                <p className="mt-1.5 text-[12px] font-semibold leading-6 text-slate-500 dark:text-slate-400">{valueFocusedCopy ? "اختار طريقة شغلك، ومسار رح يفتح لك أقصر طريق لأول عملية حقيقية. كل الأقسام تبقى متاحة." : "اختياراتك فقط لتحديد نقطة البداية. جميع أقسام مسار ستبقى متاحة لك."}</p>
              </div>
              <div className="flex items-center gap-2" aria-label={`الخطوة ${step} من 2`}>
                {[1, 2].map((number) => (
                  <span key={number} className={cn("h-2.5 rounded-full transition-all", number === step ? "w-8 bg-teal-600" : number < step ? "w-4 bg-teal-300" : "w-4 bg-slate-200 dark:bg-slate-700")} />
                ))}
              </div>
            </div>
          </div>

          <div className="px-5 py-6 sm:px-8 sm:py-8">
            {step === 1 ? (
              <div>
                <div className="mb-5">
                  <span className="inline-flex items-center gap-2 rounded-full bg-teal-50 px-3 py-1 text-[10px] font-black text-teal-700 dark:bg-teal-950/50 dark:text-teal-300">1 من 2</span>
                  <h2 className="mt-3 text-[18px] font-black text-slate-950 dark:text-slate-50">{valueFocusedCopy ? "شو الأقسام اللي بتستخدمها فعلياً؟" : "ما طبيعة عمل مركزك؟"}</h2>
                  <p className="mt-1 text-[12px] font-semibold text-slate-500 dark:text-slate-400">{valueFocusedCopy ? "حدد شغلك الحقيقي اليومي حتى نختصر لك أول خطوة." : "اختر كل الأقسام التي تستخدمها في عملك. يمكنك اختيار أكثر من قسم."}</p>
                </div>

                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {JOBS.map((card) => (
                    <JobOption
                      key={card.job}
                      card={card}
                      selected={selectedJobs.includes(card.job)}
                      onClick={() => toggleJob(card.job)}
                    />
                  ))}
                </div>

                <div className="mt-7 flex justify-end">
                  <button
                    type="button"
                    onClick={goNext}
                    disabled={selectedJobs.length === 0}
                    className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-gradient-to-l from-teal-600 to-cyan-600 px-5 text-[12px] font-black text-white shadow-lg shadow-teal-600/15 transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:translate-y-0"
                  >
                    {valueFocusedCopy ? "حدد نقطة البداية" : "متابعة"}
                    <ArrowLeft className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ) : (
              <form action={formAction}>
                {selectedJobs.map((job) => <input key={job} type="hidden" name="selectedJobs" value={job} />)}
                <input type="hidden" name="primaryJob" value={primaryJob ?? ""} />

                <div className="mb-5">
                  <span className="inline-flex items-center gap-2 rounded-full bg-teal-50 px-3 py-1 text-[10px] font-black text-teal-700 dark:bg-teal-950/50 dark:text-teal-300">2 من 2</span>
                  <h2 className="mt-3 text-[18px] font-black text-slate-950 dark:text-slate-50">{valueFocusedCopy ? "شو أول نتيجة بدك توصلها؟" : "من أي قسم تريد أن تبدأ؟"}</h2>
                  <p className="mt-1 text-[12px] font-semibold text-slate-500 dark:text-slate-400">{valueFocusedCopy ? "بعد الحفظ رح نفتح لك مباشرة أقصر Quick Flow لأول عملية حقيقية." : "سننقلك مباشرة لأول خطوة عملية في هذا القسم بعد الإعداد."}</p>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  {primaryOptions.map((card) => (
                    <JobOption
                      key={card.job}
                      card={card}
                      selected={primaryJob === card.job}
                      radio
                      onClick={() => setPrimaryJob(card.job)}
                    />
                  ))}
                </div>

                {state.error ? (
                  <div role="alert" className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-[11px] font-bold leading-5 text-rose-700 dark:border-rose-900/70 dark:bg-rose-950/35 dark:text-rose-200">
                    {state.error}
                  </div>
                ) : null}

                <div className="mt-7 flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <button
                    type="button"
                    onClick={() => setStep(1)}
                    disabled={isSaving}
                    className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-[12px] font-black text-slate-600 transition hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
                  >
                    <ArrowRight className="h-4 w-4" />
                    رجوع
                  </button>
                  <button
                    type="submit"
                    disabled={!primaryJob || isSaving}
                    className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-gradient-to-l from-teal-600 to-cyan-600 px-5 text-[12px] font-black text-white shadow-lg shadow-teal-600/15 transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:translate-y-0"
                  >
                    {isSaving ? "جارٍ تجهيز مسار..." : valueFocusedCopy ? "ابدأ أول عملية" : "ابدأ بهذا القسم"}
                    {!isSaving ? <ArrowLeft className="h-4 w-4" /> : null}
                  </button>
                </div>
              </form>
            )}
          </div>
        </section>

        <div className="mt-4 text-center">
          <button
            type="button"
            disabled={isSkipping || isSaving}
            onClick={() => startSkipTransition(() => skipOnboardingAction())}
            className="text-[11px] font-bold text-slate-400 underline-offset-4 transition hover:text-slate-600 hover:underline disabled:opacity-50 dark:text-slate-500 dark:hover:text-slate-300"
          >
            {isSkipping ? "جارٍ التخطي..." : "تخطي الإعداد الآن"}
          </button>
        </div>
      </div>
    </main>
  );
}
