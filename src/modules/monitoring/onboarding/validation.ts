import { z } from "zod";

export const OnboardingPersonaSchema = z.enum([
  "own_product",
  "clients",
  "freelancer_consultant",
  "exploring",
]);

export const OnboardingReferralSourceSchema = z.enum([
  "facebook",
  "instagram",
  "friends",
  "reddit",
  "linkedin",
  "twitter_x",
  "google",
  "others",
]);

export const OnboardingStepSchema = z.enum([
  "intro_completed",
  "proof_seen",
  "meta_connected",
  "insight_viewed",
  "completed",
]);

export const UpdateOnboardingStateSchema = z
  .object({
    persona: OnboardingPersonaSchema.optional(),
    referral_source: OnboardingReferralSourceSchema.optional(),
    onboarding_step: OnboardingStepSchema.optional(),
    meta_connected: z.boolean().optional(),
    first_insight_viewed: z.boolean().optional(),
    onboarding_completed_at: z.string().datetime().nullable().optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field must be provided",
  });
