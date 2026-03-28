import { ResultsStep } from "@/components/onboarding/ResultsStep";
import { enforceOnboardingPath } from "@/lib/onboarding/guard";

export default async function OnboardingResultsPage() {
  await enforceOnboardingPath("/onboarding/results");
  return <ResultsStep />;
}
