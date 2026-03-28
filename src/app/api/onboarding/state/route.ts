import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  handleOnboardingStateGet,
  handleOnboardingStatePatch,
} from "@/modules/monitoring/onboarding/controller";
import type { User } from "@supabase/supabase-js";

async function ensureProfileExistsForUser(
  supabase: Awaited<ReturnType<typeof createClient>>,
  user: User
): Promise<void> {
  const { data: existing, error: existingError } = await supabase
    .from("profiles")
    .select("id")
    .eq("id", user.id)
    .maybeSingle();

  if (existingError) {
    throw new Error(existingError.message);
  }
  if (existing) return;

  const primaryIdentity = user.identities?.[0];
  const provider =
    primaryIdentity?.provider ||
    (typeof user.app_metadata?.provider === "string" ? user.app_metadata.provider : null) ||
    "unknown";
  const providerUserId = primaryIdentity?.id || user.id;

  const { error: insertError } = await supabase.from("profiles").insert({
    id: user.id,
    provider,
    provider_user_id: providerUserId,
    email: user.email ?? "",
    updated_at: new Date().toISOString(),
  });

  if (insertError) {
    throw new Error(insertError.message);
  }
}

export async function GET(): Promise<NextResponse> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await handleOnboardingStateGet(supabase, user.id);
    return NextResponse.json(result.body, { status: result.status });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to fetch onboarding state";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest): Promise<NextResponse> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  try {
    await ensureProfileExistsForUser(supabase, user);
    const result = await handleOnboardingStatePatch(supabase, user.id, body);
    return NextResponse.json(result.body, { status: result.status });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to update onboarding state";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
