"use client";

import { Boxes, BookOpenText, ShoppingCart, WalletCards, Wrench } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { captureClientEvent } from "@/lib/analytics/client";
import { ANALYTICS_EVENTS } from "@/lib/analytics/events";
import type { OnboardingJob } from "@/lib/onboarding/jobs";

const ICONS = {
  REPAIRS: Wrench,
  SALES: ShoppingCart,
  INVENTORY: Boxes,
  WALLETS: WalletCards,
  DEBTS: BookOpenText,
} satisfies Record<OnboardingJob, typeof Wrench>;

export function SmartEmptyStateCard({
  job,
  title,
  description,
  actionHref,
  actionLabel,
}: {
  job: OnboardingJob;
  title: string;
  description: string;
  actionHref: string;
  actionLabel: string;
}) {
  const Icon = ICONS[job];
  const viewed = useRef(false);

  useEffect(() => {
    if (viewed.current) return;
    viewed.current = true;
    captureClientEvent(ANALYTICS_EVENTS.SMART_EMPTY_STATE_VIEWED, {
      job,
      flow_version: 1,
    });
  }, [job]);

  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-teal-200 bg-gradient-to-br from-teal-50/70 via-white to-cyan-50/50 p-8 text-center shadow-sm sm:p-12">
      <span className="rounded-full border border-teal-200 bg-white px-3 py-1 text-[10px] font-black text-teal-700">خطوتك التالية في مسار</span>
      <div className="mt-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-teal-600 to-cyan-600 text-white shadow-lg shadow-teal-600/15">
        <Icon className="h-6 w-6" aria-hidden="true" />
      </div>
      <h3 className="mt-4 text-base font-black text-slate-900">{title}</h3>
      <p className="mx-auto mt-2 max-w-lg text-xs font-semibold leading-6 text-slate-500">{description}</p>
      <Button asChild className="mt-5 rounded-xl px-5 font-black shadow-sm" size="sm">
        <Link
          href={actionHref}
          onClick={() => captureClientEvent(ANALYTICS_EVENTS.SMART_EMPTY_STATE_ACTION_CLICKED, {
            job,
            flow_version: 1,
          })}
        >
          {actionLabel}
        </Link>
      </Button>
      <p className="mt-3 text-[10px] font-semibold text-slate-400">استخدم بيانات حقيقية فقط؛ ما في داعي لأي عملية تجريبية داخل حسابات مركزك.</p>
    </div>
  );
}
