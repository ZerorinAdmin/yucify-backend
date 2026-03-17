/**
 * Facebook Ads Library scraper (per docs/scrapper.md).
 *
 * Architecture: DOM extraction from main list page (no snapshot fetches).
 * - Load page, scroll to trigger lazy-loaded ads, extract from rendered DOM
 * - HTML fallback when DOM returns 0 ads; merge from HTML for missing description/CTA/media
 * - CDN correlation for ads without media (network capture during load)
 *
 * searchPages() still uses GraphQL for advertiser suggestions.
 * Persistent profile: ADSPY_FACEBOOK_PROFILE, ADSPY_HEADLESS=false for login setup.
 */

import { chromium } from "playwright";
import type { BrowserContext, Page } from "playwright";
import path from "path";
import {
  extractAdvertisersFromGraphQL,
  extractAdsFromGraphQL,
  extractAdsFromInlineGraphQLHtml,
  extractAdsFromHtml,
  extractAdFromSnapshotPage,
  cleanAdText,
  filterMetadataFromAdText,
  getFirstAdChunkForDebug,
  diagnoseAdChunkOverlap,
  extractAdsFromDomInPage,
  correlateUrlsToAdIds,
  isAdMediaUrlForNetwork,
  isInvalidCta,
  extractMediaFromAdDetailHtml,
  extractCarouselFromSnapshotDom,
  extractVariationFromDetailDom,
  type DomExtractedAd,
} from "./ads-library-extract";
import type { DebugSource, ScrapedAd } from "./types";

const USER_AGENTS = [
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Safari/605.1.15",
];

const SCROLL_DELAY_MS = 3000 + Math.random() * 2000; // 3–5 sec (anti-block)
const MAX_ADS = 50;
const MAX_PAGE_SUGGESTIONS = 20;

// Fallback page IDs for common brands when scraping returns empty (e.g. login wall)
const KNOWN_PAGES: Record<string, { page_id: string; page_name: string; verified_status?: boolean }> = {
  nike: { page_id: "15087023444", page_name: "Nike", verified_status: true },
  "coca-cola": { page_id: "40796308305", page_name: "Coca-Cola", verified_status: true },
  adidas: { page_id: "205865296158", page_name: "adidas", verified_status: true },
};

function randomUserAgent(): string {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** Simple hash for synthetic ad IDs when DOM has media but no ad_archive_id. */
function simpleHash(s: string): string {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h << 5) - h + s.charCodeAt(i);
    h = h & h;
  }
  return Math.abs(h).toString(16).slice(0, 8);
}

const PROFILE_PATH = process.env.ADSPY_FACEBOOK_PROFILE;
const HEADLESS = process.env.ADSPY_HEADLESS !== "false";

/**
 * Create browser context. Uses persistent profile if ADSPY_FACEBOOK_PROFILE is set.
 * Set ADSPY_HEADLESS=false for one-time login setup (browser opens visible).
 */
async function createContext(): Promise<{
  context: BrowserContext;
  close: () => Promise<void>;
}> {
  const stealthArgs = [
    "--no-sandbox",
    "--disable-setuid-sandbox",
    "--disable-blink-features=AutomationControlled",
    "--disable-dev-shm-usage",
  ];

  if (PROFILE_PATH) {
    console.log("[adspy] Using persistent Facebook profile");
    const resolved = path.resolve(process.cwd(), PROFILE_PATH);
    const context = await chromium.launchPersistentContext(resolved, {
      headless: HEADLESS,
      args: stealthArgs,
      viewport: { width: 1280, height: 900 },
      locale: "en-US",
      userAgent: randomUserAgent(),
      extraHTTPHeaders: { "Accept-Language": "en-US,en;q=0.9" },
    });
    return {
      context,
      close: () => context.close(),
    };
  }

  const browser = await chromium.launch({
    headless: HEADLESS,
    args: stealthArgs,
  });
  const context = await browser.newContext({
    userAgent: randomUserAgent(),
    viewport: { width: 1280, height: 900 },
    locale: "en-US",
    extraHTTPHeaders: { "Accept-Language": "en-US,en;q=0.9" },
  });
  return {
    context,
    close: () => browser.close(),
  };
}

/** When using persistent profile, verify session is loaded before scraping. */
async function verifyLoginStatus(page: Page): Promise<void> {
  if (!PROFILE_PATH) return;
  await page.goto("https://www.facebook.com", {
    waitUntil: "domcontentloaded",
    timeout: 45000,
  });
  await delay(2000);
  let count = await page.locator('[aria-label="Your profile"]').count();

  // Setup mode (headless=false) and not logged in: wait for user to log in manually
  if (!HEADLESS && count === 0) {
    console.log("[adspy] Not logged in. Log in to Facebook in the browser (waiting up to 3 minutes)...");
    try {
      await page.locator('[aria-label="Your profile"]').first().waitFor({ state: "visible", timeout: 180_000 });
      console.log("[adspy] Login detected. Proceeding.");
      count = 1;
    } catch {
      console.log("[adspy] Timeout. Proceeding without login (ads may not load).");
    }
  }

  console.log("[adspy] Logged in:", count > 0);
}

export type PageSuggestion = {
  page_id: string;
  page_name: string;
  page_icon?: string;
  verified_status?: boolean;
};

/** Source of each field when ADSPY_DEBUG_SOURCE=1. */
type GraphqlExtractedAd = ReturnType<typeof extractAdsFromGraphQL>[number];

/**
 * Search Ads Library for page suggestions by keyword.
 * GraphQL only: intercept responses, scroll to trigger more requests.
 */
export async function searchPages(
  query: string,
  country: string = "US"
): Promise<PageSuggestion[]> {
  const { context, close } = await createContext();
  const graphqlAdvertisers: { page_id: string; page_name?: string; page_icon?: string }[] = [];

  try {
    const page = await context.newPage();
    await verifyLoginStatus(page);

    page.on("response", async (res) => {
      if (!res.url().includes("graphql")) return;
      try {
        const json = await res.json().catch(() => null);
        if (!json) return;
        const advertisers = extractAdvertisersFromGraphQL(json);
        for (const a of advertisers) {
          if (a.page_id && !graphqlAdvertisers.some((x) => x.page_id === a.page_id)) {
            graphqlAdvertisers.push({ page_id: a.page_id, page_name: a.page_name, page_icon: a.page_icon });
          }
        }
      } catch {
        // ignore
      }
    });

    const url = `https://www.facebook.com/ads/library/?active_status=all&ad_type=all&country=${country}&media_type=all&q=${encodeURIComponent(query)}&search_type=keyword`;

    const graphqlPromise = page.waitForResponse(
      (res) => res.url().includes("graphql") && res.request().method() === "POST",
      { timeout: 8000 }
    );
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45000 });
    await graphqlPromise;
    await delay(1500);

    // Scroll to trigger more GraphQL requests (lazy-loaded advertiser results)
    for (let i = 0; i < 8; i++) {
      await page.evaluate(() => window.scrollBy(0, 600));
      await delay(SCROLL_DELAY_MS);
    }

    const uniqueAdvertisers = new Map<string, { page_id: string; page_name?: string; page_icon?: string }>();
    for (const adv of graphqlAdvertisers) {
      const existing = uniqueAdvertisers.get(adv.page_id);
      if (!existing) {
        uniqueAdvertisers.set(adv.page_id, adv);
      } else if ((adv.page_name || adv.page_icon) && (!existing.page_name || !existing.page_icon)) {
        uniqueAdvertisers.set(adv.page_id, { ...existing, ...adv });
      }
    }

    const pages: PageSuggestion[] = [];
    for (const a of uniqueAdvertisers.values()) {
      if (a.page_id.length < 5) continue;
      pages.push({
        page_id: a.page_id,
        page_name: a.page_name?.trim().slice(0, 100) || "Advertiser",
        page_icon: a.page_icon,
        verified_status: undefined,
      });
      if (pages.length >= MAX_PAGE_SUGGESTIONS) break;
    }

    // Fallback: known pages for common brands when GraphQL returns empty (e.g. login wall)
    if (pages.length === 0) {
      const key = query.toLowerCase().trim().replace(/\s+/g, "-");
      const known = KNOWN_PAGES[key];
      if (known) return [known];
      for (const [k, v] of Object.entries(KNOWN_PAGES)) {
        if (key.includes(k) || k.includes(key)) return [v];
      }
    }

    return pages;
  } finally {
    await close();
  }
}

export type ScrapePageAdsOptions = {
  activeStatus?: "active" | "all";
  /** Enable source tracing (_debug_source on each ad). Overrides ADSPY_DEBUG_SOURCE env. */
  debugSource?: boolean;
};

function inferDisplayFormat(ad: {
  display_format?: string | null;
  video_url?: string | null;
  carousel_urls?: string[];
  image_url?: string | null;
}): string | null {
  if (ad.display_format?.trim()) return ad.display_format;
  if (ad.video_url) return "VIDEO";
  if ((ad.carousel_urls?.length ?? 0) > 1) return "CAROUSEL";
  if (ad.image_url || (ad.carousel_urls?.length ?? 0) === 1) return "IMAGE";
  return null;
}

function looksLikeRepeatedAdCopy(text: string | null | undefined): boolean {
  const normalized = text?.replace(/\s+/g, " ").trim();
  if (!normalized) return false;
  if (normalized.length < 80) return false;
  const half = Math.floor(normalized.length / 2);
  const first = normalized.slice(0, half).trim();
  const second = normalized.slice(half).trim();
  return first.length > 20 && second.length > 20 && (second.includes(first.slice(0, Math.min(40, first.length))) || normalized.split("!").length > 3);
}

