/**
 * Ads Library Discovery — Phase 1: Capture and document Meta's real structure.
 *
 * Run before changing extraction logic. Produces a report showing:
 * - Where ad_archive_id, display_resources, child_attachments, video_preview_url appear
 * - Byte offsets, script block locations, DOM hierarchy
 * - Whether creative data is on list page or snapshot-only
 *
 * Usage: npm run discovery -- --page_id=15087023444 --country=US
 * Or: GET /api/adspy/debug?test=discovery&page_id=...
 */

import { chromium } from "playwright";
import type { BrowserContext, Page } from "playwright";
import path from "path";
import * as fs from "fs";

const PROFILE_PATH = process.env.ADSPY_FACEBOOK_PROFILE;
const HEADLESS = process.env.ADSPY_HEADLESS !== "false";

const USER_AGENTS = [
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
];

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

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
    const resolved = path.resolve(process.cwd(), PROFILE_PATH);
    const context = await chromium.launchPersistentContext(resolved, {
      headless: HEADLESS,
      args: stealthArgs,
      viewport: { width: 1280, height: 900 },
      locale: "en-US",
      userAgent: USER_AGENTS[0],
      extraHTTPHeaders: { "Accept-Language": "en-US,en;q=0.9" },
    });
    return { context, close: () => context.close() };
  }

  const browser = await chromium.launch({
    headless: HEADLESS,
    args: stealthArgs,
  });
  const context = await browser.newContext({
    userAgent: USER_AGENTS[0],
    viewport: { width: 1280, height: 900 },
    locale: "en-US",
    extraHTTPHeaders: { "Accept-Language": "en-US,en;q=0.9" },
  });
  return { context, close: () => browser.close() };
}

async function verifyLoginStatus(page: Page): Promise<void> {
  if (!PROFILE_PATH) return;
  await page.goto("https://www.facebook.com", {
    waitUntil: "domcontentloaded",
    timeout: 45000,
  });
  await delay(2000);
  if (!HEADLESS) {
    try {
      await page.locator('[aria-label="Your profile"]').first().waitFor({ state: "visible", timeout: 10000 });
    } catch {
      // Continue
    }
  }
}

/** Find script blocks in HTML and identify which block contains a given offset. */
function findScriptBlockForOffset(html: string, offset: number): { index: number; tag: string; start: number; end: number } | null {
  const scriptRe = /<script[^>]*>([\s\S]*?)<\/script>/gi;
  let m: RegExpExecArray | null;
  let idx = 0;
  scriptRe.lastIndex = 0;
  while ((m = scriptRe.exec(html)) !== null) {
    const start = m.index;
    const end = m.index + m[0].length;
    const contentStart = html.indexOf(">", m.index) + 1;
    const contentEnd = html.lastIndexOf("<", end);
    if (offset >= contentStart && offset <= contentEnd) {
      const tag = m[0].slice(0, 80).replace(/\s+/g, " ");
      return { index: idx, tag, start, end };
    }
    idx++;
  }
  return null;
}

