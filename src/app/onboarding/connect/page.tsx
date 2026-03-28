import { ConnectStep } from "@/components/onboarding/ConnectStep";
import { enforceOnboardingPath } from "@/lib/onboarding/guard";

export default async function OnboardingConnectPage() {
  await enforceOnboardingPath("/onboarding/connect");
  return <ConnectStep />;
}