function collapseRepeatedAdCopy(text: string | null | undefined): string {
  const normalized = text?.replace(/\s+/g, " ").trim();
  if (!normalized) return "";
  if (!looksLikeRepeatedAdCopy(normalized)) return normalized;

  const lengths = [Math.floor(normalized.length / 3), Math.floor(normalized.length / 2)];
  for (const len of lengths) {
    if (len < 30 || len >= normalized.length) continue;
    const chunk = normalized.slice(0, len).trim();
    if (!chunk) continue;
    const repeated = chunk.repeat(Math.ceil(normalized.length / chunk.length)).slice(0, normalized.length);
    if (repeated.includes(normalized.slice(0, Math.min(40, normalized.length)))) {
      return chunk;
    }
  }

  const sentences = normalized
    .split(/(?<=[.!?।])\s+/)
    .map((part) => part.trim())
    .filter(Boolean);
  const deduped: string[] = [];
  const seen = new Set<string>();
  for (const sentence of sentences) {
    const key = sentence.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(sentence);
  }
  return deduped.join(" ").trim() || normalized;
}

function sanitizeRecoveredVariationText(text: string | null | undefined): string {
  const collapsed = collapseRepeatedAdCopy(text);
  if (!collapsed) return "";

  const withoutDomainPrefix = collapsed
    .replace(/^(?:https?:\/\/)?(?:www\.)?[a-z0-9.-]+\.(?:com|in|net|org|io|co)(?:\/\S*)?\s+/i, "")
    .trim();

  const sentences = withoutDomainPrefix
    .split(/(?<=[.!?।])\s+/)
    .map((part) => part.trim())
    .filter(Boolean);

  const cleaned: string[] = [];
  const seen = new Set<string>();
  for (const sentence of sentences) {
    const key = sentence.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    cleaned.push(sentence);
  }

  return cleaned.join(" ").trim() || withoutDomainPrefix;
}

function mergeGraphqlAd(base: GraphqlExtractedAd, incoming: GraphqlExtractedAd): GraphqlExtractedAd {
  const mergedCarousel = [...new Set([...(base.carousel_urls ?? []), ...(incoming.carousel_urls ?? [])])];
  const mergedPlatforms = [...new Set([...(base.publisher_platforms ?? []), ...(incoming.publisher_platforms ?? [])])];

  const merged: GraphqlExtractedAd = {
    ...base,
    ...incoming,
    ad_text:
      incoming.ad_text?.trim().length && incoming.ad_text.trim().length >= base.ad_text.trim().length
        ? incoming.ad_text
        : base.ad_text,
    ad_headline:
      incoming.ad_headline?.trim().length && incoming.ad_headline.trim().length >= (base.ad_headline?.trim().length ?? 0)
        ? incoming.ad_headline
        : base.ad_headline,
    ad_description:
      incoming.ad_description?.trim().length && incoming.ad_description.trim().length >= (base.ad_description?.trim().length ?? 0)
        ? incoming.ad_description
        : base.ad_description,
    image_url:
      incoming.image_url ??
      (mergedCarousel.length > (base.carousel_urls?.length ?? 0) ? mergedCarousel[0] ?? null : base.image_url) ??
      base.image_url,
    video_url: incoming.video_url ?? base.video_url,
    carousel_urls: mergedCarousel,
    cta: incoming.cta ?? base.cta,
    landing_page_url: incoming.landing_page_url ?? base.landing_page_url,
    ad_start_date: incoming.ad_start_date ?? base.ad_start_date,
    display_format:
      incoming.video_url || base.video_url
        ? "VIDEO"
        : incoming.display_format === "CAROUSEL" ||
            (base.display_format !== "CAROUSEL" && mergedCarousel.length > 1)
          ? "CAROUSEL"
          : incoming.display_format ?? base.display_format,
    page_name: incoming.page_name ?? base.page_name,
    is_active: incoming.is_active ?? base.is_active,
    collation_id: incoming.collation_id ?? base.collation_id,
    collation_count: incoming.collation_count ?? base.collation_count,
    publisher_platforms: mergedPlatforms.length > 0 ? mergedPlatforms : (incoming.publisher_platforms ?? base.publisher_platforms),
  };

  if (!merged.display_format) {
    merged.display_format = inferDisplayFormat(merged);
  }
  if (!merged.image_url && mergedCarousel.length > 0) {
    merged.image_url = mergedCarousel[0];
  }
  return merged;
}

/**
 * Scrape ads for a specific page from Ads Library.
 * Architecture: DOM extraction from main list page (no snapshot fetches).
 * - Load page, scroll to trigger lazy-loaded ads, extract from rendered DOM
 * - HTML fallback when DOM returns 0 ads; merge from HTML for missing description/CTA/media
 */
