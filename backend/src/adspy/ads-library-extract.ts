/**
 * Robust extraction of advertiser page_ids from Ads Library.
 * Supports: GraphQL interception, DOM selectors, raw HTML regex.
 */

export type AdvertiserResult = {
  page_id: string;
  page_name?: string;
  page_icon?: string;
};

/** Extract numeric page_id from various ID formats (e.g. "Page:123" or "123"). */
function toNumericId(id: unknown): string | null {
  if (id == null) return null;
  const str = String(id);
  const match = str.match(/(\d{8,})/);
  return match?.[1] ?? null;
}

/** Extract profile/image URL from GraphQL. */
function extractImageUrl(o: Record<string, unknown>): string | undefined {
  const url =
    (o.profile_picture_url ?? o.picture_url ?? o.image_url ?? o.thumbnail_url) as string | undefined;
  if (url && typeof url === "string" && url.startsWith("http") && !url.includes("emoji")) return url;
  const picture = o.picture as Record<string, unknown> | undefined;
  if (picture && typeof picture === "object") {
    const u = (picture.uri ?? picture.url ?? picture.src) as string | undefined;
    if (u && typeof u === "string" && u.startsWith("http")) return u;
  }
  return undefined;
}

/** Extract page name from various GraphQL field names. */
function extractName(o: Record<string, unknown>): string | undefined {
  const name =
    (o.page_name ?? o.name ?? o.username ?? o.advertiser_name ?? o.entity_name) as string | undefined;
  if (name && typeof name === "string") {
    const s = name.trim();
    if (s.length > 0 && s.length < 200 && !s.startsWith("http")) return s.slice(0, 150);
  }
  const advertiser = o.advertiser as Record<string, unknown> | undefined;
  if (advertiser && typeof advertiser === "object") {
    const an = (advertiser.name ?? advertiser.page_name ?? advertiser.username) as string | undefined;
    if (an && typeof an === "string") {
      const s = an.trim();
      if (s.length > 0 && s.length < 200) return s.slice(0, 150);
    }
  }
  return undefined;
}

/**
 * Extract advertisers from Ads Library GraphQL responses.
 * Handles: ad_library_main, ad_library_search, search_results_connection, etc.
 */
export function extractAdvertisersFromGraphQL(json: unknown): AdvertiserResult[] {
  const results: AdvertiserResult[] = [];
  const seen = new Set<string>();
  const visited = new WeakSet<object>();

  function collect(obj: unknown): void {
    if (!obj || typeof obj !== "object") return;
    const o = obj as Record<string, unknown>;
    if (visited.has(o)) return;
    visited.add(o);

    // Direct page_id + name/username (e.g. page node)
    const pid = toNumericId(o.page_id ?? o.advertiser_id ?? o.view_all_page_id);
    if (pid && !seen.has(pid)) {
      const name = extractName(o);
      if (name) {
        seen.add(pid);
        results.push({ page_id: pid, page_name: name, page_icon: extractImageUrl(o) });
      }
    }

    // Ads Library collated_results structure - search for name in item, snapshot, advertiser
    const edges = (o.search_results_connection as { edges?: unknown[] })?.edges ?? o.edges;
    if (Array.isArray(edges)) {
      for (const edge of edges) {
        const node = (edge as { node?: unknown })?.node ?? edge;
        const collated = (node as { collated_results?: unknown[] })?.collated_results;
        if (Array.isArray(collated)) {
          for (const item of collated) {
            const itemObj = item as Record<string, unknown>;
            const adv = itemObj.advertiser as Record<string, unknown> | undefined;
            const pid2 = toNumericId(itemObj.page_id ?? (itemObj.snapshot as Record<string, unknown>)?.page_id ?? adv?.page_id);
            if (pid2 && !seen.has(pid2)) {
              const snap = itemObj.snapshot as Record<string, unknown> | undefined;
              const name =
                extractName(itemObj) ??
                (snap && extractName(snap)) ??
                (itemObj.advertiser && typeof itemObj.advertiser === "object"
                  ? extractName(itemObj.advertiser as Record<string, unknown>)
                  : undefined);
              const icon =
                extractImageUrl(itemObj) ??
                (snap && extractImageUrl(snap)) ??
                (adv && extractImageUrl(adv));
              seen.add(pid2);
              results.push({ page_id: pid2, page_name: name ?? undefined, page_icon: icon });
            }
          }
        }
        collect(node);
      }
    }

    // Recurse into children
    const main = o.ad_library_main ?? o.ad_library_search ?? o.data;
    if (main) collect(main);
    if (o.node) collect(o.node);
    if (o.data) collect(o.data);

    for (const key of ["edges", "nodes", "results", "collated_results"]) {
      const arr = o[key];
      if (Array.isArray(arr)) for (const v of arr) collect(v);
    }

    for (const value of Object.values(o)) {
      if (Array.isArray(value)) {
        for (const item of value) collect(item);
      } else if (value && typeof value === "object") {
        collect(value);
      }
    }
  }

  collect(json);
  return results;
}

/** Extract ad ID from collated item (ad_archive_id or snapshot.ad_snapshot_id). */
function getAdIdFromCollated(item: Record<string, unknown>): string | null {
  const id =
    (item.ad_archive_id ?? item.ad_snapshot_id ?? (item.snapshot as Record<string, unknown>)?.ad_snapshot_id) as
      | string
      | number
      | undefined;
  if (id == null) return null;
  const s = String(id);
  return s.length >= 10 ? s : null;
}

function getTextValuesFromObj(obj: unknown, keys: string[]): string[] {
  const out: string[] = [];
  const visited = new WeakSet<object>();

  function collect(value: unknown, depth: number): void {
    if (!value || typeof value !== "object" || depth > 3) return;
    const o = value as Record<string, unknown>;
    if (visited.has(o)) return;
    visited.add(o);

    for (const k of keys) {
      const v = o[k];
      if (typeof v === "string" && v.length >= 15 && !/^(No caption|Video|Image|Photo|Sponsored)$/i.test(v.trim())) {
        out.push(v.trim());
      }
      if (v && typeof v === "object" && !Array.isArray(v)) {
        const vObj = v as Record<string, unknown>;
        const t = vObj.text;
        if (typeof t === "string" && t.length >= 15) out.push(t.trim());
      }
    }

    for (const nested of Object.values(o)) {
      if (Array.isArray(nested)) {
        for (const entry of nested) collect(entry, depth + 1);
      } else if (nested && typeof nested === "object") {
        collect(nested, depth + 1);
      }
    }
  }

  collect(obj, 0);
  return out;
}

/** Extract body-like ad text without title/description fields mixed in. */
function getBodyTextFromObj(obj: unknown): string[] {
  return getTextValuesFromObj(obj, ["primary_text", "ad_creative_body", "body", "ad_copy", "message"]);
}

/** Extract card/headline/title text. */
function getHeadlineTextFromObj(obj: unknown): string[] {
  return getTextValuesFromObj(obj, ["headline", "link_title", "title", "caption"]);
}

/** Extract supporting description text shown near the CTA block. */
function getDescriptionTextFromObj(obj: unknown): string[] {
  return getTextValuesFromObj(obj, ["link_description", "description"]);
}

/** Extract image URLs from nested object (display_resources, child_attachments, picture, etc.). */
function getImageUrlsFromObj(obj: unknown): string[] {
  const out: string[] = [];
  if (!obj || typeof obj !== "object") return out;
  const o = obj as Record<string, unknown>;

  const addUrl = (u: unknown) => {
    if (typeof u === "string" && u.startsWith("http") && isAdMediaUrl(u) && !isLogoOrSmallThumbnail(u)) {
      out.push(normalizeMediaUrl(u));
    }
  };

  addUrl(
    o.image_url ??
      o.original_image_url ??
      o.picture ??
      o.thumbnail_url ??
      o.video_preview_image_url ??
      o.resized_image_url ??
      o.watermarked_resized_image_url
  );
  const dr = o.display_resources as Array<{ src?: string }> | undefined;
  if (Array.isArray(dr)) for (const r of dr) addUrl(r?.src);
  const iv = o.image_versions as Array<{ url?: string }> | undefined;
  if (Array.isArray(iv)) for (const v of iv) addUrl(v?.url);
  const child = (
    o.child_attachments ??
    o.carousel_cards ??
    o.cards ??
    o.sub_attachments ??
    o.images ??
    o.extra_images
  ) as Array<Record<string, unknown>> | undefined;
  if (Array.isArray(child)) for (const c of child) getImageUrlsFromObj(c).forEach((u) => out.push(u));
  for (const value of Object.values(o)) {
    if (Array.isArray(value)) {
      for (const item of value) {
        if (item && typeof item === "object") getImageUrlsFromObj(item).forEach((u) => out.push(u));
      }
    } else if (value && typeof value === "object") {
      getImageUrlsFromObj(value).forEach((u) => out.push(u));
    }
  }
  return out;
}

function getCarouselCardImageUrls(obj: unknown): string[] {
  if (!obj || typeof obj !== "object") return [];
  const o = obj as Record<string, unknown>;
  const cardArrays = [o.cards, o.child_attachments, o.carousel_cards, o.sub_attachments];
  const urls: string[] = [];

  const pickCardImage = (card: Record<string, unknown>): string | null => {
    const candidates = [
      card.resized_image_url,
      card.original_image_url,
      card.image_url,
      card.thumbnail_url,
      card.video_preview_image_url,
      typeof card.picture === "string" ? card.picture : null,
    ];
    for (const candidate of candidates) {
      if (typeof candidate === "string" && candidate.startsWith("http") && isAdMediaUrl(candidate) && !isLogoOrSmallThumbnail(candidate)) {
        return normalizeMediaUrl(candidate);
      }
    }
    return null;
  };

  for (const arr of cardArrays) {
    if (!Array.isArray(arr)) continue;
    for (const entry of arr) {
      if (!entry || typeof entry !== "object") continue;
      const picked = pickCardImage(entry as Record<string, unknown>);
      if (picked) urls.push(picked);
    }
    if (urls.length > 0) break;
  }

  return [...new Set(urls)];
}

/** Extract video URL from nested object. */
function getVideoUrlFromObj(obj: unknown): string | null {
  if (!obj || typeof obj !== "object") return null;
  const o = obj as Record<string, unknown>;
  const keys = ["video_sd_url", "video_hd_url", "video_url", "video_preview_url", "source", "playable_url", "playable_url_quality_hd"];
  for (const k of keys) {
    const v = o[k];
    if (typeof v === "string" && v.includes("http") && (v.includes("video.") || /\.(mp4|webm)/i.test(v))) {
      return normalizeMediaUrl(v);
    }
  }
  const videos = o.videos as Array<Record<string, unknown>> | undefined;
  if (Array.isArray(videos) && videos[0]) return getVideoUrlFromObj(videos[0]);
  const video = o.video as Record<string, unknown> | undefined;
  if (video && typeof video === "object") return getVideoUrlFromObj(video);
  const creative = o.video_creative ?? o.creative as Record<string, unknown> | undefined;
  if (creative && typeof creative === "object") return getVideoUrlFromObj(creative);
  return null;
}

/** Extract CTA from nested object. */
function getCtaFromObj(obj: unknown): string | null {
  if (!obj || typeof obj !== "object") return null;
  const o = obj as Record<string, unknown>;
  const cta = o.cta_text ?? o.call_to_action_type ?? (o.link_cta as Record<string, unknown>)?.text ?? (o.call_to_action as Record<string, unknown>)?.value;
  if (typeof cta === "string" && cta.length >= 2 && cta.length <= 120 && !isInvalidCta(cta)) return cta.trim();
  return null;
}

