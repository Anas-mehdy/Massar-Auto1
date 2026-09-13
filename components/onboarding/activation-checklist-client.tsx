"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  Boxes,
  Check,
  CheckCircle2,
  ChevronLeft,
  CircleDashed,
  HandCoins,
  ShoppingCart,
  Sparkles,
  WalletCards,
  Wrench,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { ANALYTICS_EVENTS } from "@/lib/analytics/events";
import { captureClientEvent } from "@/lib/analytics/client";
import {
  ACTIVATION_ACTIVE_DAY_GOAL,
  ACTIVATION_OPERATION_GOAL,
} from "@/lib/onboarding/activation-checklist";
import { onboardingDestination } from "@/lib/onboarding/navigation";
import type { OnboardingJob } from "@/lib/onboarding/jobs";

const JOB_META: Record<OnboardingJob, { label: string; icon: LucideIcon; normalHref: string }> = {
  REPAIRS: { label: "الصيانة", icon: Wrench, normalHref: "/service-orders/new" },
  SALES: { label: "المبيعات", icon: ShoppingCart, normalHref: "/point-of-sale?tab=sale" },
  INVENTORY: { label: "المخزون", icon: Boxes, normalHref: "/inventory/new" },
  WALLETS: { label: "المحافظ والتحويلات", icon: WalletCards, normalHref: "/transfers" },
  DEBTS: { label: "الديون والتحصيلات", icon: HandCoins, normalHref: "/debts" },
  ELECTRONIC_SERVICES: { label: "الخدمات الإلكترونية", icon: Zap, normalHref: "/electronic-services/new" },
};

type ClientState = {
  flowVersion: number;
  firstWeekWindowOpen: boolean;
  selectedJobs: OnboardingJob[];
  primaryJob: OnboardingJob;
  jobs: Array<{
    job: OnboardingJob;
    activityCount: number;
    activated: boolean;
    primary: boolean;
    dataAvailable: boolean;
  }>;
  operationCount: number;
  activeDayCount: number;
  operationProgress: number;
  activeDayProgress: number;
  overallProgress: number;
  activatedSelectedJobCount: number;
  habitAchieved: boolean;
  nextJob: OnboardingJob;
  nextJobAlreadyActivated: boolean;
};

