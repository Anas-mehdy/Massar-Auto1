import type { OnboardingJob } from "@/lib/onboarding/jobs";

export const GROWTH_DASHBOARD_RANGES = [7, 30, 90] as const;
export type GrowthDashboardRangeDays = (typeof GROWTH_DASHBOARD_RANGES)[number];

export type GrowthShopProgressInput = {
  shopId: string;
  signupAt: Date;
  onboardingCompletedAt: Date | null;
  primaryJob: OnboardingJob | null;
  timeZone: string;
  activityAt: Date[];
  paidAt: Date | null;
};

export type GrowthShopProgress = GrowthShopProgressInput & {
  firstValueAt: Date | null;
  habitAt: Date | null;
  operationCount: number;
  activeDayCount: number;
};

export type GrowthFunnel = {
  signups: number;
  onboardingCompleted: number;
  firstValue: number;
  habit: number;
  paid: number;
  paidAfterHabit: number;
  paidBeforeHabit: number;
};

export type GrowthTimingMetrics = {
  medianSignupToOnboardingHours: number | null;
  medianSignupToFirstValueHours: number | null;
  medianSignupToHabitHours: number | null;
  medianFirstValueToHabitHours: number | null;
};

export type GrowthJobBreakdownRow = GrowthFunnel & {
  job: OnboardingJob | "UNSELECTED";
  firstValueRate: number;
  habitRate: number;
  paidRate: number;
};

export type GrowthCohortBucket = GrowthFunnel & { key: string };

export type GrowthDropoff = {
  from: "SIGNUP" | "ONBOARDING" | "FIRST_VALUE";
  to: "ONBOARDING" | "FIRST_VALUE" | "HABIT";
  lost: number;
  conversionRate: number;
};

const HOUR_MS = 60 * 60 * 1000;

export function growthRate(numerator: number, denominator: number) {
  if (denominator <= 0) return 0;
  return Math.max(0, Math.min(100, (numerator / denominator) * 100));
}

function localDayKey(value: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(value);
  const map = new Map(parts.map((part) => [part.type, part.value]));
  return `${map.get("year")}-${map.get("month")}-${map.get("day")}`;
}

export function resolveHabitAt(activityAt: readonly Date[], timeZone: string) {
  const sorted = [...activityAt].sort((a, b) => a.getTime() - b.getTime());
  const days = new Set<string>();
  for (let index = 0; index < sorted.length; index += 1) {
    days.add(localDayKey(sorted[index], timeZone));
    if (index + 1 >= 3 && days.size >= 2) return sorted[index];
  }
  return null;
}

export function buildGrowthShopProgress(input: GrowthShopProgressInput): GrowthShopProgress {
  const completedAt = input.onboardingCompletedAt;
  const activityAt = completedAt
    ? input.activityAt
        .filter((value) => value.getTime() >= completedAt.getTime())
        .sort((a, b) => a.getTime() - b.getTime())
    : [];
  const activeDays = new Set(activityAt.map((value) => localDayKey(value, input.timeZone)));
  return {
    ...input,
    activityAt,
    firstValueAt: activityAt[0] ?? null,
    habitAt: resolveHabitAt(activityAt, input.timeZone),
    operationCount: activityAt.length,
    activeDayCount: activeDays.size,
  };
}

export function buildGrowthFunnel(progress: readonly GrowthShopProgress[]): GrowthFunnel {
  const signups = progress.length;
  const onboardingCompleted = progress.filter((shop) => Boolean(shop.onboardingCompletedAt)).length;
  const firstValue = progress.filter((shop) => Boolean(shop.firstValueAt)).length;
  const habit = progress.filter((shop) => Boolean(shop.habitAt)).length;
  const paid = progress.filter((shop) => Boolean(shop.paidAt)).length;
  const paidAfterHabit = progress.filter((shop) =>
    Boolean(shop.paidAt && shop.habitAt && shop.paidAt.getTime() >= shop.habitAt.getTime()),
  ).length;
  return {
    signups,
    onboardingCompleted,
    firstValue,
    habit,
    paid,
    paidAfterHabit,
    paidBeforeHabit: paid - paidAfterHabit,
  };
}

