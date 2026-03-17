/**
 * Diagnostic for media extraction failures.
 * Verifies causes 1–18 systematically.
 */

import {
  extractAdsFromHtml,
  extractAdsFromDomInPage,
  correlateUrlsToAdIds,
  isAdMediaUrlForNetwork,
} from "./ads-library-extract";

export type CauseResult = {
  cause: number;
  status: "pass" | "fail" | "unknown";
  message: string;
  evidence?: unknown;
};

const CHUNK_BEFORE = 8000;
const CHUNK_AFTER = 25000;

/** Find distance from ad_archive_id to nearest scontent/fbcdn URL in HTML. */
function nearestMediaDistance(html: string, adArchiveIndex: number): { distance: number; urlPreview: string } | null {
  const urlRe = /(https?:\/\/[^"'\s]*(?:scontent\.\w+\.fbcdn\.net|fbcdn\.net)[^"'\s]*)/g;
  let nearest: { distance: number; urlPreview: string } | null = null;
  let m: RegExpExecArray | null;
  urlRe.lastIndex = 0;
  while ((m = urlRe.exec(html)) !== null) {
    const dist = Math.abs(m.index - adArchiveIndex);
    if (!nearest || dist < nearest.distance) {
      nearest = { distance: dist, urlPreview: m[1].slice(0, 100) + (m[1].length > 100 ? "..." : "") };
    }
  }
  return nearest;
}

/** Cause 1: HTML chunk too small – media URL outside chunk. */
function verifyCause1(html: string, pageId: string): CauseResult {
  const adIdRe = /"ad_archive_id"\s*:\s*"(\d+)"/g;
  let m: RegExpExecArray | null;
  const samples: { adId: string; chunkSize: number; nearestDist: number | null; inChunk: boolean }[] = [];
  adIdRe.lastIndex = 0;
  let count = 0;
  while ((m = adIdRe.exec(html)) !== null && count < 5) {
    const adId = m[1];
    if (!adId || adId === pageId) continue;
    count++;
    const start = Math.max(0, m.index - CHUNK_BEFORE);
    const chunk = html.slice(start, m.index + CHUNK_AFTER);
    const nearest = nearestMediaDistance(html, m.index);
    const chunkHasUrl = /(?:scontent\.\w+\.fbcdn\.net|fbcdn\.net)/.test(chunk);
    samples.push({
      adId,
      chunkSize: chunk.length,
      nearestDist: nearest?.distance ?? null,
      inChunk: chunkHasUrl,
    });
  }
  const allInChunk = samples.every((s) => s.inChunk);
  const anyOutside = samples.some((s) => !s.inChunk && s.nearestDist !== null);
  return {
    cause: 1,
    status: anyOutside ? "fail" : allInChunk ? "pass" : "unknown",
    message: anyOutside
      ? `Media URL outside chunk for some ads. Chunk: ${CHUNK_BEFORE}+${CHUNK_AFTER} chars.`
      : allInChunk
        ? `All sampled ads have media within chunk.`
        : `Could not find media URLs in HTML for sampled ads.`,
    evidence: samples,
  };
}

/** Cause 2: Meta JSON structure changed – regex patterns don't match. */
function verifyCause2(html: string, pageId: string): CauseResult {
  const ads = extractAdsFromHtml(html, pageId);
  const withMedia = ads.filter((a) => a.image_url || a.video_url || (a.carousel_urls?.length ?? 0) > 0);
  const patterns = [
    "display_resources",
    "image_versions",
    "images",
    "thumbnail_url",
    "picture",
    "child_attachments",
  ];
  const foundInHtml = patterns.filter((p) => html.includes(`"${p}"`));
  return {
    cause: 2,
    status: withMedia.length === 0 && foundInHtml.length > 0 ? "fail" : withMedia.length > 0 ? "pass" : "unknown",
    message:
      withMedia.length === 0
        ? `HTML has keys [${foundInHtml.join(", ")}] but extraction got 0 ads with media. Patterns may not match structure.`
        : `Extraction found ${withMedia.length} ads with media.`,
    evidence: { adsWithMedia: withMedia.length, totalAds: ads.length, keysInHtml: foundInHtml },
  };
}

/** Cause 3: URLs in different fields. */
function verifyCause3(html: string): CauseResult {
  const urlRe = /(https?:\/\/[^"'\s]*(?:scontent\.\w+\.fbcdn\.net|fbcdn\.net)[^"'\s]*)/g;
  const matches = html.match(urlRe) ?? [];
  const unique = [...new Set(matches.map((u) => u.slice(0, 80)))];
  return {
    cause: 3,
    status: unique.length > 0 ? "pass" : "fail",
    message: unique.length > 0 ? `Found ${unique.length} unique media URL patterns in HTML.` : "No scontent/fbcdn URLs in HTML.",
    evidence: { urlCount: matches.length, uniquePreviews: unique.slice(0, 5) },
  };
}

/** Cause 4: Lazy loading – images not in DOM when we scrape. */
function verifyCause4(domResult: { count: number; withMedia: number; imgCount: number }): CauseResult {
  return {
    cause: 4,
    status: domResult.imgCount > 0 && domResult.withMedia === 0 ? "fail" : domResult.withMedia > 0 ? "pass" : "unknown",
    message:
      domResult.withMedia === 0 && domResult.imgCount > 0
        ? `${domResult.imgCount} imgs in DOM but 0 with media in extraction. Likely lazy loading.`
        : domResult.withMedia > 0
          ? `DOM extraction found ${domResult.withMedia} ads with media.`
          : `DOM had ${domResult.imgCount} imgs total.`,
    evidence: domResult,
  };
}

/** Cause 5: DOM structure changed – selectors don't find containers. */
function verifyCause5(diag: { article_count: number; links_with_id: number }): CauseResult {
  return {
    cause: 5,
    status: diag.article_count === 0 ? "unknown" : "pass",
    message:
      diag.article_count === 0
        ? `No [role="article"]. Mitigated: using [data-pagelet], [role=group], section, div.`
        : `Found ${diag.article_count} articles.`,
    evidence: diag,
  };
}

/** Cause 6: No links with ?id= – CDN correlation can't map. */
function verifyCause6(diag: { links_with_id: number }): CauseResult {
  return {
    cause: 6,
    status: diag.links_with_id === 0 ? "fail" : "pass",
    message:
      diag.links_with_id === 0
        ? "No ads/library links with ?id= param. CDN correlation cannot map URLs to ad IDs."
        : `${diag.links_with_id} links with id param.`,
    evidence: diag,
  };
}

/** Cause 7: isAdMediaUrl too strict. */
function verifyCause7(html: string, pageId: string): CauseResult {
  const urlRe = /(https?:\/\/[^"'\s]*(?:scontent\.\w+\.fbcdn\.net|fbcdn\.net)[^"'\s]*)/g;
  const matches = html.match(urlRe) ?? [];
  const wouldReject = matches.filter((u) => {
    if (!u || u.length < 20) return true;
    if (u.includes("emoji") || u.includes("1f") || u.includes("safe_image")) return true;
    if (u.includes("rsrc.php") || u.includes("static.xx.fbcdn.net")) return true;
    if (u.includes("graph.facebook.com")) return true;
    if (/\.js(\?|&|$)/.test(u) || u.endsWith(".js")) return true;
    return !u.includes("scontent") && !u.includes("fbcdn.net");
  });
  return {
    cause: 7,
    status: wouldReject.length === matches.length && matches.length > 0 ? "fail" : "pass",
    message:
      wouldReject.length > 0
        ? `${wouldReject.length}/${matches.length} URLs would be rejected by isAdMediaUrl.`
        : "No URLs or all would pass filter.",
    evidence: { total: matches.length, rejected: wouldReject.length, sampleRejected: wouldReject.slice(0, 2) },
  };
}

/** Cause 8: isAdMediaUrl too loose – invalid URLs accepted. */
function verifyCause8(ads: { image_url: string | null }[]): CauseResult {
  const withUrl = ads.filter((a) => a.image_url);
  const truncated = withUrl.filter((a) => {
    const u = a.image_url!;
    return u.endsWith("/v/") || u.endsWith("/") || u.length < 60;
  });
  return {
    cause: 8,
    status: truncated.length > 0 ? "fail" : "pass",
    message:
      truncated.length > 0
        ? `${truncated.length} ads have suspicious/truncated image_url (e.g. ends with /v/).`
        : "No obviously invalid URLs.",
    evidence: truncated.map((a) => ({ url: a.image_url?.slice(0, 120) })),
  };
}

/** Cause 9: graph.facebook.com exclusion. */
function verifyCause9(): CauseResult {
  return {
    cause: 9,
    status: "pass",
    message: "graph.facebook.com excluded by design (profile pics). No change needed.",
    evidence: null,
  };
}

/** Cause 10: DB column – user ruled out. */
function verifyCause10(): CauseResult {
  return {
    cause: 10,
    status: "pass",
    message: "Ruled out by user – previously worked.",
    evidence: null,
  };
}

/** Cause 11: Regex captures partial URL. Only check scontent (ad media), not static.xx (scripts). */
function verifyCause11(html: string): CauseResult {
  const scontentRe = /(https?:\/\/[^"'\s]*(?:scontent\.\w+\.fbcdn\.net|video\.\w+\.fbcdn\.net)[^"'\s]*)/g;
  const matches = html.match(scontentRe) ?? [];
  const truncated = matches.filter(
    (u) =>
      (u.endsWith("/v/") || u.endsWith("/v") || u.length < 60) &&
      !u.includes("static.xx") &&
      !u.endsWith(".js")
  );
  return {
    cause: 11,
    status: truncated.length > 0 ? "fail" : "pass",
    message:
      truncated.length > 0
        ? `Found ${truncated.length} scontent URLs that look truncated (end with /v/ or very short).`
        : matches.length > 0
          ? `All ${matches.length} scontent URLs look complete.`
          : "No scontent URLs in HTML (static.xx excluded).",
    evidence: truncated.length > 0 ? { truncatedSample: truncated.slice(0, 3) } : { scontentCount: matches.length },
  };
}

/** Cause 12: Chunk boundary cuts URL. */
function verifyCause12(html: string, pageId: string): CauseResult {
  const adIdRe = /"ad_archive_id"\s*:\s*"(\d+)"/g;
  let m: RegExpExecArray | null;
  const cutAtBoundary: { adId: string; atEnd: boolean }[] = [];
  adIdRe.lastIndex = 0;
  let count = 0;
  while ((m = adIdRe.exec(html)) !== null && count < 3) {
    const adId = m[1];
    if (!adId || adId === pageId) continue;
    count++;
    const chunkEnd = m.index + CHUNK_AFTER;
    const afterChunk = html.slice(chunkEnd, chunkEnd + 500);
    if (/https?:\/\//.test(afterChunk) && !/^["'\s]*\}/.test(afterChunk)) {
      cutAtBoundary.push({ adId, atEnd: true });
    }
  }
  return {
    cause: 12,
    status: cutAtBoundary.length > 0 ? "fail" : "pass",
    message:
      cutAtBoundary.length > 0
        ? `Possible URL cut at chunk end for ${cutAtBoundary.length} ads.`
        : "No evidence of chunk cutting URLs.",
    evidence: cutAtBoundary,
  };
}

/** Cause 13: API/insert truncation. */
function verifyCause13(ads: { image_url: string | null }[]): CauseResult {
  const withUrl = ads.filter((a) => a.image_url);
  const longUrls = withUrl.filter((a) => (a.image_url?.length ?? 0) > 200);
  return {
    cause: 13,
    status: longUrls.length > 0 ? "unknown" : "pass",
    message:
      longUrls.length > 0
        ? `${longUrls.length} ads have long URLs (>200 chars). Check API/DB doesn't truncate.`
        : "No very long URLs to truncate.",
    evidence: { longUrlCount: longUrls.length },
  };
}

/** Cause 14: Images not loaded when correlation runs. */
function verifyCause14(domImgCount: number, capturedUrlCount: number, correlatedCount: number): CauseResult {
  return {
    cause: 14,
    status:
      capturedUrlCount > 0 && domImgCount > 0 && correlatedCount === 0 ? "fail" : correlatedCount > 0 ? "pass" : "unknown",
    message:
      capturedUrlCount > 0 && correlatedCount === 0
        ? `Captured ${capturedUrlCount} URLs, DOM has imgs, but 0 correlated. Imgs may not have loaded.`
        : correlatedCount > 0
          ? `CDN correlation matched ${correlatedCount} ads.`
          : `Captured: ${capturedUrlCount}, DOM imgs: ${domImgCount}.`,
    evidence: { capturedUrlCount, domImgCount, correlatedCount },
  };
}

/** Cause 15: Network listener timing. */
function verifyCause15(capturedUrlCount: number): CauseResult {
  return {
    cause: 15,
    status: capturedUrlCount === 0 ? "fail" : "pass",
    message:
      capturedUrlCount === 0
        ? "No fbcdn/scontent URLs captured. Listener may attach too late."
        : `Captured ${capturedUrlCount} URLs from network.`,
    evidence: { capturedUrlCount },
  };
}

/** Cause 16: ad_id not in DOM for correlation. */
function verifyCause16(linksWithId: number, adArchiveInHtml: number): CauseResult {
  return {
    cause: 16,
    status: linksWithId === 0 && adArchiveInHtml > 0 ? "fail" : "pass",
    message:
      linksWithId === 0
        ? "No links with id. correlateUrlsToAdIds needs ad_id from link or container innerHTML."
        : "Links with id present.",
    evidence: { linksWithId, adArchiveInHtml },
  };
}

/** Cause 17: Wrong field mapping. */
function verifyCause17(): CauseResult {
  return {
    cause: 17,
    status: "unknown",
    message: "Manual check: API maps image_url → DB column correctly.",
    evidence: null,
  };
}

/** Cause 18: Null overwriting. */
function verifyCause18(): CauseResult {
  return {
    cause: 18,
    status: "unknown",
    message: "Manual check: No later step overwrites valid image_url with null.",
    evidence: null,
  };
}

export type MediaDiagnosticResult = {
  causes: CauseResult[];
  summary: { pass: number; fail: number; unknown: number };
};

/**
 * Run full media diagnostic for causes 1–18.
 * Requires: html, pageId, optional domResult, networkUrls, diag, scrapeResult.
 */
export function runMediaDiagnostic(params: {
  html: string;
  pageId: string;
  domResult?: { count: number; withMedia: number; imgCount: number };
  networkUrls?: string[];
  diag?: { article_count: number; links_with_id_param: number; ad_archive_id_in_html?: number };
  scrapeResult?: { ads: { image_url: string | null }[] };
  correlationResult?: Record<string, unknown>;
}): MediaDiagnosticResult {
  const {
    html,
    pageId,
    domResult = { count: 0, withMedia: 0, imgCount: 0 },
    networkUrls = [],
    diag = { article_count: 0, links_with_id_param: 0, ad_archive_id_in_html: 0 },
    scrapeResult,
    correlationResult = {},
  } = params;

  const htmlAds = extractAdsFromHtml(html, pageId);
  const ads = scrapeResult?.ads ?? htmlAds;

  const causes: CauseResult[] = [
    verifyCause1(html, pageId),
    verifyCause2(html, pageId),
    verifyCause3(html),
    verifyCause4(domResult),
    verifyCause5({ article_count: diag.article_count, links_with_id: diag.links_with_id_param }),
    verifyCause6({ links_with_id: diag.links_with_id_param }),
    verifyCause7(html, pageId),
    verifyCause8(ads),
    verifyCause9(),
    verifyCause10(),
    verifyCause11(html),
    verifyCause12(html, pageId),
    verifyCause13(ads),
    verifyCause14(domResult.imgCount, networkUrls.length, Object.keys(correlationResult).length),
    verifyCause15(networkUrls.length),
    verifyCause16(diag.links_with_id_param, diag.ad_archive_id_in_html ?? 0),
    verifyCause17(),
    verifyCause18(),
  ];

  const summary = {
    pass: causes.filter((c) => c.status === "pass").length,
    fail: causes.filter((c) => c.status === "fail").length,
    unknown: causes.filter((c) => c.status === "unknown").length,
  };

  return { causes, summary };
}
