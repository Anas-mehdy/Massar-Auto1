import {
  normalizeOnboardingJobs,
  type OnboardingJob,
} from "@/lib/onboarding/jobs";

export const FEATURE_DISCOVERY_MAX_AGE_DAYS = 30 as const;

export type FeatureDiscoveryId =
  | "service_order_workflow"
  | "sales_inventory"
  | "wallet_monthly_limit"
  | "debt_collection";

export type FeatureDiscoveryCandidate = {
  id: FeatureDiscoveryId;
  job: OnboardingJob;
  title: string;
  description: string;
  actionHref: string;
  actionLabel: string;
};

export type FeatureDiscoveryEvidence = {
  serviceOrderHref?: string | null;
  salesHasActivity?: boolean;
  inventoryHasActivity?: boolean;
  walletNeedsLimit?: boolean;
  debtCollectionHref?: string | null;
};

function candidateForJob(
  job: OnboardingJob,
  evidence: FeatureDiscoveryEvidence,
): FeatureDiscoveryCandidate | null {
  if (job === "REPAIRS" && evidence.serviceOrderHref) {
    return {
      id: "service_order_workflow",
      job,
      title: "خلّي كل صيانة تمشي بمسار واضح من الاستقبال للتسليم",
      description: "من أمر الصيانة نفسه تقدر تتابع الفحص والتشخيص، موافقة العميل، قطع الغيار والأجور، ثم التنفيذ والتسليم بدون تشتيت بين سجلات منفصلة.",
      actionHref: evidence.serviceOrderHref,
      actionLabel: "افتح أمر الصيانة",
    };
  }

  if (job === "SALES" && evidence.salesHasActivity && evidence.inventoryHasActivity) {
    return {
      id: "sales_inventory",
      job,
      title: "اربط البيع بالمخزون في نفس العملية",
      description: "لما تختار صنفاً من المخزون داخل نقطة البيع، مسار يسجل البيع ويخصم الكمية تلقائياً بدل تعديل الرصيد يدوياً.",
      actionHref: "/point-of-sale?tab=sale",
      actionLabel: "افتح نقطة البيع",
    };
  }

  if (job === "WALLETS" && evidence.walletNeedsLimit) {
    return {
      id: "wallet_monthly_limit",
      job,
      title: "أضف حد المحفظة الشهري حتى تعرف استهلاكك",
      description: "إذا مزود المحفظة يعطيك سقفاً شهرياً، احفظه مرة واحدة ليظهر لك المستخدم والمتبقي بدل الحساب اليدوي.",
      actionHref: "/transfers",
      actionLabel: "راجع إعدادات المحافظ",
    };
  }

  if (job === "DEBTS" && evidence.debtCollectionHref) {
    return {
      id: "debt_collection",
      job,
      title: "لما يدفع العميل، سجّل التحصيل من نفس دفتره",
      description: "التحصيل ينقص الرصيد المستحق ويحدث الدرج أو المحفظة التي استلمت المال، بدون تسجيل الحركة مرتين.",
      actionHref: evidence.debtCollectionHref,
      actionLabel: "افتح دفتر العميل",
    };
  }

  return null;
}

export function buildFeatureDiscoveryCandidates(input: {
  selectedJobs: readonly unknown[];
  primaryJob: OnboardingJob;
  evidence: FeatureDiscoveryEvidence;
}): FeatureDiscoveryCandidate[] {
  const selectedJobs = normalizeOnboardingJobs(input.selectedJobs);
  if (!selectedJobs.includes(input.primaryJob)) return [];

  const orderedJobs = [input.primaryJob, ...selectedJobs.filter((job) => job !== input.primaryJob)];
  return orderedJobs
    .map((job) => candidateForJob(job, input.evidence))
    .filter((candidate): candidate is FeatureDiscoveryCandidate => Boolean(candidate));
}
