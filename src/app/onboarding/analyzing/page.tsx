import { AnalyzingStep } from "@/components/onboarding/AnalyzingStep";
import { enforceOnboardingPath } from "@/lib/onboarding/guard";

export default async function OnboardingAnalyzingPage() {
  await enforceOnboardingPath("/onboarding/analyzing");
  return <AnalyzingStep />;
}
