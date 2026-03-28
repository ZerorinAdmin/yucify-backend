import type { SupabaseClient } from "@supabase/supabase-js";
import { getOnboardingState, updateOnboardingState } from "./service";
import { UpdateOnboardingStateSchema } from "./validation";

export async function handleOnboardingStateGet(
  supabase: SupabaseClient,
  userId: string
) {
  const state = await getOnboardingState(supabase, userId);
  return { ok: true as const, status: 200, body: state };
}

export async function handleOnboardingStatePatch(
  supabase: SupabaseClient,
  userId: string,
  body: unknown
) {
  const parsed = UpdateOnboardingStateSchema.safeParse(body);
  if (!parsed.success) {
    return {
      ok: false as const,
      status: 400,
      body: { error: parsed.error.flatten() },
    };
  }

  const state = await updateOnboardingState(supabase, userId, parsed.data);
  return { ok: true as const, status: 200, body: state };
}
