/**
 * Repository for competitor ads cache (per docs/scrapper.md).
 */

import { SupabaseClient } from "@supabase/supabase-js";
import type { ScrapedAd } from "./types";

const CACHE_HOURS = 24;

export async function getCachedAds(
  supabase: SupabaseClient,
  pageId: string
): Promise<{ ads: ScrapedAd[]; scrapedAt: Date } | null> {
  const cutoff = new Date();
  cutoff.setHours(cutoff.getHours() - CACHE_HOURS);

  const { data: latest } = await supabase
    .from("competitor_ads")
    .select("scraped_at")
    .eq("page_id", pageId)
    .order("scraped_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!latest) return null;

  const scrapedAt = new Date(latest.scraped_at);
  if (scrapedAt < cutoff) return null;

  const scrapedAtStr = latest.scraped_at;
  const { data: rows } = await supabase
    .from("competitor_ads")
    .select("ad_id, page_id, ad_text, ad_headline, ad_description, image_url, video_url, carousel_urls, cta, landing_page_url, ad_start_date, ad_snapshot_url, display_format, is_active, collation_id, collation_count, publisher_platforms, industry, scraped_at")
    .eq("page_id", pageId)
    .gte("scraped_at", scrapedAtStr)
    .lte("scraped_at", scrapedAtStr)
    .order("scraped_at", { ascending: false });

  if (!rows || rows.length === 0) return null;

  const ads: ScrapedAd[] = rows.map((r) => ({
    ad_id: r.ad_id,
    page_id: r.page_id,
    ad_text: r.ad_text ?? "",
    ad_headline: r.ad_headline ?? null,
    ad_description: r.ad_description ?? null,
    image_url: r.image_url,
    video_url: r.video_url,
    carousel_urls: Array.isArray(r.carousel_urls) ? (r.carousel_urls as string[]) : undefined,
    cta: r.cta,
    landing_page_url: r.landing_page_url,
    ad_start_date: r.ad_start_date,
    ad_snapshot_url: r.ad_snapshot_url,
    display_format: r.display_format ?? undefined,
    is_active: r.is_active ?? undefined,
    collation_id: r.collation_id ?? undefined,
    collation_count: r.collation_count ?? undefined,
    publisher_platforms: r.publisher_platforms ?? undefined,
    industry: r.industry ?? undefined,
  }));

  return { ads, scrapedAt };
}

export async function upsertCompetitor(
  supabase: SupabaseClient,
  pageId: string,
  pageName: string,
  pageIcon?: string
): Promise<void> {
  const { data: existing } = await supabase
    .from("competitors")
    .select("id")
    .eq("page_id", pageId)
    .maybeSingle();

  if (existing) {
    await supabase
      .from("competitors")
      .update({ page_name: pageName, page_icon: pageIcon })
      .eq("page_id", pageId);
  } else {
    await supabase.from("competitors").insert({
      page_id: pageId,
      page_name: pageName,
      page_icon: pageIcon,
    });
  }
}

export async function upsertAds(
  supabase: SupabaseClient,
  pageId: string,
  ads: ScrapedAd[]
): Promise<void> {
  const now = new Date().toISOString();
  const rows = ads.map((ad) => ({
    page_id: pageId,
    ad_id: ad.ad_id,
    ad_text: ad.ad_text,
    ad_headline: ad.ad_headline ?? null,
    ad_description: ad.ad_description ?? null,
    image_url: ad.image_url,
    video_url: ad.video_url,
    carousel_urls: ad.carousel_urls ?? [],
    cta: ad.cta,
    landing_page_url: ad.landing_page_url,
    ad_start_date: ad.ad_start_date,
    ad_snapshot_url: ad.ad_snapshot_url,
    display_format: ad.display_format ?? null,
    is_active: ad.is_active ?? null,
    collation_id: ad.collation_id ?? null,
    collation_count: ad.collation_count ?? null,
    publisher_platforms: ad.publisher_platforms ?? null,
    industry: ad.industry ?? null,
    scraped_at: now,
  }));

  await supabase.from("competitor_ads").upsert(rows, {
    onConflict: "ad_id",
    ignoreDuplicates: false,
  });
}

export async function logRequest(
  supabase: SupabaseClient,
  userId: string,
  pageId: string,
  source: "cache" | "scrape"
): Promise<void> {
  await supabase.from("competitor_requests").insert({
    user_id: userId,
    page_id: pageId,
    source,
  });
}

export async function getPageName(
  supabase: SupabaseClient,
  pageId: string
): Promise<string | null> {
  const { data } = await supabase
    .from("competitors")
    .select("page_name")
    .eq("page_id", pageId)
    .maybeSingle();
  return data?.page_name ?? null;
}
