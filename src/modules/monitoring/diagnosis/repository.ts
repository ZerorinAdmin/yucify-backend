import type { SupabaseClient } from "@supabase/supabase-js";
import type { CreativeRow, MetricDayRow } from "./normalize";

export async function fetchMetricsForRange(
  supabase: SupabaseClient,
  userId: string,
  adAccountId: string,
  from: string,
  to: string
): Promise<MetricDayRow[]> {
  const { data, error } = await supabase
    .from("ad_metrics")
    .select("ad_id, ad_name, date, spend, impressions, reach, clicks, ctr, cpc, frequency")
    .eq("user_id", userId)
    .eq("ad_account_id", adAccountId)
    .gte("date", from)
    .lte("date", to);

  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => ({
    ad_id: r.ad_id,
    ad_name: r.ad_name ?? "",
    date: String(r.date),
    spend: Number(r.spend),
    impressions: Number(r.impressions),
    reach: Number(r.reach),
    clicks: Number(r.clicks),
    ctr: Number(r.ctr),
    cpc: Number(r.cpc),
    frequency: Number(r.frequency),
  }));
}

export async function fetchDailyMetricsForAdsRange(
  supabase: SupabaseClient,
  userId: string,
  adAccountId: string,
  adIds: string[],
  from: string,
  to: string
): Promise<MetricDayRow[]> {
  if (adIds.length === 0) return [];
  const { data, error } = await supabase
    .from("ad_metrics")
    .select("ad_id, ad_name, date, spend, impressions, reach, clicks, ctr, cpc, frequency")
    .eq("user_id", userId)
    .eq("ad_account_id", adAccountId)
    .in("ad_id", adIds)
    .gte("date", from)
    .lte("date", to);

  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => ({
    ad_id: r.ad_id,
    ad_name: r.ad_name ?? "",
    date: String(r.date),
    spend: Number(r.spend),
    impressions: Number(r.impressions),
    reach: Number(r.reach),
    clicks: Number(r.clicks),
    ctr: Number(r.ctr),
    cpc: Number(r.cpc),
    frequency: Number(r.frequency),
  }));
}

export async function fetchCreativesForUser(
  supabase: SupabaseClient,
  userId: string
): Promise<CreativeRow[]> {
  const { data, error } = await supabase
    .from("ad_creatives")
    .select(
      "ad_id, creative_type, body, headline, description, cta_type, link_url, thumbnail_url, image_url, video_url, carousel_urls"
    )
    .eq("user_id", userId);

  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => {
    const raw = r.carousel_urls;
    const carousel_urls = Array.isArray(raw)
      ? raw.filter((u): u is string => typeof u === "string")
      : [];
    return {
      ad_id: r.ad_id,
      creative_type: r.creative_type ?? "unknown",
      body: r.body,
      headline: (r as { headline?: string | null }).headline ?? "",
      description: (r as { description?: string | null }).description ?? "",
      cta_type: (r as { cta_type?: string | null }).cta_type ?? "",
      link_url: (r as { link_url?: string | null }).link_url ?? "",
      thumbnail_url: r.thumbnail_url ?? null,
      image_url: r.image_url ?? null,
      video_url: (r as { video_url?: string | null }).video_url ?? null,
      carousel_urls,
    };
  });
}

export async function fetchConversionActionsForRange(
  supabase: SupabaseClient,
  userId: string,
  from: string,
  to: string
): Promise<{ ad_id: string; action_type: string; action_count: number }[]> {
  const { data, error } = await supabase
    .from("ad_actions")
    .select("ad_id, action_type, action_count")
    .eq("user_id", userId)
    .gte("date", from)
    .lte("date", to);

  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => ({
    ad_id: r.ad_id,
    action_type: r.action_type,
    action_count: Number(r.action_count),
  }));
}
