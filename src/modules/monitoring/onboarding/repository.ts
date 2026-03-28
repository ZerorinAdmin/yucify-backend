import type { SupabaseClient } from "@supabase/supabase-js";
import type { OnboardingProfile } from "./types";

function normalizeProfileRow(row: Record<string, unknown> | null): OnboardingProfile {
  return {
    persona: (row?.persona as OnboardingProfile["persona"]) ?? null,
    referral_source: (row?.referral_source as OnboardingProfile["referral_source"]) ?? null,
    onboarding_step: (row?.onboarding_step as OnboardingProfile["onboarding_step"]) ?? null,
    meta_connected: Boolean(row?.meta_connected),
    first_insight_viewed: Boolean(row?.first_insight_viewed),
    onboarding_completed_at:
      typeof row?.onboarding_completed_at === "string"
        ? (row.onboarding_completed_at as string)
        : null,
  };
}

export async function fetchOnboardingProfile(
  supabase: SupabaseClient,
  userId: string
): Promise<OnboardingProfile> {
  const { data, error } = await supabase
    .from("profiles")
    .select(
      "persona, referral_source, onboarding_step, meta_connected, first_insight_viewed, onboarding_completed_at"
    )
    .eq("id", userId)
    .maybeSingle();

  if (error) {
    const missingColumns =
      error.code === "42703" ||
      error.message.includes("column profiles.persona does not exist") ||
      error.message.includes("column profiles.referral_source does not exist") ||
      error.message.includes("column profiles.onboarding_step does not exist");

    if (missingColumns) {
      // Fail-soft so app doesn't crash on environments where onboarding migration
      // has not been applied yet.
      return normalizeProfileRow(null);
    }

    throw new Error(error.message);
  }
  return normalizeProfileRow((data ?? null) as Record<string, unknown> | null);
}

export async function upsertOnboardingProfile(
  supabase: SupabaseClient,
  userId: string,
  patch: Partial<OnboardingProfile>
): Promise<OnboardingProfile> {
  const payload: Record<string, unknown> = {
    ...patch,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from("profiles")
    .update(payload)
    .eq("id", userId)
    .select("id")
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) {
    throw new Error("Profile row missing for user");
  }

  return fetchOnboardingProfile(supabase, userId);
}