/** Analyze HTML structure: ad_archive_id, creative markers, offsets. */
function analyzeHtmlStructure(html: string, pageId: string): HtmlDiscoveryResult {
  const adArchiveMatches: { adId: string; offset: number; contextBefore: string; contextAfter: string; scriptBlock: string | null }[] = [];
  const adArchiveRe = /"ad_archive_id"\s*:\s*"(\d+)"/g;
  let m: RegExpExecArray | null;
  while ((m = adArchiveRe.exec(html)) !== null) {
    const adId = m[1];
    if (adId === pageId || adId.length < 5) continue;
    const offset = m.index;
    const contextBefore = html.slice(Math.max(0, offset - 2000), offset);
    const contextAfter = html.slice(offset, Math.min(html.length, offset + 2000));
    const block = findScriptBlockForOffset(html, offset);
    adArchiveMatches.push({
      adId,
      offset,
      contextBefore: contextBefore.slice(-500),
      contextAfter: contextAfter.slice(0, 500),
      scriptBlock: block ? `script[${block.index}] ${block.tag}` : null,
    });
  }

  // Dedupe by adId (keep last occurrence - creative often appears later)
  const byId = new Map<string, (typeof adArchiveMatches)[0]>();
  for (const a of adArchiveMatches) {
    byId.set(a.adId, a);
  }
  const uniqueAdIds = [...byId.values()].sort((a, b) => a.offset - b.offset);

  // For each ad, check if creative markers exist in surrounding chunk
  const creativeMarkerRe = /"display_resources"|"child_attachments"|"carousel_cards"|"video_sd_url"|"video_hd_url"|"video_preview_url"/;
  const adAnalyses: AdAnalysis[] = uniqueAdIds.map((a) => {
    const chunkStart = Math.max(0, a.offset - 30000);
    const chunkEnd = Math.min(html.length, a.offset + 50000);
    const chunk = html.slice(chunkStart, chunkEnd);
    const hasCreativeInChunk = creativeMarkerRe.test(chunk);
    const displayResourcesOffset = chunk.indexOf('"display_resources"');
    const childAttachmentsOffset = chunk.indexOf('"child_attachments"');
    const videoPreviewOffset = chunk.indexOf('"video_preview_url"');
    const displayResourcesInChunk = displayResourcesOffset >= 0 ? chunkStart + displayResourcesOffset : -1;
    const childAttachmentsInChunk = childAttachmentsOffset >= 0 ? chunkStart + childAttachmentsOffset : -1;
    const videoPreviewInChunk = videoPreviewOffset >= 0 ? chunkStart + videoPreviewOffset : -1;

    return {
      ad_id: a.adId,
      byte_offset: a.offset,
      has_creative_in_chunk: hasCreativeInChunk,
      display_resources_offset: displayResourcesInChunk >= 0 ? displayResourcesInChunk : null,
      child_attachments_offset: childAttachmentsInChunk >= 0 ? childAttachmentsInChunk : null,
      video_preview_url_offset: videoPreviewInChunk >= 0 ? videoPreviewInChunk : null,
      distance_to_display_resources: displayResourcesOffset >= 0 ? displayResourcesOffset - (a.offset - chunkStart) : null,
      distance_to_child_attachments: childAttachmentsOffset >= 0 ? childAttachmentsOffset - (a.offset - chunkStart) : null,
    };
  });

  // Global search for creative markers (not tied to specific ad)
  const displayResourcesAll = [...html.matchAll(/"display_resources"\s*:/g)].map((x) => x.index);
  const childAttachmentsAll = [...html.matchAll(/"child_attachments"\s*:/g)].map((x) => x.index);
  const videoPreviewAll = [...html.matchAll(/"video_preview_url"\s*:/g)].map((x) => x.index);

  return {
    html_length: html.length,
    ad_archive_id_count: uniqueAdIds.length,
    ad_ids: uniqueAdIds.map((a) => a.adId),
    ad_analyses: adAnalyses,
    creative_markers_global: {
      display_resources_count: displayResourcesAll.length,
      display_resources_offsets: displayResourcesAll.slice(0, 20),
      child_attachments_count: childAttachmentsAll.length,
      child_attachments_offsets: childAttachmentsAll.slice(0, 20),
      video_preview_url_count: videoPreviewAll.length,
      video_preview_url_offsets: videoPreviewAll.slice(0, 20),
    },
    sample_ad_context: uniqueAdIds[0]
      ? {
          ad_id: uniqueAdIds[0].adId,
          context_before_tail: uniqueAdIds[0].contextBefore.slice(-800),
          context_after_head: uniqueAdIds[0].contextAfter.slice(0, 800),
        }
      : null,
  };
}