export async function scrapePageAds(
  pageId: string,
  country: string = "US",
  options: ScrapePageAdsOptions = {}
): Promise<{ page_id: string; page_name: string; ads: ScrapedAd[]; data_source?: "graphql" | "dom" | "html" }> {
  const { activeStatus = "active", debugSource: optDebugSource } = options;
  const DEBUG_SOURCE = process.env.ADSPY_DEBUG_SOURCE === "1" || optDebugSource === true;
  const { context, close } = await createContext();

  try {
    const page = await context.newPage();
    await verifyLoginStatus(page);

    const networkMediaUrls: string[] = [];
    const graphqlAds: GraphqlExtractedAd[] = [];
    page.on("response", async (response) => {
      const u = response.url();
      if (
        (u.includes("fbcdn.net") || u.includes("scontent") || u.includes("video.xx.fbcdn.net")) &&
        isAdMediaUrlForNetwork(u)
      ) {
        if (!networkMediaUrls.includes(u)) networkMediaUrls.push(u);
      }
      if (u.includes("graphql") && response.request().method() === "POST") {
        try {
          const json = await response.json().catch(() => null);
          if (json) {
            const extracted = extractAdsFromGraphQL(json, pageId);
            for (const ad of extracted) {
              const existingIndex = graphqlAds.findIndex((a) => a.ad_id === ad.ad_id);
              if (existingIndex === -1) graphqlAds.push(ad);
              else graphqlAds[existingIndex] = mergeGraphqlAd(graphqlAds[existingIndex], ad);
            }
          }
        } catch {
          // ignore
        }
      }
    });

    const url = `https://www.facebook.com/ads/library/?active_status=${activeStatus}&ad_type=all&country=${country}&is_targeted_country=false&media_type=all&search_type=page&sort_data[direction]=desc&sort_data[mode]=total_impressions&source=fb-logo&view_all_page_id=${pageId}`;

    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
    await delay(2000);

    try {
      const acceptBtn = page.locator('[data-cookiebanner="accept_button"]').first();
      await acceptBtn.click({ timeout: 2000 });
      await delay(1000);
    } catch {
      // No overlay
    }

    await page
      .waitForFunction(
        () =>
          document.documentElement.innerHTML.includes('"ad_archive_id"') ||
          document.querySelectorAll('a[href*="ads/library"]').length > 0,
        { timeout: 25000 }
      )
      .then(() => console.log("[adspy] Ads feed mounted"))
      .catch(() => null);

    await delay(2000);
    try {
      await page.waitForLoadState("networkidle", { timeout: 15000 });
    } catch {
      // Continue
    }
    await delay(2000);

    const scrollRounds = 6;
    for (let i = 0; i < scrollRounds; i++) {
      await page.mouse.wheel(0, 2000);
      await delay(800);
    }

    await page.evaluate(() => {
      document.querySelectorAll("img").forEach((img) => {
        (img as HTMLImageElement).loading = "eager";
        (img as HTMLImageElement).decoding = "sync";
      });
    });
    for (let i = 0; i < 3; i++) {
      await page.evaluate(() => window.scrollBy(0, 600));
      await delay(600);
    }
    await delay(2000);

    const pageNameEl = await page.$('[role="main"] [dir="auto"]');
    const pageName = pageNameEl ? (await pageNameEl.textContent())?.trim()?.slice(0, 100) ?? "Unknown" : "Unknown";

    let ads: ScrapedAd[] = [];
    let dataSource: "graphql" | "dom" | "html" = "dom";

    let domAds: DomExtractedAd[] = [];
    try {
      domAds = (await page.evaluate(extractAdsFromDomInPage)) ?? [];
    } catch (e) {
      console.warn("[adspy] DOM extraction failed:", e instanceof Error ? e.message : String(e));
    }

    const html = await page.content();
    const inlineGraphqlAds = extractAdsFromInlineGraphQLHtml(html, pageId);
    for (const ad of inlineGraphqlAds) {
      const existingIndex = graphqlAds.findIndex((a) => a.ad_id === ad.ad_id);
      if (existingIndex === -1) graphqlAds.push(ad);
      else graphqlAds[existingIndex] = mergeGraphqlAd(graphqlAds[existingIndex], ad);
    }
    const htmlAds = extractAdsFromHtml(html, pageId);

    const domAdsWithId = domAds.filter((d) => d.ad_id);

    // Prefer GraphQL when it has ads (most reliable source; snapshot fetch fills gaps)
    const preferGraphQL = graphqlAds.length > 0;

    // Prefer HTML when it has more ads (DOM often finds few due to link structure) or when DOM has no ad_ids
    const preferHtml =
      !preferGraphQL &&
      (domAdsWithId.length === 0 || (htmlAds.length > domAdsWithId.length && htmlAds.length >= 3));

    if (preferGraphQL) {
      dataSource = "graphql";
      for (const g of graphqlAds.slice(0, MAX_ADS)) {
        ads.push({
          ad_id: g.ad_id,
          page_id: pageId,
          page_name: g.page_name ?? pageName,
          ad_text: cleanAdText(filterMetadataFromAdText(g.ad_text)),
          ad_headline: g.ad_headline ? cleanAdText(filterMetadataFromAdText(g.ad_headline)) : null,
          ad_description: g.ad_description ? cleanAdText(filterMetadataFromAdText(g.ad_description)) : null,
          image_url: g.image_url ?? g.carousel_urls?.[0] ?? null,
          video_url: g.video_url ?? null,
          carousel_urls: g.carousel_urls?.length ? g.carousel_urls : undefined,
          cta: isInvalidCta(g.cta) ? null : (g.cta ?? null),
          landing_page_url: g.landing_page_url ?? null,
          ad_start_date: g.ad_start_date ?? null,
          ad_snapshot_url: `https://www.facebook.com/ads/library/?id=${g.ad_id}`,
          display_format: inferDisplayFormat(g),
          is_active: g.is_active ?? null,
          collation_id: g.collation_id ?? null,
          collation_count: g.collation_count ?? null,
          publisher_platforms: g.publisher_platforms ?? null,
          industry: null,
          ...(DEBUG_SOURCE && {
            _debug_source: {
              ad_text: "graphql",
              ad_headline: g.ad_headline ? "graphql" : undefined,
              ad_description: g.ad_description ? "graphql" : undefined,
              image_url: g.image_url ?? g.carousel_urls?.[0] ? "graphql" : undefined,
              video_url: g.video_url ? "graphql" : undefined,
              carousel_urls: g.carousel_urls?.length ? "graphql" : undefined,
              cta: g.cta ? "graphql" : undefined,
            },
          }),
        });
      }
      console.log("[adspy] GraphQL extraction:", ads.length, "ads");
    } else if (!preferHtml && domAdsWithId.length > 0) {
      for (const d of domAdsWithId) {
        ads.push({
          ad_id: d.ad_id!,
          page_id: pageId,
          page_name: pageName,
          ad_text: cleanAdText(filterMetadataFromAdText(d.ad_text ?? "")),
          ad_headline: null,
          ad_description: null,
          image_url: d.image_url ?? d.carousel_urls?.[0] ?? null,
          video_url: d.video_url ?? null,
          carousel_urls: d.carousel_urls?.length ? d.carousel_urls : undefined,
          cta: isInvalidCta(d.cta) ? null : (d.cta ?? null),
          landing_page_url: d.landing_page_url ?? null,
          ad_start_date: d.ad_start_date ?? null,
          ad_snapshot_url: `https://www.facebook.com/ads/library/?id=${d.ad_id}`,
          display_format: inferDisplayFormat(d),
          is_active: null,
          collation_id: null,
          collation_count: null,
          publisher_platforms: null,
          industry: null,
          ...(DEBUG_SOURCE && {
            _debug_source: {
              ad_text: "dom",
              image_url: d.image_url ?? d.carousel_urls?.[0] ? "dom" : undefined,
              video_url: d.video_url ? "dom" : undefined,
              carousel_urls: d.carousel_urls?.length ? "dom" : undefined,
              cta: d.cta ? "dom" : undefined,
            },
          }),
        });
      }
      console.log("[adspy] DOM extraction:", ads.length, "ads");
    } else if (htmlAds.length > 0) {
      // Links lack id param – use HTML (ad_archive_id in JSON) for full ad count
      dataSource = "html";
      for (const h of htmlAds.slice(0, MAX_ADS)) {
        ads.push({
          ad_id: h.ad_id,
          page_id: pageId,
          page_name: pageName,
          ad_text: cleanAdText(filterMetadataFromAdText(h.ad_text)),
          ad_headline: h.ad_headline ? cleanAdText(filterMetadataFromAdText(h.ad_headline)) : null,
          ad_description: h.ad_description ? cleanAdText(filterMetadataFromAdText(h.ad_description)) : null,
          image_url: h.image_url ?? h.carousel_urls?.[0] ?? null,
          video_url: h.video_url ?? null,
          carousel_urls: h.carousel_urls?.length ? h.carousel_urls : undefined,
          cta: isInvalidCta(h.cta) ? null : (h.cta ?? null),
          landing_page_url: h.landing_page_url ?? null,
          ad_start_date: h.ad_start_date ?? null,
          ad_snapshot_url: `https://www.facebook.com/ads/library/?id=${h.ad_id}`,
          display_format: inferDisplayFormat(h),
          is_active: null,
          collation_id: h.collation_id ?? null,
          collation_count: h.collation_count ?? null,
          publisher_platforms: h.publisher_platforms ?? null,
          industry: null,
          ...(DEBUG_SOURCE && {
            _debug_source: {
              ad_text: "html",
              ad_headline: h.ad_headline ? "html" : undefined,
              ad_description: h.ad_description ? "html" : undefined,
              image_url: h.image_url ?? h.carousel_urls?.[0] ? "html" : undefined,
              video_url: h.video_url ? "html" : undefined,
              carousel_urls: h.carousel_urls?.length ? "html" : undefined,
              cta: h.cta ? "html" : undefined,
            },
          }),
        });
      }
      console.log("[adspy] HTML extraction (links lack id):", ads.length, "ads");
    } else {
      // Fallback: DOM with media but no ad_id (synthetic IDs)
      const domAdsWithMedia = domAds.filter(
        (d) => d.image_url || (d.carousel_urls?.length ?? 0) > 0 || d.video_url
      );
      if (domAdsWithMedia.length > 0) {
        for (let i = 0; i < domAdsWithMedia.length; i++) {
          const d = domAdsWithMedia[i];
          const firstMedia = d.image_url ?? d.carousel_urls?.[0] ?? d.video_url ?? "";
          const syntheticId = `dom-${pageId}-${i}-${simpleHash(firstMedia || d.ad_text || String(i))}`;
          ads.push({
            ad_id: syntheticId,
            page_id: pageId,
            page_name: pageName,
            ad_text: cleanAdText(filterMetadataFromAdText(d.ad_text ?? "")),
            ad_headline: null,
            ad_description: null,
            image_url: d.image_url ?? d.carousel_urls?.[0] ?? null,
            video_url: d.video_url ?? null,
            carousel_urls: d.carousel_urls?.length ? d.carousel_urls : undefined,
            cta: isInvalidCta(d.cta) ? null : (d.cta ?? null),
            landing_page_url: d.landing_page_url ?? null,
            ad_start_date: d.ad_start_date ?? null,
            ad_snapshot_url: `https://www.facebook.com/ads/library/?view_all_page_id=${pageId}`,
            display_format: inferDisplayFormat(d),
            is_active: null,
            collation_id: null,
            collation_count: null,
            publisher_platforms: null,
            industry: null,
            ...(DEBUG_SOURCE && {
              _debug_source: {
                ad_text: "dom",
                image_url: d.image_url ?? d.carousel_urls?.[0] ? "dom" : undefined,
                video_url: d.video_url ? "dom" : undefined,
                carousel_urls: d.carousel_urls?.length ? "dom" : undefined,
                cta: d.cta ? "dom" : undefined,
              },
            }),
          });
        }
        console.log("[adspy] DOM fallback (no ad_id):", ads.length, "ads with media");
      }
    }

    const adsWithoutMedia = ads.filter(
      (a) => !a.image_url && !a.video_url && (a.carousel_urls?.length ?? 0) === 0
    );
    if (adsWithoutMedia.length > 0 && networkMediaUrls.length > 0) {
      try {
        const adIdsForCorrelation = htmlAds.map((h) => h.ad_id);
        const correlation = (await page.evaluate(
          correlateUrlsToAdIds,
          { capturedUrls: networkMediaUrls, adIdsInOrder: adIdsForCorrelation }
        )) as Record<string, { image_url?: string; video_url?: string; carousel_urls: string[] }>;
        let correlated = 0;
        for (const ad of adsWithoutMedia) {
          const media = correlation[ad.ad_id];
          if (media && (media.image_url || media.video_url || (media.carousel_urls?.length ?? 0) > 0)) {
            ad.image_url = media.image_url ?? media.carousel_urls?.[0] ?? null;
            ad.video_url = media.video_url ?? null;
            ad.carousel_urls = media.carousel_urls ?? (ad.image_url ? [ad.image_url] : []);
            if (DEBUG_SOURCE && ad._debug_source) {
              if (ad.image_url) ad._debug_source.image_url = "cdn_correlation";
              if (ad.video_url) ad._debug_source.video_url = "cdn_correlation";
              if ((ad.carousel_urls?.length ?? 0) > 0) ad._debug_source.carousel_urls = "cdn_correlation";
            }
            correlated++;
          }
        }
        if (correlated > 0) {
          console.log("[adspy] CDN correlation:", correlated, "ads matched");
        }
        // Positional fallback: assign network URLs by order when correlation missed ads (e.g. ad_id not in DOM)
        const stillWithoutMedia = ads.filter(
          (a) => !a.image_url && !a.video_url && (a.carousel_urls?.length ?? 0) === 0
        );
        if (stillWithoutMedia.length > 0 && networkMediaUrls.length > 0) {
          const imageUrls = networkMediaUrls.filter(
            (u) =>
              isAdMediaUrlForNetwork(u) &&
              !u.includes("video.") &&
              !/\.(mp4|webm)(\?|&|$)/i.test(u)
          );
          const videoUrls = networkMediaUrls.filter(
            (u) => u.includes("video.") || /\.(mp4|webm)(\?|&|$)/i.test(u)
          );
          for (let i = 0; i < stillWithoutMedia.length; i++) {
            if (i < imageUrls.length) {
              stillWithoutMedia[i].image_url = imageUrls[i];
              stillWithoutMedia[i].carousel_urls = [imageUrls[i]];
              if (DEBUG_SOURCE && stillWithoutMedia[i]._debug_source) {
                stillWithoutMedia[i]._debug_source!.image_url = "positional";
                stillWithoutMedia[i]._debug_source!.carousel_urls = "positional";
              }
            }
            if (i < videoUrls.length && !stillWithoutMedia[i].video_url) {
              stillWithoutMedia[i].video_url = videoUrls[i];
              if (DEBUG_SOURCE && stillWithoutMedia[i]._debug_source) {
                stillWithoutMedia[i]._debug_source!.video_url = "positional";
              }
            }
          }
        }
      } catch (e) {
        if (process.env.ADSPY_DEBUG === "true") {
          console.warn("[adspy] CDN correlation failed:", e);
        }
      }
    }

    const adsNeedingMerge = ads.filter(
      (a) =>
        !a.ad_text?.trim() ||
        !a.video_url ||
        (a.carousel_urls?.length ?? 0) <= 1 ||
        isInvalidCta(a.cta)
    );
    if (adsNeedingMerge.length > 0) {
      try {
        const byAdId = new Map(htmlAds.map((h) => [h.ad_id, h]));
        const isMetadataHeavy = (t: string) =>
          !t?.trim() ||
          /^(Sort|Filters|Remove|Active status)/i.test(t.trim()) ||
          /SortSort|FiltersSort|Remove Filters/i.test(t);
        for (const ad of adsNeedingMerge) {
          const htmlAd = byAdId.get(ad.ad_id);
          if (!htmlAd) continue;
          if ((!ad.ad_text?.trim() || isMetadataHeavy(ad.ad_text)) && htmlAd.ad_text?.trim()) {
            ad.ad_text = cleanAdText(filterMetadataFromAdText(htmlAd.ad_text));
            if (DEBUG_SOURCE && ad._debug_source) ad._debug_source.ad_text = "merge";
          }
          if (!ad.ad_headline?.trim() && htmlAd.ad_headline?.trim()) {
            ad.ad_headline = cleanAdText(filterMetadataFromAdText(htmlAd.ad_headline));
            if (DEBUG_SOURCE && ad._debug_source) ad._debug_source.ad_headline = "merge";
          }
          if (!ad.ad_description?.trim() && htmlAd.ad_description?.trim()) {
            ad.ad_description = cleanAdText(filterMetadataFromAdText(htmlAd.ad_description));
            if (DEBUG_SOURCE && ad._debug_source) ad._debug_source.ad_description = "merge";
          }
          if (!ad.video_url && htmlAd.video_url) {
            ad.video_url = htmlAd.video_url;
            if (DEBUG_SOURCE && ad._debug_source) ad._debug_source.video_url = "html";
          }
          if ((ad.carousel_urls?.length ?? 0) <= 1 && (htmlAd.carousel_urls?.length ?? 0) > 1) {
            ad.carousel_urls = htmlAd.carousel_urls;
            if (DEBUG_SOURCE && ad._debug_source) ad._debug_source.carousel_urls = "html";
          }
          if (isInvalidCta(ad.cta) && htmlAd.cta?.trim() && !isInvalidCta(htmlAd.cta)) {
            ad.cta = htmlAd.cta;
            if (DEBUG_SOURCE && ad._debug_source) ad._debug_source.cta = "merge";
          }
          if (!ad.landing_page_url && htmlAd.landing_page_url) ad.landing_page_url = htmlAd.landing_page_url;
          if (!ad.ad_start_date && htmlAd.ad_start_date) ad.ad_start_date = htmlAd.ad_start_date;
          if (!ad.publisher_platforms?.length && htmlAd.publisher_platforms?.length) {
            ad.publisher_platforms = htmlAd.publisher_platforms;
          }
          if (!ad.display_format && htmlAd.display_format) ad.display_format = htmlAd.display_format;
        }
        // Avoid positional text fallback here: if one source is missing/extra ads, order-based
        // merging can attach another ad's copy to the current ad.
      } catch (e) {
        if (process.env.ADSPY_DEBUG === "true") {
          console.warn("[adspy] HTML merge failed:", e);
        }
      }
    }

    // Snapshot fetch is opt-in for broad recovery, but certain DCO / multi-version ads are only
    // fully represented on the detail page ("See ad details"). For those hidden variations we do
    // a very small targeted recovery pass so we don't mislabel videos as carousels.
    const fetchSnapshot = process.env.ADSPY_FETCH_SNAPSHOT === "true";
    const needsSnapshot = (a: ScrapedAd) =>
      (a.ad_snapshot_url?.includes("id=") ?? false) &&
      (a.ad_id?.startsWith("dom-") ? false : true) &&
      ((!a.image_url && !a.video_url && (a.carousel_urls?.length ?? 0) === 0) ||
        (a.carousel_urls?.length ?? 0) <= 1 ||
        !a.ad_text?.trim() ||
        !a.ad_start_date ||
        isInvalidCta(a.cta));
    const needsVariationSnapshot = (a: ScrapedAd) =>
      (a.ad_snapshot_url?.includes("id=") ?? false) &&
      !(a.ad_id?.startsWith("dom-") ?? false) &&
      (a.display_format === "DCO" || (a.collation_count ?? 0) > 1) &&
      (!a.video_url || !a.ad_text?.trim() || looksLikeRepeatedAdCopy(a.ad_text) || (a.carousel_urls?.length ?? 0) > 1);
    const targetedVariationFetch = ads.filter(needsVariationSnapshot).slice(0, 3);
    const broadRecoveryFetch = fetchSnapshot ? ads.filter(needsSnapshot).slice(0, 5) : [];
    const byAdId = new Map<string, ScrapedAd>();
    for (const ad of [...targetedVariationFetch, ...broadRecoveryFetch]) {
      byAdId.set(ad.ad_id, ad);
    }
    const toFetch = [...byAdId.values()];
    if (toFetch.length > 0) {
      for (const ad of toFetch) {
        try {
          const suspiciousVariation = needsVariationSnapshot(ad);
          await delay(600);
          const snapshotUrl = ad.ad_snapshot_url!;
          const snapPage = await context.newPage();
          await snapPage.goto(snapshotUrl, { waitUntil: "load", timeout: 15000 });
          await delay(800);
          await snapPage.waitForSelector('[role="listbox"] img, [role="tabpanel"] img, [aria-label*="carousel"] img, [aria-label*="slide"] img, [aria-roledescription="carousel"] img, [role="main"] img', { timeout: 5000 }).catch(() => null);
          await delay(1500);
          const detailDom = suspiciousVariation
            ? await snapPage.evaluate(extractVariationFromDetailDom).catch(() => null)
            : null;
          const snapHtml = await snapPage.content();
          const domCarousel = await snapPage.evaluate(extractCarouselFromSnapshotDom).catch(() => [] as string[]);
          await snapPage.close();
          const snapshotAd = extractAdFromSnapshotPage(snapHtml, ad.ad_id, pageId);
          const detailMedia = extractMediaFromAdDetailHtml(snapHtml);
          if (snapshotAd) {
            if ((!ad.ad_text?.trim() || (suspiciousVariation && looksLikeRepeatedAdCopy(ad.ad_text))) && snapshotAd.ad_text) {
              ad.ad_text = suspiciousVariation
                ? sanitizeRecoveredVariationText(cleanAdText(filterMetadataFromAdText(snapshotAd.ad_text)))
                : cleanAdText(filterMetadataFromAdText(snapshotAd.ad_text));
              if (DEBUG_SOURCE && ad._debug_source) ad._debug_source.ad_text = "snapshot";
            }
            if (!ad.ad_headline?.trim() && snapshotAd.ad_headline?.trim()) {
              ad.ad_headline = cleanAdText(filterMetadataFromAdText(snapshotAd.ad_headline));
              if (DEBUG_SOURCE && ad._debug_source) ad._debug_source.ad_headline = "snapshot";
            }
            if (!ad.ad_description?.trim() && snapshotAd.ad_description?.trim()) {
              ad.ad_description = cleanAdText(filterMetadataFromAdText(snapshotAd.ad_description));
              if (DEBUG_SOURCE && ad._debug_source) ad._debug_source.ad_description = "snapshot";
            }
            if (!ad.image_url && snapshotAd.image_url) {
              ad.image_url = snapshotAd.image_url;
              if (DEBUG_SOURCE && ad._debug_source) ad._debug_source.image_url = "snapshot";
            }
            if (!ad.video_url && snapshotAd.video_url) {
              ad.video_url = snapshotAd.video_url;
              if (DEBUG_SOURCE && ad._debug_source) ad._debug_source.video_url = "snapshot";
            }
            if (suspiciousVariation && snapshotAd.video_url) {
              ad.video_url = snapshotAd.video_url;
              ad.display_format = "VIDEO";
              ad.carousel_urls = [];
              if (DEBUG_SOURCE && ad._debug_source) {
                ad._debug_source.video_url = "snapshot";
                ad._debug_source.carousel_urls = "snapshot";
              }
            }
            if ((ad.carousel_urls?.length ?? 0) <= 1 && (snapshotAd.carousel_urls?.length ?? 0) > 1) {
              ad.carousel_urls = snapshotAd.carousel_urls;
              if (DEBUG_SOURCE && ad._debug_source) ad._debug_source.carousel_urls = "snapshot";
            }
            if ((ad.carousel_urls?.length ?? 0) <= 1 && domCarousel.length > 1) {
              ad.carousel_urls = domCarousel;
              if (DEBUG_SOURCE && ad._debug_source) ad._debug_source.carousel_urls = "snapshot";
            }
            if (isInvalidCta(ad.cta) && snapshotAd.cta && !isInvalidCta(snapshotAd.cta)) {
              ad.cta = snapshotAd.cta;
              if (DEBUG_SOURCE && ad._debug_source) ad._debug_source.cta = "snapshot";
            }
            if (!ad.ad_start_date && snapshotAd.ad_start_date) ad.ad_start_date = snapshotAd.ad_start_date;
            if (!ad.publisher_platforms?.length && snapshotAd.publisher_platforms?.length) {
              ad.publisher_platforms = snapshotAd.publisher_platforms;
            }
          }
          if (suspiciousVariation && detailMedia.video_url) {
            ad.video_url = detailMedia.video_url;
            ad.display_format = "VIDEO";
            ad.carousel_urls = [];
            if (!ad.image_url && detailMedia.image_url) {
              ad.image_url = detailMedia.image_url;
            }
            if (DEBUG_SOURCE && ad._debug_source) {
              ad._debug_source.video_url = "snapshot";
              ad._debug_source.carousel_urls = "snapshot";
            }
          }
          if (suspiciousVariation && detailDom?.video_url) {
            ad.video_url = detailDom.video_url;
            ad.display_format = "VIDEO";
            ad.carousel_urls = [];
            if (!ad.image_url && detailDom.image_url) {
              ad.image_url = detailDom.image_url;
            }
            if ((!ad.ad_text?.trim() || looksLikeRepeatedAdCopy(ad.ad_text)) && detailDom.ad_text) {
              ad.ad_text = sanitizeRecoveredVariationText(cleanAdText(filterMetadataFromAdText(detailDom.ad_text)));
            }
            if (isInvalidCta(ad.cta) && detailDom.cta && !isInvalidCta(detailDom.cta)) {
              ad.cta = detailDom.cta;
            }
            if (DEBUG_SOURCE && ad._debug_source) {
              ad._debug_source.video_url = "snapshot";
              ad._debug_source.carousel_urls = "snapshot";
              if (detailDom.ad_text) ad._debug_source.ad_text = "snapshot";
              if (detailDom.cta) ad._debug_source.cta = "snapshot";
            }
          }
          if (
            !ad.image_url &&
            !ad.video_url &&
            (ad.carousel_urls?.length ?? 0) === 0
          ) {
            const media = detailMedia;
            if (media.video_url) {
              ad.video_url = media.video_url;
              if (DEBUG_SOURCE && ad._debug_source) ad._debug_source.video_url = "snapshot";
            }
            if (media.image_url) {
              ad.image_url = media.image_url;
              if (DEBUG_SOURCE && ad._debug_source) ad._debug_source.image_url = "snapshot";
            }
            if (media.carousel_urls.length > 0) {
              ad.carousel_urls = media.carousel_urls;
              if (DEBUG_SOURCE && ad._debug_source) ad._debug_source.carousel_urls = "snapshot";
            }
            if ((ad.carousel_urls?.length ?? 0) === 0 && domCarousel.length > 0) {
              ad.carousel_urls = domCarousel;
              if (DEBUG_SOURCE && ad._debug_source) ad._debug_source.carousel_urls = "snapshot";
            }
          }
        } catch {
          // Snapshot fetch failed, skip
        }
      }
      if (toFetch.length > 0) {
        console.log("[adspy] Snapshot fetch:", toFetch.length, "ads enriched");
      }
    }

    if (DEBUG_SOURCE) {
      for (const ad of ads.slice(0, 15)) {
        console.log(`[adspy] source ${ad.ad_id}:`, JSON.stringify(ad._debug_source ?? {}));
      }
    }

    for (const ad of ads) {
      const shouldNormalizeRecoveredVariation =
        (ad.display_format === "DCO" || (ad.collation_count ?? 0) > 1 || looksLikeRepeatedAdCopy(ad.ad_text)) &&
        Boolean(ad.video_url);

      if (shouldNormalizeRecoveredVariation) {
        ad.display_format = "VIDEO";
        ad.carousel_urls = [];
        ad.ad_text = sanitizeRecoveredVariationText(ad.ad_text);
      }
      ad.display_format = inferDisplayFormat(ad);
    }

    return { page_id: pageId, page_name: pageName, ads: ads.slice(0, MAX_ADS), data_source: dataSource };
  } finally {
    await close();
  }
}