export function ActivationChecklistClient({
  storageScope,
  state,
}: {
  storageScope: string;
  state: ClientState;
}) {
  const [showCompleted, setShowCompleted] = useState(!state.habitAchieved);
  const storagePrefix = `masar:activation:v${state.flowVersion}:${storageScope}`;

  useEffect(() => {
    try {
      const viewKey = `${storagePrefix}:checklist-viewed`;
      if (!window.localStorage.getItem(viewKey)) {
        captureClientEvent(ANALYTICS_EVENTS.ACTIVATION_CHECKLIST_VIEWED, {
          flow_version: state.flowVersion,
          primary_job: state.primaryJob,
          selected_jobs_count: state.selectedJobs.length,
          activated_selected_jobs: state.activatedSelectedJobCount,
          operations_progress: Math.min(state.operationCount, ACTIVATION_OPERATION_GOAL),
          active_days_progress: Math.min(state.activeDayCount, ACTIVATION_ACTIVE_DAY_GOAL),
          first_week_window_open: state.firstWeekWindowOpen,
        });
        window.localStorage.setItem(viewKey, "1");
      }

      if (state.habitAchieved) {
        const achievedKey = `${storagePrefix}:habit-achieved`;
        if (window.localStorage.getItem(achievedKey)) {
          setShowCompleted(false);
          return;
        }
        captureClientEvent(ANALYTICS_EVENTS.ACTIVATION_HABIT_ACHIEVED, {
          flow_version: state.flowVersion,
          primary_job: state.primaryJob,
          selected_jobs_count: state.selectedJobs.length,
          activated_selected_jobs: state.activatedSelectedJobCount,
          first_week_window_open: state.firstWeekWindowOpen,
        });
        window.localStorage.setItem(achievedKey, "1");
        setShowCompleted(true);
      }
    } catch {
      if (state.habitAchieved) setShowCompleted(true);
    }
  }, [state, storagePrefix]);

  const next = useMemo(() => {
    const meta = JOB_META[state.nextJob];
    return {
      ...meta,
      href: state.nextJobAlreadyActivated ? meta.normalHref : onboardingDestination(state.nextJob),
    };
  }, [state.nextJob, state.nextJobAlreadyActivated]);

  if (state.habitAchieved) {
    if (!showCompleted) return null;
    return (
      <section className="overflow-hidden rounded-[24px] border border-emerald-200 bg-gradient-to-l from-emerald-50 via-white to-teal-50/70 px-5 py-4 shadow-sm dark:border-emerald-900/70 dark:from-emerald-950/25 dark:via-slate-950 dark:to-teal-950/20">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-600 text-white"><CheckCircle2 className="h-5 w-5" /></span>
          <div>
            <p className="text-[10px] font-black text-emerald-700 dark:text-emerald-300">بداية قوية على مسار</p>
            <h2 className="mt-1 text-[16px] font-black text-slate-950 dark:text-slate-50">ثبتت عادة الاستخدام الأساسية ✅</h2>
            <p className="mt-1 text-[11px] font-semibold leading-5 text-slate-500 dark:text-slate-400">سجلت 3 عمليات حقيقية على الأقل خلال يومي عمل مختلفين. من هون خليه جزء من شغلك اليومي، مو تجربة لمرة واحدة.</p>
          </div>
        </div>
      </section>
    );
  }

  const needsSecondDay = state.operationCount >= ACTIVATION_OPERATION_GOAL && state.activeDayCount < ACTIVATION_ACTIVE_DAY_GOAL;

  function trackNextAction() {
    captureClientEvent(ANALYTICS_EVENTS.ACTIVATION_CHECKLIST_ACTION_CLICKED, {
      flow_version: state.flowVersion,
      target_job: state.nextJob,
      target_state: state.nextJobAlreadyActivated ? "repeat" : "first_value",
      operations_progress: state.operationProgress,
      active_days_progress: state.activeDayProgress,
    });
  }

  return (
    <section className="overflow-hidden rounded-[24px] border border-teal-100/90 bg-white shadow-[0_18px_55px_-42px_rgba(13,148,136,0.45)] dark:border-slate-800 dark:bg-slate-950" aria-label="خطوات تثبيت استخدام مسار">
      <div className="border-b border-slate-100 bg-gradient-to-l from-teal-50/80 via-white to-cyan-50/60 px-5 py-4 dark:border-slate-800 dark:from-teal-950/25 dark:via-slate-950 dark:to-cyan-950/20">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="inline-flex items-center gap-1.5 text-[10px] font-black text-teal-700 dark:text-teal-300"><Sparkles className="h-3.5 w-3.5" /> هدف البداية</div>
            <h2 className="mt-1 text-[16px] font-black text-slate-950 dark:text-slate-50">خلّي مسار يدخل بروتين الشغل</h2>
            <p className="mt-1 text-[11px] font-semibold leading-5 text-slate-500 dark:text-slate-400">هدفنا مو تضغط أزرار للتجربة: سجّل <strong>3 عمليات حقيقية</strong> على <strong>يومي عمل مختلفين</strong>.</p>
          </div>
          <div className="min-w-24 text-left sm:text-center">
            <div className="font-numeric text-2xl font-black text-teal-700 dark:text-teal-300">{state.overallProgress}%</div>
            <div className="text-[9px] font-black text-slate-400">تقدم البداية</div>
          </div>
        </div>
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800"><div className="h-full rounded-full bg-gradient-to-l from-teal-600 to-cyan-500 transition-all" style={{ width: `${state.overallProgress}%` }} /></div>
      </div>

      <div className="grid gap-4 p-5 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div>
          <div className="grid gap-3 sm:grid-cols-2">
            <GoalCard label="عمليات حقيقية" value={`${state.operationProgress} / ${ACTIVATION_OPERATION_GOAL}`} done={state.operationCount >= ACTIVATION_OPERATION_GOAL} helper={state.operationCount >= ACTIVATION_OPERATION_GOAL ? "العدد المطلوب تحقق" : `باقي ${ACTIVATION_OPERATION_GOAL - state.operationProgress}`} />
            <GoalCard label="أيام استخدام مختلفة" value={`${state.activeDayProgress} / ${ACTIVATION_ACTIVE_DAY_GOAL}`} done={state.activeDayCount >= ACTIVATION_ACTIVE_DAY_GOAL} helper={state.activeDayCount >= ACTIVATION_ACTIVE_DAY_GOAL ? "استخدمته بأكثر من يوم" : "يوم شغل ثاني يثبت العادة"} />
          </div>

          {needsSecondDay ? (
            <div className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-[11px] font-bold leading-6 text-amber-800 dark:border-amber-900/70 dark:bg-amber-950/25 dark:text-amber-200">وصلت لعدد العمليات المطلوب. يلي ناقص فقط تستخدم مسار في <strong>يوم عمل مختلف</strong>. لا تسجل عملية وهمية — لما يصير عندك شغل حقيقي باليوم التالي، سجله هون.</div>
          ) : (
            <Link onClick={trackNextAction} href={next.href} className="mt-3 flex min-h-12 items-center justify-between gap-3 rounded-2xl border border-teal-200 bg-teal-50/70 px-4 py-3 text-teal-800 transition hover:bg-teal-100 dark:border-teal-900/70 dark:bg-teal-950/25 dark:text-teal-200 dark:hover:bg-teal-950/40">
              <span><span className="block text-[9px] font-black opacity-70">الخطوة المقترحة</span><strong className="mt-0.5 block text-[12px] font-black">{state.nextJobAlreadyActivated ? `سجّل العملية الحقيقية التالية في ${next.label}` : `جرّب أول عملية في ${next.label}`}</strong></span>
              <ChevronLeft className="h-4 w-4 shrink-0" />
            </Link>
          )}

          <p className="mt-3 text-[9px] font-bold text-slate-400">{state.firstWeekWindowOpen ? "هذا هو هدف الأسبوع الأول. العمليات تُحسب من بيانات مسار الحقيقية فقط." : "انتهى الأسبوع الأول، لكن تقدر تكمل تثبيت الاستخدام بدون أي عمليات تجريبية أو وهمية."}</p>
        </div>

        <aside className="rounded-2xl border border-slate-200 bg-slate-50/65 p-4 dark:border-slate-800 dark:bg-slate-900/60">
          <h3 className="text-[11px] font-black text-slate-800 dark:text-slate-200">الأقسام اللي اخترتها</h3>
          <div className="mt-3 space-y-2">
            {state.jobs.map((job) => {
              const meta = JOB_META[job.job];
              const Icon = meta.icon;
              return (
                <div key={job.job} className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2.5 dark:border-slate-800 dark:bg-slate-950">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-50 text-slate-600 dark:bg-slate-900 dark:text-slate-300"><Icon className="h-4 w-4" /></span>
                  <div className="min-w-0 flex-1"><div className="truncate text-[10px] font-black text-slate-800 dark:text-slate-200">{meta.label}{job.primary ? " · الأساسي" : ""}</div><div className="mt-0.5 text-[9px] font-bold text-slate-400">{!job.dataAvailable ? "التقدم غير متاح مؤقتاً" : job.activated ? "تمت أول عملية حقيقية" : "بانتظار أول عملية"}</div></div>
                  {job.activated ? <Check className="h-4 w-4 shrink-0 text-emerald-600" /> : <CircleDashed className="h-4 w-4 shrink-0 text-slate-300" />}
                </div>
              );
            })}
          </div>
        </aside>
      </div>
    </section>
  );
}

function GoalCard({ label, value, done, helper }: { label: string; value: string; done: boolean; helper: string }) {
  return <div className={`rounded-2xl border px-4 py-3 ${done ? "border-emerald-200 bg-emerald-50/70 dark:border-emerald-900/70 dark:bg-emerald-950/25" : "border-slate-200 bg-slate-50/70 dark:border-slate-800 dark:bg-slate-900/60"}`}><div className="flex items-center justify-between gap-2"><span className="text-[10px] font-black text-slate-600 dark:text-slate-300">{label}</span>{done ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> : <CircleDashed className="h-4 w-4 text-slate-400" />}</div><div className="mt-2 font-numeric text-xl font-black text-slate-950 dark:text-slate-50">{value}</div><div className="mt-0.5 text-[9px] font-bold text-slate-400">{helper}</div></div>;
}
