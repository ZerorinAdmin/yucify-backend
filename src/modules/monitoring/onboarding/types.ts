export type OnboardingPersona =
  | "own_product"
  | "clients"
  | "freelancer_consultant"
  | "exploring";

export type OnboardingReferralSource =
  | "facebook"
  | "instagram"
  | "friends"
  | "reddit"
  | "linkedin"
  | "twitter_x"
  | "google"
  | "others";

export type OnboardingStep =
  | "intro_completed"
  | "proof_seen"
  | "meta_connected"
  | "insight_viewed"
  | "completed";

export type OnboardingProfile = {
  persona: OnboardingPersona | null;
  referral_source: OnboardingReferralSource | null;
  onboarding_step: OnboardingStep | null;
  meta_connected: boolean;
  first_insight_viewed: boolean;
  onboarding_completed_at: string | null;
};
