import { NextStepStep } from "@/components/onboarding/NextStepStep";
import { enforceOnboardingPath } from "@/lib/onboarding/guard";

export default async function OnboardingNextStepPage() {
  await enforceOnboardingPath("/onboarding/next-step");
  return <NextStepStep />;
}
