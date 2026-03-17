import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  searchPages,
  scrapePageAds,
  diagnoseAdsPage,
  diagnoseGraphicsUrls,
  diagnoseMediaCauses,
  captureRawStructures,
  diagnoseVariationDetail,
} from "@/lib/adspy/scraper";
import { runDiscovery } from "@/lib/adspy/ads-library-discovery";
import { resolvePageFromUrl } from "@/lib/adspy/page-resolver";

export type DebugResult = {
  timestamp: string;
  checks: {
    name: string;
    status: "ok" | "fail" | "warn";
    duration_ms?: number;
    message?: string;
    data?: unknown;
  }[];
  root_cause?: string;
};

/**
 * Debug endpoint to verify AdSpy scraping.
 * GET /api/adspy/debug?test=pages|ads|diagnose|graphics|graphics_cause_a|media_causes|raw_structures|variation_detail|discovery|resolve|all&page_id=...&country=...
 * - test: pages | ads | diagnose | graphics | graphics_cause_a | raw_structures | variation_detail | media_causes | discovery | resolve | all (default: all)
 * - page_id: Override page for ads/diagnose (default: 15087023444 Nike)
 * - country: Override country (default: US, use ALL for worldwide)
 * - page_url: For test=resolve - e.g. facebook.com/adidas
 * - page_name: For test=resolve - e.g. adidas
 *
 * graphics_cause_a: Debug Graphics Cause A - data source path (GraphQL vs HTML) and media presence
 *
 * Example: ?test=graphics_cause_a&page_id=182162001806727&country=US
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const test = searchParams.get("test") ?? "all";
  const pageId = searchParams.get("page_id") ?? "15087023444";
  const countryParam = searchParams.get("country") ?? "US";
  const country = countryParam === "WW" || countryParam.toUpperCase() === "WORLDWIDE" ? "ALL" : countryParam;
  const pageUrl = searchParams.get("page_url") ?? "";
  const pageName = searchParams.get("page_name") ?? "";
  const debugSource = searchParams.get("debug_source") === "1";
  const adId = searchParams.get("ad_id") ?? "";

  const result: DebugResult = {
    timestamp: new Date().toISOString(),
    checks: [],
  };

  if (test === "pages" || test === "all") {
    const start = Date.now();
    try {
      const pages = await searchPages("Nike", "US");
      result.checks.push({
        name: "Page search (Nike, US)",
        status: "ok",
        duration_ms: Date.now() - start,
        message: `Found ${pages.length} page(s)`,
        data: pages,
      });
    } catch (err) {
      result.checks.push({
        name: "Page search (Nike, US)",
        status: "fail",
        duration_ms: Date.now() - start,
        message: err instanceof Error ? err.message : "Unknown error",
      });
    }
  }

  if (test === "ads" || test === "all") {
    const start = Date.now();
    try {
      const { ads, page_name } = await scrapePageAds(pageId, country, { debugSource });
      const status = ads.length > 0 ? "ok" : "warn";
      result.checks.push({
        name: `Ad scraping (page ${pageId})`,
        status,
        duration_ms: Date.now() - start,
        message: ads.length > 0 ? `Found ${ads.length} ad(s) for ${page_name}` : `0 ads extracted (see diagnose)`,
        data: { page_name, ad_count: ads.length, sample_ad: ads[0] ?? null },
      });
    } catch (err) {
      result.checks.push({
        name: `Ad scraping (page ${pageId})`,
        status: "fail",
        duration_ms: Date.now() - start,
        message: err instanceof Error ? err.message : "Unknown error",
      });
    }
  }

  if (test === "diagnose" || test === "all") {
    const start = Date.now();
    try {
      const diag = await diagnoseAdsPage(pageId, country);
      const hasIssue = diag.links_with_id_param === 0 || diag.has_login_prompt;
      result.checks.push({
        name: `Page diagnostics (page ${pageId})`,
        status: hasIssue ? "warn" : "ok",
        duration_ms: Date.now() - start,
        message: hasIssue
          ? `Links with id: ${diag.links_with_id_param}, Login prompt: ${diag.has_login_prompt}`
          : `Page has ${diag.links_with_id_param} ad links`,
        data: diag,
      });
      if (hasIssue) {
        result.root_cause =
          diag.has_login_prompt
            ? "Facebook shows login wall for unauthenticated requests. Ads may require login."
            : diag.total_ads_library_links === 0
              ? "No ads/library links found. Page structure may have changed or content not loaded."
              : `Found ${diag.total_ads_library_links} ads/library links but ${diag.links_with_id_param} have id param. URL format may differ.`;
      }
    } catch (err) {
      result.checks.push({
        name: `Page diagnostics (page ${pageId})`,
        status: "fail",
        duration_ms: Date.now() - start,
        message: err instanceof Error ? err.message : "Unknown error",
      });
    }
  }

  if (test === "graphics" || test === "all") {
    const start = Date.now();
    try {
      const diag = await diagnoseGraphicsUrls(pageId, country);
      const hasMedia =
        diag.img_elements.sample_with_media.length > 0 ||
        diag.dom_extraction_result.sample?.image_url ||
        (diag.dom_extraction_result.sample?.carousel_urls?.length ?? 0) > 0;
      result.checks.push({
        name: `Graphics URL diagnostics (page ${pageId})`,
        status: hasMedia ? "ok" : "warn",
        duration_ms: Date.now() - start,
        message: hasMedia
          ? `Found ${diag.img_elements.with_src} imgs with src, ${diag.dom_extraction_result.count} from DOM extraction`
          : `No media URLs found. imgs: ${diag.img_elements.total}, with_src: ${diag.img_elements.with_src}, with_srcset: ${diag.img_elements.with_srcset}`,
        data: diag,
      });
      if (!hasMedia) {
        result.root_cause =
          (result.root_cause ?? "") +
          " Graphics: DOM imgs may lack src/srcset (lazy-loaded). Check img_elements.sample_with_media and html_snippets.sample_json_chunk for where Facebook stores URLs.";
      }
    } catch (err) {
      result.checks.push({
        name: `Graphics URL diagnostics (page ${pageId})`,
        status: "fail",
        duration_ms: Date.now() - start,
        message: err instanceof Error ? err.message : "Unknown error",
      });
    }
  }

  /** Graphics Cause A: Data source path (GraphQL vs HTML) and media presence. Run explicitly with test=graphics_cause_a */
  if (test === "graphics_cause_a") {
    const start = Date.now();
    try {
      const { ads, page_name, data_source } = await scrapePageAds(pageId, country, { debugSource });
      const withMedia = ads.filter(
        (a) => a.image_url || a.video_url || (a.carousel_urls?.length ?? 0) > 0
      ).length;
      const withoutMedia = ads.filter(
        (a) => !a.image_url && !a.video_url && (a.carousel_urls?.length ?? 0) === 0
      );
      const hasIssue =
        ads.length > 0 && withoutMedia.length > 0;
      const status = ads.length === 0 ? "warn" : hasIssue ? "warn" : "ok";
      const message = ads.length === 0
        ? "No ads extracted"
        : hasIssue
          ? `Data source: ${data_source}. ${withMedia}/${ads.length} ads have media. ${withoutMedia.length} ads missing graphics.`
          : `Data source: ${data_source}. All ${ads.length} ads have media.`;

      result.checks.push({
        name: `Graphics Cause A: Data source (page ${pageId})`,
        status,
        duration_ms: Date.now() - start,
        message,
        data: {
          data_source,
          total_ads: ads.length,
          ads_with_media: withMedia,
          ads_without_media: withoutMedia.length,
          sample_ad_with_media: ads.find((a) => a.image_url || a.video_url || (a.carousel_urls?.length ?? 0) > 0) ?? null,
          sample_ad_without_media: withoutMedia[0] ?? null,
          page_name,
        },
      });
      if (hasIssue) {
        result.root_cause =
          (result.root_cause ?? "") +
          ` Graphics Cause A: Ads from ${data_source} have missing media. ` +
          (data_source === "dom"
            ? "DOM extraction may miss media due to lazy loading or different selectors. Check img/video elements in ad cards."
            : data_source === "html"
              ? "HTML extraction regex may not match Meta's JSON structure. Run test=graphics for sample_json_chunk."
              : "GraphQL extraction may not find images/videos in snapshot. Check snapshot.images, snapshot.cards, display_resources.");
      }
    } catch (err) {
      result.checks.push({
        name: `Graphics Cause A: Data source (page ${pageId})`,
        status: "fail",
        duration_ms: Date.now() - start,
        message: err instanceof Error ? err.message : "Unknown error",
      });
    }
  }

  if (test === "raw_structures") {
    const start = Date.now();
    try {
      const raw = await captureRawStructures(pageId, country);
      result.checks.push({
        name: `Raw structures (page ${pageId})`,
        status: "ok",
        duration_ms: Date.now() - start,
        message: `GraphQL responses: ${raw.graphql_responses_count}, collated items: ${raw.collated_items_total}. Inspect sample_raw_structures for video/collation/child_attachments.`,
        data: raw,
      });
    } catch (err) {
      result.checks.push({
        name: `Raw structures (page ${pageId})`,
        status: "fail",
        duration_ms: Date.now() - start,
        message: err instanceof Error ? err.message : "Unknown error",
      });
    }
  }

  if (test === "variation_detail") {
    const start = Date.now();
    try {
      if (!adId) {
        throw new Error("Missing ad_id");
      }
      const diag = await diagnoseVariationDetail(adId, country);
      result.checks.push({
        name: `Variation detail diagnosis (ad ${adId})`,
        status: diag.root_cause === "variation_revealed_after_click" || diag.root_cause === "detail_page_contains_video_without_click" ? "ok" : "warn",
        duration_ms: Date.now() - start,
        message: `Root cause: ${diag.root_cause}`,
        data: diag,
      });
      if (diag.root_cause === "variation_revealed_after_click") {
        result.root_cause = "The real variation media appears only after interacting with the ad detail page.";
      } else if (diag.root_cause === "detail_page_still_parent_shell") {
        result.root_cause = "Even the initial and interacted detail page still expose only the parent DCO shell for this ad.";
      } else if (diag.root_cause === "interaction_not_found") {
        result.root_cause = "No detail/variation interaction was found on the snapshot page.";
      }
    } catch (err) {
      result.checks.push({
        name: `Variation detail diagnosis (ad ${adId || "unknown"})`,
        status: "fail",
        duration_ms: Date.now() - start,
        message: err instanceof Error ? err.message : "Unknown error",
      });
    }
  }

  if (test === "media_causes") {
    const start = Date.now();
    try {
      const diag = await diagnoseMediaCauses(pageId, country);
      const failCount = diag.causes.filter((c) => c.status === "fail").length;
      result.checks.push({
        name: `Media causes 1–18 (page ${pageId})`,
        status: failCount > 0 ? "warn" : "ok",
        duration_ms: Date.now() - start,
        message: `${diag.summary.pass} pass, ${diag.summary.fail} fail, ${diag.summary.unknown} unknown`,
        data: diag,
      });
      if (failCount > 0) {
        const failed = diag.causes.filter((c) => c.status === "fail");
        result.root_cause = `Media causes FAILED: ${failed.map((c) => `#${c.cause} ${c.message}`).join("; ")}`;
      }
    } catch (err) {
      result.checks.push({
        name: `Media causes 1–18 (page ${pageId})`,
        status: "fail",
        duration_ms: Date.now() - start,
        message: err instanceof Error ? err.message : "Unknown error",
      });
    }
  }

  if (test === "discovery") {
    const start = Date.now();
    try {
      const report = await runDiscovery(pageId, country);
      result.checks.push({
        name: `Discovery (page ${pageId})`,
        status: "ok",
        duration_ms: Date.now() - start,
        message: report.summary.recommendation,
        data: report,
      });
    } catch (err) {
      result.checks.push({
        name: `Discovery (page ${pageId})`,
        status: "fail",
        duration_ms: Date.now() - start,
        message: err instanceof Error ? err.message : "Unknown error",
      });
    }
  }

  if (test === "resolve" && pageUrl) {
    const start = Date.now();
    try {
      const resolved = await resolvePageFromUrl(pageUrl, { pageName: pageName || undefined, country });
      result.checks.push({
        name: "Page resolve (page_url → page_id)",
        status: "ok",
        duration_ms: Date.now() - start,
        message: `Resolved to page_id=${resolved.page_id}, page_name=${resolved.page_name}`,
        data: resolved,
      });
    } catch (err) {
      result.checks.push({
        name: "Page resolve (page_url → page_id)",
        status: "fail",
        duration_ms: Date.now() - start,
        message: err instanceof Error ? err.message : "Unknown error",
      });
      result.root_cause = "See terminal for [resolver] logs. GraphQL may not find page node; Ads Library fallback may not find view_all_page_id links.";
    }
  }

  const allOk = result.checks.every((c) => c.status === "ok");
  return NextResponse.json(result, { status: allOk ? 200 : 207 });
}
