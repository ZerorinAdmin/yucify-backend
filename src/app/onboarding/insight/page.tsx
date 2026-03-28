import { InsightStep } from "@/components/onboarding/InsightStep";
import { enforceOnboardingPath } from "@/lib/onboarding/guard";

export default async function OnboardingInsightPage() {
  await enforceOnboardingPath("/onboarding/insight");
  return <InsightStep />;
}
