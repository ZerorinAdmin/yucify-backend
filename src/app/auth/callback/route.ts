import { createClient, createServiceClient } from "@/lib/supabase/server";
import { DEFAULT_SCRAPE_LIMIT, DEFAULT_ANALYSIS_LIMIT } from "@/lib/usage/limits";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/dashboard";

  if (code) {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error && data.user) {
      // Sync profile: provider, provider_user_id, email (per requirements)
      const identity = data.user.identities?.[0];
      if (identity) {
        try {
          await supabase.from("profiles").upsert(
            {
              id: data.user.id,
              provider: identity.provider,
              provider_user_id: identity.id,
              email: data.user.email ?? "",
              updated_at: new Date().toISOString(),
            },
            { onConflict: "id" }
          );
        } catch {
          // Profiles table may not exist yet; auth still succeeds
        }
      }

      // Ensure user_usage_limits row exists with defaults (insert only if missing)
      try {
        const serviceClient = createServiceClient();
        await serviceClient.from("user_usage_limits").upsert(
          {
            user_id: data.user.id,
            daily_scrape_limit: DEFAULT_SCRAPE_LIMIT,
            daily_analysis_limit: DEFAULT_ANALYSIS_LIMIT,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "user_id", ignoreDuplicates: true }
        );
      } catch {
        // Service key may be missing or table may not exist; auth still succeeds
      }

      const forwardedHost = request.headers.get("x-forwarded-host");
      const isLocalEnv = process.env.NODE_ENV === "development";
      const redirectUrl =
        isLocalEnv || !forwardedHost
          ? `${origin}${next.startsWith("/") ? "" : "/"}${next}`
          : `https://${forwardedHost}${next}`;

      return NextResponse.redirect(redirectUrl);
    }
  }

  return NextResponse.redirect(`${origin}/auth/auth-code-error`);
}
