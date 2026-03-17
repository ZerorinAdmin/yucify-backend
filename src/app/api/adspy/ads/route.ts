import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { ScrapedAd } from "@/lib/adspy/scraper";
import { isBackendConfigured, backendScrape } from "@/lib/adspy/backend-client";
import {
  getCachedAds,
  upsertCompetitor,
  upsertAds,
  logRequest,
  getPageName,
} from "@/lib/adspy/repository";
import { checkScrapeAllowed } from "@/lib/usage/limits";

const RATE_LIMIT_SEC = 10;

function formatAdsForResponse(ads: ScrapedAd[], pageName: string) {
  return ads
    .filter((ad) => ad.ad_text?.trim() || ad.image_url || ad.video_url || ad.carousel_urls?.length || ad.ad_snapshot_url)
    .map((ad) => ({
      ad_id: ad.ad_id,
      page_name: ad.page_name ?? pageName,
      ad_text: ad.ad_text,
      ad_headline: ad.ad_headline ?? null,
      ad_description: ad.ad_description ?? null,
      image_url: ad.image_url ?? ad.carousel_urls?.[0] ?? null,
      video_url: ad.video_url,
      carousel_urls: ad.carousel_urls ?? [],
      cta: ad.cta,
      start_date: ad.ad_start_date,
      snapshot_url: ad.ad_snapshot_url,
      display_format: ad.display_format ?? null,
      landing_page: ad.landing_page_url,
      is_active: ad.is_active ?? null,
      collation_id: ad.collation_id ?? null,
      collation_count: ad.collation_count ?? null,
      publisher_platforms: ad.publisher_platforms ?? null,
      industry: ad.industry ?? null,
    }));
}

const lastRequest = new Map<string, number>();

function checkRateLimit(userId: string): boolean {
  const now = Date.now();
  const last = lastRequest.get(userId) ?? 0;
  if (now - last < RATE_LIMIT_SEC * 1000) return false;
  lastRequest.set(userId, now);
  return true;
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!checkRateLimit(user.id)) {
    return NextResponse.json(
      { error: "Please wait 10 seconds between competitor analyses" },
      { status: 429 }
    );
  }

  const { searchParams } = new URL(req.url);
  const pageId = searchParams.get("page_id")?.trim();
  const countryParam = searchParams.get("country") ?? "US";
  const countryUpper = countryParam.toUpperCase();
  // Facebook Ads Library uses "ALL" for worldwide, not "WW"
  const country = countryUpper === "WW" || countryUpper === "WORLDWIDE" ? "ALL" : countryParam;
  const pageNameFallback = searchParams.get("page_name")?.trim();
  const fresh = searchParams.get("fresh") === "1";

  if (!pageId) {
    return NextResponse.json(
      { error: "page_id is required" },
      { status: 400 }
    );
  }

  const cached = fresh ? null : await getCachedAds(supabase, pageId);

  // Daily scrape limit: only enforce when we would actually scrape (cache miss)
  if (!cached) {
    const { allowed, used, limit } = await checkScrapeAllowed(supabase, user.id);
    if (!allowed) {
      return NextResponse.json(
        {
          error: "Daily search limit reached. Resets at midnight UTC.",
          used,
          limit,
        },
        { status: 429 }
      );
    }
  }

  if (cached) {
    await logRequest(supabase, user.id, pageId, "cache");
    const pageName = (await getPageName(supabase, pageId)) ?? pageNameFallback ?? "Unknown";
    return NextResponse.json({
      page_id: pageId,
      page_name: pageName,
      ads: formatAdsForResponse(cached.ads, pageName),
      source: "cache",
      scraped_at: cached.scrapedAt.toISOString(),
    });
  }

  if (!isBackendConfigured()) {
    return NextResponse.json(
      { error: "Scraper backend not configured. Set ADSPY_BACKEND_URL and ADSPY_BACKEND_SECRET." },
      { status: 503 }
    );
  }

  try {
    let result = await backendScrape(pageId, country);
    if (result.ads.length === 0 && country !== "ALL") {
      console.log("[adspy/ads] 0 ads for country=", country, ", retrying with country=ALL, active_status=all");
      result = await backendScrape(pageId, "ALL", "all");
    }

    if (result.ads.length === 0) {
      console.warn("[adspy/ads] Scraper returned 0 ads for page_id=", pageId, "- check terminal for diagnostics");
    }

    await upsertCompetitor(supabase, pageId, result.page_name);
    await upsertAds(supabase, pageId, result.ads);
    await logRequest(supabase, user.id, pageId, "scrape");

    return NextResponse.json({
      page_id: result.page_id,
      page_name: result.page_name,
      ads: formatAdsForResponse(result.ads, result.page_name),
      source: "scrape",
      scraped_at: new Date().toISOString(),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Scraping failed";
    console.error("[adspy/ads]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