/** DOM structure analysis. Pass as string to page.evaluate to avoid bundler helpers (__name etc). */
const DOM_DISCOVERY_SCRIPT = `
  (function() {
    const adLinks = document.querySelectorAll('a[href*="ads/library"], a[href*="ads/archive"]');
    const withId = Array.from(adLinks).filter(function(a) {
      const href = a.href || a.getAttribute("href") || "";
      return href && /[?&]id=\\d+/.test(href);
    });
    const articles = document.querySelectorAll('[role="article"]');
    const pagelets = document.querySelectorAll("[data-pagelet]");
    const getContainer = function(el) {
      return el.closest("[role='article']") || el.closest("[data-pagelet]") || el.closest("[role='group']") || el.closest("section") || el.closest("div");
    };
    const linkDetails = [];
    for (let i = 0; i < Math.min(adLinks.length, 15); i++) {
      const a = adLinks[i];
      const href = a.href || a.getAttribute("href") || "";
      const idMatch = href.match(/[?&]id=(\\d+)/);
      const container = getContainer(a);
      const adLinksInContainer = container ? container.querySelectorAll('a[href*="ads/library"], a[href*="ads/archive"]') : [];
      const imgsInContainer = container ? container.querySelectorAll("img") : [];
      const hasVideo = container ? container.querySelector("video") : null;
      linkDetails.push({
        index: i,
        has_id_param: !!idMatch,
        ad_id: idMatch ? idMatch[1] : null,
        container_tag: container ? container.tagName : null,
        container_role: container ? container.getAttribute("role") : null,
        ads_in_same_container: adLinksInContainer.length,
        imgs_in_container: imgsInContainer.length,
        has_video: !!hasVideo
      });
    }
    const html = document.documentElement.innerHTML;
    const adArchiveMatches = html.match(/"ad_archive_id"\\s*:\\s*"\\d+"/g) || [];
    return {
      total_ads_library_links: adLinks.length,
      links_with_id_param: withId.length,
      article_count: articles.length,
      pagelet_count: pagelets.length,
      link_details: linkDetails,
      ad_archive_id_in_html: adArchiveMatches.length
    };
  })()
`;

export type HtmlDiscoveryResult = {
  html_length: number;
  ad_archive_id_count: number;
  ad_ids: string[];
  ad_analyses: AdAnalysis[];
  creative_markers_global: {
    display_resources_count: number;
    display_resources_offsets: number[];
    child_attachments_count: number;
    child_attachments_offsets: number[];
    video_preview_url_count: number;
    video_preview_url_offsets: number[];
  };
  sample_ad_context: {
    ad_id: string;
    context_before_tail: string;
    context_after_head: string;
  } | null;
};

export type AdAnalysis = {
  ad_id: string;
  byte_offset: number;
  has_creative_in_chunk: boolean;
  display_resources_offset: number | null;
  child_attachments_offset: number | null;
  video_preview_url_offset: number | null;
  distance_to_display_resources: number | null;
  distance_to_child_attachments: number | null;
};

export type DomDiscoveryResult = {
  total_ads_library_links: number;
  links_with_id_param: number;
  article_count: number;
  pagelet_count: number;
  link_details: Array<{
    index: number;
    has_id_param: boolean;
    ad_id: string | null;
    container_tag: string | null;
    container_role: string | null;
    ads_in_same_container: number;
    imgs_in_container: number;
    has_video: boolean;
  }>;
  ad_archive_id_in_html: number;
};

export type DiscoveryReport = {
  timestamp: string;
  page_id: string;
  country: string;
  url: string;
  html: HtmlDiscoveryResult;
  dom: DomDiscoveryResult;
  summary: {
    creative_on_list_page: "yes" | "partial" | "no";
    ads_with_creative_in_chunk: number;
    ads_without_creative_in_chunk: number;
    dom_vs_html_ad_count: string;
    links_have_id_param: boolean;
    recommendation: string;
  };
};

/** Run full discovery: load page, capture HTML/DOM, analyze, produce report. */
export async function runDiscovery(
  pageId: string,
  country: string = "US",
  options: { activeStatus?: "active" | "all" } = {}
): Promise<DiscoveryReport> {
  const { activeStatus = "active" } = options;
  const { context, close } = await createContext();

  try {
    const page = await context.newPage();
    await verifyLoginStatus(page);

    const url = `https://www.facebook.com/ads/library/?active_status=${activeStatus}&ad_type=all&country=${country}&is_targeted_country=false&media_type=all&search_type=page&sort_data[direction]=desc&sort_data[mode]=total_impressions&source=fb-logo&view_all_page_id=${pageId}`;

    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
    await delay(3000);

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
      .catch(() => null);

    await delay(2000);
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
    const domResult = (await page.evaluate(DOM_DISCOVERY_SCRIPT)) as DomDiscoveryResult;
    const htmlResult = analyzeHtmlStructure(html, pageId);

    const adsWithCreative = htmlResult.ad_analyses.filter((a) => a.has_creative_in_chunk).length;
    const adsWithoutCreative = htmlResult.ad_analyses.length - adsWithCreative;

    let creativeOnListPage: "yes" | "partial" | "no" = "no";
    if (adsWithoutCreative === 0 && htmlResult.ad_analyses.length > 0) creativeOnListPage = "yes";
    else if (adsWithCreative > 0) creativeOnListPage = "partial";

    let recommendation: string;
    if (creativeOnListPage === "yes") {
      recommendation =
        "Creative data is present on list page. Design extraction for the exact locations documented in ad_analyses.";
    } else if (creativeOnListPage === "partial") {
      recommendation =
        "Some ads have creative on list page, others do not. Use chunk-based extraction with snapshot fallback for ads without creative in chunk.";
    } else {
      recommendation =
        "Creative data is NOT on list page (or not in expected chunks). Use snapshot-first: list page for IDs only, snapshot for creative.";
    }

    const report: DiscoveryReport = {
      timestamp: new Date().toISOString(),
      page_id: pageId,
      country,
      url,
      html: htmlResult,
      dom: domResult,
      summary: {
        creative_on_list_page: creativeOnListPage,
        ads_with_creative_in_chunk: adsWithCreative,
        ads_without_creative_in_chunk: adsWithoutCreative,
        dom_vs_html_ad_count: `DOM links: ${domResult.total_ads_library_links} (${domResult.links_with_id_param} with id), HTML ad_archive_id: ${htmlResult.ad_archive_id_count}`,
        links_have_id_param: domResult.links_with_id_param > 0,
        recommendation,
      },
    };

    return report;
  } finally {
    await close();
  }
}

