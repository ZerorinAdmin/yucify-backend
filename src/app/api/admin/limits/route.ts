/**
 * Admin API: set or get user usage limits.
 * Secured by x-admin-secret header (ADMIN_SECRET env).
 * Uses service role to bypass RLS when updating limits for any user.
 */

import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { z } from "zod";

const SetLimitsSchema = z.object({
  userId: z.string().uuid(),
  dailyScrapeLimit: z.number().int().min(1).max(1000).optional(),
  dailyAnalysisLimit: z.number().int().min(1).max(500).optional(),
});

function isAuthorized(request: NextRequest): boolean {
  const secret = process.env.ADMIN_SECRET ?? process.env.CRON_SECRET;
  const header = request.headers.get("x-admin-secret");
  return !!secret && header === secret;
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = request.nextUrl.searchParams.get("userId");
  if (!userId) {
    return NextResponse.json(
      { error: "userId query param required" },
      { status: 400 }
    );
  }

  try {
    const supabase = createServiceClient();
    const { data, error } = await supabase
      .from("user_usage_limits")
      .select("user_id, daily_scrape_limit, daily_analysis_limit, updated_at")
      .eq("user_id", userId)
      .maybeSingle();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      limits: data ?? null,
      defaults: data
        ? null
        : { dailyScrapeLimit: 10, dailyAnalysisLimit: 4 },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = SetLimitsSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { userId, dailyScrapeLimit, dailyAnalysisLimit } = parsed.data;

  if (!dailyScrapeLimit && !dailyAnalysisLimit) {
    return NextResponse.json(
      { error: "At least one of dailyScrapeLimit or dailyAnalysisLimit required" },
      { status: 400 }
    );
  }

  try {
    const supabase = createServiceClient();

    const { data: existing } = await supabase
      .from("user_usage_limits")
      .select("daily_scrape_limit, daily_analysis_limit")
      .eq("user_id", userId)
      .maybeSingle();

    const row = {
      user_id: userId,
      daily_scrape_limit:
        dailyScrapeLimit ?? existing?.daily_scrape_limit ?? 10,
      daily_analysis_limit:
        dailyAnalysisLimit ?? existing?.daily_analysis_limit ?? 4,
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await supabase
      .from("user_usage_limits")
      .upsert(row, { onConflict: "user_id" })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ updated: data });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
