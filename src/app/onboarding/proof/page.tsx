import { ProofStep } from "@/components/onboarding/ProofStep";
import { enforceOnboardingPath } from "@/lib/onboarding/guard";

export default async function OnboardingProofPage() {
  await enforceOnboardingPath("/onboarding/proof");
  return <ProofStep />;
}