/** Write report to JSON file. */
export function writeReportToFile(report: DiscoveryReport, outputPath: string): void {
  fs.writeFileSync(outputPath, JSON.stringify(report, null, 2), "utf-8");
}

/** Generate markdown summary from report. */
export function reportToMarkdown(report: DiscoveryReport): string {
  const s = report.summary;
  const h = report.html;
  const d = report.dom;

  let md = `# Ads Library Discovery Report\n\n`;
  md += `**Timestamp:** ${report.timestamp}\n`;
  md += `**Page ID:** ${report.page_id} | **Country:** ${report.country}\n`;
  md += `**URL:** ${report.url}\n\n`;

  md += `## Summary\n\n`;
  md += `| Metric | Value |\n|--------|-------|\n`;
  md += `| Creative on list page | ${s.creative_on_list_page} |\n`;
  md += `| Ads with creative in chunk | ${s.ads_with_creative_in_chunk} |\n`;
  md += `| Ads without creative in chunk | ${s.ads_without_creative_in_chunk} |\n`;
  md += `| DOM vs HTML | ${s.dom_vs_html_ad_count} |\n`;
  md += `| Links have ?id= param | ${s.links_have_id_param} |\n\n`;
  md += `**Recommendation:** ${s.recommendation}\n\n`;

  md += `## HTML Structure\n\n`;
  md += `- HTML length: ${h.html_length} bytes\n`;
  md += `- ad_archive_id count: ${h.ad_archive_id_count}\n`;
  md += `- display_resources occurrences: ${h.creative_markers_global.display_resources_count}\n`;
  md += `- child_attachments occurrences: ${h.creative_markers_global.child_attachments_count}\n`;
  md += `- video_preview_url occurrences: ${h.creative_markers_global.video_preview_url_count}\n\n`;

  md += `### Per-Ad Analysis (first 5)\n\n`;
  for (const a of h.ad_analyses.slice(0, 5)) {
    md += `- **${a.ad_id}** @ offset ${a.byte_offset}: creative_in_chunk=${a.has_creative_in_chunk}`;
    if (a.distance_to_display_resources != null)
      md += `, display_resources @ ${a.distance_to_display_resources} chars from ad_archive_id`;
    if (a.distance_to_child_attachments != null)
      md += `, child_attachments @ ${a.distance_to_child_attachments} chars`;
    md += `\n`;
  }

  md += `\n## DOM Structure\n\n`;
  md += `- Total ads/library links: ${d.total_ads_library_links}\n`;
  md += `- Links with ?id= param: ${d.links_with_id_param}\n`;
  md += `- [role="article"] count: ${d.article_count}\n`;
  md += `- [data-pagelet] count: ${d.pagelet_count}\n\n`;

  md += `### Link Details (first 5)\n\n`;
  for (const l of d.link_details.slice(0, 5)) {
    md += `- Link ${l.index}: has_id=${l.has_id_param}, ad_id=${l.ad_id ?? "—"}, container=${l.container_tag}/${l.container_role}, ads_in_container=${l.ads_in_same_container}, imgs=${l.imgs_in_container}, video=${l.has_video}\n`;
  }

  return md;
}
