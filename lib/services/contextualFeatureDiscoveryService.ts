import { prisma } from "@/lib/prisma";
import {
  buildFeatureDiscoveryCandidates,
  FEATURE_DISCOVERY_MAX_AGE_DAYS,
  type FeatureDiscoveryCandidate,
  type FeatureDiscoveryEvidence,
} from "@/lib/onboarding/feature-discovery";
import {
  CURRENT_ONBOARDING_FLOW_VERSION,
  isOnboardingJob,
  normalizeOnboardingJobs,
  type OnboardingJob,
} from "@/lib/onboarding/jobs";
import { onboardingService } from "@/lib/services/onboardingService";

const DAY_MS = 24 * 60 * 60 * 1000;

type IdRow = { id: string };
type CustomerRow = { customerId: string };
type ExistsRow = { value: boolean };

type EvidenceLoader = (shopId: string) => Promise<Partial<FeatureDiscoveryEvidence>>;

const LOADERS: Record<OnboardingJob, EvidenceLoader> = {
  REPAIRS: async (shopId) => {
    const serviceOrder = await prisma.serviceOrder.findFirst({
      where: { shopId, deletedAt: null },
      orderBy: { receivedAt: "desc" },
      select: { id: true },
    });
    return { serviceOrderHref: serviceOrder ? `/service-orders/${serviceOrder.id}` : null };
  },

  SALES: async (shopId) => {
    const [saleRows, inventoryRows] = await Promise.all([
      prisma.$queryRaw<ExistsRow[]>`
        SELECT EXISTS(
          SELECT 1 FROM "Sale"
          WHERE "shopId" = ${shopId}::uuid AND "deletedAt" IS NULL AND "status" = 'COMPLETED'
        ) AS "value"
      `,
      prisma.$queryRaw<ExistsRow[]>`
        SELECT EXISTS(
          SELECT 1 FROM "InventoryItem"
          WHERE "shopId" = ${shopId}::uuid AND "deletedAt" IS NULL
        ) AS "value"
      `,
    ]);
    return {
      salesHasActivity: Boolean(saleRows[0]?.value),
      inventoryHasActivity: Boolean(inventoryRows[0]?.value),
    };
  },

  // No automotive fitment discovery is exposed yet. Keep inventory onboarding neutral
  // instead of querying the legacy phone compatibility directory.
  INVENTORY: async () => ({}),

  WALLETS: async (shopId) => {
    const rows = await prisma.$queryRaw<IdRow[]>`
      SELECT w."id"
      FROM "FinancialWallet" w
      WHERE w."shopId" = ${shopId}::uuid
        AND w."deletedAt" IS NULL
        AND w."isActive" = TRUE
        AND w."monthlyLimit" IS NULL
        AND EXISTS (
          SELECT 1 FROM "FinancialTransfer" t
          WHERE t."shopId" = w."shopId"
            AND t."walletId" = w."id"
            AND t."deletedAt" IS NULL
            AND t."status" = 'ACTIVE'
        )
      ORDER BY w."createdAt" ASC
      LIMIT 1
    `;
    return { walletNeedsLimit: Boolean(rows[0]) };
  },

  DEBTS: async (shopId) => {
    const rows = await prisma.$queryRaw<CustomerRow[]>`
      SELECT e."customerId"
      FROM "DebtLedgerEntry" e
      WHERE e."shopId" = ${shopId}::uuid
        AND e."isReversed" = FALSE
      GROUP BY e."customerId"
      HAVING SUM(
        CASE
          WHEN e."type" IN ('DEBT','OPENING_BALANCE','ADJUSTMENT_DEBIT') THEN e."amount"
          WHEN e."type" IN ('PAYMENT','ADJUSTMENT_CREDIT') THEN -e."amount"
          ELSE 0
        END
      ) > 0.005
      ORDER BY MAX(e."createdAt") DESC
      LIMIT 1
    `;
    return { debtCollectionHref: rows[0] ? `/debts/${rows[0].customerId}` : null };
  },

  ELECTRONIC_SERVICES: async (shopId) => {
    const [activityRows, templateRows] = await Promise.all([
      prisma.$queryRaw<ExistsRow[]>`
        SELECT EXISTS(
          SELECT 1 FROM "ElectronicServiceTransaction"
          WHERE "shopId" = ${shopId}::uuid AND "status" = 'ACTIVE'
        ) AS "value"
      `,
      prisma.$queryRaw<ExistsRow[]>`
        SELECT EXISTS(
          SELECT 1 FROM "ElectronicServiceTemplate"
          WHERE "shopId" = ${shopId}::uuid AND "isActive" = TRUE
        ) AS "value"
      `,
    ]);
    return {
      electronicHasActivity: Boolean(activityRows[0]?.value),
      electronicHasTemplates: Boolean(templateRows[0]?.value),
    };
  },
};

export async function getContextualFeatureDiscoveries(
  shopId: string,
  now = new Date(),
): Promise<FeatureDiscoveryCandidate[]> {
  const profile = await onboardingService.getOnboardingProfile(shopId);
  if (!profile || profile.flowVersion !== CURRENT_ONBOARDING_FLOW_VERSION) return [];
  if (!profile.completedAt || profile.skippedAt || !isOnboardingJob(profile.primaryJob)) return [];

  const ageMs = now.getTime() - profile.completedAt.getTime();
  if (ageMs < 0 || ageMs > FEATURE_DISCOVERY_MAX_AGE_DAYS * DAY_MS) return [];

  const selectedJobs = normalizeOnboardingJobs(profile.selectedJobs);
  if (!selectedJobs.includes(profile.primaryJob)) return [];

  const settled = await Promise.allSettled(
    selectedJobs.map(async (job) => ({ job, evidence: await LOADERS[job](shopId) })),
  );

  const evidence: FeatureDiscoveryEvidence = {};
  for (const result of settled) {
    if (result.status === "fulfilled") Object.assign(evidence, result.value.evidence);
  }

  return buildFeatureDiscoveryCandidates({
    selectedJobs,
    primaryJob: profile.primaryJob,
    evidence,
  });
}

export const contextualFeatureDiscoveryService = {
  getContextualFeatureDiscoveries,
};
