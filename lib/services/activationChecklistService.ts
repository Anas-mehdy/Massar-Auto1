import { prisma } from "@/lib/prisma";
import {
  ACTIVATION_CHECKLIST_MAX_AGE_DAYS,
  buildActivationChecklistState,
  type ActivationChecklistState,
  type ActivationJobActivity,
} from "@/lib/onboarding/activation-checklist";
import {
  CURRENT_ONBOARDING_FLOW_VERSION,
  normalizeOnboardingJobs,
  type OnboardingJob,
} from "@/lib/onboarding/jobs";
import { onboardingService } from "@/lib/services/onboardingService";

const DAY_MS = 24 * 60 * 60 * 1000;

type CountRow = { count: bigint | number | string | null; firstAt: Date | null };
type DayRow = { day: string };

type ActivityLoader = (shopId: string, startAt: Date, timeZone: string) => Promise<{
  count: number;
  firstAt: Date | null;
  days: string[];
}>;

function countValue(value: CountRow["count"]) {
  if (typeof value === "bigint") return Number(value);
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

async function loadServiceOrderActivity(shopId: string, startAt: Date, timeZone: string) {
  const [countRows, dayRows] = await Promise.all([
    prisma.$queryRaw<CountRow[]>`
      SELECT COUNT(*)::bigint AS "count", MIN("receivedAt") AS "firstAt"
      FROM "ServiceOrder"
      WHERE "shopId" = ${shopId}::uuid AND "deletedAt" IS NULL AND "receivedAt" >= ${startAt}
    `,
    prisma.$queryRaw<DayRow[]>`
      SELECT DISTINCT ((("receivedAt" AT TIME ZONE 'UTC') AT TIME ZONE ${timeZone})::date)::text AS "day"
      FROM "ServiceOrder"
      WHERE "shopId" = ${shopId}::uuid AND "deletedAt" IS NULL AND "receivedAt" >= ${startAt}
      ORDER BY "day" ASC
      LIMIT 15
    `,
  ]);
  return { count: countValue(countRows[0]?.count), firstAt: countRows[0]?.firstAt ?? null, days: dayRows.map((row) => row.day) };
}

async function loadSalesActivity(shopId: string, startAt: Date, timeZone: string) {
  const [countRows, dayRows] = await Promise.all([
    prisma.$queryRaw<CountRow[]>`
      SELECT COUNT(*)::bigint AS "count", MIN("createdAt") AS "firstAt"
      FROM "Sale"
      WHERE "shopId" = ${shopId}::uuid AND "deletedAt" IS NULL AND "status" = 'COMPLETED' AND "createdAt" >= ${startAt}
    `,
    prisma.$queryRaw<DayRow[]>`
      SELECT DISTINCT ((("createdAt" AT TIME ZONE 'UTC') AT TIME ZONE ${timeZone})::date)::text AS "day"
      FROM "Sale"
      WHERE "shopId" = ${shopId}::uuid AND "deletedAt" IS NULL AND "status" = 'COMPLETED' AND "createdAt" >= ${startAt}
      ORDER BY "day" ASC
      LIMIT 15
    `,
  ]);
  return { count: countValue(countRows[0]?.count), firstAt: countRows[0]?.firstAt ?? null, days: dayRows.map((row) => row.day) };
}

async function loadInventoryActivity(shopId: string, startAt: Date, timeZone: string) {
  const [countRows, dayRows] = await Promise.all([
    prisma.$queryRaw<CountRow[]>`
      SELECT COUNT(*)::bigint AS "count", MIN("createdAt") AS "firstAt"
      FROM "InventoryItem"
      WHERE "shopId" = ${shopId}::uuid AND "deletedAt" IS NULL AND "createdAt" >= ${startAt}
    `,
    prisma.$queryRaw<DayRow[]>`
      SELECT DISTINCT ((("createdAt" AT TIME ZONE 'UTC') AT TIME ZONE ${timeZone})::date)::text AS "day"
      FROM "InventoryItem"
      WHERE "shopId" = ${shopId}::uuid AND "deletedAt" IS NULL AND "createdAt" >= ${startAt}
      ORDER BY "day" ASC
      LIMIT 15
    `,
  ]);
  return { count: countValue(countRows[0]?.count), firstAt: countRows[0]?.firstAt ?? null, days: dayRows.map((row) => row.day) };
}

async function loadWalletActivity(shopId: string, startAt: Date, timeZone: string) {
  const [countRows, dayRows] = await Promise.all([
    prisma.$queryRaw<CountRow[]>`
      SELECT COUNT(*)::bigint AS "count", MIN("createdAt") AS "firstAt"
      FROM "FinancialTransfer"
      WHERE "shopId" = ${shopId}::uuid AND "deletedAt" IS NULL AND "status" = 'ACTIVE' AND "createdAt" >= ${startAt}
    `,
    prisma.$queryRaw<DayRow[]>`
      SELECT DISTINCT ((("createdAt" AT TIME ZONE 'UTC') AT TIME ZONE ${timeZone})::date)::text AS "day"
      FROM "FinancialTransfer"
      WHERE "shopId" = ${shopId}::uuid AND "deletedAt" IS NULL AND "status" = 'ACTIVE' AND "createdAt" >= ${startAt}
      ORDER BY "day" ASC
      LIMIT 15
    `,
  ]);
  return { count: countValue(countRows[0]?.count), firstAt: countRows[0]?.firstAt ?? null, days: dayRows.map((row) => row.day) };
}

async function loadDebtActivity(shopId: string, startAt: Date, timeZone: string) {
  const [countRows, dayRows] = await Promise.all([
    prisma.$queryRaw<CountRow[]>`
      SELECT COUNT(*)::bigint AS "count", MIN("createdAt") AS "firstAt"
      FROM "DebtLedgerEntry"
      WHERE "shopId" = ${shopId}::uuid AND "isReversed" = FALSE
        AND "type" IN ('DEBT', 'OPENING_BALANCE', 'PAYMENT') AND "createdAt" >= ${startAt}
    `,
    prisma.$queryRaw<DayRow[]>`
      SELECT DISTINCT ((("createdAt" AT TIME ZONE 'UTC') AT TIME ZONE ${timeZone})::date)::text AS "day"
      FROM "DebtLedgerEntry"
      WHERE "shopId" = ${shopId}::uuid AND "isReversed" = FALSE
        AND "type" IN ('DEBT', 'OPENING_BALANCE', 'PAYMENT') AND "createdAt" >= ${startAt}
      ORDER BY "day" ASC
      LIMIT 15
    `,
  ]);
  return { count: countValue(countRows[0]?.count), firstAt: countRows[0]?.firstAt ?? null, days: dayRows.map((row) => row.day) };
}

async function loadElectronicActivity(shopId: string, startAt: Date, timeZone: string) {
  const [countRows, dayRows] = await Promise.all([
    prisma.$queryRaw<CountRow[]>`
      SELECT COUNT(*)::bigint AS "count", MIN("createdAt") AS "firstAt"
      FROM "ElectronicServiceTransaction"
      WHERE "shopId" = ${shopId}::uuid AND "status" = 'ACTIVE' AND "createdAt" >= ${startAt}
    `,
    prisma.$queryRaw<DayRow[]>`
      SELECT DISTINCT ((("createdAt" AT TIME ZONE 'UTC') AT TIME ZONE ${timeZone})::date)::text AS "day"
      FROM "ElectronicServiceTransaction"
      WHERE "shopId" = ${shopId}::uuid AND "status" = 'ACTIVE' AND "createdAt" >= ${startAt}
      ORDER BY "day" ASC
      LIMIT 15
    `,
  ]);
  return { count: countValue(countRows[0]?.count), firstAt: countRows[0]?.firstAt ?? null, days: dayRows.map((row) => row.day) };
}

const LOADERS: Record<OnboardingJob, ActivityLoader> = {
  REPAIRS: loadServiceOrderActivity,
  SALES: loadSalesActivity,
  INVENTORY: loadInventoryActivity,
  WALLETS: loadWalletActivity,
  DEBTS: loadDebtActivity,
  ELECTRONIC_SERVICES: loadElectronicActivity,
};

async function loadSelectedJobActivity(shopId: string, startAt: Date, timeZone: string, selectedJobs: OnboardingJob[]) {
  const settled = await Promise.allSettled(selectedJobs.map(async (job): Promise<ActivationJobActivity> => {
    const data = await LOADERS[job](shopId, startAt, timeZone);
    return {
      job,
      activityCount: data.count,
      activeDays: data.days,
      firstActivityAt: data.firstAt,
      dataAvailable: true,
    };
  }));

  return settled.map((result, index): ActivationJobActivity => {
    if (result.status === "fulfilled") return result.value;
    return {
      job: selectedJobs[index],
      activityCount: 0,
      activeDays: [],
      firstActivityAt: null,
      dataAvailable: false,
    };
  });
}

export async function getActivationChecklistState(
  shopId: string,
  timeZone: string,
  now = new Date(),
): Promise<ActivationChecklistState | null> {
  const profile = await onboardingService.getOnboardingProfile(shopId);
  if (!profile || profile.flowVersion !== CURRENT_ONBOARDING_FLOW_VERSION) return null;
  if (!profile.completedAt || profile.skippedAt) return null;

  const selectedJobs = normalizeOnboardingJobs(profile.selectedJobs);
  if (selectedJobs.length === 0 || !profile.primaryJob || !selectedJobs.includes(profile.primaryJob as OnboardingJob)) return null;

  const ageMs = now.getTime() - profile.completedAt.getTime();
  if (ageMs > ACTIVATION_CHECKLIST_MAX_AGE_DAYS * DAY_MS) return null;

  const jobActivity = await loadSelectedJobActivity(shopId, profile.completedAt, timeZone, selectedJobs);
  return buildActivationChecklistState({
    flowVersion: profile.flowVersion,
    startedAt: profile.completedAt,
    selectedJobs,
    primaryJob: profile.primaryJob,
    jobActivity,
    now,
  });
}

export const activationChecklistService = {
  getActivationChecklistState,
};
