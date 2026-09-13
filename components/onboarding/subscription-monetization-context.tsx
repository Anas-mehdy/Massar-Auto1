"use client";

import Link from "next/link";
import { useEffect } from "react";
import { ArrowDown, ArrowLeft, CheckCircle2, Clock3, Sparkles } from "lucide-react";
import { ANALYTICS_EVENTS } from "@/lib/analytics/events";
import { captureClientEvent } from "@/lib/analytics/client";
import {
  monetizationAnalyticsProperties,
  type MonetizationState,
} from "@/lib/monetization/onboarding";
import type { OnboardingJob } from "@/lib/onboarding/jobs";

const JOB_LABELS: Record<OnboardingJob, string> = {
  REPAIRS: "الصيانة",
  SALES: "المبيعات",
  INVENTORY: "المخزون",
  WALLETS: "المحافظ والتحويلات",
  DEBTS: "الديون والتحصيلات",
};

function copy(state: MonetizationState) {
  const jobLabel = state.primaryJob ? JOB_LABELS[state.primaryJob] : "شغلك الأساسي";
  if (state.stage === "PRE_VALUE") return {
    title: "ما لازم تقرر الاشتراك من أول دقيقة",
    description: `قبل ما تدفع، جرّب مسار على عملية حقيقية في ${jobLabel}. إذا شفت القيمة بنفسك، ارجع وقارن الخطط براحتك.`,
    primaryLabel: "ارجع وجرّب أول عملية",
    primaryHref: state.activationHref,
    primaryDestination: "activation_flow",
    Icon: Sparkles,
  } as const;
  if (state.stage === "FIRST_VALUE") return {
    title: "وصلت لأول قيمة — ولسه التجربة مستمرة",
    description: "سجلت أول عملية حقيقية. الأفضل تكمل استخدامه بيوم عمل ثاني قبل القرار؛ والأسعار موجودة تحت وقت ما تحب تقارن.",
    primaryLabel: "شوف الخطط والأسعار",
    primaryHref: "#subscription-plans",
    primaryDestination: "plans_anchor",
    Icon: CheckCircle2,
  } as const;
  if (state.stage === "HABIT") return {
    title: "هلق صار قرار الاشتراك مبني على استخدام فعلي",
    description: "وصلت لعدة عمليات وعلى أكثر من يوم. قارن الخيارات تحت واختار اللي يناسب مركزك إذا بدك تكمل بنفس السجلات والروتين.",
    primaryLabel: "قارن خيارات الاشتراك",
    primaryHref: "#subscription-plans",
    primaryDestination: "plans_anchor",
    Icon: CheckCircle2,
  } as const;
  if (state.stage === "TRIAL_ENDING") return {
    title: state.remainingTrialHours <= 24 ? "تجربتك بتنتهي خلال أقل من يوم" : `تجربتك بتنتهي خلال حوالي ${state.remainingTrialHours} ساعة`,
    description: "كل بياناتك محفوظة. إذا قررت تكمل، اختار الخطة قبل نهاية الفترة حتى ما تتوقف العمليات الجديدة.",
    primaryLabel: "اختار الخطة",
    primaryHref: "#subscription-plans",
    primaryDestination: "plans_anchor",
    Icon: Clock3,
  } as const;
  return {
    title: "انتهت التجربة، لكن بيانات مركزك محفوظة",
    description: "اختار الخطة المناسبة للعودة لتسجيل عمليات جديدة. ما في داعي تعيد إعداد المركز أو بياناتك من الصفر.",
    primaryLabel: "عرض خيارات الاشتراك",
    primaryHref: "#subscription-plans",
    primaryDestination: "plans_anchor",
    Icon: Clock3,
  } as const;
}

export function SubscriptionMonetizationContext({ state }: { state: MonetizationState | null }) {
  return state ? <SubscriptionMonetizationContextInner state={state} /> : null;
}

function SubscriptionMonetizationContextInner({ state }: { state: MonetizationState }) {
  const meta = copy(state);

  useEffect(() => {
    captureClientEvent(ANALYTICS_EVENTS.MONETIZATION_PROMPT_VIEWED, {
      ...monetizationAnalyticsProperties(state),
      placement: "subscription_context",
    });
  }, [state.activeDayCount, state.flowVersion, state.operationCount, state.primaryJob, state.remainingTrialHours, state.stage]);

  function trackPrimary() {
    captureClientEvent(ANALYTICS_EVENTS.MONETIZATION_PROMPT_CLICKED, {
      ...monetizationAnalyticsProperties(state),
      placement: "subscription_context",
      destination: meta.primaryDestination,
    });
  }

  function trackPlans() {
    captureClientEvent(ANALYTICS_EVENTS.MONETIZATION_PROMPT_CLICKED, {
      ...monetizationAnalyticsProperties(state),
      placement: "subscription_context",
      destination: "plans_anchor",
    });
  }

  return (
    <section className="mx-auto mb-6 max-w-6xl rounded-3xl border border-teal-200 bg-gradient-to-l from-teal-50 via-white to-cyan-50/60 p-5 shadow-sm dark:border-teal-900/70 dark:from-teal-950/25 dark:via-slate-950 dark:to-cyan-950/20 sm:p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-teal-600 text-white"><meta.Icon className="h-5 w-5" /></span>
          <div>
            <div className="text-[10px] font-black text-teal-700 dark:text-teal-300">قرار الاشتراك حسب استخدامك</div>
            <h2 className="mt-1 text-lg font-black text-slate-950 dark:text-slate-50">{meta.title}</h2>
            <p className="mt-1 max-w-2xl text-xs font-semibold leading-6 text-slate-500 dark:text-slate-400">{meta.description}</p>
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <Link onClick={trackPrimary} href={meta.primaryHref} className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-xl bg-teal-600 px-4 text-[11px] font-black text-white hover:bg-teal-700">
            {meta.primaryLabel}{meta.primaryHref.startsWith("#") ? <ArrowDown className="h-4 w-4" /> : <ArrowLeft className="h-4 w-4" />}
          </Link>
          {state.stage === "PRE_VALUE" ? (
            <Link onClick={trackPlans} href="#subscription-plans" className="inline-flex min-h-10 items-center justify-center rounded-xl border border-slate-200 bg-white px-4 text-[11px] font-black text-slate-600 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300">مع هيك، شوف الأسعار</Link>
          ) : null}
        </div>
      </div>
    </section>
  );
}
