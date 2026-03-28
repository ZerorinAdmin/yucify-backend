import { IntroStep } from "@/components/onboarding/IntroStep";
import { enforceOnboardingPath } from "@/lib/onboarding/guard";

export default async function OnboardingIntroPage() {
  await enforceOnboardingPath("/onboarding/intro");
  return <IntroStep />;
}