export type PageDiagnostics = {
  total_ads_library_links: number;
  links_with_id_param: number;
  article_count: number;
  page_title: string;
  has_login_prompt: boolean;
  sample_hrefs: string[];
  ad_archive_id_in_html?: number;
  ads_library_id_in_html?: number;
};

/**
 * Run diagnostics on the Ads Library page without extracting ads.
 * Use to debug why extraction returns empty.
 */
export async function diagnoseAdsPage(
  pageId: string,
  country: string = "US"
): Promise<PageDiagnostics> {
  const { context, close } = await createContext();

  try {
    const page = await context.newPage();
    await verifyLoginStatus(page);

    const url = `https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=${country}&is_targeted_country=false&media_type=all&search_type=page&sort_data[direction]=desc&sort_data[mode]=total_impressions&source=fb-logo&view_all_page_id=${pageId}`;
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
    await delay(8000);

    for (let i = 0; i < 5; i++) {
      await page.evaluate(() => window.scrollBy(0, 600));
      await delay(2500);
    }

    const diag = await page.evaluate(() => {
      const adLibLinks = document.querySelectorAll('a[href*="ads/library"]');
      const withId = [...adLibLinks].filter((a) => (a as HTMLAnchorElement).href.match(/[?&]id=\d+/));
      const articles = document.querySelectorAll('[role="article"]');
      const pageTitle = document.title;
      const bodyText = document.body?.innerText?.slice(0, 500) ?? "";
      const hasLoginPrompt = bodyText.includes("Log in") || bodyText.includes("log in");
      const sampleHrefs = [...adLibLinks].slice(0, 8).map((a) => (a as HTMLAnchorElement).href);
      const html = document.documentElement.outerHTML;
      const adArchiveIdMatches = html.match(/"ad_archive_id"\s*:\s*"\d+"/g);
      const adsLibraryIdMatches = html.match(/ads\/library[^"']*[?&]id=\d+/g);
      return {
        total_ads_library_links: adLibLinks.length,
        links_with_id_param: withId.length,
        article_count: articles.length,
        page_title: pageTitle,
        has_login_prompt: hasLoginPrompt,
        sample_hrefs: sampleHrefs,
        ad_archive_id_in_html: adArchiveIdMatches?.length ?? 0,
        ads_library_id_in_html: adsLibraryIdMatches?.length ?? 0,
      };
    });

    return diag;
  } finally {
    await close();
  }
}

export type GraphicsDiagnostics = {
  page_id: string;
  img_elements: {
    total: number;
    with_src: number;
    with_srcset: number;
    with_data_src: number;
    sample_with_media: Array<{
      src: string | null;
      srcset: string | null;
      data_src: string | null;
      loading: string;
      parent_tag: string;
      url_preview: string;
    }>;
    all_src_previews: string[];
  };
  video_elements: { total: number; with_src: number; sample_srcs: string[] };
  html_snippets: { ad_archive_id_count: number; scontent_matches: number; fbcdn_matches: number; sample_json_chunk: string | null };
  dom_extraction_result: { count: number; sample: { image_url: string | null; carousel_urls: string[] } | null };
  first_ad_chunk?: { ad_id: string; chunk_preview: string; chunk_length: number; url_matches: string[] } | null;
};

/**
 * Debug where Facebook stores graphics URLs on the Ads Library page.
 * Returns DOM img/video attributes and HTML/JSON hints for extraction reference.
 */
export async function diagnoseGraphicsUrls(
  pageId: string,
  country: string = "US"
): Promise<GraphicsDiagnostics> {
  const { context, close } = await createContext();

  try {
    const page = await context.newPage();
    await verifyLoginStatus(page);

    const url = `https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=${country}&is_targeted_country=false&media_type=all&search_type=page&sort_data[direction]=desc&sort_data[mode]=total_impressions&source=fb-logo&view_all_page_id=${pageId}`;
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
    await delay(5000);

    // Force image hydration + scroll
    await page.evaluate(() => {
      document.querySelectorAll("img").forEach((img) => {
        (img as HTMLImageElement).loading = "eager";
        (img as HTMLImageElement).decoding = "sync";
      });
    });
    await page.evaluate(() => window.scrollBy(0, 600));
    await delay(2000);
    await page.evaluate(() => window.scrollBy(0, 600));
    await delay(1500);

    const domDiag = await page.evaluate(() => {
      const imgs = document.querySelectorAll("img");
      const withSrc = [...imgs].filter((i) => (i as HTMLImageElement).src || i.getAttribute("src"));
      const withSrcset = [...imgs].filter((i) => i.getAttribute("srcset"));
      const withDataSrc = [...imgs].filter((i) => i.getAttribute("data-src"));

      const isMediaUrl = (u: string) =>
        u && (u.includes("scontent") || u.includes("fbcdn") || u.includes("facebook.com"));

      const sampleWithMedia: Array<{
        src: string | null;
        srcset: string | null;
        data_src: string | null;
        loading: string;
        parent_tag: string;
        url_preview: string;
      }> = [];
      const allSrcPreviews: string[] = [];

      for (const img of imgs) {
        const el = img as HTMLImageElement;
        const src = el.getAttribute("src") ?? el.src ?? null;
        const srcset = el.getAttribute("srcset");
        const dataSrc = el.getAttribute("data-src");
        const u = src ?? el.src ?? srcset?.split(",")[0]?.trim().split(/\s+/)[0] ?? dataSrc ?? "";
        if (isMediaUrl(u) && sampleWithMedia.length < 10) {
          sampleWithMedia.push({
            src: src ?? el.src,
            srcset: srcset ?? null,
            data_src: dataSrc,
            loading: el.loading ?? "unknown",
            parent_tag: el.parentElement?.tagName ?? "?",
            url_preview: u.slice(0, 80) + (u.length > 80 ? "..." : ""),
          });
        }
        if (u && isMediaUrl(u)) allSrcPreviews.push(u.slice(0, 100));
      }

      const videos = document.querySelectorAll("video source");
      const videoSrcs = [...videos].map((v) => v.getAttribute("src")).filter(Boolean) as string[];

      return {
        img_elements: {
          total: imgs.length,
          with_src: withSrc.length,
          with_srcset: withSrcset.length,
          with_data_src: withDataSrc.length,
          sample_with_media: sampleWithMedia,
          all_src_previews: allSrcPreviews.slice(0, 30),
        },
        video_elements: {
          total: videos.length,
          with_src: videoSrcs.length,
          sample_srcs: videoSrcs.slice(0, 5),
        },
      };
    });

    const html = await page.content();
    const adArchiveIdMatches = html.match(/"ad_archive_id"\s*:\s*"\d+"/g);
    const scontentMatches = html.match(/scontent\.\w+\.fbcdn\.net/g);
    const fbcdnMatches = html.match(/fbcdn\.net[^"'\s]*/g);
    let sampleJsonChunk: string | null = null;
    const scontentMatch = html.match(/https?:\/\/scontent[^"']{0,200}/);
    if (scontentMatch) {
      const idx = html.indexOf(scontentMatch[0]);
      sampleJsonChunk = html.slice(Math.max(0, idx - 100), idx + 250);
    } else {
      const displayRes = html.match(/"display_resources"[^]]{0,500}/);
      if (displayRes) sampleJsonChunk = displayRes[0];
    }
    const firstAdChunk = getFirstAdChunkForDebug(html, pageId);

    let domExtractionCount = 0;
    let domExtractionSample: { image_url: string | null; carousel_urls: string[] } | null = null;
    try {
      const domAds = await page.evaluate(extractAdsFromDomInPage);
      domExtractionCount = domAds?.length ?? 0;
      const first = domAds?.[0];
      if (first) {
        domExtractionSample = {
          image_url: first.image_url,
          carousel_urls: first.carousel_urls ?? [],
        };
      }
    } catch {
      // ignore
    }

    return {
      page_id: pageId,
      img_elements: domDiag.img_elements,
      video_elements: domDiag.video_elements,
      html_snippets: {
        ad_archive_id_count: adArchiveIdMatches?.length ?? 0,
        scontent_matches: scontentMatches?.length ?? 0,
        fbcdn_matches: fbcdnMatches?.length ?? 0,
        sample_json_chunk: sampleJsonChunk,
      },
      dom_extraction_result: {
        count: domExtractionCount,
        sample: domExtractionSample,
      },
      first_ad_chunk: firstAdChunk ?? undefined,
    };
  } finally {
    await close();
  }
}

/**
 * Run media diagnostic for causes 1–18.
 * Loads page, captures network, runs extraction, then verifies each cause.
 */
export async function diagnoseMediaCauses(
  pageId: string,
  country: string = "US"
): Promise<import("./media-diagnostic").MediaDiagnosticResult> {
  const { runMediaDiagnostic } = await import("./media-diagnostic");
  const { context, close } = await createContext();

  try {
    const page = await context.newPage();
    await verifyLoginStatus(page);

    const networkMediaUrls: string[] = [];
    page.on("response", (response) => {
      const u = response.url();
      if (
        (u.includes("fbcdn.net") || u.includes("scontent") || u.includes("video.xx.fbcdn.net")) &&
        isAdMediaUrlForNetwork(u)
      ) {
        if (!networkMediaUrls.includes(u)) networkMediaUrls.push(u);
      }
    });

    const url = `https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=${country}&is_targeted_country=false&media_type=all&search_type=page&sort_data[direction]=desc&sort_data[mode]=total_impressions&source=fb-logo&view_all_page_id=${pageId}`;
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
    await delay(3000);

    try {
      const acceptBtn = page.locator('[data-cookiebanner="accept_button"]').first();
      await acceptBtn.click({ timeout: 2000 });
      await delay(1000);
    } catch {
      // No overlay
    }

    for (let i = 0; i < 6; i++) {
      await page.mouse.wheel(0, 2000);
      await delay(1500);
    }
    await page.evaluate(() => {
      document.querySelectorAll("img").forEach((img) => {
        (img as HTMLImageElement).loading = "eager";
        (img as HTMLImageElement).decoding = "sync";
      });
    });
    for (let i = 0; i < 3; i++) {
      await page.evaluate(() => window.scrollBy(0, 600));
      await delay(1200);
    }
    await delay(2000);

    const html = await page.content();

    const diag = await page.evaluate(() => {
      const adLibLinks = document.querySelectorAll('a[href*="ads/library"]');
      const withId = [...adLibLinks].filter((a) => (a as HTMLAnchorElement).href.match(/[?&]id=\d+/));
      const articles = document.querySelectorAll('[role="article"]');
      const adArchiveMatches = document.documentElement.innerHTML.match(/"ad_archive_id"\s*:\s*"\d+"/g);
      return {
        article_count: articles.length,
        links_with_id_param: withId.length,
        ad_archive_id_in_html: adArchiveMatches?.length ?? 0,
      };
    });

    let domResult = { count: 0, withMedia: 0, imgCount: 0 };
    let correlationResult: Record<string, unknown> = {};
    let domAds: DomExtractedAd[] = [];
    try {
      domAds = (await page.evaluate(extractAdsFromDomInPage)) ?? [];
      const withMedia = domAds.filter((d) => d.image_url || d.video_url || (d.carousel_urls?.length ?? 0) > 0);
      const imgCount = await page.evaluate(() => document.querySelectorAll("img").length);
      domResult = { count: domAds.length, withMedia: withMedia.length, imgCount };

      if (networkMediaUrls.length > 0) {
        const htmlAdsForCorrelation = extractAdsFromHtml(html, pageId);
        const adIdsForCorrelation = htmlAdsForCorrelation.map((h) => h.ad_id);
        correlationResult = (await page.evaluate(
          correlateUrlsToAdIds,
          { capturedUrls: networkMediaUrls, adIdsInOrder: adIdsForCorrelation }
        )) as Record<string, unknown>;
      }
    } catch (e) {
      console.warn("[adspy] Diagnostic DOM/correlation failed:", e);
    }

    const htmlAds = extractAdsFromHtml(html, pageId);
    const domByAdId = new Map(domAds.filter((d) => d.ad_id).map((d) => [d.ad_id!, d]));
    const ads = htmlAds.map((h) => {
      const dom = domByAdId.get(h.ad_id);
      return {
        image_url: dom?.image_url ?? h.image_url ?? h.carousel_urls?.[0] ?? null,
        video_url: dom?.video_url ?? h.video_url ?? null,
        carousel_urls: dom?.carousel_urls ?? h.carousel_urls ?? [],
      };
    });

    return runMediaDiagnostic({
      html,
      pageId,
      domResult,
      networkUrls: networkMediaUrls,
      diag,
      scrapeResult: { ads },
      correlationResult,
    });
  } finally {
    await close();
  }
}

/** Keys we care about for video, carousel, collation. */
const VIDEO_KEYS = ["video_sd_url", "video_hd_url", "video_url", "video_preview_url", "playable_url", "videos", "video", "video_creative"];
const COLLATION_KEYS = ["collation_id", "collation_count", "collation_key", "ad_collation_id"];

function extractRawStructureFromCollated(item: Record<string, unknown>): Record<string, unknown> {
  const snap = (item.snapshot ?? item) as Record<string, unknown>;
  const topKeys = Object.keys(item);
  const snapKeys = typeof snap === "object" && snap ? Object.keys(snap) : [];
  const allKeys = [...new Set([...topKeys, ...snapKeys])];
  const hasVideo = VIDEO_KEYS.some((k) => (item[k] != null) || (snap && snap[k] != null));
  const hasCollation = COLLATION_KEYS.some((k) => (item[k] != null) || (snap && snap[k] != null));
  const child = (snap?.child_attachments ?? snap?.carousel_cards ?? snap?.cards) as unknown[] | undefined;
  const childCount = Array.isArray(child) ? child.length : 0;
  const videoValues: Record<string, unknown> = {};
  for (const k of VIDEO_KEYS) {
    const v = item[k] ?? (snap && (snap as Record<string, unknown>)[k]);
    if (v != null) videoValues[k] = typeof v === "string" ? v.slice(0, 80) + "..." : Array.isArray(v) ? `[${(v as unknown[]).length} items]` : v;
  }
  const collationValues: Record<string, unknown> = {};
  for (const k of COLLATION_KEYS) {
    const v = item[k] ?? (snap && (snap as Record<string, unknown>)[k]);
    if (v != null) collationValues[k] = v;
  }
  const adId = item.ad_archive_id ?? item.ad_snapshot_id ?? (snap as Record<string, unknown>)?.ad_snapshot_id;
  return {
    ad_id: adId,
    top_level_keys: topKeys,
    snapshot_keys: snapKeys,
    all_keys_sample: allKeys.slice(0, 50),
    has_video_fields: hasVideo,
    has_collation_fields: hasCollation,
    child_attachments_count: childCount,
    video_values: Object.keys(videoValues).length > 0 ? videoValues : null,
    collation_values: Object.keys(collationValues).length > 0 ? collationValues : null,
    first_child_keys: Array.isArray(child) && child[0] && typeof child[0] === "object"
      ? Object.keys(child[0] as Record<string, unknown>)
      : null,
  };
}

function collectCollatedFromGraphQL(json: unknown): Array<Record<string, unknown>> {
  const items: Array<Record<string, unknown>> = [];
  function walk(obj: unknown): void {
    if (!obj || typeof obj !== "object") return;
    const o = obj as Record<string, unknown>;
    const edges = (o.search_results_connection as { edges?: unknown[] })?.edges ?? o.edges;
    if (Array.isArray(edges)) {
      for (const edge of edges) {
        const node = (edge as { node?: unknown })?.node ?? edge;
        const coll = (node as { collated_results?: unknown[] })?.collated_results;
        if (Array.isArray(coll)) {
          for (const c of coll) {
            if (c && typeof c === "object") items.push(c as Record<string, unknown>);
          }
        }
        walk(node);
      }
    }
    for (const key of ["ad_library_main", "ad_library_search", "data", "node"]) {
      if (o[key]) walk(o[key]);
    }
    if (Array.isArray(o.edges)) for (const e of o.edges) walk(e);
  }
  walk(json);
  return items;
}

/** Audit HTML for presence of creative data. Answers: does creative exist, and where? */
function auditHtmlCreative(html: string, pageId: string): {
  creative_markers: Record<string, number>;
  ad_archive_id_positions: Array<{ ad_id: string; index: number }>;
  ads_with_creative_nearby: number;
  ads_without_creative_nearby: number;
  sample_pairings: Array<{ ad_id: string; nearest_marker: string; distance: number }>;
} {
  const markers = [
    "child_attachments",
    "carousel_cards",
    "display_resources",
    "video_sd_url",
    "video_hd_url",
    "video_url",
    "video_preview_url",
    "video_preview_image_url",
  ];
  const creative_markers: Record<string, number> = {};
  for (const m of markers) {
    const re = new RegExp(m.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g");
    creative_markers[m] = (html.match(re) ?? []).length;
  }

  const adIdRe = /"ad_archive_id"\s*:\s*"(\d+)"/g;
  const adPositions: Array<{ ad_id: string; index: number }> = [];
  let m: RegExpExecArray | null;
  adIdRe.lastIndex = 0;
  while ((m = adIdRe.exec(html)) !== null) {
    const adId = m[1];
    if (adId && adId !== pageId && adId.length >= 10) {
      adPositions.push({ ad_id: adId, index: m.index });
    }
  }

  const markerPositions: Array<{ name: string; index: number }> = [];
  for (const name of markers) {
    const re = new RegExp(name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g");
    let mm: RegExpExecArray | null;
    re.lastIndex = 0;
    while ((mm = re.exec(html)) !== null) {
      markerPositions.push({ name, index: mm.index });
    }
  }

  const WINDOW = 60000;
  let withCreative = 0;
  let withoutCreative = 0;
  const samplePairings: Array<{ ad_id: string; nearest_marker: string; distance: number }> = [];

  for (const { ad_id, index } of adPositions) {
    const start = Math.max(0, index - WINDOW);
    const end = Math.min(html.length, index + WINDOW);
    const chunk = html.slice(start, end);
    const hasAny = markers.some((mk) => chunk.includes(mk));
    if (hasAny) withCreative++;
    else withoutCreative++;

    if (samplePairings.length < 5) {
      let nearest: { name: string; dist: number } | null = null;
      for (const mp of markerPositions) {
        const dist = Math.abs(mp.index - index);
        if (dist < WINDOW && (!nearest || dist < nearest.dist)) {
          nearest = { name: mp.name, dist };
        }
      }
      samplePairings.push({
        ad_id,
        nearest_marker: nearest?.name ?? "none",
        distance: nearest?.dist ?? -1,
      });
    }
  }

  return {
    creative_markers,
    ad_archive_id_positions: adPositions.slice(0, 20),
    ads_with_creative_nearby: withCreative,
    ads_without_creative_nearby: withoutCreative,
    sample_pairings: samplePairings,
  };
}

/** Same video regex patterns used in extractAdsFromHtml. */
const VIDEO_REGEX_PATTERNS = [
  /"(?:video_sd_url|video_hd_url|video_url)"\s*:\s*"((?:https?:)?(?:\/\/|\\\/\\\/)[^"]+)"/,
  /"videos"\s*:\s*\[\s*\{\s*"(?:video_sd_url|video_hd_url|url)"\s*:\s*"((?:https?:)?(?:\/\/|\\\/\\\/)[^"]+)"/,
  /"video_preview_url"\s*:\s*"((?:https?:)?(?:\/\/|\\\/\\\/)[^"]+\.(?:mp4|webm)[^"]*)"/,
  /"source"\s*:\s*"((?:https?:)?(?:\/\/|\\\/\\\/)[^"]+\.(?:mp4|webm)[^"]*)"/,
  /(https?:\/\/[^"'\s]*(?:video\.\w+\.fbcdn\.net|video\.xx\.fbcdn\.net)[^"'\s]*)/,
  /"(?:https?:)?\/\/[^"]+\.(?:mp4|webm)(?:\?[^"]*)?"/,
];

/** Verify: does our video regex match in the chunk we'd use for this ad? */
function verifyVideoInChunk(html: string, adId: string, adIndex: number): {
  ad_id: string;
  chunk_size: number;
  regex_matches: Array<{ pattern: string; matched: boolean; sample_url?: string }>;
  any_match: boolean;
  chunk_contains_video_sd_url: boolean;
  raw_video_format_sample: string | null;
} {
  const WINDOW = 5000;
  const start = Math.max(0, adIndex - WINDOW);
  const end = Math.min(html.length, adIndex + WINDOW);
  const chunk = html.slice(start, end);

  const results: Array<{ pattern: string; matched: boolean; sample_url?: string }> = [];
  for (const re of VIDEO_REGEX_PATTERNS) {
    const m = chunk.match(re);
    results.push({
      pattern: re.source.slice(0, 60) + "...",
      matched: !!m,
      sample_url: m?.[1]?.slice(0, 80),
    });
  }

  let rawVideoSample: string | null = null;
  const idx = chunk.indexOf("video_sd_url");
  if (idx >= 0) {
    const sampleStart = Math.max(0, idx - 30);
    const sampleEnd = Math.min(chunk.length, idx + 180);
    rawVideoSample = chunk.slice(sampleStart, sampleEnd);
  } else {
    const hdIdx = chunk.indexOf("video_hd_url");
    if (hdIdx >= 0) {
      const sampleStart = Math.max(0, hdIdx - 30);
      const sampleEnd = Math.min(chunk.length, hdIdx + 180);
      rawVideoSample = chunk.slice(sampleStart, sampleEnd);
    }
  }

  return {
    ad_id: adId,
    chunk_size: chunk.length,
    regex_matches: results,
    any_match: results.some((r) => r.matched),
    chunk_contains_video_sd_url: /"video_sd_url"\s*:\s*"/.test(chunk),
    raw_video_format_sample: rawVideoSample,
  };
}

/** Recursively find all keys in object for structure inspection. */
function getStructureSample(obj: unknown, depth = 0, maxDepth = 5): unknown {
  if (depth > maxDepth) return "[max depth]";
  if (!obj || typeof obj !== "object") return obj;
  const o = obj as Record<string, unknown>;
  const keys = Object.keys(o).slice(0, 30);
  const sample: Record<string, unknown> = {};
  for (const k of keys) {
    const v = o[k];
    if (Array.isArray(v)) {
      sample[k] = `[array len=${v.length}]`;
      if (v.length > 0 && v[0] && typeof v[0] === "object") {
        sample[`${k}_first_keys`] = Object.keys(v[0] as Record<string, unknown>).slice(0, 20);
      }
    } else if (v && typeof v === "object") {
      sample[k] = getStructureSample(v, depth + 1, maxDepth);
    } else {
      sample[k] = typeof v === "string" ? v.slice(0, 50) + (v.length > 50 ? "..." : "") : v;
    }
  }
  return sample;
}

/**
 * Capture raw GraphQL/HTML structures to verify what Meta actually returns.
 * Use for debugging: video fields, collation_id, child_attachments.
 * GET /api/adspy/debug?test=raw_structures&page_id=...&country=...
 */
export async function captureRawStructures(
  pageId: string,
  country: string = "US",
  options?: { diagnoseAdId?: string }
): Promise<{
  graphql_responses_count: number;
  graphql_structure_sample: unknown;
  collated_items_total: number;
  sample_raw_structures: Array<Record<string, unknown>>;
  extracted_ads_summary: Array<{ ad_id: string; image_url: boolean; video_url: boolean; carousel_count: number }>;
  html_first_ad_chunk: { ad_id: string; chunk_preview: string; has_video: boolean; has_child_attachments: boolean } | null;
  html_creative_audit: {
    creative_markers: Record<string, number>;
    ad_archive_id_positions: Array<{ ad_id: string; index: number }>;
    ads_with_creative_nearby: number;
    ads_without_creative_nearby: number;
    sample_pairings: Array<{ ad_id: string; nearest_marker: string; distance: number }>;
  };
  video_verification: {
    ad_id: string;
    chunk_size: number;
    regex_matches: Array<{ pattern: string; matched: boolean; sample_url?: string }>;
    any_match: boolean;
    chunk_contains_video_sd_url: boolean;
    raw_video_format_sample: string | null;
    root_cause: "regex_fails" | "chunk_wrong" | "extraction_should_work";
  };
  carousel_verification: {
    snapshots_tested: number;
    results: Array<{
      ad_id: string;
      snapshot_url: string;
      child_attachments_count: number;
      carousel_cards_count: number;
      display_resources_count: number;
      has_carousel_data: boolean;
    }>;
    any_snapshot_has_carousel: boolean;
    root_cause: "snapshot_has_carousel" | "snapshot_no_carousel";
  };
  ad_chunk_diagnosis: ReturnType<typeof diagnoseAdChunkOverlap> | null;
}> {
  const { context, close } = await createContext();
  const rawGraphQLBodies: unknown[] = [];

  try {
    const page = await context.newPage();
    await verifyLoginStatus(page);

    page.on("response", async (response) => {
      const u = response.url();
      if (u.includes("graphql") && response.request().method() === "POST") {
        try {
          const json = await response.json().catch(() => null);
          if (json) rawGraphQLBodies.push(json);
        } catch {
          // ignore
        }
      }
    });

    const url = `https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=${country}&is_targeted_country=false&media_type=all&search_type=page&sort_data[direction]=desc&sort_data[mode]=total_impressions&source=fb-logo&view_all_page_id=${pageId}`;
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
    await delay(3000);
    for (let i = 0; i < 5; i++) {
      await page.mouse.wheel(0, 2000);
      await delay(1500);
    }
    await delay(2000);

    const html = await page.content();
    const inlineGraphqlAds = extractAdsFromInlineGraphQLHtml(html, pageId);
    const htmlAds = extractAdsFromHtml(html, pageId);
    const graphqlAds: GraphqlExtractedAd[] = [];
    for (const body of rawGraphQLBodies) {
      const extracted = extractAdsFromGraphQL(body, pageId);
      for (const ad of extracted) {
        const existingIndex = graphqlAds.findIndex((a) => a.ad_id === ad.ad_id);
        if (existingIndex === -1) graphqlAds.push(ad);
        else graphqlAds[existingIndex] = mergeGraphqlAd(graphqlAds[existingIndex], ad);
      }
    }
    for (const ad of inlineGraphqlAds) {
      const existingIndex = graphqlAds.findIndex((a) => a.ad_id === ad.ad_id);
      if (existingIndex === -1) graphqlAds.push(ad);
      else graphqlAds[existingIndex] = mergeGraphqlAd(graphqlAds[existingIndex], ad);
    }
    const ads = graphqlAds.length > 0 ? graphqlAds : htmlAds.map((h) => ({
      ad_id: h.ad_id,
      image_url: h.image_url,
      video_url: h.video_url,
      carousel_urls: h.carousel_urls ?? [],
    }));

    const allCollated: Array<Record<string, unknown>> = [];
    for (const body of rawGraphQLBodies) {
      allCollated.push(...collectCollatedFromGraphQL(body));
    }
    const seenIds = new Set<string>();
    const uniqueCollated = allCollated.filter((c) => {
      const id = String(c.ad_archive_id ?? c.ad_snapshot_id ?? (c.snapshot as Record<string, unknown>)?.ad_snapshot_id ?? "");
      if (!id || seenIds.has(id)) return false;
      seenIds.add(id);
      return true;
    });

    const graphqlStructureSample =
      rawGraphQLBodies.length > 0 ? getStructureSample(rawGraphQLBodies[0]) : null;
    const sampleStructures = uniqueCollated.slice(0, 8).map(extractRawStructureFromCollated);
    const firstChunk = getFirstAdChunkForDebug(html, pageId);
    const htmlCreativeAudit = auditHtmlCreative(html, pageId);

    const videoVerification =
      htmlCreativeAudit.ad_archive_id_positions.length > 0
        ? (() => {
            const first = htmlCreativeAudit.ad_archive_id_positions[0];
            const v = verifyVideoInChunk(html, first.ad_id, first.index);
            const rootCause: "regex_fails" | "chunk_wrong" | "extraction_should_work" = v.any_match
              ? "extraction_should_work"
              : v.chunk_contains_video_sd_url
                ? "regex_fails"
                : "chunk_wrong";
            return { ...v, root_cause: rootCause };
          })()
        : null;

    const carouselAdIds = htmlAds.slice(0, 5).map((a) => a.ad_id);
    const carouselResults: Array<{
      ad_id: string;
      snapshot_url: string;
      child_attachments_count: number;
      carousel_cards_count: number;
      display_resources_count: number;
      has_carousel_data: boolean;
    }> = [];
    for (const adId of carouselAdIds) {
      try {
        await delay(1500);
        const snapshotUrl = `https://www.facebook.com/ads/library/?id=${adId}`;
        const snapPage = await context.newPage();
        await snapPage.goto(snapshotUrl, { waitUntil: "domcontentloaded", timeout: 15000 });
        await delay(2000);
        const snapHtml = await snapPage.content();
        await snapPage.close();
        const childCount = (snapHtml.match(/"child_attachments"/g) ?? []).length;
        const carouselCount = (snapHtml.match(/"carousel_cards"/g) ?? []).length;
        const displayCount = (snapHtml.match(/"display_resources"/g) ?? []).length;
        carouselResults.push({
          ad_id: adId,
          snapshot_url: snapshotUrl,
          child_attachments_count: childCount,
          carousel_cards_count: carouselCount,
          display_resources_count: displayCount,
          has_carousel_data: childCount > 0 || carouselCount > 0 || displayCount > 0,
        });
      } catch {
        carouselResults.push({
          ad_id: adId,
          snapshot_url: `https://www.facebook.com/ads/library/?id=${adId}`,
          child_attachments_count: -1,
          carousel_cards_count: -1,
          display_resources_count: -1,
          has_carousel_data: false,
        });
      }
    }
    const anySnapshotHasCarousel = carouselResults.some((r) => r.has_carousel_data);
    const carouselVerification = {
      snapshots_tested: carouselResults.length,
      results: carouselResults,
      any_snapshot_has_carousel: anySnapshotHasCarousel,
      root_cause: (anySnapshotHasCarousel ? "snapshot_has_carousel" : "snapshot_no_carousel") as
        | "snapshot_has_carousel"
        | "snapshot_no_carousel",
    };

    const extractedSummary = (graphqlAds.length > 0 ? graphqlAds : htmlAds).slice(0, 15).map((a) => ({
      ad_id: a.ad_id,
      image_url: !!(a.image_url ?? a.carousel_urls?.[0]),
      video_url: !!a.video_url,
      carousel_count: a.carousel_urls?.length ?? 0,
    }));

    return {
      graphql_responses_count: rawGraphQLBodies.length,
      graphql_structure_sample: graphqlStructureSample,
      collated_items_total: uniqueCollated.length,
      sample_raw_structures: sampleStructures,
      extracted_ads_summary: extractedSummary,
      html_first_ad_chunk: firstChunk
        ? {
            ad_id: firstChunk.ad_id,
            chunk_preview: firstChunk.chunk_preview.slice(0, 3000),
            has_video: /video_sd_url|video_hd_url|video_url|video_preview/.test(firstChunk.chunk_preview),
            has_child_attachments: /child_attachments|carousel_cards/.test(firstChunk.chunk_preview),
          }
        : null,
      html_creative_audit: htmlCreativeAudit,
      video_verification: videoVerification ?? {
        ad_id: "",
        chunk_size: 0,
        regex_matches: [],
        any_match: false,
        chunk_contains_video_sd_url: false,
        raw_video_format_sample: null,
        root_cause: "chunk_wrong" as "chunk_wrong",
      },
      carousel_verification: carouselVerification,
      ad_chunk_diagnosis: options?.diagnoseAdId
        ? diagnoseAdChunkOverlap(html, pageId, options.diagnoseAdId)
        : null,
    };
  } finally {
    await close();
  }
}

type VariationDetailStage = {
  extracted: ReturnType<typeof extractAdFromSnapshotPage> | null;
  dom_media: ReturnType<typeof extractMediaFromAdDetailHtml>;
  dom_carousel_count: number;
  page_video_count: number;
  page_video_srcs: string[];
  visible_buttons: string[];
};

/**
 * Diagnose whether a hidden DCO/multi-variation ad reveals its true media only after
 * interacting with the detail page (e.g. "See ad details", "View ad variations").
 */
export async function diagnoseVariationDetail(
  adId: string,
  country = "US"
): Promise<{
  ad_id: string;
  snapshot_url: string;
  clicked_control: string | null;
  before: VariationDetailStage;
  after: VariationDetailStage;
  root_cause:
    | "variation_revealed_after_click"
    | "detail_page_contains_video_without_click"
    | "detail_page_still_parent_shell"
    | "interaction_not_found";
}> {
  const { context, close } = await createContext();
  const snapshotUrl = `https://www.facebook.com/ads/library/?id=${adId}&country=${country}`;

  const captureStage = async (page: Page): Promise<VariationDetailStage> => {
    const html = await page.content();
    const extracted = extractAdFromSnapshotPage(html, adId, adId);
    const dom_media = extractMediaFromAdDetailHtml(html);
    const dom_carousel = await page.evaluate(extractCarouselFromSnapshotDom).catch(() => [] as string[]);
    const domSignals = await page.evaluate(() => {
      const videos = Array.from(document.querySelectorAll("video"));
      const videoSrcs = videos
        .map((video) => {
          const el = video as HTMLVideoElement;
          return el.currentSrc || video.querySelector("source")?.getAttribute("src") || "";
        })
        .filter(Boolean)
        .slice(0, 5);
      const visibleButtons = Array.from(document.querySelectorAll("button, [role='button'], a"))
        .map((el) => (el.textContent || "").replace(/\s+/g, " ").trim())
        .filter(Boolean)
        .filter((text) => /see ad details|see summary details|view ad variation|view ad variations|multiple versions/i.test(text))
        .slice(0, 10);
      return {
        page_video_count: videos.length,
        page_video_srcs: videoSrcs,
        visible_buttons: visibleButtons,
      };
    });

    return {
      extracted,
      dom_media,
      dom_carousel_count: dom_carousel.length,
      page_video_count: domSignals.page_video_count,
      page_video_srcs: domSignals.page_video_srcs,
      visible_buttons: domSignals.visible_buttons,
    };
  };

  try {
    const page = await context.newPage();
    await verifyLoginStatus(page);
    await page.goto(snapshotUrl, { waitUntil: "load", timeout: 30000 });
    await delay(1500);

    const before = await captureStage(page);

    const interactionCandidates = [
      page.getByRole("button", { name: /see ad details/i }),
      page.getByRole("button", { name: /see summary details/i }),
      page.getByRole("button", { name: /view ad variation/i }),
      page.getByRole("button", { name: /view ad variations/i }),
      page.getByText(/see ad details/i).locator(".."),
      page.getByText(/view ad variations?/i).locator(".."),
    ];

    let clickedControl: string | null = null;
    for (const candidate of interactionCandidates) {
      try {
        const count = await candidate.count();
        if (count < 1) continue;
        const text = ((await candidate.first().textContent()) || "").replace(/\s+/g, " ").trim();
        await candidate.first().click({ timeout: 3000 });
        clickedControl = text || "interaction";
        break;
      } catch {
        // keep trying
      }
    }

    if (clickedControl) {
      await delay(1800);
    }

    const after = await captureStage(page);
    await page.close();

    const afterHasVideo = Boolean(after.extracted?.video_url || after.dom_media.video_url || after.page_video_count > 0);
    const beforeHasVideo = Boolean(before.extracted?.video_url || before.dom_media.video_url || before.page_video_count > 0);

    let root_cause: "variation_revealed_after_click" | "detail_page_contains_video_without_click" | "detail_page_still_parent_shell" | "interaction_not_found";
    if (!clickedControl) {
      root_cause = beforeHasVideo ? "detail_page_contains_video_without_click" : "interaction_not_found";
    } else if (!beforeHasVideo && afterHasVideo) {
      root_cause = "variation_revealed_after_click";
    } else if (beforeHasVideo) {
      root_cause = "detail_page_contains_video_without_click";
    } else {
      root_cause = "detail_page_still_parent_shell";
    }

    return {
      ad_id: adId,
      snapshot_url: snapshotUrl,
      clicked_control: clickedControl,
      before,
      after,
      root_cause,
    };
  } finally {
    await close();
  }
}
