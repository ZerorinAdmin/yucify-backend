export type OnboardingStatePatch = {
  persona?: "own_product" | "clients" | "freelancer_consultant" | "exploring";
  referral_source?:
    | "facebook"
    | "instagram"
    | "friends"
    | "reddit"
    | "linkedin"
    | "twitter_x"
    | "google"
    | "others";
  onboarding_step?:
    | "intro_completed"
    | "proof_seen"
    | "meta_connected"
    | "insight_viewed"
    | "completed";
  meta_connected?: boolean;
  first_insight_viewed?: boolean;
  onboarding_completed_at?: string | null;
};

export async function patchOnboardingState(patch: OnboardingStatePatch): Promise<void> {
  const res = await fetch("/api/onboarding/state", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });

  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(data.error ?? "Failed to update onboarding state");
  }
}
