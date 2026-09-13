"use client";

import { Boxes, BookOpenText, Lightbulb, ShoppingCart, WalletCards, Wrench, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { captureClientEvent } from "@/lib/analytics/client";
import { ANALYTICS_EVENTS } from "@/lib/analytics/events";
import type { FeatureDiscoveryCandidate } from "@/lib/onboarding/feature-discovery";
import type { OnboardingJob } from "@/lib/onboarding/jobs";

const STORAGE_PREFIX = "masar_feature_discovery_v1:";
const ICONS = {
  REPAIRS: Wrench,
  SALES: ShoppingCart,
  INVENTORY: Boxes,
  WALLETS: WalletCards,
  DEBTS: BookOpenText,
} satisfies Record<OnboardingJob, typeof Wrench>;

function wasDismissed(id: string) {
  try {
    return localStorage.getItem(`${STORAGE_PREFIX}${id}`) === "1";
  } catch {
    return false;
  }
}

function rememberDismissed(id: string) {
  try {
    localStorage.setItem(`${STORAGE_PREFIX}${id}`, "1");
  } catch {
    // Browsers may block storage; dismissal still works for this render.
  }
}

export function ContextualFeatureDiscoveryClient({
  candidates,
}: {
  candidates: FeatureDiscoveryCandidate[];
}) {
  const [dismissedIds, setDismissedIds] = useState<Set<string> | null>(null);
  const viewed = useRef(new Set<string>());

  useEffect(() => {
    setDismissedIds(new Set(candidates.filter((candidate) => wasDismissed(candidate.id)).map((candidate) => candidate.id)));
  }, [candidates]);

  const active = useMemo(() => {
    if (!dismissedIds) return null;
    return candidates.find((candidate) => !dismissedIds.has(candidate.id)) ?? null;
  }, [candidates, dismissedIds]);

  useEffect(() => {
    if (!active || viewed.current.has(active.id)) return;
    viewed.current.add(active.id);
    captureClientEvent(ANALYTICS_EVENTS.FEATURE_DISCOVERY_VIEWED, {
      discovery_id: active.id,
      job: active.job,
      candidate_count: candidates.length,
    });
  }, [active, candidates.length]);

  if (!active) return null;
  const Icon = ICONS[active.job];

  return (
    <section className="relative overflow-hidden rounded-2xl border border-indigo-200/70 bg-gradient-to-l from-indigo-50/80 via-white to-violet-50/60 p-4 shadow-sm sm:p-5 dark:border-indigo-900/70 dark:from-indigo-950/60 dark:via-slate-950 dark:to-violet-950/40">
      <div className="flex items-start gap-3 pr-1">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-600 text-white shadow-md shadow-indigo-600/15">
          <Icon className="h-4.5 w-4.5" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2 text-[10px] font-black text-indigo-600 dark:text-indigo-300"><Lightbulb className="h-3.5 w-3.5" /> ميزة مناسبة لخطوتك الحالية</div>
          <h3 className="mt-1 text-sm font-black text-slate-900 dark:text-slate-50">{active.title}</h3>
          <p className="mt-1 max-w-3xl text-[11px] font-semibold leading-5 text-slate-500 dark:text-slate-300">{active.description}</p>
          <Link
            href={active.actionHref}
            onClick={() => captureClientEvent(ANALYTICS_EVENTS.FEATURE_DISCOVERY_CLICKED, {
              discovery_id: active.id,
              job: active.job,
            })}
            className="mt-3 inline-flex min-h-9 items-center rounded-xl border border-indigo-200 bg-white px-3.5 py-2 text-[11px] font-black text-indigo-700 shadow-sm transition hover:bg-indigo-50 dark:border-indigo-800 dark:bg-slate-900 dark:text-indigo-200 dark:hover:bg-indigo-950/60"
          >
            {active.actionLabel}
          </Link>
        </div>
        <button
          type="button"
          aria-label="إخفاء الاقتراح"
          onClick={() => {
            rememberDismissed(active.id);
            setDismissedIds((current) => new Set([...(current ?? []), active.id]));
            captureClientEvent(ANALYTICS_EVENTS.FEATURE_DISCOVERY_DISMISSED, {
              discovery_id: active.id,
              job: active.job,
            });
          }}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-400 transition hover:bg-white hover:text-slate-700 dark:text-slate-500 dark:hover:bg-slate-800 dark:hover:text-slate-200"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
    </section>
  );
}
