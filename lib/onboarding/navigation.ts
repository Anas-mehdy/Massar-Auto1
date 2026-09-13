import { CURRENT_ONBOARDING_FLOW_VERSION, type OnboardingJob } from "@/lib/onboarding/jobs";

export type OnboardingProfileGate = {
  flowVersion: number;
  completedAt: Date | null;
  skippedAt: Date | null;
};

export function shouldEnterOnboarding(profile: OnboardingProfileGate | null | undefined) {
  return Boolean(
    profile &&
      profile.flowVersion === CURRENT_ONBOARDING_FLOW_VERSION &&
      !profile.completedAt &&
      !profile.skippedAt,
  );
}

const DESTINATION_BY_JOB: Record<OnboardingJob, string> = {
  REPAIRS: "/service-orders/new",
  SALES: "/point-of-sale?tab=sale&onboarding=1",
  INVENTORY: "/inventory/new?onboarding=1",
  WALLETS: "/transfers?onboarding=1",
  DEBTS: "/debts?onboarding=1",
  ELECTRONIC_SERVICES: "/electronic-services?onboarding=1",
};

export function onboardingDestination(job: OnboardingJob) {
  return DESTINATION_BY_JOB[job];
}
