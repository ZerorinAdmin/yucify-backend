/**
 * Daily usage limits: scrape and AI analysis.
 * Defaults: 4 scrapes/day, 3 analyses/day.
 * Per-user overrides in user_usage_limits table.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { UsageCheckResult, UserLimits } from "./types";

export const DEFAULT_SCRAPE_LIMIT = 4;
export const DEFAULT_ANALYSIS_LIMIT = 3;

function startOfDayUTC(): string {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d.toISOString();
}

export async function getUserLimits(
  supabase: SupabaseClient,
  userId: string
): Promise<UserLimits> {
  const { data } = await supabase
    .from("user_usage_limits")
    .select("daily_scrape_limit, daily_analysis_limit")
    .eq("user_id", userId)
    .maybeSingle();

  return {
    dailyScrapeLimit: data?.daily_scrape_limit ?? DEFAULT_SCRAPE_LIMIT,
    dailyAnalysisLimit: data?.daily_analysis_limit ?? DEFAULT_ANALYSIS_LIMIT,
  };
}

export async function getScrapeCountToday(
  supabase: SupabaseClient,
  userId: string
): Promise<number> {
  const startOfDay = startOfDayUTC();

  const { count, error } = await supabase
    .from("competitor_requests")
    .select("*", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("source", "scrape")
    .gte("created_at", startOfDay);

  if (error) {
    console.error("[usage] getScrapeCountToday error:", error.message);
    return 0;
  }
  return count ?? 0;
}

export async function getAnalysisCountToday(
  supabase: SupabaseClient,
  userId: string
): Promise<number> {
  const startOfDay = startOfDayUTC();

  const { count, error } = await supabase
    .from("ai_analysis_requests")
    .select("*", { count: "exact", head: true })
    .eq("user_id", userId)
    .gte("created_at", startOfDay);

  if (error) {
    console.error("[usage] getAnalysisCountToday error:", error.message);
    return 0;
  }
  return count ?? 0;
}

export async function checkScrapeAllowed(
  supabase: SupabaseClient,
  userId: string
): Promise<UsageCheckResult> {
  const [limits, used] = await Promise.all([
    getUserLimits(supabase, userId),
    getScrapeCountToday(supabase, userId),
  ]);

  const limit = limits.dailyScrapeLimit;
  const allowed = used < limit;
  const remaining = Math.max(0, limit - used);

  return { allowed, used, limit, remaining };
}

export async function checkAnalysisAllowed(
  supabase: SupabaseClient,
  userId: string
): Promise<UsageCheckResult> {
  const [limits, used] = await Promise.all([
    getUserLimits(supabase, userId),
    getAnalysisCountToday(supabase, userId),
  ]);

  const limit = limits.dailyAnalysisLimit;
  const allowed = used < limit;
  const remaining = Math.max(0, limit - used);

  return { allowed, used, limit, remaining };
}

export async function recordAnalysis(
  supabase: SupabaseClient,
  userId: string,
  pageId: string,
  pageName: string,
  adCount: number
): Promise<void> {
  const { error } = await supabase.from("ai_analysis_requests").insert({
    user_id: userId,
    page_id: pageId,
    page_name: pageName,
    ad_count: adCount,
  });

  if (error) {
    console.error("[usage] recordAnalysis error:", error.message);
  }
}
