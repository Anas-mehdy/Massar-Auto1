import { SaleStatus, type ShopOnboardingProfile } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  CURRENT_ONBOARDING_FLOW_VERSION,
  ONBOARDING_JOBS,
  type OnboardingJob,
  validateOnboardingPreferences,
} from "@/lib/onboarding/jobs";

export type JobActivationSignal = {
  setupRequired: boolean;
  setupCompleted: boolean;
  setupCount: number;
  firstSetupAt: Date | null;
  coreActivityCount: number;
  firstCoreActivityAt: Date | null;
  activated: boolean;
};

export type JobActivationSignals = Record<OnboardingJob, JobActivationSignal>;

export type ShopOnboardingState = {
  profile: ShopOnboardingProfile | null;
  signals: JobActivationSignals;
  activatedJobs: OnboardingJob[];
  hasAnyCoreActivity: boolean;
};

type RawAggregateRow = {
  count: bigint | number | string | null;
  firstAt: Date | null;
};

function countValue(value: RawAggregateRow["count"]): number {
  if (typeof value === "bigint") return Number(value);
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function signal(input: {
  setupRequired?: boolean;
  setupCount?: number;
  firstSetupAt?: Date | null;
  coreActivityCount: number;
  firstCoreActivityAt: Date | null;
}): JobActivationSignal {
  const setupRequired = input.setupRequired ?? false;
  const setupCount = input.setupCount ?? 0;
  return {
    setupRequired,
    setupCompleted: setupRequired ? setupCount > 0 : true,
    setupCount,
    firstSetupAt: input.firstSetupAt ?? null,
    coreActivityCount: input.coreActivityCount,
    firstCoreActivityAt: input.firstCoreActivityAt,
    activated: input.coreActivityCount > 0,
  };
}

export async function getOnboardingProfile(shopId: string) {
  return prisma.shopOnboardingProfile.findUnique({ where: { shopId } });
}

export async function ensureOnboardingProfile(shopId: string) {
  return prisma.shopOnboardingProfile.upsert({
    where: { shopId },
    create: { shopId, flowVersion: CURRENT_ONBOARDING_FLOW_VERSION },
    update: {},
  });
}

/** First exposure timestamp is immutable once set. */
export async function markOnboardingStarted(shopId: string, now = new Date()) {
  return prisma.$transaction(async (tx) => {
    const profile = await tx.shopOnboardingProfile.upsert({
      where: { shopId },
      create: {
        shopId,
        flowVersion: CURRENT_ONBOARDING_FLOW_VERSION,
        startedAt: now,
      },
      update: {},
    });

    if (profile.startedAt) return profile;

    return tx.shopOnboardingProfile.update({
      where: { shopId },
      data: { startedAt: now },
    });
  });
}

export async function saveOnboardingPreferences(
  shopId: string,
  input: { primaryJob: unknown; selectedJobs: readonly unknown[] },
  now = new Date(),
) {
  const preferences = validateOnboardingPreferences(input);
  const existing = await prisma.shopOnboardingProfile.findUnique({ where: { shopId } });
  const flowChanged = existing && existing.flowVersion !== CURRENT_ONBOARDING_FLOW_VERSION;

  return prisma.shopOnboardingProfile.upsert({
    where: { shopId },
    create: {
      shopId,
      flowVersion: CURRENT_ONBOARDING_FLOW_VERSION,
      primaryJob: preferences.primaryJob,
      selectedJobs: preferences.selectedJobs,
      startedAt: now,
    },
    update: {
      flowVersion: CURRENT_ONBOARDING_FLOW_VERSION,
      primaryJob: preferences.primaryJob,
      selectedJobs: preferences.selectedJobs,
      startedAt: existing?.startedAt ?? now,
      skippedAt: null,
      ...(flowChanged ? { completedAt: null } : {}),
    },
  });
}

export async function markOnboardingCompleted(shopId: string, now = new Date()) {
  const profile = await prisma.shopOnboardingProfile.findUnique({ where: { shopId } });
  if (!profile) {
    throw new Error("ابدأ إعداد مسار أولاً قبل إنهاء خطوات البداية.");
  }

  validateOnboardingPreferences({
    primaryJob: profile.primaryJob,
    selectedJobs: profile.selectedJobs,
  });

  if (profile.completedAt && profile.flowVersion === CURRENT_ONBOARDING_FLOW_VERSION) {
    return profile;
  }

  return prisma.shopOnboardingProfile.update({
    where: { shopId },
    data: {
      flowVersion: CURRENT_ONBOARDING_FLOW_VERSION,
      startedAt: profile.startedAt ?? now,
      completedAt: now,
      skippedAt: null,
    },
  });
}

export async function markOnboardingSkipped(shopId: string, now = new Date()) {
  const profile = await prisma.shopOnboardingProfile.upsert({
    where: { shopId },
    create: {
      shopId,
      flowVersion: CURRENT_ONBOARDING_FLOW_VERSION,
      startedAt: now,
      skippedAt: now,
    },
    update: {},
  });

  if (profile.completedAt && profile.flowVersion === CURRENT_ONBOARDING_FLOW_VERSION) {
    return profile;
  }

  if (profile.skippedAt && profile.flowVersion === CURRENT_ONBOARDING_FLOW_VERSION) {
    return profile;
  }

  return prisma.shopOnboardingProfile.update({
    where: { shopId },
    data: {
      flowVersion: CURRENT_ONBOARDING_FLOW_VERSION,
      startedAt: profile.startedAt ?? now,
      completedAt: null,
      skippedAt: now,
    },
  });
}

/**
 * Reads activation from automotive business truth, never from onboarding checkboxes.
 * Cancellation/deletion naturally changes the signal.
 */
export async function getJobActivationSignals(shopId: string): Promise<JobActivationSignals> {
  const [serviceOrders, sales, inventory, walletRows, transferRows, debtRows] = await Promise.all([
    prisma.serviceOrder.aggregate({
      where: { shopId, deletedAt: null },
      _count: { _all: true },
      _min: { receivedAt: true },
    }),
    prisma.sale.aggregate({
      where: { shopId, deletedAt: null, status: SaleStatus.COMPLETED },
      _count: { _all: true },
      _min: { createdAt: true },
    }),
    prisma.inventoryItem.aggregate({
      where: { shopId, deletedAt: null },
      _count: { _all: true },
      _min: { createdAt: true },
    }),
    prisma.$queryRaw<RawAggregateRow[]>`
      SELECT COUNT(*)::bigint AS "count", MIN("createdAt") AS "firstAt"
      FROM "FinancialWallet"
      WHERE "shopId" = ${shopId}::uuid AND "deletedAt" IS NULL
    `,
    prisma.$queryRaw<RawAggregateRow[]>`
      SELECT COUNT(*)::bigint AS "count", MIN("createdAt") AS "firstAt"
      FROM "FinancialTransfer"
      WHERE "shopId" = ${shopId}::uuid
        AND "deletedAt" IS NULL
        AND "status" = 'ACTIVE'
    `,
    prisma.$queryRaw<RawAggregateRow[]>`
      SELECT COUNT(*)::bigint AS "count", MIN("createdAt") AS "firstAt"
      FROM "DebtLedgerEntry"
      WHERE "shopId" = ${shopId}::uuid
        AND "isReversed" = FALSE
        AND "type" IN ('DEBT', 'OPENING_BALANCE')
    `,
  ]);

  const walletSetup = walletRows[0] ?? { count: 0, firstAt: null };
  const transfers = transferRows[0] ?? { count: 0, firstAt: null };
  const debts = debtRows[0] ?? { count: 0, firstAt: null };

  return {
    REPAIRS: signal({
      coreActivityCount: serviceOrders._count._all,
      firstCoreActivityAt: serviceOrders._min.receivedAt,
    }),
    SALES: signal({
      coreActivityCount: sales._count._all,
      firstCoreActivityAt: sales._min.createdAt,
    }),
    INVENTORY: signal({
      coreActivityCount: inventory._count._all,
      firstCoreActivityAt: inventory._min.createdAt,
    }),
    WALLETS: signal({
      setupRequired: true,
      setupCount: countValue(walletSetup.count),
      firstSetupAt: walletSetup.firstAt,
      coreActivityCount: countValue(transfers.count),
      firstCoreActivityAt: transfers.firstAt,
    }),
    DEBTS: signal({
      coreActivityCount: countValue(debts.count),
      firstCoreActivityAt: debts.firstAt,
    }),
  };
}

export async function getShopOnboardingState(shopId: string): Promise<ShopOnboardingState> {
  const [profile, signals] = await Promise.all([
    getOnboardingProfile(shopId),
    getJobActivationSignals(shopId),
  ]);
  const activatedJobs = ONBOARDING_JOBS.filter((job) => signals[job].activated);

  return {
    profile,
    signals,
    activatedJobs,
    hasAnyCoreActivity: activatedJobs.length > 0,
  };
}

export const onboardingService = {
  getOnboardingProfile,
  ensureOnboardingProfile,
  markOnboardingStarted,
  saveOnboardingPreferences,
  markOnboardingCompleted,
  markOnboardingSkipped,
  getJobActivationSignals,
  getShopOnboardingState,
};