function getStringFromObj(obj: unknown, keys: string[]): string | null {
  if (!obj || typeof obj !== "object") return null;
  const o = obj as Record<string, unknown>;
  for (const key of keys) {
    const value = o[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

function getBooleanFromObj(obj: unknown, keys: string[]): boolean | null {
  if (!obj || typeof obj !== "object") return null;
  const o = obj as Record<string, unknown>;
  for (const key of keys) {
    const value = o[key];
    if (typeof value === "boolean") return value;
  }
  return null;
}

function getNumberFromObj(obj: unknown, keys: string[]): number | null {
  if (!obj || typeof obj !== "object") return null;
  const o = obj as Record<string, unknown>;
  for (const key of keys) {
    const value = o[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
  }
  return null;
}

/**
 * Extract ads from Ads Library GraphQL responses.
 * Handles: search_results_connection → edges → node → collated_results → snapshot.
 */
export function extractAdsFromGraphQL(json: unknown, pageId: string): ExtractedAd[] {
  const results: ExtractedAd[] = [];
  const seen = new Set<string>();
  const visited = new WeakSet<object>();

  function collect(obj: unknown): void {
    if (!obj || typeof obj !== "object") return;
    const o = obj as Record<string, unknown>;
    if (visited.has(o)) return;
    visited.add(o);

    const edges = (o.search_results_connection as { edges?: unknown[] })?.edges ?? o.edges;
    if (Array.isArray(edges)) {
      for (const edge of edges) {
        const node = (edge as { node?: unknown })?.node ?? edge;
        const collated = (node as { collated_results?: unknown[] })?.collated_results;
        if (Array.isArray(collated)) {
          for (const item of collated) {
            const itemObj = item as Record<string, unknown>;
            const adId = getAdIdFromCollated(itemObj);
            if (!adId || adId === pageId || seen.has(adId)) continue;
            seen.add(adId);

            const snap = (itemObj.snapshot ?? itemObj) as Record<string, unknown>;
            const bodyTextParts = getBodyTextFromObj(snap);
            const headlineTextParts = getHeadlineTextFromObj(snap);
            const descriptionTextParts = getDescriptionTextFromObj(snap);
            const adText =
              bodyTextParts.length > 0
                ? cleanAdText(filterMetadataFromAdText(bodyTextParts.join("\n\n").slice(0, 2000)))
                : "";
            const adHeadline =
              headlineTextParts.length > 0
                ? cleanAdText(filterMetadataFromAdText(headlineTextParts[0].slice(0, 300)))
                : null;
            const adDescription =
              descriptionTextParts.length > 0
                ? cleanAdText(filterMetadataFromAdText(descriptionTextParts[0].slice(0, 500)))
                : null;

            const snapDisplayFormat = getStringFromObj(snap, ["display_format", "creative_format", "format"]);
            const itemDisplayFormat = getStringFromObj(itemObj, ["display_format", "creative_format", "format"]);

            const snapCardCarouselUrls = getCarouselCardImageUrls(snap);
            const itemCardCarouselUrls = getCarouselCardImageUrls(itemObj);

            let videoUrl = getVideoUrlFromObj(snap);
            if (!videoUrl) {
              const v = (snap.videos as Record<string, unknown>[])?.[0];
              if (v) videoUrl = getVideoUrlFromObj(v);
            }
            if (!videoUrl) {
              videoUrl = getVideoUrlFromObj(itemObj);
            }

            const displayFormat =
              snapDisplayFormat ??
              (videoUrl ? "VIDEO" : null) ??
              itemDisplayFormat;

            // For collated/multi-version ads, itemObj can contain parent-level carousel cards while
            // snapshot carries the actual hidden variation's creative. If this variation is a video,
            // don't let parent carousel media override it.
            const preferSnapshotCreative = Boolean(videoUrl) || snapDisplayFormat === "VIDEO";
            const cardCarouselUrls = [
              ...snapCardCarouselUrls,
              ...(preferSnapshotCreative ? [] : itemCardCarouselUrls),
            ];
            const imageUrls = [
              ...cardCarouselUrls,
              ...getImageUrlsFromObj(snap),
              ...(preferSnapshotCreative ? [] : getImageUrlsFromObj(itemObj)),
            ];

            const carouselUrls =
              displayFormat === "CAROUSEL" || cardCarouselUrls.length > 0
                ? [...new Set(cardCarouselUrls)]
                : [...new Set(imageUrls.filter((u) => u && isAdMediaUrl(u) && !isLogoOrSmallThumbnail(u)))];
            const imageUrl = pickBestImageUrl(carouselUrls.length > 0 ? carouselUrls : imageUrls) ?? null;
            if (imageUrl && !carouselUrls.includes(imageUrl)) carouselUrls.unshift(imageUrl);

            const cta = getCtaFromObj(snap) ?? getCtaFromObj(itemObj);
            const landingPageUrl =
              getStringFromObj(snap, ["link_url", "url", "website_url", "destination_url"]) ??
              getStringFromObj(itemObj, ["link_url", "url", "website_url", "destination_url"]);

            let ad_start_date: string | null = null;
            const ts =
              snap.ad_delivery_start_time ??
              snap.start_date ??
              itemObj.ad_delivery_start_time ??
              itemObj.start_date;
            if (typeof ts === "number" && ts > 1e9) {
              ad_start_date = new Date(ts * 1000).toISOString().slice(0, 10);
            } else if (typeof ts === "string" && /^\d{4}-\d{2}-\d{2}/.test(ts)) {
              ad_start_date = ts.slice(0, 10);
            }

            let publisher_platforms: string[] | null = null;
            const pp = snap.publisher_platform ?? snap.publisher_platforms;
            if (Array.isArray(pp)) publisher_platforms = pp.filter((x): x is string => typeof x === "string");
            else if (typeof pp === "string") publisher_platforms = [pp];

            const pageName =
              getStringFromObj(snap, ["page_name", "advertiser_name", "title"]) ??
              getStringFromObj(itemObj, ["page_name", "advertiser_name", "page_title", "title"]);
            const isActive =
              getBooleanFromObj(itemObj, ["is_active"]) ??
              getBooleanFromObj(snap, ["is_active"]);
            const collationId =
              getStringFromObj(itemObj, ["collation_id", "creative_collation_id", "group_id"]) ??
              getStringFromObj(snap, ["collation_id", "creative_collation_id", "group_id"]);
            const collationCount =
              getNumberFromObj(itemObj, ["collation_count", "creative_collation_count", "variants_count"]) ??
              getNumberFromObj(snap, ["collation_count", "creative_collation_count", "variants_count"]);

            results.push({
              ad_id: adId,
              ad_text: adText,
              ad_headline: adHeadline,
              ad_description: adDescription,
              image_url: imageUrl,
              video_url: videoUrl,
              carousel_urls: carouselUrls,
              cta,
              landing_page_url: landingPageUrl,
              ad_start_date,
              display_format: displayFormat,
              page_name: pageName,
              is_active: isActive,
              collation_id: collationId,
              collation_count: collationCount,
              publisher_platforms,
            });
          }
        }
        collect(node);
      }
    }

    const main = o.ad_library_main ?? o.ad_library_search ?? o.data;
    if (main) collect(main);
    if (o.node) collect(o.node);
    if (o.data) collect(o.data);

    for (const value of Object.values(o)) {
      if (Array.isArray(value)) {
        for (const item of value) collect(item);
      } else if (value && typeof value === "object") {
        collect(value);
      }
    }
  }

  collect(json);
  return results;
}

/**
 * Extract Ads Library GraphQL payloads embedded in application/json SSR/Relay script tags.
 * Meta often hydrates the full collated ad payload inline without a separate network /graphql response.
 */
export function extractAdsFromInlineGraphQLHtml(html: string, pageId: string): ExtractedAd[] {
  const results: ExtractedAd[] = [];
  const byAdId = new Map<string, ExtractedAd>();
  const scriptRe = /<script\b[^>]*type="application\/json"[^>]*>([\s\S]*?)<\/script>/gi;
  let match: RegExpExecArray | null;

  while ((match = scriptRe.exec(html)) !== null) {
    const raw = match[1]?.trim();
    if (!raw) continue;
    if (!/search_results_connection|collated_results|ad_archive_id/.test(raw)) continue;

    try {
      const parsed = JSON.parse(raw) as unknown;
      const extracted = extractAdsFromGraphQL(parsed, pageId);
      for (const ad of extracted) {
        const existing = byAdId.get(ad.ad_id);
        if (!existing) {
          byAdId.set(ad.ad_id, ad);
          continue;
        }
        const mergedCarousel = [...new Set([...(existing.carousel_urls ?? []), ...(ad.carousel_urls ?? [])])];
        byAdId.set(ad.ad_id, {
          ...existing,
          ...ad,
          ad_text:
            ad.ad_text?.trim().length && ad.ad_text.trim().length >= existing.ad_text.trim().length
              ? ad.ad_text
              : existing.ad_text,
          image_url: ad.image_url ?? existing.image_url ?? mergedCarousel[0] ?? null,
          video_url: ad.video_url ?? existing.video_url,
          carousel_urls: mergedCarousel,
          cta: ad.cta ?? existing.cta,
          landing_page_url: ad.landing_page_url ?? existing.landing_page_url,
          ad_start_date: ad.ad_start_date ?? existing.ad_start_date,
          display_format:
            ad.video_url || existing.video_url
              ? "VIDEO"
              : ad.display_format === "CAROUSEL" || (existing.display_format !== "CAROUSEL" && mergedCarousel.length > 1)
                ? "CAROUSEL"
                : ad.display_format ?? existing.display_format,
          page_name: ad.page_name ?? existing.page_name,
          is_active: ad.is_active ?? existing.is_active,
          collation_id: ad.collation_id ?? existing.collation_id,
          collation_count: ad.collation_count ?? existing.collation_count,
          publisher_platforms:
            ad.publisher_platforms?.length || existing.publisher_platforms?.length
              ? [...new Set([...(existing.publisher_platforms ?? []), ...(ad.publisher_platforms ?? [])])]
              : null,
        });
      }
    } catch {
      // Ignore non-JSON or unexpected script payloads.
    }
  }

  results.push(...byAdId.values());
  return results;
}

/**
 * Extract page_ids from raw HTML using regex.
 * Catches embedded data in script tags, data attributes, etc.
 */
export function extractPageIdsFromHtml(html: string): string[] {
  const seen = new Set<string>();
  const patterns = [
    /view_all_page_id=(\d{8,})/g,
    /[?&]page_id=(\d{8,})/g,
    /"page_id"\s*:\s*"(\d{8,})"/g,
    /"page_id"\s*:\s*(\d{8,})/g,
    /"pageID"\s*:\s*"(\d{8,})"/g,
    /"view_all_page_id"\s*:\s*"(\d{8,})"/g,
    /"advertiser_id"\s*:\s*"(\d{8,})"/g,
    /\/ads\/library\/[^"'\s]*view_all_page_id=(\d{8,})/g,
  ];

  for (const re of patterns) {
    let m: RegExpExecArray | null;
    re.lastIndex = 0;
    while ((m = re.exec(html)) !== null) {
      if (m[1] && !seen.has(m[1])) seen.add(m[1]);
    }
  }

  return [...seen];
}

/**
 * Extract advertisers (page_id + page_name) from raw HTML.
 * Looks for JSON-like blocks where page_id and page_name appear together.
 */
export function extractAdvertisersFromHtml(html: string): AdvertiserResult[] {
  const seen = new Set<string>();
  const results: AdvertiserResult[] = [];

  // Pattern 1: "page_id":"123"... "page_name":"Nike" (within ~400 chars)
  const re1 = /"page_id"\s*:\s*"(\d{8,})"[^}]{0,400}?"page_name"\s*:\s*"([^"\\]*(?:\\.[^"\\]*)*)"/g;
  let m1: RegExpExecArray | null;
  re1.lastIndex = 0;
  while ((m1 = re1.exec(html)) !== null) {
    const pid = m1[1];
    const name = m1[2].replace(/\\"/g, '"').trim().slice(0, 150);
    if (pid && name && !seen.has(pid) && name.length > 0 && name.length < 200) {
      seen.add(pid);
      results.push({ page_id: pid, page_name: name });
    }
  }

  // Pattern 2: "page_name":"Nike"... "page_id":"123"
  const re2 = /"page_name"\s*:\s*"([^"\\]*(?:\\.[^"\\]*)*)"[^}]{0,400}?"page_id"\s*:\s*"(\d{8,})"/g;
  re2.lastIndex = 0;
  while ((m1 = re2.exec(html)) !== null) {
    const name = m1[1].replace(/\\"/g, '"').trim().slice(0, 150);
    const pid = m1[2];
    if (pid && name && !seen.has(pid) && name.length > 0 && name.length < 200) {
      seen.add(pid);
      results.push({ page_id: pid, page_name: name });
    }
  }

  // Pattern 3: advertiser_name near page_id
  const re3 = /"advertiser_name"\s*:\s*"([^"\\]*(?:\\.[^"\\]*)*)"[^}]{0,200}?"page_id"\s*:\s*"(\d{8,})"/g;
  re3.lastIndex = 0;
  while ((m1 = re3.exec(html)) !== null) {
    const name = m1[1].replace(/\\"/g, '"').trim().slice(0, 150);
    const pid = m1[2];
    if (pid && name && !seen.has(pid) && name.length > 0 && name.length < 200) {
      seen.add(pid);
      results.push({ page_id: pid, page_name: name });
    }
  }

  return results;
}

export type ExtractedAd = {
  ad_id: string;
  ad_text: string;
  ad_headline?: string | null;
  ad_description?: string | null;
  image_url: string | null;
  video_url: string | null;
  carousel_urls: string[];
  cta: string | null;
  landing_page_url?: string | null;
  ad_start_date: string | null;
  display_format?: string | null;
  page_name?: string | null;
  is_active?: boolean | null;
  collation_id?: string | null;
  collation_count?: number | null;
  publisher_platforms: string[] | null;
};

/** Unescape JSON string (backslash-escaped). */
function unescapeJsonString(s: string): string {
  return s
    .replace(/\\"/g, '"')
    .replace(/\\n/g, "\n")
    .replace(/\\u([0-9a-fA-F]{4})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
    .trim()
    .slice(0, 2000);
}

/** Facebook CDN size params: s60x60 = thumbnail, s600x600 = full. Reject small sizes (incl. s148 logo). */
const SMALL_SIZE_PATTERN = /[_-]s(?:50|60|80|100|120|148|150|200)x(?:50|60|80|100|120|148|150|200)(?:[_-]|$|\?|&)/i;
/** Profile/logo: p148x148, p100x100, dst-png_s100x100 (Meta uses these for page pics). */
const PROFILE_SIZE_PATTERN = /[_-]p(?:50|60|80|100|120|148|150|200)x(?:50|60|80|100|120|148|150|200)(?:[_-]|$|\?|&)/i;

/** Check if URL looks like ad creative (exclude emoji, avatars, icons, scripts, placeholders, thumbnails). */
function isAdMediaUrl(url: string): boolean {
  if (!url || url.length < 20) return false;
  if (url.includes("emoji") || url.includes("1f") || url.includes("safe_image")) return false;
  if (url.includes("rsrc.php")) return false; // Resource loader - scripts, not images
  if (url.includes("static.xx.fbcdn.net")) return false; // Static script CDN
  if (url.includes("graph.facebook.com")) return false; // Profile pictures, not ad creatives
  if (/\.js(\?|&|$)/.test(url) || url.endsWith(".js")) return false; // JavaScript files
  if (url.includes("placeholder") || url.includes("silhouette") || url.includes("default_avatar")) return false;
  if (/[?&_]1x1(?:\.[a-z]+|$|\?|&)/i.test(url)) return false; // 1x1 placeholder
  if (SMALL_SIZE_PATTERN.test(url)) return false; // s60x60, s100x100 etc = profile/logo thumbnails
  if (PROFILE_SIZE_PATTERN.test(url)) return false; // p148x148, p100x100 = page profile pics
  return url.includes("scontent") || url.includes("fbcdn.net");
}

/** True if URL looks like small profile/logo (e.g. _50x50, s148x148). Deprioritize these. */
function isLikelyProfileOrLogoUrl(url: string): boolean {
  return (
    /[_-](?:50|80|100|120|148|150)x(?:50|80|100|120|148|150)(?:\.[a-z]+|$|\?)/i.test(url) ||
    SMALL_SIZE_PATTERN.test(url) ||
    /\/[ps](\d+)\./i.test(url)
  );
}

/** Reject URL if it looks like profile pic, logo, or small thumbnail (not main creative). */
function isLogoOrSmallThumbnail(url: string): boolean {
  if (!url) return true;
  if (SMALL_SIZE_PATTERN.test(url)) return true;
  if (PROFILE_SIZE_PATTERN.test(url)) return true; // p148x148, p100x100
  if (/[_-](?:50|80|100|120|148|150)x(?:50|80|100|120|148|150)(?:\.[a-z]+|$|\?)/i.test(url)) return true;
  if (url.includes("graph.facebook.com")) return true;
  return false;
}

/** Pick best image URL from candidates (prefer main creative over logo/thumbnail). */
function pickBestImageUrl(candidates: string[]): string | null {
  const valid = candidates.filter((u) => u && isAdMediaUrl(u) && !isLogoOrSmallThumbnail(u));
  if (valid.length > 0) return valid[0];
  const fallback = candidates.filter((u) => u && isAdMediaUrl(u));
  return fallback[0] ?? null;
}

/** Normalize protocol-relative, ensure https, fix &amp; for CDN URLs. Unescape JSON \/ to /. */
function normalizeMediaUrl(url: string): string {
  if (!url?.trim()) return "";
  const s = url
    .trim()
    .replace(/\\\//g, "/")
    .replace(/&amp;/gi, "&");
  if (s.startsWith("//")) return "https:" + s;
  if (s.startsWith("http://") || s.startsWith("https://")) return s;
  return "https://" + s;
}

/** Strip Ads Library template placeholders like {{product.brand}} {{product.description}}. */
export function cleanAdText(text: string): string {
  if (!text) return "";
  return text
    .replace(/\{\{[^}]*\}\}/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** CTA values that are UI chrome, not real ad CTAs. Treat as invalid. */
const INVALID_CTA_PATTERN = /^(Filters|Sort|Remove|Remove Filters|Sort by|Active status|View on Meta|Ad creative|No caption)$/i;

/** Return true if CTA looks like UI metadata, not a real ad call-to-action. */
export function isInvalidCta(cta: string | null | undefined): boolean {
  if (!cta?.trim()) return true;
  const t = cta.trim();
  if (t.length < 2 || t.length > 120) return true;
  if (INVALID_CTA_PATTERN.test(t)) return true;
  if (/^https?:\/\//.test(t)) return true;
  if (/^[a-z0-9.-]+\.(com|org|net|io)$/i.test(t)) return true;
  return false;
}

/** Filter out UI/metadata text that often leaks into ad descriptions. */
export function filterMetadataFromAdText(text: string): string {
  if (!text?.trim()) return "";
  const s = text.trim();
  const metadataPatterns = [
    /FiltersSort\s*Sort\s*by/gi,
    /SortSort\s*by/gi,
    /Sort\s*by\s*Remove/gi,
    /Remove\s*Filters/gi,
    /Active status:\s*Active ads/gi,
    /Sort by\s*Active status/gi,
    /^Sort\s*by\s*/i,
    /^Filters\s*/i,
    /^Remove\s*Filters\s*/i,
    /^Remove\s*Active\s*/i,
    /Library ID:\s*\d+/gi,
    /Started running on\s+[A-Za-z]+/gi,
    /ad library report/i,
    /branded content/i,
    /why am i seeing this/i,
    /about this ad/i,
    /platforms\s*this ad has multiple versions/gi,
    /this ad has multiple versions/gi,
    /see ad details/gi,
    /see summary details/gi,
    /open dropdown/gi,
    /active\s+\d{1,2},\s+\d{4}/gi,
  ];
  let out = s;
  for (const re of metadataPatterns) {
    out = out.replace(re, " ").replace(/\s+/g, " ").trim();
  }
  return out;
}

/** Extract unique ad IDs from HTML (for snapshot-based flow). */
export function getAdIdsFromHtml(html: string, pageId: string): string[] {
  const pairs = findAdIdMatches(html);
  const seen = new Set<string>();
  const ids: string[] = [];
  for (const { adId } of pairs) {
    if (adId === pageId || adId.length < 5 || seen.has(adId)) continue;
    seen.add(adId);
    ids.push(adId);
  }
  return ids;
}

/**
 * Extract the HTML chunk around the first ad_archive_id for debugging.
 * Returns chunk preview and URL matches to diagnose why media extraction may fail.
 */
export function getFirstAdChunkForDebug(html: string, pageId: string): {
  ad_id: string;
  chunk_preview: string;
  chunk_length: number;
  url_matches: string[];
} | null {
  const m = html.match(/"ad_archive_id"\s*:\s*"(\d+)"/);
  if (!m) return null;
  const adId = m[1];
  if (!adId || adId === pageId) return null;
  const idx = html.indexOf(m[0]);
  const start = Math.max(0, idx - 4000);
  const chunk = html.slice(start, idx + 10000);
  const urlMatches: string[] = [];
  const urlRe = /(https?:\/\/[^"'\s]*(?:scontent\.\w+\.fbcdn\.net|fbcdn\.net)[^"'\s]*)/g;
  let match: RegExpExecArray | null;
  urlRe.lastIndex = 0;
  while ((match = urlRe.exec(chunk)) !== null && urlMatches.length < 20) {
    const u = match[1];
    if (u && !urlMatches.includes(u)) urlMatches.push(u.slice(0, 120));
  }
  return {
    ad_id: adId,
    chunk_preview: chunk.slice(0, 2500),
    chunk_length: chunk.length,
    url_matches: urlMatches,
  };
}

/**
 * Diagnose chunk overlap for a specific ad_id. Traces why wrong creative may be assigned.
 * Returns: chunk boundaries, all video/text matches in chunk, which one we pick, distances.
 */
export function diagnoseAdChunkOverlap(
  html: string,
  pageId: string,
  targetAdId: string
): {
  found: boolean;
  target_ad_id: string;
  target_index: number;
  prev_ad_id: string | null;
  next_ad_id: string | null;
  chunk_start: number;
  chunk_end: number;
  chunk_size: number;
  text_chunk_start: number;
  text_chunk_end: number;
  video_matches_in_chunk: Array<{
    position_in_html: number;
    distance_from_ad_id: number;
    url_preview: string;
    is_first_match: boolean;
  }>;
  video_we_pick: { url_preview: string; distance_from_ad_id: number } | null;
  text_matches_in_text_chunk: Array<{
    position_in_html: number;
    distance_from_ad_id: number;
    text_preview: string;
    pattern: string;
    is_first_match: boolean;
  }>;
  text_we_pick: { text_preview: string; pattern: string } | null;
  ads_in_chunk: Array<{ ad_id: string; index: number }>;
} {
  const adIdMatches = findAdIdMatches(html);
  const idx = adIdMatches.findIndex((m) => m.adId === targetAdId);
  if (idx < 0) {
    return {
      found: false,
      target_ad_id: targetAdId,
      target_index: -1,
      prev_ad_id: null,
      next_ad_id: null,
      chunk_start: 0,
      chunk_end: 0,
      chunk_size: 0,
      text_chunk_start: 0,
      text_chunk_end: 0,
      video_matches_in_chunk: [],
      video_we_pick: null,
      text_matches_in_text_chunk: [],
      text_we_pick: null,
      ads_in_chunk: [],
    };
  }

  const { adId, index } = adIdMatches[idx];
  const prevIndex = idx > 0 ? adIdMatches[idx - 1].index : 0;
  const nextIndex = idx + 1 < adIdMatches.length ? adIdMatches[idx + 1].index : html.length;
  const prevAdId = idx > 0 ? adIdMatches[idx - 1].adId : null;
  const nextAdId = idx + 1 < adIdMatches.length ? adIdMatches[idx + 1].adId : null;

  const start = Math.max(0, index - 30000);
  const end = Math.min(html.length, index + 50000);
  const chunk = html.slice(start, end);
  const textChunk = html.slice(Math.max(0, prevIndex), nextIndex);

  const adsInChunk = adIdMatches.filter((m) => m.index >= start && m.index < end);

  const videoRe = /"(?:video_sd_url|video_hd_url|video_url)"\s*:\s*"((?:https?:)?(?:\/\/|\\\/\\\/)[^"]+)"/g;
  const videoMatches: Array<{ pos: number; url: string; dist: number }> = [];
  let m: RegExpExecArray | null;
  videoRe.lastIndex = 0;
  while ((m = videoRe.exec(chunk)) !== null && m[1]) {
    const posInHtml = start + m.index;
    const dist = Math.abs(posInHtml - index);
    videoMatches.push({ pos: posInHtml, url: m[1].slice(0, 80), dist });
  }

  const firstVideoMatch = chunk.match(/"(?:video_sd_url|video_hd_url|video_url)"\s*:\s*"((?:https?:)?(?:\/\/|\\\/\\\/)[^"]+)"/);
  const videoWePick = firstVideoMatch?.[1]
    ? (() => {
        const pos = chunk.indexOf(firstVideoMatch[0]);
        const posInHtml = start + pos;
        return { url_preview: firstVideoMatch[1].slice(0, 80), distance_from_ad_id: Math.abs(posInHtml - index) };
      })()
    : null;

  const textPatterns: { re: RegExp; name: string }[] = [
    { re: /"primary_text"\s*:\s*"([^"\\]*(?:\\.[^"\\]*)*)"/, name: "primary_text" },
    { re: /"ad_creative_body"\s*:\s*"([^"\\]*(?:\\.[^"\\]*)*)"/, name: "ad_creative_body" },
    { re: /"body"\s*:\s*"([^"\\]*(?:\\.[^"\\]*)*)"/, name: "body" },
  ];
  const textMatches: Array<{ pos: number; text: string; pattern: string; dist: number }> = [];
  for (const { re, name } of textPatterns) {
    re.lastIndex = 0;
    while ((m = re.exec(textChunk)) !== null && m[1]) {
      const posInHtml = prevIndex + m.index;
      const dist = Math.abs(posInHtml - index);
      textMatches.push({ pos: posInHtml, text: m[1].slice(0, 100), pattern: name, dist });
    }
  }
  textMatches.sort((a, b) => a.pos - b.pos);

  let textWePick: { text_preview: string; pattern: string } | null = null;
  for (const { re, name } of textPatterns) {
    const bodyMatch = textChunk.match(re);
    if (bodyMatch?.[1]) {
      textWePick = { text_preview: bodyMatch[1].slice(0, 100), pattern: name };
      break;
    }
  }

  return {
    found: true,
    target_ad_id: adId,
    target_index: index,
    prev_ad_id: prevAdId,
    next_ad_id: nextAdId,
    chunk_start: start,
    chunk_end: end,
    chunk_size: chunk.length,
    text_chunk_start: prevIndex,
    text_chunk_end: nextIndex,
    video_matches_in_chunk: videoMatches.map((v, i) => ({
      position_in_html: v.pos,
      distance_from_ad_id: v.dist,
      url_preview: v.url,
      is_first_match: i === 0,
    })),
    video_we_pick: videoWePick,
    text_matches_in_text_chunk: textMatches.map((t, i) => ({
      position_in_html: t.pos,
      distance_from_ad_id: t.dist,
      text_preview: t.text,
      pattern: t.pattern,
      is_first_match: textWePick?.pattern === t.pattern && textMatches.findIndex((x) => x.text === t.text) === 0,
    })),
    text_we_pick: textWePick,
    ads_in_chunk: adsInChunk.map((a) => ({ ad_id: a.adId, index: a.index })),
  };
}

/**
 * Extract carousel image URLs from snapshot page DOM.
 * Run via page.evaluate(extractCarouselFromSnapshotDom) after page has loaded.
 * Returns URLs from carousel/listbox/slide regions.
 */
export function extractCarouselFromSnapshotDom(): string[] {
  const urls: string[] = [];
  const seen = new Set<string>();
  const smallRe = /[_-]s(?:50|60|80|100|120|148|150|200)x(?:50|60|80|100|120|148|150|200)(?:[_-]|$|\?|&)/i;
  const profileRe = /[_-]p(?:50|60|80|100|120|148|150|200)x(?:50|60|80|100|120|148|150|200)(?:[_-]|$|\?|&)/i;
  const isAdMedia = (u: string) =>
    u &&
    u.length > 20 &&
    !u.includes("emoji") &&
    !u.includes("rsrc.php") &&
    !u.includes("static.xx.fbcdn") &&
    !u.includes("graph.facebook") &&
    !smallRe.test(u) &&
    !profileRe.test(u) &&
    (u.includes("scontent") || u.includes("fbcdn.net"));
  const norm = (u: string) => {
    const s = (u || "").trim();
    return s.startsWith("//") ? "https:" + s : s.startsWith("http") ? s : "https://" + s;
  };
  const add = (u: string) => {
    if (!u) return;
    const n = norm(u);
    if (isAdMedia(n) && !seen.has(n)) {
      seen.add(n);
      urls.push(n);
    }
  };
  const carouselSelectors =
    '[role="listbox"] img, [role="tabpanel"] img, [aria-label*="carousel"] img, [aria-label*="slide"] img, [aria-label*="Slide"] img, [aria-roledescription="carousel"] img';
  document.querySelectorAll(carouselSelectors).forEach((img) => {
    const el = img as HTMLImageElement;
    add(el.currentSrc || el.src);
    const srcset = el.getAttribute("srcset");
    if (srcset) {
      const first = srcset.split(",")[0]?.trim().split(/\s+/)[0];
      if (first) add(first);
    }
  });
  if (urls.length === 0) {
    document.querySelectorAll("[role='main'] img, [role='article'] img").forEach((img) => {
      const el = img as HTMLImageElement;
      const u = el.currentSrc || el.src;
      if (u && (u.includes("scontent") || u.includes("fbcdn"))) add(u);
    });
  }
  return urls;
}

/**
 * Extract the currently rendered creative from an ad detail page DOM.
 * This is intentionally narrow and only used for suspicious DCO/multi-variation ads where
 * the page HTML may still reflect the parent shell.
 */
export function extractVariationFromDetailDom(): {
  video_url?: string | null;
  image_url?: string | null;
  ad_text?: string;
  cta?: string | null;
} {
  const normalize = (u: string | null | undefined): string | null => {
    if (!u) return null;
    const s = u.trim();
    if (!s) return null;
    if (s.startsWith("//")) return `https:${s}`;
    return s;
  };

  const isVisible = (el: Element): boolean => {
    const rect = (el as HTMLElement).getBoundingClientRect();
    const style = window.getComputedStyle(el as HTMLElement);
    return rect.width > 24 && rect.height > 24 && style.display !== "none" && style.visibility !== "hidden";
  };

  const isMetaUiText = (text: string): boolean =>
    /^(Sponsored|Library ID:|Started running on|Platforms|This ad has multiple versions|See ad details|See summary details|Sign Up|Learn more|Install now|Details|Activity|Brand|Status|Landing page|Visual Format)$/i.test(
      text.trim()
    );

  const main = document.querySelector('[role="main"]') ?? document.body;

  let video_url: string | null = null;
  for (const video of Array.from(main.querySelectorAll("video"))) {
    if (!isVisible(video)) continue;
    const el = video as HTMLVideoElement;
    const src = normalize(el.currentSrc || video.getAttribute("src") || video.querySelector("source")?.getAttribute("src"));
    if (src && (src.includes("video.") || /\.(mp4|webm)(\?|&|$)/i.test(src))) {
      video_url = src;
      break;
    }
  }

  let image_url: string | null = null;
  for (const img of Array.from(main.querySelectorAll("img"))) {
    if (!isVisible(img)) continue;
    const el = img as HTMLImageElement;
    const src = normalize(el.currentSrc || el.src || img.getAttribute("src"));
    if (src && (src.includes("scontent") || src.includes("fbcdn.net"))) {
      image_url = src;
      break;
    }
  }

  const textCandidates = Array.from(main.querySelectorAll("div, span, p"))
    .filter((el) => isVisible(el))
    .map((el) => {
      const text = (el.textContent || "").replace(/\s+/g, " ").trim();
      const top = (el as HTMLElement).getBoundingClientRect().top;
      return { text, top };
    })
    .filter(({ text, top }) => text.length >= 15 && text.length <= 220 && top > 120 && top < window.innerHeight * 0.8)
    .filter(({ text }) => !isMetaUiText(text))
    .filter(({ text }) => !/^https?:\/\//i.test(text) && !/^[a-z0-9.-]+\.(com|in|net|org)$/i.test(text))
    .filter(({ text }) => !/^(Zepto|google\.com)$/i.test(text));

  const uniqueTexts: Array<{ text: string; top: number }> = [];
  const seen = new Set<string>();
  for (const candidate of textCandidates) {
    const key = candidate.text.slice(0, 80).toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    uniqueTexts.push(candidate);
  }
  uniqueTexts.sort((a, b) => a.top - b.top || b.text.length - a.text.length);
  const ad_text = uniqueTexts[0]?.text;

  const ctaCandidates = Array.from(main.querySelectorAll("button, a"))
    .filter((el) => isVisible(el))
    .map((el) => (el.textContent || "").replace(/\s+/g, " ").trim())
    .filter((text) => /^(Sign up|Learn more|Install now|Apply now|Download|Book now|Shop now)$/i.test(text));
  const cta = ctaCandidates[0] ?? null;

  return { video_url, image_url, ad_text, cta };
}

/**
 * Extract media URLs from ad detail/snapshot page HTML (single-ad view).
 * Used as fallback when network capture or list-page extraction returns no media.
 */
export function extractMediaFromAdDetailHtml(html: string): {
  image_url: string | null;
  video_url: string | null;
  carousel_urls: string[];
} {
  const chunk = html;
  const imageCandidates: string[] = [];

  const drMatch = chunk.match(/"display_resources"\s*:\s*\[([\s\S]*?)\]\s*[,}]/);
  if (drMatch) {
    const srcs = [...drMatch[1].matchAll(/"src"\s*:\s*"((?:https?:)?\/\/[^"]+)"/g)].map((m) => normalizeMediaUrl(m[1]));
    if (srcs.length > 0) imageCandidates.push(srcs[srcs.length - 1]);
  }
  const ivMatch = chunk.match(/"image_versions"\s*:\s*\[([\s\S]*?)\]\s*[,}]/);
  if (ivMatch) {
    const urls = [...ivMatch[1].matchAll(/"url"\s*:\s*"((?:https?:)?\/\/[^"]+)"/g)].map((m) => normalizeMediaUrl(m[1]));
    if (urls.length > 0) imageCandidates.push(urls[urls.length - 1]);
  }
  const preferPatterns = [
    /"original_image_url"\s*:\s*"((?:https?:)?\/\/[^"]+)"/,
    /"image_url"\s*:\s*"((?:https?:)?\/\/[^"]+)"/,
    /"picture"\s*:\s*"((?:https?:)?\/\/[^"]+)"/,
    /"child_attachments"\s*:\s*\[\s*\{[^}]*"(?:picture|url|uri|src)"\s*:\s*"((?:https?:)?\/\/[^"]+)"/,
  ];
  for (const re of preferPatterns) {
    const m = chunk.match(re);
    if (m?.[1]) imageCandidates.push(normalizeMediaUrl(m[1]));
  }
  const fallbackPatterns = [
    /"display_resources"\s*:\s*\[\s*\{[^}]*"src"\s*:\s*"((?:https?:)?\/\/[^"]+)"/,
    /"thumbnail_url"\s*:\s*"((?:https?:)?\/\/[^"]+)"/,
    /src=["'](https?:\/\/[^"']+(?:fbcdn|scontent)[^"']+)["']/,
    /(https?:\/\/[^"'\s]*(?:scontent\.\w+\.fbcdn\.net|fbcdn\.net)[^"'\s]*)/,
  ];
  for (const re of fallbackPatterns) {
    const m = chunk.match(re);
    if (m?.[1]) imageCandidates.push(normalizeMediaUrl(m[1]));
  }

  const imageUrl = imageCandidates.find((u) => u && isAdMediaUrl(u)) ?? null;

  let videoUrl: string | null = null;
  const videoPatterns = [
    /"(?:video_sd_url|video_hd_url|video_url)"\s*:\s*"((?:https?:)?(?:\/\/|\\\/\\\/)[^"]+)"/,
    /"videos"\s*:\s*\[\s*\{\s*"(?:video_sd_url|video_hd_url|url)"\s*:\s*"((?:https?:)?(?:\/\/|\\\/\\\/)[^"]+)"/,
    /"video_preview_url"\s*:\s*"((?:https?:)?(?:\/\/|\\\/\\\/)[^"]+\.(?:mp4|webm)[^"]*)"/,
    /"source"\s*:\s*"((?:https?:)?(?:\/\/|\\\/\\\/)[^"]+\.(?:mp4|webm)[^"]*)"/,
  ];
  for (const re of videoPatterns) {
    const m = chunk.match(re);
    if (m?.[1] && !m[1].includes("emoji")) {
      videoUrl = normalizeMediaUrl(m[1]);
      break;
    }
  }
  if (!videoUrl) {
    const rawMatch = chunk.match(/(https?(?:\/\/|\\\/\\\/)[^"'\s]*(?:video\.\w+\.fbcdn\.net|video\.xx\.fbcdn\.net)[^"'\s]*)/) ??
      chunk.match(/"((?:https?:)?(?:\/\/|\\\/\\\/)[^"]+\.(?:mp4|webm)(?:\?[^"]*)?)"/);
    if (rawMatch?.[1]) {
      const u = rawMatch[1].replace(/^"|"$/g, "").trim();
      if (u && (u.includes("video.") || /\.(mp4|webm)(\?|&|"|$)/i.test(u))) {
        videoUrl = normalizeMediaUrl(u);
      }
    }
  }

  const carouselCandidates: string[] = [];
  const extractUrlsFromArray = (arrContent: string) => {
    const urlRe = /"(?:picture|url|uri|src)"\s*:\s*"((?:https?:)?\/\/[^"]+)"/g;
    let m: RegExpExecArray | null;
    while ((m = urlRe.exec(arrContent)) !== null && m[1]) {
      const u = normalizeMediaUrl(m[1]);
      if (u && isAdMediaUrl(u) && !carouselCandidates.includes(u)) carouselCandidates.push(u);
    }
  };
  for (const key of ["child_attachments", "carousel_cards", "cards", "sub_attachments"]) {
    const match = chunk.match(new RegExp(`"${key}"\\s*:\\s*\\[([\\s\\S]*?)\\]\\s*[,}]`));
    if (match?.[1]) extractUrlsFromArray(match[1]);
  }
  const multiRe = [
    /"display_resources"\s*:\s*\[\s*\{[^}]*"src"\s*:\s*"((?:https?:)?\/\/[^"]+)"/g,
    /"picture"\s*:\s*"((?:https?:)?\/\/[^"]+)"/g,
    /src=["'](https?:\/\/[^"']+(?:fbcdn|scontent)[^"']+)["']/g,
  ];
  for (const re of multiRe) {
    let mm: RegExpExecArray | null;
    re.lastIndex = 0;
    while ((mm = re.exec(chunk)) !== null) {
      const u = normalizeMediaUrl(mm[1]);
      if (u && isAdMediaUrl(u) && !carouselCandidates.includes(u)) carouselCandidates.push(u);
    }
  }
  const carouselUrls = carouselCandidates.filter((u, i, arr) => arr.indexOf(u) === i);
  if (imageUrl && !carouselUrls.includes(imageUrl)) carouselUrls.unshift(imageUrl);

  return { image_url: imageUrl, video_url: videoUrl, carousel_urls: carouselUrls };
}

/**
 * Extract full ad details from a single-ad snapshot page (/ads/library/?id=AD_ID).
 * Snapshot pages have clean JSON structure - most reliable source for description, CTA, media.
 */
export function extractAdFromSnapshotPage(
  html: string,
  adId: string,
  pageId: string
): ExtractedAd | null {
  if (!html || !adId || adId === pageId) return null;

  const idx = html.indexOf(adId);
  if (idx < 0) return null;

  const start = Math.max(0, idx - 12000);
  const chunk = html.slice(start, idx + 35000);

  const unescapeJsonString = (s: string) =>
    s
      .replace(/\\"/g, '"')
      .replace(/\\n/g, "\n")
      .replace(/\\u([0-9a-fA-F]{4})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
      .trim()
      .slice(0, 2000);

  const isPlaceholder = (s: string) =>
    /^(No caption|Video|Image|Photo|Sponsored|Learn more|See more)$/i.test(s.trim()) ||
    s.trim().length < 15;

  const metadataPatterns = [
    /FiltersSort|Active status|Remove Filters|Sort by/i,
    /ad library report|branded content|about this ad/i,
    /platforms\s*this ad has multiple versions/i,
    /this ad has multiple versions/i,
    /see ad details/i,
    /see summary details/i,
    /open dropdown/i,
  ];

  const collectPatternMatches = (patterns: RegExp[]): string[] => {
    const parts: string[] = [];
    const seen = new Set<string>();
    for (const re of patterns) {
      const m = chunk.match(re);
      if (!m?.[1]) continue;
      const cleaned = unescapeJsonString(m[1]).trim();
      if (
        cleaned.length >= 3 &&
        !isPlaceholder(cleaned) &&
        !metadataPatterns.some((p) => p.test(cleaned)) &&
        !seen.has(cleaned.slice(0, 80))
      ) {
        seen.add(cleaned.slice(0, 80));
        parts.push(cleaned);
      }
    }
    return parts;
  };

  const bodyPatterns = [
    /"primary_text"\s*:\s*"([^"\\]*(?:\\.[^"\\]*)*)"/,
    /"primary_text"\s*:\s*\{\s*"text"\s*:\s*"([^"\\]*(?:\\.[^"\\]*)*)"/,
    /"ad_creative_body"\s*:\s*"([^"\\]*(?:\\.[^"\\]*)*)"/,
    /"body"\s*:\s*"([^"\\]*(?:\\.[^"\\]*)*)"/,
    /"body"\s*:\s*\{\s*"text"\s*:\s*"([^"\\]*(?:\\.[^"\\]*)*)"/,
    /"ad_copy"\s*:\s*"([^"\\]*(?:\\.[^"\\]*)*)"/,
    /"message"\s*:\s*"([^"\\]*(?:\\.[^"\\]*)*)"/,
  ];
  const headlinePatterns = [
    /"headline"\s*:\s*"([^"\\]*(?:\\.[^"\\]*)*)"/,
    /"link_title"\s*:\s*"([^"\\]*(?:\\.[^"\\]*)*)"/,
    /"title"\s*:\s*"([^"\\]*(?:\\.[^"\\]*)*)"/,
    /"caption"\s*:\s*"([^"\\]*(?:\\.[^"\\]*)*)"/,
  ];
  const descriptionPatterns = [
    /"link_description"\s*:\s*"([^"\\]*(?:\\.[^"\\]*)*)"/,
    /"description"\s*:\s*"([^"\\]*(?:\\.[^"\\]*)*)"/,
  ];
  const bodyTextParts = collectPatternMatches(bodyPatterns);
  const headlineTextParts = collectPatternMatches(headlinePatterns);
  const descriptionTextParts = collectPatternMatches(descriptionPatterns);
  const adText =
    bodyTextParts.length > 0
      ? cleanAdText(filterMetadataFromAdText(bodyTextParts.join("\n\n").slice(0, 2000)))
      : "";
  const adHeadline =
    headlineTextParts.length > 0
      ? cleanAdText(filterMetadataFromAdText(headlineTextParts[0].slice(0, 300)))
      : null;
  const adDescription =
    descriptionTextParts.length > 0
      ? cleanAdText(filterMetadataFromAdText(descriptionTextParts[0].slice(0, 500)))
      : null;

  const imageCandidates: string[] = [];
  const urlPatterns = [
    /"display_resources"\s*:\s*\[\s*\{[^}]*"src"\s*:\s*"((?:https?:)?\/\/[^"]+)"/g,
    /"image_versions"\s*:\s*\[[^\]]*"url"\s*:\s*"((?:https?:)?\/\/[^"]+)"/g,
    /"original_image_url"\s*:\s*"((?:https?:)?\/\/[^"]+)"/,
    /"image_url"\s*:\s*"((?:https?:)?\/\/[^"]+)"/,
    /"picture"\s*:\s*"((?:https?:)?\/\/[^"]+)"/,
    /"child_attachments"\s*:\s*\[\s*\{[^}]*"(?:picture|url|uri|src)"\s*:\s*"((?:https?:)?\/\/[^"]+)"/,
  ];
  for (const re of urlPatterns) {
    if (re.global) {
      let mm: RegExpExecArray | null;
      re.lastIndex = 0;
      while ((mm = re.exec(chunk)) !== null && mm[1]) {
        imageCandidates.push(normalizeMediaUrl(mm[1]));
      }
    } else {
      const m = chunk.match(re);
      if (m?.[1]) imageCandidates.push(normalizeMediaUrl(m[1]));
    }
  }
  const imageUrl = pickBestImageUrl(imageCandidates);

  let videoUrl: string | null = null;
  const videoPatterns = [
    /"(?:video_sd_url|video_hd_url|video_url)"\s*:\s*"((?:https?:)?(?:\/\/|\\\/\\\/)[^"]+)"/,
    /"videos"\s*:\s*\[\s*\{\s*"(?:video_sd_url|video_hd_url|url)"\s*:\s*"((?:https?:)?(?:\/\/|\\\/\\\/)[^"]+)"/,
    /"video_preview_url"\s*:\s*"((?:https?:)?(?:\/\/|\\\/\\\/)[^"]+\.(?:mp4|webm)[^"]*)"/,
    /"source"\s*:\s*"((?:https?:)?(?:\/\/|\\\/\\\/)[^"]+\.(?:mp4|webm)[^"]*)"/,
  ];
  for (const re of videoPatterns) {
    const m = chunk.match(re);
    if (m?.[1] && !m[1].includes("emoji")) {
      videoUrl = normalizeMediaUrl(m[1]);
      break;
    }
  }
  if (!videoUrl) {
    const rawMatch = chunk.match(/(https?(?:\/\/|\\\/\\\/)[^"'\s]*(?:video\.\w+\.fbcdn\.net|video\.xx\.fbcdn\.net)[^"'\s]*)/) ??
      chunk.match(/"((?:https?:)?(?:\/\/|\\\/\\\/)[^"]+\.(?:mp4|webm)(?:\?[^"]*)?)"/);
    if (rawMatch?.[1]) {
      const u = rawMatch[1].replace(/^"|"$/g, "").trim();
      if (u && (u.includes("video.") || /\.(mp4|webm)(\?|&|"|$)/i.test(u))) {
        videoUrl = normalizeMediaUrl(u);
      }
    }
  }

  const carouselUrls: string[] = [];
  const extractUrlsFromArray = (arrContent: string) => {
    const urlRe = /"(?:picture|url|uri|src)"\s*:\s*"((?:https?:)?\/\/[^"]+)"/g;
    let m: RegExpExecArray | null;
    while ((m = urlRe.exec(arrContent)) !== null && m[1]) {
      const u = normalizeMediaUrl(m[1]);
      if (u && isAdMediaUrl(u) && !isLogoOrSmallThumbnail(u) && !carouselUrls.includes(u)) carouselUrls.push(u);
    }
  };
  for (const key of ["child_attachments", "carousel_cards", "cards", "sub_attachments"]) {
    const match = chunk.match(new RegExp(`"${key}"\\s*:\\s*\\[([\\s\\S]*?)\\]\\s*[,}]`));
    if (match?.[1]) extractUrlsFromArray(match[1]);
  }
  const multiRe = [
    /"display_resources"\s*:\s*\[\s*\{[^}]*"src"\s*:\s*"((?:https?:)?\/\/[^"]+)"/g,
    /"picture"\s*:\s*"((?:https?:)?\/\/[^"]+)"/g,
  ];
  for (const re of multiRe) {
    let mm: RegExpExecArray | null;
    re.lastIndex = 0;
    while ((mm = re.exec(chunk)) !== null) {
      const u = normalizeMediaUrl(mm[1]);
      if (u && isAdMediaUrl(u) && !isLogoOrSmallThumbnail(u) && !carouselUrls.includes(u)) carouselUrls.push(u);
    }
  }
  if (imageUrl && !carouselUrls.includes(imageUrl)) carouselUrls.unshift(imageUrl);
  if (carouselUrls.length === 0 && imageUrl) carouselUrls.push(imageUrl);
  let finalImageUrl = imageUrl;
  if (videoUrl && !imageUrl && imageCandidates.length > 0) {
    finalImageUrl = imageCandidates.find((u) => u && isAdMediaUrl(u)) ?? null;
  }

  let cta: string | null = null;
  const ctaPatterns = [
    /"cta_text"\s*:\s*"([^"\\]*(?:\\.[^"\\]*)*)"/,
    /"link_cta"\s*:\s*\{\s*"text"\s*:\s*"([^"\\]*(?:\\.[^"\\]*)*)"/,
    /"cta_type"\s*:\s*"([^"]+)"/,
    /"call_to_action_type"\s*:\s*"([^"]+)"/,
  ];
  for (const re of ctaPatterns) {
    const m = chunk.match(re);
    if (m?.[1]) {
      cta = unescapeJsonString(m[1]).trim().slice(0, 120);
      break;
    }
  }

  let ad_start_date: string | null = null;
  const tsMatch = chunk.match(/"ad_delivery_start_time"\s*:\s*(\d+)/) ?? chunk.match(/"start_date"\s*:\s*"([^"]+)"/);
  if (tsMatch?.[1]) {
    if (/^\d{10,}$/.test(tsMatch[1])) {
      ad_start_date = new Date(parseInt(tsMatch[1], 10) * 1000).toISOString().slice(0, 10);
    } else if (/^\d{4}-\d{2}-\d{2}/.test(tsMatch[1])) {
      ad_start_date = tsMatch[1].slice(0, 10);
    }
  }

  let publisher_platforms: string[] | null = null;
  const platformMatch = chunk.match(/"publisher_platform"\s*:\s*\[([^\]]+)\]/) ?? chunk.match(/"publisher_platform"\s*:\s*"([^"]+)"/);
  if (platformMatch?.[1]) {
    const platforms = platformMatch[1].split(",").map((s) => s.replace(/"/g, "").trim()).filter(Boolean);
    if (platforms.length > 0) publisher_platforms = platforms;
  }

  return {
    ad_id: adId,
    ad_text: adText,
    ad_headline: adHeadline,
    ad_description: adDescription,
    image_url: finalImageUrl,
    video_url: videoUrl,
    carousel_urls: carouselUrls,
    cta,
    ad_start_date,
    publisher_platforms,
  };
}

/** Check if URL is valid ad media (for network capture). Excludes scripts, avatars. */
export function isAdMediaUrlForNetwork(url: string): boolean {
  return isAdMediaUrl(url);
}

/**
 * Extract ads from raw HTML when ad_archive_id is present in JSON.
 * Looks for body, images, CTA, start_date, publisher_platforms near each ad_archive_id.
 * Uses larger chunk and more patterns to match Meta's varying JSON structures.
 */
/** Find ALL occurrences of an ad_id in HTML (for diagnostics). Returns indices. */
export function findAllAdIdOccurrences(html: string, adId: string): number[] {
  const indices: number[] = [];
  const re = new RegExp(`"ad_archive_id"\\s*:\\s*"${adId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"`, "g");
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) indices.push(m.index);
  return indices;
}

/** Collect ad ID + index pairs from HTML. Uses LAST occurrence per adId (creative data often appears later). */
function findAdIdMatches(html: string): { adId: string; index: number }[] {
  const byId = new Map<string, number>();
  const patterns: RegExp[] = [
    /"ad_archive_id"\s*:\s*"(\d+)"/g,
    /"ad_snapshot_id"\s*:\s*"(\d+)"/g,
    /render_ad\/\?id=(\d+)/g,
    /render_ad%3Fid%3D(\d+)/gi,
    /\/ads\/library\/\?id=(\d+)/g,
  ];
  for (const re of patterns) {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(html)) !== null) {
      const adId = m[1];
      if (adId && adId.length >= 10) {
        byId.set(adId, m.index); // last occurrence wins
      }
    }
  }
  return [...byId.entries()]
    .map(([adId, index]) => ({ adId, index }))
    .sort((a, b) => a.index - b.index);
}

export function extractAdsFromHtml(html: string, pageId: string): ExtractedAd[] {
  const results: ExtractedAd[] = [];
  const seen = new Set<string>();

  const adIdMatches = findAdIdMatches(html);
  for (let i = 0; i < adIdMatches.length; i++) {
    const { adId, index } = adIdMatches[i];
    if (adId === pageId || adId.length < 5 || seen.has(adId)) continue;
    seen.add(adId);

    // Chunk: Meta may put creative data before or after ad_archive_id. Use block between consecutive
    // ad_archive_ids when possible (creative often lives in same JSON region as next ad).
    const prevIndex = i > 0 ? adIdMatches[i - 1].index : 0;
    const nextIndex = i + 1 < adIdMatches.length ? adIdMatches[i + 1].index : html.length;
    const blockBefore = html.slice(Math.max(0, prevIndex), index);
    const blockAfter = html.slice(index, Math.min(html.length, nextIndex + 5000));
    // Primary chunk: 20k before, 30k after – balances coverage vs regex performance
    const start = Math.max(0, index - 20000);
    const end = Math.min(html.length, index + 30000);
    let chunk = html.slice(start, end);
    // If primary chunk has no creative markers, try block-based (content between ads)
    let hasCreativeInChunk =
      /"display_resources"|"child_attachments"|"carousel_cards"|"video_sd_url"|"video_hd_url"/.test(chunk);
    if (!hasCreativeInChunk && (blockBefore.length > 0 || blockAfter.length > 0)) {
      chunk = blockBefore + blockAfter;
      hasCreativeInChunk =
        /"display_resources"|"child_attachments"|"carousel_cards"|"video_sd_url"|"video_hd_url"/.test(chunk);
    }
    // Full-HTML fallback: when creative not in chunk, search for ad_archive_id in other script blocks
    if (!hasCreativeInChunk) {
      const escapedId = adId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const adIdPattern = new RegExp(`"ad_archive_id"\\s*:\\s*"${escapedId}"`, "g");
      let adIdMatch: RegExpExecArray | null;
      while ((adIdMatch = adIdPattern.exec(html)) !== null) {
        const ctxStart = Math.max(0, adIdMatch.index - 15000);
        const ctxEnd = Math.min(html.length, adIdMatch.index + 30000);
        const ctx = html.slice(ctxStart, ctxEnd);
        if (/"display_resources"|"child_attachments"|"carousel_cards"/.test(ctx)) {
          chunk = ctx;
          break;
        }
      }
    }

    // Text: use the ad block and prefer content after the current ad_id, since adjacent ads
    // can share one large JSON region and "first match" often belongs to the previous ad.
    const textChunk = html.slice(Math.max(0, prevIndex), nextIndex);
    const afterAdTextChunk = html.slice(index, nextIndex);

    // Map chunk position to HTML position (for nearest-match logic). Compute once to avoid repeated slice.
    const isPrimaryChunk = chunk.length === end - start && chunk === html.slice(start, end);
    const getChunkPosInHtml = isPrimaryChunk
      ? (chunkIdx: number) => start + chunkIdx
      : (chunkIdx: number) =>
          chunkIdx < blockBefore.length ? prevIndex + chunkIdx : index + (chunkIdx - blockBefore.length);

    // Collect all caption/description parts – use NEAREST match to ad_id (not first) to avoid chunk overlap
    const bodyTextParts: string[] = [];
    const headlineTextParts: string[] = [];
    const descriptionTextParts: string[] = [];
    const isPlaceholder = (s: string) =>
      /^(No caption|Video|Image|Photo|Sponsored|Learn more|See more)$/i.test(s.trim()) ||
      s.trim().length < 15;
    const bodyPatterns: { re: RegExp; key: string }[] = [
      { re: /"primary_text"\s*:\s*"([^"\\]*(?:\\.[^"\\]*)*)"/, key: "primary" },
      { re: /"primary_text"\s*:\s*\{\s*"text"\s*:\s*"([^"\\]*(?:\\.[^"\\]*)*)"/, key: "primary" },
      { re: /"ad_creative_body"\s*:\s*"([^"\\]*(?:\\.[^"\\]*)*)"/, key: "body" },
      { re: /"body"\s*:\s*"([^"\\]*(?:\\.[^"\\]*)*)"/, key: "body" },
      { re: /"body"\s*:\s*\{\s*"text"\s*:\s*"([^"\\]*(?:\\.[^"\\]*)*)"/, key: "body" },
      { re: /"link_description"\s*:\s*"([^"\\]*(?:\\.[^"\\]*)*)"/, key: "link_desc" },
      { re: /"link_description"\s*:\s*\{\s*"text"\s*:\s*"([^"\\]*(?:\\.[^"\\]*)*)"/, key: "link_desc" },
      { re: /"headline"\s*:\s*"([^"\\]*(?:\\.[^"\\]*)*)"/, key: "headline" },
      { re: /"link_title"\s*:\s*"([^"\\]*(?:\\.[^"\\]*)*)"/, key: "link_title" },
      { re: /"title"\s*:\s*"([^"\\]*(?:\\.[^"\\]*)*)"/, key: "title" },
      { re: /"ad_copy"\s*:\s*"([^"\\]*(?:\\.[^"\\]*)*)"/, key: "copy" },
      { re: /"description"\s*:\s*"([^"\\]*(?:\\.[^"\\]*)*)"/, key: "desc" },
      { re: /"message"\s*:\s*"([^"\\]*(?:\\.[^"\\]*)*)"/, key: "message" },
      { re: /"text"\s*:\s*"([^"\\]*(?:\\.[^"\\]*)*)"/, key: "text" },
    ];
    const seenText = new Set<string>();
    const isMetadata = (s: string) =>
      /FiltersSort|SortSort|Remove Filters|Active status|Library ID:|Started running on/i.test(s) ||
      /^Sort\s*by\s*$/i.test(s.trim()) ||
      /^Filters\s*$/i.test(s.trim());
    const addIfNew = (bucket: string[], cleaned: string) => {
      if (
        cleaned.length >= 5 &&
        !isPlaceholder(cleaned) &&
        !isMetadata(cleaned) &&
        !seenText.has(cleaned.slice(0, 50))
      ) {
        seenText.add(cleaned.slice(0, 50));
        bucket.push(cleaned);
      }
    };
    for (const { re, key } of bodyPatterns) {
      const globalRe = new RegExp(re.source, re.flags.includes("g") ? re.flags : `${re.flags}g`);
      globalRe.lastIndex = 0;
      let match: RegExpExecArray | null;
      while ((match = globalRe.exec(afterAdTextChunk)) !== null && match[1]) {
        const cleaned = unescapeJsonString(match[1]).trim();
        if (["headline", "link_title", "title"].includes(key)) addIfNew(headlineTextParts, cleaned);
        else if (["link_desc", "desc"].includes(key)) addIfNew(descriptionTextParts, cleaned);
        else addIfNew(bodyTextParts, cleaned);
        break;
      }
    }
    const arrayPatterns = [
      /"ad_creative_bodies"\s*:\s*\[\s*\{\s*"text"\s*:\s*"([^"\\]*(?:\\.[^"\\]*)*)"/g,
      /"bodies"\s*:\s*\[\s*\{\s*"text"\s*:\s*"([^"\\]*(?:\\.[^"\\]*)*)"/g,
      /"ad_creative_link_descriptions"\s*:\s*\[\s*\{\s*"text"\s*:\s*"([^"\\]*(?:\\.[^"\\]*)*)"/g,
      /"descriptions"\s*:\s*\[\s*\{\s*"text"\s*:\s*"([^"\\]*(?:\\.[^"\\]*)*)"/g,
    ];
    for (const re of arrayPatterns) {
      re.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = re.exec(afterAdTextChunk)) !== null && m[1]) {
        const cleaned = unescapeJsonString(m[1]).trim();
        if (re.source.includes("link_descriptions") || re.source.includes("descriptions")) {
          addIfNew(descriptionTextParts, cleaned);
        } else {
          addIfNew(bodyTextParts, cleaned);
        }
      }
    }
    const adText =
      bodyTextParts.length > 0
        ? cleanAdText(filterMetadataFromAdText(bodyTextParts.join("\n\n").slice(0, 2000)))
        : "";
    const adHeadline =
      headlineTextParts.length > 0
        ? cleanAdText(filterMetadataFromAdText(headlineTextParts[0].slice(0, 300)))
        : null;
    const adDescription =
      descriptionTextParts.length > 0
        ? cleanAdText(filterMetadataFromAdText(descriptionTextParts[0].slice(0, 500)))
        : null;

    // Prefer main creative over logo/thumbnail – collect candidates with position, prefer after ad_id
    type ImageMatch = { url: string; pos: number };
    const imageMatches: ImageMatch[] = [];
    const urlPatterns: { re: RegExp; global: boolean }[] = [
      { re: /"display_resources"\s*:\s*\[\s*\{[^}]*"src"\s*:\s*"((?:https?:)?(?:\/\/|\\\/\\\/)[^"]+)"/g, global: true },
      { re: /"original_image_url"\s*:\s*"((?:https?:)?(?:\/\/|\\\/\\\/)[^"]+)"/, global: false },
      { re: /"image_url"\s*:\s*"((?:https?:)?(?:\/\/|\\\/\\\/)[^"]+)"/, global: false },
      { re: /"image_versions"\s*:\s*\[\s*\{\s*"url"\s*:\s*"((?:https?:)?(?:\/\/|\\\/\\\/)[^"]+)"/, global: false },
      { re: /"image_crops"\s*:\s*\[\s*\{\s*"url"\s*:\s*"((?:https?:)?(?:\/\/|\\\/\\\/)[^"]+)"/, global: false },
      { re: /"images"\s*:\s*\[\s*\{\s*"(?:url|uri|src)"\s*:\s*"((?:https?:)?(?:\/\/|\\\/\\\/)[^"]+)"/, global: false },
      { re: /"resized_image_url"\s*:\s*"((?:https?:)?(?:\/\/|\\\/\\\/)[^"]+)"/, global: false },
      { re: /"child_attachments"\s*:\s*\[\s*\{[^}]*"(?:picture|url|uri|src)"\s*:\s*"((?:https?:)?(?:\/\/|\\\/\\\/)[^"]+)"/, global: false },
      { re: /"thumbnail_url"\s*:\s*"((?:https?:)?(?:\/\/|\\\/\\\/)[^"]+)"/, global: false },
      { re: /"video_preview_image_url"\s*:\s*"((?:https?:)?(?:\/\/|\\\/\\\/)[^"]+)"/, global: false },
      { re: /"picture"\s*:\s*"((?:https?:)?(?:\/\/|\\\/\\\/)[^"]+)"/, global: false },
      { re: /(https?:\/\/[^"'\s]*(?:scontent\.\w+\.fbcdn\.net|fbcdn\.net)[^"'\s]*)/, global: false },
    ];
    for (const { re, global } of urlPatterns) {
      re.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = re.exec(chunk)) !== null && m[1]) {
        const u = normalizeMediaUrl(m[1]);
        if (u && !imageMatches.some((x) => x.url === u)) {
          const htmlPos = getChunkPosInHtml(m.index);
          imageMatches.push({ url: u, pos: htmlPos });
        }
        if (!global) break;
      }
    }
    // Use only image AFTER ad_id – no fallback to before (avoids picking previous ad's creative)
    const afterAd = imageMatches.filter((m) => m.pos >= index && m.pos < nextIndex);
    const afterUrls = afterAd.map((m) => m.url);
    let imageUrl = pickBestImageUrl(afterUrls);

    // Fallback: extract from img src in HTML when chunk has no JSON creative (Meta may embed URLs in HTML)
    if (!imageUrl || isLogoOrSmallThumbnail(imageUrl)) {
      const imgSrcRegion = html.slice(Math.max(0, prevIndex), nextIndex);
      const imgSrcRe = /src=["'](https?:\/\/[^"']+(?:scontent|fbcdn)[^"']+)["']/g;
      let m: RegExpExecArray | null;
      while ((m = imgSrcRe.exec(imgSrcRegion)) !== null && m[1]) {
        const u = normalizeMediaUrl(m[1]);
        if (u && isAdMediaUrl(u) && !isLogoOrSmallThumbnail(u) && !imageMatches.some((x) => x.url === u)) {
          const htmlPos = prevIndex + m.index;
          imageMatches.push({ url: u, pos: htmlPos });
        }
      }
      const afterAd2 = imageMatches.filter((m) => m.pos >= index && m.pos < nextIndex);
      imageUrl = pickBestImageUrl(afterAd2.map((x) => x.url)) ?? imageUrl;
    }

    let videoUrl: string | null = null;
    type VideoMatch = { url: string; dist: number; pos: number };
    const videoMatches: VideoMatch[] = [];
    const videoPatterns = [
      /"(?:video_sd_url|video_hd_url|video_url)"\s*:\s*"((?:https?:)?(?:\/\/|\\\/\\\/)[^"]+)"/g,
      /"videos"\s*:\s*\[\s*\{\s*"(?:video_sd_url|video_hd_url|url)"\s*:\s*"((?:https?:)?(?:\/\/|\\\/\\\/)[^"]+)"/g,
      /"video_preview_url"\s*:\s*"((?:https?:)?(?:\/\/|\\\/\\\/)[^"]+\.(?:mp4|webm)[^"]*)"/g,
      /"source"\s*:\s*"((?:https?:)?(?:\/\/|\\\/\\\/)[^"]+\.(?:mp4|webm)[^"]*)"/g,
    ];
    for (const re of videoPatterns) {
      re.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = re.exec(chunk)) !== null && m[1] && !m[1].includes("emoji")) {
        const u = normalizeMediaUrl(m[1]);
        if (u) {
          const htmlPos = getChunkPosInHtml(m.index);
          videoMatches.push({ url: u, dist: Math.abs(htmlPos - index), pos: htmlPos });
        }
      }
    }
    if (videoMatches.length > 0) {
      // Use only video AFTER ad_id – no fallback to before (avoids picking previous ad's creative)
      const afterAd = videoMatches.filter((m) => m.pos >= index && m.pos < nextIndex).sort((a, b) => a.dist - b.dist);
      const best = afterAd[0];
      if (best) videoUrl = best.url;
    }
    if (!videoUrl) {
      const rawVideoRe = /(https?(?:\/\/|\\\/\\\/)[^"'\s]*(?:video\.\w+\.fbcdn\.net|video\.xx\.fbcdn\.net)[^"'\s]*)/g;
      const mp4Re = /"(?:https?:)?(?:\/\/|\\\/\\\/)[^"]+\.(?:mp4|webm)(?:\?[^"]*)?"/g;
      const rawMatches: VideoMatch[] = [];
      rawVideoRe.lastIndex = 0;
      let rawMatch: RegExpExecArray | null = null;
      while ((rawMatch = rawVideoRe.exec(chunk)) !== null && rawMatch[1]) {
        const u = rawMatch[1].trim();
        if (u && (u.includes("video.") || /\.(mp4|webm)(\?|&|"|$)/i.test(u))) {
          const htmlPos = getChunkPosInHtml(rawMatch.index);
          rawMatches.push({ url: normalizeMediaUrl(u), dist: Math.abs(htmlPos - index), pos: htmlPos });
        }
      }
      if (rawMatches.length === 0) {
        mp4Re.lastIndex = 0;
        while ((rawMatch = mp4Re.exec(chunk)) !== null) {
          const u = (rawMatch[0]?.replace(/^"|"$/g, "") ?? "").trim();
          if (u && /\.(mp4|webm)(\?|&|"|$)/i.test(u)) {
            const htmlPos = getChunkPosInHtml(rawMatch.index);
            rawMatches.push({ url: normalizeMediaUrl(u), dist: Math.abs(htmlPos - index), pos: htmlPos });
          }
        }
      }
      if (rawMatches.length > 0) {
        const afterAd = rawMatches.filter((m) => m.pos >= index && m.pos < nextIndex).sort((a, b) => a.dist - b.dist);
        const best = afterAd[0];
        if (best) videoUrl = best.url;
      }
    }

    // Carousel: restrict to the current ad's forward block to avoid picking sibling cards
    // from the previous/next ad in a shared JSON region.
    const afterAdChunk = html.slice(index, nextIndex);
    const carouselUrls: string[] = [];
    const extractUrlsFromArray = (arrContent: string) => {
      const urlRe = /"(?:picture|url|uri|src)"\s*:\s*"((?:https?:)?(?:\/\/|\\\/\\\/)[^"]+)"/g;
      let m: RegExpExecArray | null;
      while ((m = urlRe.exec(arrContent)) !== null && m[1]) {
        const u = normalizeMediaUrl(m[1]);
        if (u && isAdMediaUrl(u) && !isLogoOrSmallThumbnail(u) && !carouselUrls.includes(u)) {
          carouselUrls.push(u);
        }
      }
    };
    const caMatch = afterAdChunk.match(/"child_attachments"\s*:\s*\[([\s\S]*?)\]\s*[,}]/);
    if (caMatch?.[1]) extractUrlsFromArray(caMatch[1]);
    const ccMatch = afterAdChunk.match(/"carousel_cards"\s*:\s*\[([\s\S]*?)\]\s*[,}]/);
    if (ccMatch?.[1]) extractUrlsFromArray(ccMatch[1]);
    const cardsMatch = afterAdChunk.match(/"cards"\s*:\s*\[([\s\S]*?)\]\s*[,}]/);
    if (cardsMatch?.[1]) extractUrlsFromArray(cardsMatch[1]);
    const subMatch = afterAdChunk.match(/"sub_attachments"\s*:\s*\[([\s\S]*?)\]\s*[,}]/);
    if (subMatch?.[1]) extractUrlsFromArray(subMatch[1]);

    const multiUrlPatterns = [
      /"images"\s*:\s*\[\s*\{[^}]*"(?:url|uri|src)"\s*:\s*"((?:https?:)?(?:\/\/|\\\/\\\/)[^"]+)"/g,
      /"display_resources"\s*:\s*\[\s*\{[^}]*"src"\s*:\s*"((?:https?:)?(?:\/\/|\\\/\\\/)[^"]+)"/g,
      /"picture"\s*:\s*"((?:https?:)?(?:\/\/|\\\/\\\/)[^"]+)"/g,
      /src=["'](https?:\/\/[^"']+(?:fbcdn|scontent)[^"']+)["']/g,
      /(https?:\/\/[^"'\s]*(?:scontent\.\w+\.fbcdn\.net|fbcdn\.net)[^"'\s]*)/g,
    ];
    for (const re of multiUrlPatterns) {
      re.lastIndex = 0;
      let mm: RegExpExecArray | null;
      while ((mm = re.exec(afterAdChunk)) !== null && mm[1]) {
        const u = normalizeMediaUrl(mm[1]);
        if (u && isAdMediaUrl(u) && !isLogoOrSmallThumbnail(u) && !carouselUrls.includes(u)) {
          carouselUrls.push(u);
        }
      }
    }
    // Fallback: img src from HTML block when JSON has no carousel (multiple imgs = carousel)
    if (carouselUrls.length <= 1) {
      const imgSrcRegion = html.slice(Math.max(0, prevIndex), nextIndex);
      const imgSrcRe = /src=["'](https?:\/\/[^"']+(?:scontent|fbcdn)[^"']+)["']/g;
      let mm: RegExpExecArray | null;
      while ((mm = imgSrcRe.exec(imgSrcRegion)) !== null && mm[1]) {
        const u = normalizeMediaUrl(mm[1]);
        if (u && isAdMediaUrl(u) && !isLogoOrSmallThumbnail(u) && !carouselUrls.includes(u)) {
          carouselUrls.push(u);
        }
      }
    }
    if (imageUrl && !carouselUrls.includes(imageUrl)) carouselUrls.unshift(imageUrl);

    let cta: string | null = null;
    const ctaPatterns = [
      /"cta_text"\s*:\s*"([^"\\]*(?:\\.[^"\\]*)*)"/,
      /"link_cta"\s*:\s*\{\s*"text"\s*:\s*"([^"\\]*(?:\\.[^"\\]*)*)"/,
      /"call_to_action"\s*:\s*\{\s*"value"\s*:\s*"([^"\\]*(?:\\.[^"\\]*)*)"/,
      /"cta_type"\s*:\s*"([^"]+)"/,
      /"call_to_action_type"\s*:\s*"([^"]+)"/,
    ];
    for (const re of ctaPatterns) {
      const m = afterAdTextChunk.match(re) ?? textChunk.match(re);
      if (m?.[1]) {
        const raw = unescapeJsonString(m[1]).trim().slice(0, 120);
        if (raw && !isInvalidCta(raw)) cta = raw;
        break;
      }
    }

    let ad_start_date: string | null = null;
    const tsMatch =
      chunk.match(/"ad_delivery_start_time"\s*:\s*(\d+)/) ??
      textChunk.match(/"ad_delivery_start_time"\s*:\s*(\d+)/) ??
      chunk.match(/"start_date"\s*:\s*"([^"]+)"/) ??
      textChunk.match(/"start_date"\s*:\s*"([^"]+)"/);
    if (tsMatch) {
      if (tsMatch[1] && /^\d{10,}$/.test(tsMatch[1])) {
        ad_start_date = new Date(parseInt(tsMatch[1], 10) * 1000).toISOString().slice(0, 10);
      } else if (tsMatch[1] && /^\d{4}-\d{2}-\d{2}/.test(tsMatch[1])) {
        ad_start_date = tsMatch[1].slice(0, 10);
      }
    }

    let publisher_platforms: string[] | null = null;
    const platformArrMatch = textChunk.match(/"publisher_platform"\s*:\s*\[([^\]]+)\]/) ?? textChunk.match(/"publisher_platforms"\s*:\s*\[([^\]]+)\]/);
    if (platformArrMatch?.[1]) {
      const platforms = platformArrMatch[1]
        .split(",")
        .map((s) => s.replace(/"/g, "").trim())
        .filter((s) => s.length > 0);
      if (platforms.length > 0) publisher_platforms = platforms;
    } else {
      const platformStrMatch = textChunk.match(/"publisher_platform"\s*:\s*"([^"]+)"/);
      if (platformStrMatch?.[1]) publisher_platforms = [platformStrMatch[1]];
    }

    results.push({
      ad_id: adId,
      ad_text: adText,
      ad_headline: adHeadline,
      ad_description: adDescription,
      image_url: imageUrl,
      video_url: videoUrl,
      carousel_urls: carouselUrls,
      cta,
      ad_start_date,
      publisher_platforms,
    });
  }

  return results;
}

/** DOM-extracted ad. ad_id from link href; all fields from DOM. */
export type DomExtractedAd = {
  ad_id?: string;
  image_url: string | null;
  video_url: string | null;
  carousel_urls: string[];
  ad_text: string;
  cta?: string | null;
  landing_page_url?: string | null;
  ad_start_date?: string | null;
};

/** Check if URL is ad creative media (scontent.xx.fbcdn, fbcdn, etc.). */
function isAdMediaUrlFromDom(url: string | null): boolean {
  if (!url || url.length < 30) return false;
  if (url.includes("emoji") || url.includes("1f") || url.includes("safe_image")) return false;
  if (url.includes("rsrc.php")) return false;
  if (url.includes("static.xx.fbcdn.net")) return false;
  if (url.includes("graph.facebook.com")) return false;
  if (url.includes("placeholder") || url.includes("silhouette") || url.includes("default_avatar")) return false;
  if (/[?&_]1x1(?:\.[a-z]+|$|\?|&)/i.test(url)) return false;
  if (SMALL_SIZE_PATTERN.test(url)) return false;
  if (PROFILE_SIZE_PATTERN.test(url)) return false;
  if (/\.js(\?|&|$)/.test(url) || url.endsWith(".js")) return false;
  return url.includes("scontent.") || url.includes("fbcdn.net");
}

/** Normalize URL: protocol-relative -> https, ensure full URL. */
function normalizeDomUrl(url: string): string {
  const s = url.trim();
  if (s.startsWith("//")) return "https:" + s;
  if (s.startsWith("http://") || s.startsWith("https://")) return s;
  return "https://" + s;
}

/** Pick the largest-width URL from srcset for full quality creatives. */
function getBestSrcFromSrcset(srcset: string): string | null {
  const parts = srcset.split(",");
  const sorted = parts
    .map((p) => {
      const [url, size] = p.trim().split(/\s+/);
      const w = size?.replace("w", "") ?? "0";
      return { url: url?.trim() ?? "", size: parseInt(w, 10) || 0 };
    })
    .filter((x) => x.url && x.size > 0)
    .sort((a, b) => b.size - a.size);
  return sorted[0]?.url ?? null;
}

/** Extract image URLs from an img element. Checks src, currentSrc, srcset, data-src. */
function getImgUrls(img: HTMLImageElement): string[] {
  const urls: string[] = [];
  const addIfValid = (u: string | null | undefined) => {
    if (u && isAdMediaUrlFromDom(u)) {
      const n = normalizeDomUrl(u);
      if (!urls.includes(n)) urls.push(n);
    }
  };
  addIfValid(img.currentSrc || img.src);
  const srcset = img.getAttribute("srcset");
  if (srcset) {
    const best = getBestSrcFromSrcset(srcset);
    addIfValid(best);
  }
  addIfValid(img.getAttribute("src") ?? img.getAttribute("data-src"));
  return urls;
}

/** Parse srcset into URLs. */
function parseSrcsetUrls(srcset: string): string[] {
  if (!srcset?.trim()) return [];
  return srcset
    .split(",")
    .map((p) => p.trim().split(/\s+/)[0])
    .filter(Boolean);
}

/** Parse background-image url(...) into URLs. */
function parseBackgroundImageUrls(bg: string): string[] {
  if (!bg || bg === "none") return [];
  const matches = bg.matchAll(/url\(["']?([^"')]+)["']?\)/g);
  return [...matches].map((m) => m[1].trim()).filter(Boolean);
}

/**
 * Extract graphics and captions directly from the rendered Ads Library DOM.
 * Uses actual img/video src attributes (e.g. https://scontent.xx.fbcdn.net/...).
 * Run via page.evaluate(extractAdsFromDomInPage).
 * All helpers inlined – page.evaluate runs in browser, no module-level refs.
 */
export function extractAdsFromDomInPage(): DomExtractedAd[] {
  const results: DomExtractedAd[] = [];
  const seen = new Set<string>();

  const normalizeDomUrl = (url: string) => {
    const s = url.trim().replace(/&amp;/gi, "&");
    if (s.startsWith("//")) return "https:" + s;
    if (s.startsWith("http://") || s.startsWith("https://")) return s;
    return "https://" + s;
  };
  const smallSizeRe = /[_-]s(?:50|60|80|100|120|148|150|200)x(?:50|60|80|100|120|148|150|200)(?:[_-]|$|\?|&)/i;
  const profileSizeRe = /[_-]p(?:50|60|80|100|120|148|150|200)x(?:50|60|80|100|120|148|150|200)(?:[_-]|$|\?|&)/i;
  const isAdMediaUrlFromDom = (url: string | null) => {
    if (!url || url.length < 30) return false;
    if (url.includes("emoji") || url.includes("1f") || url.includes("safe_image")) return false;
    if (url.includes("rsrc.php") || url.includes("static.xx.fbcdn.net")) return false;
    if (url.includes("graph.facebook.com")) return false;
    if (url.includes("placeholder") || url.includes("silhouette") || url.includes("default_avatar")) return false;
    if (/[?&_]1x1(?:\.[a-z]+|$|\?|&)/i.test(url)) return false;
    if (smallSizeRe.test(url)) return false;
    if (profileSizeRe.test(url)) return false;
    if (/\.js(\?|&|$)/.test(url) || url.endsWith(".js")) return false;
    return url.includes("scontent.") || url.includes("fbcdn.net");
  };
  const isLikelyProfileOrLogo = (url: string) =>
    /[_-](?:50|100|148|150)x(?:50|100|148|150)(?:\.[a-z]+|$|\?)/i.test(url) ||
    profileSizeRe.test(url) ||
    /\/[ps](\d+)\./i.test(url);
  const getBestSrcFromSrcset = (srcset: string) => {
    const parts = srcset.split(",");
    const sorted = parts
      .map((p) => {
        const [url, size] = p.trim().split(/\s+/);
        const w = (size ?? "").replace("w", "") || "0";
        return { url: (url ?? "").trim(), size: parseInt(w, 10) || 0 };
      })
      .filter((x) => x.url && x.size > 0)
      .sort((a, b) => b.size - a.size);
    return sorted[0]?.url ?? null;
  };
  const getImgUrls = (img: HTMLImageElement) => {
    const urls: string[] = [];
    const add = (u: string | null | undefined) => {
      if (u && isAdMediaUrlFromDom(u)) {
        const n = normalizeDomUrl(u);
        if (!urls.includes(n)) urls.push(n);
      }
    };
    add(img.currentSrc || img.src);
    const srcset = img.getAttribute("srcset");
    if (srcset) add(getBestSrcFromSrcset(srcset));
    add(img.getAttribute("src") ?? img.getAttribute("data-src"));
    return urls;
  };
  const parseSrcsetUrls = (srcset: string) => {
    if (!srcset?.trim()) return [];
    return srcset
      .split(",")
      .map((p) => p.trim().split(/\s+/)[0])
      .filter(Boolean);
  };
  const parseBackgroundImageUrls = (bg: string) => {
    if (!bg || bg === "none") return [];
    const matches = bg.matchAll(/url\(["']?([^"')]+)["']?\)/g);
    return [...matches].map((m) => m[1].trim()).filter(Boolean);
  };

  const isPlaceholderText = (t: string) =>
    /^(No caption|Video|Image|Photo|Sponsored|Learn more|See more)$/i.test(t) || t.length < 15;

  const isMetadataOrSystemText = (t: string) => {
    const s = t.toLowerCase();
    return (
      s.includes("ad library report") ||
      s.includes("branded content") ||
      s.includes("subscribe to email") ||
      s.includes("about ads and data") ||
      s.includes("metastatus.com") ||
      s.includes("about this ad") ||
      s.includes("why am i seeing this") ||
      s.includes("filterssort") ||
      s.includes("sortsort by") ||
      s.includes("remove filters") ||
      s.includes("active status") ||
      s.includes("library id:") ||
      s.includes("started running on") ||
      /^https?:\/\//.test(t.trim()) ||
      /^[a-z0-9.-]+\.(com|org|net|io)$/i.test(t.trim())
    );
  };

  function getText(container: Element): string {
    const texts: string[] = [];
    const seen = new Set<string>();
    const addText = (t: string) => {
      const s = t.trim().replace(/\s+/g, " ");
      if (
        s.length >= 10 &&
        s.length < 5000 &&
        !isPlaceholderText(s) &&
        !isMetadataOrSystemText(s) &&
        !seen.has(s.slice(0, 80))
      ) {
        seen.add(s.slice(0, 80));
        texts.push(s);
      }
    };
    for (const el of container.querySelectorAll("[dir='auto'], span, div, p")) {
      const t = (el.textContent ?? "").trim();
      if (t) addText(t);
    }
    return texts.length > 0 ? texts.join("\n\n").slice(0, 2000) : "";
  }

  const isVideoUrlLocal = (u: string) =>
    u.includes("video.xx.fbcdn.net") ||
    (u.includes("video.") && (u.includes("fbcdn") || u.includes("cdninstagram"))) ||
    /\.(mp4|webm)(\?|&|$)/i.test(u);

  /** Min size to treat as ad creative (exclude profile/logo ~50–120px). */
  const MIN_AD_IMAGE_SIZE = 180;

  function collectMediaFromContainer(container: Element): { imageUrl: string | null; carouselUrls: string[]; videoUrl: string | null } {
    const byUrl = new Map<string, number>(); // url -> pixel area (width*height)
    let videoUrl: string | null = null;
    const addImageUrl = (u: string, area = 0) => {
      if (!u || !isAdMediaUrlFromDom(u)) return;
      if (isVideoUrlLocal(u)) {
        if (!videoUrl) videoUrl = normalizeDomUrl(u);
        return;
      }
      const n = normalizeDomUrl(u);
      const prev = byUrl.get(n);
      if (prev === undefined || area > prev) byUrl.set(n, area);
    };

    // img: src, currentSrc, srcset, data-src – use naturalWidth/height to prefer ad creative over profile pic
    const imgs = container.querySelectorAll("img");
    for (const img of imgs) {
      const el = img as HTMLImageElement;
      const w = el.naturalWidth || el.width || 0;
      const h = el.naturalHeight || el.height || 0;
      const area = w * h;
      for (const u of getImgUrls(el)) addImageUrl(u, area);
    }
    // Carousel: collect from listbox/tabpanel/slide/carousel regions (may have multiple slides)
    const carouselSelectors =
      '[role="listbox"] img, [role="tabpanel"] img, [aria-label*="carousel"] img, [aria-label*="slide"] img, [aria-label*="Slide"] img, [aria-roledescription="carousel"] img, [role="group"] img';
    for (const img of container.querySelectorAll(carouselSelectors)) {
      const el = img as HTMLImageElement;
      const w = el.naturalWidth || el.width || 0;
      const h = el.naturalHeight || el.height || 0;
      const area = w * h;
      for (const u of getImgUrls(el)) addImageUrl(u, area);
    }
    // video: currentSrc, source src
    const videoEl = container.querySelector("video");
    if (videoEl) {
      const vsrc = (videoEl as HTMLVideoElement).currentSrc || videoEl.querySelector("source")?.getAttribute("src");
      if (vsrc && (vsrc.startsWith("http") || vsrc.startsWith("//"))) addImageUrl(vsrc);
    }

    // Video thumbnail: img with play overlay may have video URL in data attributes
    const videoDataAttrs = ["data-video-src", "data-src", "data-video-url", "data-href"];
    for (const el of container.querySelectorAll("[data-video-src], [data-src], [data-video-url], [data-href]")) {
      for (const attr of videoDataAttrs) {
        const u = el.getAttribute(attr);
        if (u && (u.includes("video.") || /\.(mp4|webm)(\?|&|$)/i.test(u))) addImageUrl(u);
      }
    }

    // source (inside video/picture)
    const sources = container.querySelectorAll("video source, picture source");
    for (const src of sources) {
      const s = src as HTMLSourceElement;
      const u = s.src || s.getAttribute("src");
      if (u) addImageUrl(u);
      for (const u2 of parseSrcsetUrls(s.srcset || "")) addImageUrl(u2);
    }

    // background-image (Meta sometimes uses CSS backgrounds)
    const allEls = container.querySelectorAll("[style*='background'], [style*='background-image']");
    for (const el of allEls) {
      const bg = (el as HTMLElement).style?.backgroundImage || getComputedStyle(el).backgroundImage;
      for (const u of parseBackgroundImageUrls(bg)) addImageUrl(u);
    }

    // Prefer larger images (ad creatives) over small ones (profile/logo). Sort by area desc, exclude tiny.
    const minArea = MIN_AD_IMAGE_SIZE * MIN_AD_IMAGE_SIZE;
    let carouselUrls = [...byUrl.entries()]
      .map(([url, area]) => {
        if (area === 0 && isLikelyProfileOrLogo(url)) return [url, 1] as [string, number];
        return [url, area] as [string, number];
      })
      .filter(([, area]) => area === 0 || area >= minArea)
      .sort((a, b) => b[1] - a[1])
      .map(([url]) => url);
    if (carouselUrls.length === 0) carouselUrls = [...byUrl.keys()];
    const imageUrl = carouselUrls[0] ?? null;
    return { imageUrl, carouselUrls, videoUrl };
  }

  function getStartDateFromContainer(container: Element): string | null {
    const text = (container.textContent ?? "").trim();
    if (!text) return null;
    const startedMatch = text.match(/Started running on\s+([A-Za-z]+\s+\d{1,2},?\s+\d{4})/i);
    if (startedMatch?.[1]) {
      const d = new Date(startedMatch[1].trim());
      if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
    }
    const activeMatch = text.match(/Active since\s+([A-Za-z]+\s+\d{1,2},?\s+\d{4})/i);
    if (activeMatch?.[1]) {
      const d = new Date(activeMatch[1].trim());
      if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
    }
    const isoMatch = text.match(/\b(\d{4}-\d{2}-\d{2})\b/);
    if (isoMatch?.[1]) return isoMatch[1];
    return null;
  }

  function getCtaFromContainer(container: Element): string | null {
    const skipText = /^(View on Meta|Ad creative|No caption|Sponsored|Learn more|See more|Filters|Sort|Remove|Remove Filters|Sort by|Active status)$/i;
    const isCtaLike = (t: string) =>
      t.length >= 2 &&
      t.length <= 120 &&
      !skipText.test(t) &&
      !/^https?:\/\//.test(t) &&
      !/^[a-z0-9.-]+\.(com|org|net|io)$/i.test(t.trim());

    // 1. Links to external URLs (often CTA buttons: "Sign Up", "Earn upto ₹45,000")
    const links = container.querySelectorAll('a[href]');
    for (const a of links) {
      const href = ((a as HTMLAnchorElement).href ?? a.getAttribute("href") ?? "").trim();
      if (
        !href ||
        href.includes("ads/library") ||
        href.includes("ads/archive") ||
        href.includes("facebook.com") ||
        href.startsWith("#")
      )
        continue;
      const t = (a.textContent ?? "").trim().replace(/\s+/g, " ");
      if (isCtaLike(t)) return t;
    }
    // 2. Buttons
    const buttons = container.querySelectorAll('[role="button"]');
    for (const el of buttons) {
      const t = (el.textContent ?? "").trim().replace(/\s+/g, " ");
      if (isCtaLike(t)) return t;
    }
    // 3. Divs/spans that look like CTA (short actionable text, often in styled containers)
    const ctaCandidates = container.querySelectorAll(
      '[data-cta], [aria-label*="action"], [aria-label*="cta"], div[class*="cta"], span[class*="cta"]'
    );
    for (const el of ctaCandidates) {
      const t = (el.textContent ?? "").trim().replace(/\s+/g, " ");
      if (isCtaLike(t)) return t;
    }
    // 4. Any element with short actionable text (2–80 chars) that looks like CTA (Sign Up, Learn More, etc.)
    const actionWords = /^(sign up|learn more|shop now|get started|download|subscribe|contact us|earn|apply|join|send|message)/i;
    for (const el of container.querySelectorAll("a, [role='button'], span, div")) {
      const t = (el.textContent ?? "").trim().replace(/\s+/g, " ");
      if (isCtaLike(t) && (actionWords.test(t) || t.includes("₹") || t.includes("$") || t.length <= 50)) {
        return t;
      }
    }
    return null;
  }

  function getLandingUrlFromContainer(container: Element): string | null {
    const links = container.querySelectorAll('a[href]');
    for (const a of links) {
      const href = (a as HTMLAnchorElement).href ?? a.getAttribute("href") ?? "";
      if (!href || href.includes("ads/library") || href.includes("ads/archive") || href.includes("facebook.com") || href.startsWith("#")) continue;
      const trimmed = href.trim();
      if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) return trimmed;
    }
    return null;
  }

  function getAdIdFromContainer(container: Element): string | undefined {
    const adLink = container.querySelector('a[href*="ads/library"], a[href*="ads/archive"]');
    if (adLink) {
      const href = (adLink as HTMLAnchorElement).href ?? adLink.getAttribute("href") ?? "";
      const decoded = (() => {
        try {
          return decodeURIComponent(href);
        } catch {
          return href;
        }
      })();
      const idMatch =
        href.match(/[?&]id=(\d+)/) ??
        href.match(/\/id\/(\d+)/) ??
        href.match(/[?&]id%3D(\d+)/i) ??
        decoded.match(/[?&]id=(\d+)/) ??
        decoded.match(/\/id\/(\d+)/);
      if (idMatch?.[1]) return idMatch[1];
    }
    const adIdPatterns = [
      /"ad_archive_id"\s*:\s*"(\d+)"/,
      /"ad_snapshot_id"\s*:\s*"(\d+)"/,
      /render_ad\/\?id=(\d+)/,
      /render_ad%3Fid%3D(\d+)/i,
      /\/ads\/library\/\?id=(\d+)/,
      /[?&]id=(\d{10,})/,
    ];
    let el: Element | null = container;
    while (el && el !== document.body) {
      const html = el.innerHTML;
      for (const re of adIdPatterns) {
        const m = html.match(re);
        if (m?.[1] && m[1].length >= 10) return m[1];
      }
      el = el.parentElement;
    }
    return undefined;
  }

  const getContainer = (el: Element): Element =>
    el.closest("[role='article']") ??
    el.closest("[data-pagelet]") ??
    el.closest("[role='group']") ??
    el.closest("section") ??
    el.closest("div[class]")?.parentElement ??
    el.closest("div") ??
    el;

  /** Find smallest container that has exactly one ads/library link (avoids grouping multiple ads). */
  const getAdCardContainer = (link: Element): Element => {
    let el: Element | null = link.parentElement;
    while (el && el !== document.body) {
      const adLinksInEl = el.querySelectorAll('a[href*="ads/library"], a[href*="ads/archive"]');
      if (adLinksInEl.length === 1 && adLinksInEl[0] === link) return el;
      el = el.parentElement;
    }
    return getContainer(link);
  };

  // Strategy 1: Links to ads/library - get container per link (smallest with one ad), extract all from DOM
  const adLinks = document.querySelectorAll('a[href*="ads/library"], a[href*="ads/archive"]');
  for (const a of adLinks) {
    const href = (a as HTMLAnchorElement).href ?? a.getAttribute("href") ?? "";
    const idMatch = href.match(/[?&]id=(\d+)/) ?? href.match(/\/id\/(\d+)/);
    const container = getAdCardContainer(a);
    const adId = idMatch?.[1] ?? getAdIdFromContainer(container);
    const { imageUrl, carouselUrls, videoUrl } = collectMediaFromContainer(container);
    const adText = getText(container);
    const cta = getCtaFromContainer(container);
    const landing_page_url = getLandingUrlFromContainer(container);
    const ad_start_date = getStartDateFromContainer(container);
    if (imageUrl || carouselUrls.length > 0 || videoUrl || adText || adId) {
      const key = adId ?? carouselUrls[0] ?? videoUrl ?? adText.slice(0, 50);
      if (!seen.has(key)) {
        seen.add(key);
        results.push({
          ad_id: adId,
          image_url: imageUrl,
          video_url: videoUrl,
          carousel_urls: carouselUrls,
          ad_text: adText,
          cta: cta ?? undefined,
          landing_page_url: landing_page_url ?? undefined,
          ad_start_date: ad_start_date ?? undefined,
        });
      }
    }
  }

  // Strategy 2: Find ad cards by img elements with scontent/fbcdn - supplement media for existing or add new
  const byAdId = new Map<string, (typeof results)[0]>();
  for (const r of results) {
    if (r.ad_id) byAdId.set(r.ad_id, r);
  }
  const allImgs = document.querySelectorAll("img");
  const seenContainers = new Set<Element>();
  const getContainerForImg = (img: Element): Element | null => {
    let el: Element | null = img.parentElement;
    while (el && el !== document.body) {
      const adLinksInEl = el.querySelectorAll('a[href*="ads/library"], a[href*="ads/archive"]');
      if (adLinksInEl.length === 1) return el;
      el = el.parentElement;
    }
    return (
      img.closest("[role='article']") ??
      img.closest("[role='group']") ??
      img.closest("[data-pagelet]") ??
      img.closest("section") ??
      img.closest("div")?.parentElement ??
      null
    );
  };
  for (const img of allImgs) {
    const urls = getImgUrls(img as HTMLImageElement);
    if (urls.length === 0) continue;
    const container = getContainerForImg(img);
    if (!container || seenContainers.has(container)) continue;
    seenContainers.add(container);
    const adId = getAdIdFromContainer(container);
    const { imageUrl, carouselUrls, videoUrl } = collectMediaFromContainer(container);
    const adText = getText(container);
    const cta = getCtaFromContainer(container);
    const landing_page_url = getLandingUrlFromContainer(container);
    const ad_start_date = getStartDateFromContainer(container);
    const existing = adId ? byAdId.get(adId) : undefined;
    if (existing && (imageUrl || videoUrl || carouselUrls.length > 0)) {
      if (!existing.image_url && imageUrl) existing.image_url = imageUrl;
      if (!existing.video_url && videoUrl) existing.video_url = videoUrl;
      if (carouselUrls.length > 0) existing.carousel_urls = carouselUrls;
      if (!existing.ad_text && adText) existing.ad_text = adText;
      if (!existing.cta && cta) existing.cta = cta;
      if (!existing.landing_page_url && landing_page_url) existing.landing_page_url = landing_page_url;
      if (!existing.ad_start_date && ad_start_date) existing.ad_start_date = ad_start_date;
    } else if (!existing) {
      const key = adId ?? carouselUrls[0]?.slice(0, 100) ?? videoUrl ?? adText.slice(0, 50) ?? "";
      if (!key || seen.has(key)) continue;
      seen.add(key);
      const entry = {
        ad_id: adId,
        image_url: imageUrl,
        video_url: videoUrl,
        carousel_urls: carouselUrls,
        ad_text: adText,
        cta: cta ?? undefined,
        landing_page_url: landing_page_url ?? undefined,
        ad_start_date: ad_start_date ?? undefined,
      };
      results.push(entry);
      if (adId) byAdId.set(adId, entry);
    }
  }

  return results;
}

export type CorrelateUrlsArgs = {
  capturedUrls: string[];
  adIdsInOrder?: string[];
};

/**
 * Tier 2.5: Correlate captured CDN URLs to ad IDs via DOM.
 * Checks src, currentSrc, srcset, background-image on img/video/source/div.
 * Run via page.evaluate(correlateUrlsToAdIds, { capturedUrls, adIdsInOrder }).
 * When containers lack ad_id in innerHTML but HTML has ad_archive_id, uses positional matching.
 */
export function correlateUrlsToAdIds(
  args: CorrelateUrlsArgs | string[]
): Record<string, { image_url?: string; video_url?: string; carousel_urls: string[] }> {
  const capturedUrls = Array.isArray(args) ? args : args.capturedUrls;
  const adIdsInOrder = Array.isArray(args) ? undefined : args.adIdsInOrder;
  const result: Record<string, { image_url?: string; video_url?: string; carousel_urls: string[] }> = {};
  if (capturedUrls.length === 0) return result;

  const norm = (u: string) => u.trim().split("?")[0];
  const capturedSet = new Set(capturedUrls.map(norm));

  const urlMatches = (domUrl: string): boolean => {
    const n = norm(domUrl);
    if (capturedSet.has(n)) return true;
    for (const c of capturedSet) {
      if (n.includes(c) || c.includes(n)) return true;
    }
    return false;
  };

  const isVideo = (u: string) =>
    u.includes("video.xx.fbcdn.net") ||
    (u.includes("video.") && (u.includes("fbcdn") || u.includes("cdninstagram"))) ||
    /\.(mp4|webm)(\?|&|$)/i.test(u);

  // Inlined so correlateUrlsToAdIds is self-contained when run in page.evaluate (browser context)
  const smallSizeRe = /[_-]s(?:50|60|80|100|120|148|150|200)x(?:50|60|80|100|120|148|150|200)(?:[_-]|$|\?|&)/i;
  const profileSizeRe = /[_-]p(?:50|60|80|100|120|148|150|200)x(?:50|60|80|100|120|148|150|200)(?:[_-]|$|\?|&)/i;
  const isAdMediaUrlLocal = (url: string): boolean => {
    if (!url || url.length < 20) return false;
    if (url.includes("emoji") || url.includes("1f") || url.includes("safe_image")) return false;
    if (url.includes("rsrc.php") || url.includes("static.xx.fbcdn.net")) return false;
    if (url.includes("graph.facebook.com")) return false;
    if (url.includes("placeholder") || url.includes("silhouette") || url.includes("default_avatar")) return false;
    if (/[?&_]1x1(?:\.[a-z]+|$|\?|&)/i.test(url)) return false;
    if (smallSizeRe.test(url)) return false;
    if (profileSizeRe.test(url)) return false;
    if (/\.js(\?|&|$)/.test(url) || url.endsWith(".js")) return false;
    return url.includes("scontent") || url.includes("fbcdn.net");
  };
  const isLikelyProfileOrLogoLocal = (url: string): boolean =>
    /[_-](?:50|100|150)x(?:50|100|150)(?:\.[a-z]+|$|\?)/i.test(url) || /\/[ps](\d+)\./i.test(url);

  const parseSrcset = (s: string) =>
    s
      .split(",")
      .map((p) => p.trim().split(/\s+/)[0])
      .filter(Boolean);
  const parseBg = (bg: string) =>
    !bg || bg === "none" ? [] : [...bg.matchAll(/url\(["']?([^"')]+)["']?\)/g)].map((m) => m[1].trim());

  const getAdIdFromContainer = (container: Element): string | undefined => {
    const adLink = container.querySelector('a[href*="ads/library"], a[href*="ads/archive"]');
    if (adLink) {
      const href = (adLink as HTMLAnchorElement).href ?? adLink.getAttribute("href") ?? "";
      const decoded = (() => {
        try {
          return decodeURIComponent(href);
        } catch {
          return href;
        }
      })();
      const idMatch =
        href.match(/[?&]id=(\d+)/) ??
        href.match(/\/id\/(\d+)/) ??
        href.match(/[?&]id%3D(\d+)/i) ??
        decoded.match(/[?&]id=(\d+)/) ??
        decoded.match(/\/id\/(\d+)/);
      if (idMatch?.[1]) return idMatch[1];
    }
    const adIdPatterns = [
      /"ad_archive_id"\s*:\s*"(\d+)"/,
      /"ad_snapshot_id"\s*:\s*"(\d+)"/,
      /render_ad\/\?id=(\d+)/,
      /render_ad%3Fid%3D(\d+)/i,
      /\/ads\/library\/\?id=(\d+)/,
      /[?&]id=(\d{10,})/,
    ];
    let el: Element | null = container;
    while (el && el !== document.body) {
      const html = el.innerHTML;
      for (const re of adIdPatterns) {
        const m = html.match(re);
        if (m?.[1] && m[1].length >= 10) return m[1];
      }
      el = el.parentElement;
    }
    return undefined;
  };

  const getContainer = (el: Element): Element =>
    el.closest("[role='article']") ??
    el.closest("[data-pagelet]") ??
    el.closest("[role='group']") ??
    el.closest("section") ??
    el.closest("div[class]")?.parentElement ??
    el.closest("div") ??
    el;

  const pending: { container: Element; images: string[]; videoUrl?: string }[] = [];

  const MIN_AD_SIZE = 180;
  const collectMediaFromContainer = (container: Element, requireUrlMatch: boolean): { images: string[]; videoUrl?: string } => {
    const byUrl = new Map<string, number>();
    let videoUrl: string | undefined;
    const addUrl = (u: string | null, area = 0) => {
      if (!u || typeof u !== "string") return;
      const matches = requireUrlMatch ? urlMatches(u) : isAdMediaUrlLocal(u);
      if (matches) {
        if (isVideo(u)) videoUrl = u;
        else {
          const prev = byUrl.get(u);
          if (prev === undefined || area > prev) byUrl.set(u, area);
        }
      }
    };

    const imgs = container.querySelectorAll("img");
    for (const img of imgs) {
      const el = img as HTMLImageElement;
      const w = el.naturalWidth || el.width || 0;
      const h = el.naturalHeight || el.height || 0;
      const area = w * h;
      const u = el.currentSrc || el.src || el.getAttribute("src") || el.getAttribute("data-src");
      addUrl(u, area);
      for (const u2 of parseSrcset(el.srcset || "")) addUrl(u2, area);
    }
    const videos = container.querySelectorAll("video");
    for (const v of videos) {
      const u = ((v as HTMLVideoElement).currentSrc || v.getAttribute("src")) ?? "";
      if (u && (requireUrlMatch ? urlMatches(u) : isAdMediaUrlLocal(u))) videoUrl = u;
    }
    const sources = container.querySelectorAll("video source, picture source");
    for (const s of sources) {
      const el = s as HTMLSourceElement;
      const u = el.src || el.getAttribute("src");
      addUrl(u);
      for (const u2 of parseSrcset(el.srcset || "")) addUrl(u2);
    }
    const bgEls = container.querySelectorAll("[style*='background']");
    for (const el of bgEls) {
      const bg = (el as HTMLElement).style?.backgroundImage || getComputedStyle(el).backgroundImage;
      for (const u of parseBg(bg)) addUrl(u);
    }
    const minArea = MIN_AD_SIZE * MIN_AD_SIZE;
    const images = [...byUrl.entries()]
      .map(([url, area]) => (area === 0 && isLikelyProfileOrLogoLocal(url) ? [url, 1] as [string, number] : [url, area] as [string, number]))
      .filter(([, area]) => area === 0 || area >= minArea)
      .sort((a, b) => b[1] - a[1])
      .map(([url]) => url);
    const fallback = images.length === 0 ? [...byUrl.keys()] : images;
    return { images: fallback, videoUrl };
  };

  const processContainer = (container: Element): void => {
    const adId = getAdIdFromContainer(container);
    const withMatch = collectMediaFromContainer(container, true);
    const withAnyAdMedia = adIdsInOrder?.length ? collectMediaFromContainer(container, false) : { images: [] as string[], videoUrl: undefined };

    const images = withMatch.images.length > 0 ? withMatch.images : withAnyAdMedia.images;
    const videoUrl = withMatch.videoUrl ?? withAnyAdMedia.videoUrl;

    if (images.length === 0 && !videoUrl) return;

    if (adId && !result[adId]) {
      result[adId] = {
        image_url: images[0],
        video_url: videoUrl,
        carousel_urls: [...new Set(images)],
      };
    } else if (!adId && adIdsInOrder && adIdsInOrder.length > 0) {
      pending.push({ container, images, videoUrl });
    }
  };

  const adLinks = document.querySelectorAll('a[href*="ads/library"], a[href*="ads/archive"]');
  for (const a of adLinks) {
    processContainer(getContainer(a));
  }

  const seenContainers = new Set<Element>();
  const allImgs = document.querySelectorAll("img");
  for (const img of allImgs) {
    const el = img as HTMLImageElement;
    const u = el.currentSrc || el.src || el.getAttribute("src") || el.getAttribute("data-src");
    if (!u || !urlMatches(u)) continue;
    const container =
      img.closest("[role='article']") ??
      img.closest("[data-pagelet]") ??
      img.closest("[role='group']") ??
      img.closest("section") ??
      img.closest("div[class]")?.parentElement ??
      img.closest("div")?.parentElement ??
      img.parentElement?.parentElement;
    if (!container || seenContainers.has(container)) continue;
    seenContainers.add(container);
    processContainer(container);
  }

  // Positional fallback: ad_archive_id in HTML but not in container innerHTML
  if (pending.length > 0 && adIdsInOrder && adIdsInOrder.length > 0) {
    const usedIds = new Set(Object.keys(result));
    const availableIds = adIdsInOrder.filter((id) => !usedIds.has(id));
    if (availableIds.length > 0) {
      const docOrder = (a: { container: Element }, b: { container: Element }) =>
        a.container.compareDocumentPosition(b.container) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1;
      const sorted = [...pending].sort(docOrder);
      const toAssign = Math.min(sorted.length, availableIds.length);
      for (let i = 0; i < toAssign; i++) {
        const adId = availableIds[i];
        const { images, videoUrl } = sorted[i];
        if (!result[adId]) {
          result[adId] = {
            image_url: images[0],
            video_url: videoUrl,
            carousel_urls: [...new Set(images)],
          };
        }
      }
    }
  }

  return result;
}
