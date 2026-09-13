export const CURRENT_ONBOARDING_FLOW_VERSION = 1 as const;

export const ONBOARDING_JOBS = [
  "REPAIRS",
  "SALES",
  "INVENTORY",
  "WALLETS",
  "DEBTS",
] as const;

export type OnboardingJob = (typeof ONBOARDING_JOBS)[number];

const ONBOARDING_JOB_SET = new Set<string>(ONBOARDING_JOBS);

export function isOnboardingJob(value: unknown): value is OnboardingJob {
  return typeof value === "string" && ONBOARDING_JOB_SET.has(value);
}

/**
 * Returns supported jobs once, in the canonical product order.
 * Unknown and retired values are intentionally discarded so old clients cannot persist
 * arbitrary or phone-era strings into the automotive onboarding profile.
 */
export function normalizeOnboardingJobs(values: readonly unknown[]): OnboardingJob[] {
  const requested = new Set(values.filter(isOnboardingJob));
  return ONBOARDING_JOBS.filter((job) => requested.has(job));
}

export type OnboardingPreferences = {
  primaryJob: OnboardingJob;
  selectedJobs: OnboardingJob[];
};

export function validateOnboardingPreferences(input: {
  primaryJob: unknown;
  selectedJobs: readonly unknown[];
}): OnboardingPreferences {
  if (!isOnboardingJob(input.primaryJob)) {
    throw new Error("اختر القسم الأساسي الذي تريد البدء منه.");
  }

  const selectedJobs = normalizeOnboardingJobs(input.selectedJobs);
  if (selectedJobs.length === 0) {
    throw new Error("اختر قسماً واحداً على الأقل من طبيعة عملك.");
  }

  if (!selectedJobs.includes(input.primaryJob)) {
    throw new Error("القسم الأساسي يجب أن يكون ضمن الأقسام التي اخترتها.");
  }

  return {
    primaryJob: input.primaryJob,
    selectedJobs,
  };
}
