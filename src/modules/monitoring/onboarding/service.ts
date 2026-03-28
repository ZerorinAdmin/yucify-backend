import type { SupabaseClient } from "@supabase/supabase-js";
import {
  fetchOnboardingProfile,
  upsertOnboardingProfile,
} from "@/modules/monitoring/onboarding/repository";
import type { OnboardingProfile } from "./types";

const STEP_ORDER: Record<string, number> = {
  intro: 0,
  proof: 1,
  connect: 2,
  "select-account": 3,
  analyzing: 4,
  results: 5,
  insight: 6,
  "next-step": 7,
};

const STEP_TO_MAX_ROUTE_ORDER: Record<
  NonNullable<OnboardingProfile["onboarding_step"]>,
  number
> = {
  intro_completed: STEP_ORDER.proof,
  proof_seen: STEP_ORDER.connect,
  meta_connected: STEP_ORDER["next-step"],
  insight_viewed: STEP_ORDER["next-step"],
  completed: STEP_ORDER["next-step"],
};

const ROUTE_BY_ORDER: Record<number, string> = {
  0: "/onboarding/intro",
  1: "/onboarding/proof",
  2: "/onboarding/connect",
  3: "/onboarding/select-account",
  4: "/onboarding/analyzing",
  5: "/onboarding/results",
  6: "/onboarding/insight",
  7: "/onboarding/next-step",
};

function routeOrderFromPath(pathname: string): number | null {
  const normalized = pathname.replace(/\/+$/, "");
  const segment = normalized.split("/")[2] ?? "";
  if (!(segment in STEP_ORDER)) return null;
  return STEP_ORDER[segment as keyof typeof STEP_ORDER];
}

export async function getOnboardingState(
  supabase: SupabaseClient,
  userId: string
): Promise<OnboardingProfile> {
  return fetchOnboardingProfile(supabase, userId);
}

export async function updateOnboardingState(
  supabase: SupabaseClient,
  userId: string,
  patch: Partial<OnboardingProfile>
): Promise<OnboardingProfile> {
  return upsertOnboardingProfile(supabase, userId, patch);
}

export function isOnboardingComplete(profile: OnboardingProfile): boolean {
  return Boolean(profile.onboarding_completed_at);
}

export function getRequiredOnboardingRoute(profile: OnboardingProfile): string {
  if (profile.onboarding_completed_at) return "/dashboard";
  if (!profile.onboarding_step) return "/onboarding/intro";
  return ROUTE_BY_ORDER[STEP_TO_MAX_ROUTE_ORDER[profile.onboarding_step]] ?? "/onboarding/intro";
}

export function shouldRedirectFromOnboarding(
  profile: OnboardingProfile,
  pathname: string
): string | null {
  if (isOnboardingComplete(profile)) return "/dashboard";

  const requestedOrder = routeOrderFromPath(pathname);
  if (requestedOrder === null) return "/onboarding/intro";

  if (!profile.onboarding_step) {
    return requestedOrder === STEP_ORDER.intro ? null : "/onboarding/intro";
  }

  const maxAllowedOrder = STEP_TO_MAX_ROUTE_ORDER[profile.onboarding_step];
  if (requestedOrder > maxAllowedOrder) {
    return ROUTE_BY_ORDER[maxAllowedOrder] ?? "/onboarding/intro";
  }

  return null;
}
