import type { SupabaseClient } from "@supabase/supabase-js";
import {
  getOnboardingState,
  shouldRedirectFromOnboarding,
} from "@/modules/monitoring/onboarding/service";

export async function getOnboardingRedirectForOnboardingPath(
  supabase: SupabaseClient,
  userId: string,
  pathname: string
): Promise<string | null> {
  const state = await getOnboardingState(supabase, userId);
  return shouldRedirectFromOnboarding(state, pathname);
}

export async function requiresOnboardingRedirect(
  supabase: SupabaseClient,
  userId: string
): Promise<boolean> {
  const state = await getOnboardingState(supabase, userId);
  return !Boolean(state.onboarding_completed_at);
}