function durationHours(from: Date | null, to: Date | null) {
  if (!from || !to) return null;
  const hours = (to.getTime() - from.getTime()) / HOUR_MS;
  return Number.isFinite(hours) && hours >= 0 ? hours : null;
}

export function median(values: readonly number[]) {
  const finite = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (finite.length === 0) return null;
  const middle = Math.floor(finite.length / 2);
  return finite.length % 2 === 0 ? (finite[middle - 1] + finite[middle]) / 2 : finite[middle];
}

export function buildGrowthTimingMetrics(progress: readonly GrowthShopProgress[]): GrowthTimingMetrics {
  const collect = (from: (row: GrowthShopProgress) => Date | null, to: (row: GrowthShopProgress) => Date | null) =>
    progress.flatMap((row) => {
      const value = durationHours(from(row), to(row));
      return value == null ? [] : [value];
    });
  return {
    medianSignupToOnboardingHours: median(collect((row) => row.signupAt, (row) => row.onboardingCompletedAt)),
    medianSignupToFirstValueHours: median(collect((row) => row.signupAt, (row) => row.firstValueAt)),
    medianSignupToHabitHours: median(collect((row) => row.signupAt, (row) => row.habitAt)),
    medianFirstValueToHabitHours: median(collect((row) => row.firstValueAt, (row) => row.habitAt)),
  };
}

export function buildGrowthJobBreakdown(progress: readonly GrowthShopProgress[]): GrowthJobBreakdownRow[] {
  const jobs: Array<OnboardingJob | "UNSELECTED"> = [
    "REPAIRS",
    "SALES",
    "INVENTORY",
    "WALLETS",
    "DEBTS",
    "UNSELECTED",
  ];
  return jobs.flatMap((job) => {
    const rows = progress.filter((shop) => (shop.primaryJob ?? "UNSELECTED") === job);
    if (rows.length === 0) return [];
    const funnel = buildGrowthFunnel(rows);
    return [{
      job,
      ...funnel,
      firstValueRate: growthRate(funnel.firstValue, funnel.onboardingCompleted),
      habitRate: growthRate(funnel.habit, funnel.firstValue),
      paidRate: growthRate(funnel.paid, funnel.signups),
    }];
  });
}

function cohortKey(value: Date, rangeDays: GrowthDashboardRangeDays) {
  const iso = value.toISOString().slice(0, 10);
  if (rangeDays <= 7) return iso;
  const date = new Date(`${iso}T00:00:00.000Z`);
  const day = date.getUTCDay();
  date.setUTCDate(date.getUTCDate() + (day === 0 ? -6 : 1 - day));
  return `أسبوع ${date.toISOString().slice(0, 10)}`;
}

export function buildGrowthCohorts(
  progress: readonly GrowthShopProgress[],
  rangeDays: GrowthDashboardRangeDays,
): GrowthCohortBucket[] {
  const grouped = new Map<string, GrowthShopProgress[]>();
  for (const shop of progress) {
    const key = cohortKey(shop.signupAt, rangeDays);
    const rows = grouped.get(key) ?? [];
    rows.push(shop);
    grouped.set(key, rows);
  }
  return [...grouped.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, rows]) => ({ key, ...buildGrowthFunnel(rows) }));
}

export function biggestActivationDropoff(funnel: GrowthFunnel): GrowthDropoff | null {
  const candidates: GrowthDropoff[] = [
    { from: "SIGNUP", to: "ONBOARDING", lost: Math.max(0, funnel.signups - funnel.onboardingCompleted), conversionRate: growthRate(funnel.onboardingCompleted, funnel.signups) },
    { from: "ONBOARDING", to: "FIRST_VALUE", lost: Math.max(0, funnel.onboardingCompleted - funnel.firstValue), conversionRate: growthRate(funnel.firstValue, funnel.onboardingCompleted) },
    { from: "FIRST_VALUE", to: "HABIT", lost: Math.max(0, funnel.firstValue - funnel.habit), conversionRate: growthRate(funnel.habit, funnel.firstValue) },
  ];
  return candidates.sort((a, b) => b.lost - a.lost || a.conversionRate - b.conversionRate)[0] ?? null;
}
