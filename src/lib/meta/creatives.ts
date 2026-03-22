import { SupabaseClient } from "@supabase/supabase-js";
import { serverLogger } from "@/lib/logger";

const META_VERSION = "v21.0";
const GRAPH_BASE = `https://graph.facebook.com/${META_VERSION}`;

type ChildAttachment = {
  picture?: string;
  link?: string;
  name?: string;
  description?: string;
  image_hash?: string;
};

type AssetFeedVideo = { video_id?: string };
type RawCreative = {
  id: string;
  thumbnail_url?: string;
  image_url?: string;
  body?: string;
  object_story_spec?: {
    link_data?: { link?: string; image_hash?: string; child_attachments?: ChildAttachment[] };
    video_data?: { image_url?: string; video_id?: string };
  };
  asset_feed_spec?: { videos?: AssetFeedVideo[] };
};

type RawAd = {
  id: string;
  name: string;
  campaign?: { name: string };
  adset?: { name: string };
  creative?: RawCreative;
};

type AdsResponse = {
  data?: RawAd[];
  paging?: { next?: string };
  error?: { message: string };
};

export type CreativeUpsertRow = {
  user_id: string;
  ad_id: string;
  ad_name: string;
  campaign_name: string;
  adset_name: string;
  creative_id: string;
  thumbnail_url: string;
  image_url: string;
  body: string;
  link_url: string;
  creative_type: string;
  video_url: string;
  carousel_urls: string[];
  updated_at: string;
};

/** Safe subset returned by GET /api/meta/creatives-debug (no tokens). */
export type CreativeSyncDebugEntry = {
  ad_id: string;
  ad_name: string;
  creative_id: string;
  creative_type: string;
  video_url_empty: boolean;
  video_id_in_listing: string | null;
  creative_node_refetch_attempted: boolean;
  video_id_after_refetch: string | null;
  final_video_id: string | null;
  video_resolution: {
    error_message: string | null;
    meta_returned_source: boolean;
    meta_returned_permalink_url: boolean;
    meta_returned_embed_html: boolean;
    used_strategy: "source" | "permalink_plugin" | "embed_src" | "none";
  } | null;
  story_shape: {
    has_object_story_spec: boolean;
    story_top_level_keys: string[];
    video_data_present: boolean;
    video_data_keys: string[];
    video_data_video_id_raw: string | null;
    asset_feed_videos_count: number;
    asset_feed_video_ids: string[];
  };
};

/** Nested fields so Graph returns video_id (shallow object_story_spec often omits it). */
const CREATIVE_FIELDS =
  "id,thumbnail_url,image_url,body," +
  "object_story_spec{video_data{video_id,image_url},link_data{link,child_attachments{picture,link,name}}}," +
  "asset_feed_spec{videos{video_id}}";

export function extractVideoId(creative: RawCreative | undefined): string | undefined {
  if (!creative) return undefined;
  const fromStory = creative.object_story_spec?.video_data?.video_id;
  if (fromStory) return String(fromStory);
  const feedVideos = creative.asset_feed_spec?.videos;
  if (Array.isArray(feedVideos)) {
    for (const v of feedVideos) {
      if (v?.video_id) return String(v.video_id);
    }
  }
  return undefined;
}

/**
 * Single-creative fetch when ads listing returns video_data without video_id.
 */
async function fetchVideoIdFromCreativeNode(
  creativeId: string,
  token: string
): Promise<{ videoId: string | undefined; errorMessage: string | null }> {
  try {
    const fields = encodeURIComponent(
      "object_story_spec{video_data{video_id},link_data{link}}," + "asset_feed_spec{videos{video_id}}"
    );
    const res = await fetch(
      `${GRAPH_BASE}/${encodeURIComponent(creativeId)}?fields=${fields}&access_token=${encodeURIComponent(token)}`
    );
    const j = (await res.json()) as {
      object_story_spec?: RawCreative["object_story_spec"];
      asset_feed_spec?: RawCreative["asset_feed_spec"];
      error?: { message: string };
    };
    if (j.error) {
      return { videoId: undefined, errorMessage: j.error.message };
    }
    const nestedCreative: RawCreative = {
      id: creativeId,
      object_story_spec: j.object_story_spec,
      asset_feed_spec: j.asset_feed_spec,
    };
    return { videoId: extractVideoId(nestedCreative), errorMessage: null };
  } catch {
    return { videoId: undefined, errorMessage: "creative_node_fetch_exception" };
  }
}

type VideoUrlResolution = {
  url: string;
  error_message: string | null;
  meta_returned_source: boolean;
  meta_returned_permalink_url: boolean;
  meta_returned_embed_html: boolean;
  used_strategy: "source" | "permalink_plugin" | "embed_src" | "none";
};

/**
 * Meta often omits `source` for ad-account videos (policy / token), but may still return
 * `permalink_url` or `embed_html`. HTML5 <video> needs a direct file URL; otherwise we
 * store a Facebook embed plugin URL and render it in an iframe.
 */
async function fetchVideoPlayableUrlWithDebug(videoId: string, token: string): Promise<VideoUrlResolution> {
  const base = (): Omit<VideoUrlResolution, "url" | "used_strategy"> => ({
    error_message: null,
    meta_returned_source: false,
    meta_returned_permalink_url: false,
    meta_returned_embed_html: false,
  });

  try {
    const fields = encodeURIComponent("source,permalink_url,embed_html");
    const vRes = await fetch(
      `${GRAPH_BASE}/${encodeURIComponent(videoId)}?fields=${fields}&access_token=${encodeURIComponent(token)}`
    );
    const vData = (await vRes.json()) as {
      source?: string;
      permalink_url?: string;
      embed_html?: string;
      error?: { message: string };
    };

    if (vData.error) {
      return {
        url: "",
        used_strategy: "none",
        ...base(),
        error_message: vData.error.message,
      };
    }

    const srcRaw = vData.source?.trim();
    const hasSourceField = Boolean(srcRaw);
    const permalinkRaw = vData.permalink_url?.trim();
    const hasPermalinkField = Boolean(permalinkRaw);
    const html = vData.embed_html;
    const hasEmbedField = typeof html === "string" && html.length > 0;

    if (srcRaw && /^https?:\/\//i.test(srcRaw)) {
      return {
        url: srcRaw,
        used_strategy: "source",
        ...base(),
        meta_returned_source: true,
        meta_returned_permalink_url: hasPermalinkField,
        meta_returned_embed_html: hasEmbedField,
      };
    }

    if (permalinkRaw) {
      return {
        url: `https://www.facebook.com/plugins/video.php?href=${encodeURIComponent(permalinkRaw)}&show_text=false&width=560`,
        used_strategy: "permalink_plugin",
        ...base(),
        meta_returned_source: hasSourceField,
        meta_returned_permalink_url: true,
        meta_returned_embed_html: hasEmbedField,
      };
    }

    if (html && typeof html === "string") {
      const m = html.match(/\ssrc="([^"]+)"/);
      if (m?.[1]) {
        let u = m[1].replace(/&amp;/g, "&");
        if (u.startsWith("//")) u = `https:${u}`;
        if (/^https?:\/\//i.test(u)) {
          return {
            url: u,
            used_strategy: "embed_src",
            ...base(),
            meta_returned_source: hasSourceField,
            meta_returned_permalink_url: hasPermalinkField,
            meta_returned_embed_html: true,
          };
        }
      }
    }

    return {
      url: "",
      used_strategy: "none",
      ...base(),
      meta_returned_source: hasSourceField,
      meta_returned_permalink_url: hasPermalinkField,
      meta_returned_embed_html: hasEmbedField,
    };
  } catch {
    return {
      url: "",
      used_strategy: "none",
      ...base(),
      error_message: "video_node_fetch_exception",
    };
  }
}

function buildStoryShape(creative: RawCreative | undefined): CreativeSyncDebugEntry["story_shape"] {
  const oss = creative?.object_story_spec;
  const vd = oss?.video_data;
  const videos = creative?.asset_feed_spec?.videos;
  return {
    has_object_story_spec: !!oss,
    story_top_level_keys: oss ? Object.keys(oss) : [],
    video_data_present: !!vd,
    video_data_keys: vd ? Object.keys(vd) : [],
    video_data_video_id_raw: vd?.video_id != null ? String(vd.video_id) : null,
    asset_feed_videos_count: Array.isArray(videos) ? videos.length : 0,
    asset_feed_video_ids: Array.isArray(videos)
      ? videos.map((v) => (v?.video_id != null ? String(v.video_id) : null)).filter((x): x is string => x != null)
      : [],
  };
}

/**
 * Resolve one ad's creative into a DB row plus diagnostics (for sync + debug API).
 */
export async function resolveAdCreativeRow(
  ad: RawAd,
  token: string,
  userId: string
): Promise<{ row: CreativeUpsertRow; debug: CreativeSyncDebugEntry }> {
  const creative = ad.creative;
  const imageUrl =
    creative?.image_url ?? creative?.object_story_spec?.video_data?.image_url ?? "";
  const linkUrl = creative?.object_story_spec?.link_data?.link ?? "";
  const hasVideoDataBlock = !!creative?.object_story_spec?.video_data;
  const hasAssetFeedVideos =
    Array.isArray(creative?.asset_feed_spec?.videos) &&
    (creative?.asset_feed_spec?.videos?.length ?? 0) > 0;

  const videoIdInListing = extractVideoId(creative);
  let videoIdAfterRefetch: string | undefined;
  let creativeRefetchError: string | null = null;
  const needsRefetch =
    !videoIdInListing && !!creative?.id && (hasVideoDataBlock || hasAssetFeedVideos);

  if (needsRefetch) {
    const ref = await fetchVideoIdFromCreativeNode(creative.id, token);
    videoIdAfterRefetch = ref.videoId;
    creativeRefetchError = ref.errorMessage;
  }

  const finalVideoId = videoIdInListing ?? videoIdAfterRefetch;

  let videoResolution: VideoUrlResolution | null = null;
  let videoUrl = "";
  if (finalVideoId) {
    videoResolution = await fetchVideoPlayableUrlWithDebug(finalVideoId, token);
    videoUrl = videoResolution.url;
  }

  const hasVideo = !!finalVideoId || hasVideoDataBlock || hasAssetFeedVideos;
  const childAttachments = creative?.object_story_spec?.link_data?.child_attachments;
  const isCarousel = Array.isArray(childAttachments) && childAttachments.length > 1;

  const carouselUrls: string[] = isCarousel
    ? childAttachments.map((c) => c.picture ?? "").filter(Boolean)
    : [];

  const creativeType = isCarousel ? "carousel" : hasVideo ? "video" : imageUrl ? "image" : "unknown";

  const storyShape = buildStoryShape(creative);

  const debug: CreativeSyncDebugEntry = {
    ad_id: ad.id,
    ad_name: ad.name ?? "",
    creative_id: creative?.id ?? "",
    creative_type: creativeType,
    video_url_empty: !videoUrl,
    video_id_in_listing: videoIdInListing ?? null,
    creative_node_refetch_attempted: needsRefetch,
    video_id_after_refetch: videoIdAfterRefetch ?? null,
    final_video_id: finalVideoId ?? null,
    video_resolution: videoResolution
      ? {
          error_message: videoResolution.error_message ?? creativeRefetchError,
          meta_returned_source: videoResolution.meta_returned_source,
          meta_returned_permalink_url: videoResolution.meta_returned_permalink_url,
          meta_returned_embed_html: videoResolution.meta_returned_embed_html,
          used_strategy: videoResolution.used_strategy,
        }
      : creativeRefetchError
        ? {
            error_message: creativeRefetchError,
            meta_returned_source: false,
            meta_returned_permalink_url: false,
            meta_returned_embed_html: false,
            used_strategy: "none" as const,
          }
        : null,
    story_shape: storyShape,
  };

  const row: CreativeUpsertRow = {
    user_id: userId,
    ad_id: ad.id,
    ad_name: ad.name ?? "",
    campaign_name: ad.campaign?.name ?? "",
    adset_name: ad.adset?.name ?? "",
    creative_id: creative?.id ?? "",
    thumbnail_url: creative?.thumbnail_url ?? "",
    image_url: imageUrl,
    body: creative?.body ?? "",
    link_url: linkUrl,
    creative_type: creativeType,
    video_url: videoUrl,
    carousel_urls: carouselUrls,
    updated_at: new Date().toISOString(),
  };

  return { row, debug };
}

/**
 * Fetch ads + creative diagnostics without writing to the database (for debugging).
 */
export async function fetchCreativesDebugReport(
  token: string,
  adAccountId: string,
  limit: number
): Promise<{ ad_account_id: string; fetched_at: string; limit: number; ads: CreativeSyncDebugEntry[] }> {
  const adFields = `id,name,campaign{name},adset{name},creative{${CREATIVE_FIELDS}}`;
  const url =
    `${GRAPH_BASE}/${encodeURIComponent(adAccountId)}/ads` +
    `?fields=${encodeURIComponent(adFields)}` +
    `&limit=${Math.min(Math.max(limit, 1), 100)}` +
    `&access_token=${encodeURIComponent(token)}`;

  const res = await fetch(url);
  const data = (await res.json()) as AdsResponse;

  if (data.error) {
    throw new Error(data.error.message);
  }

  const ads = data.data ?? [];
  const entries: CreativeSyncDebugEntry[] = [];
  for (const ad of ads) {
    const { debug } = await resolveAdCreativeRow(ad, token, "debug-user-id");
    entries.push(debug);
  }

  return {
    ad_account_id: adAccountId,
    fetched_at: new Date().toISOString(),
    limit: Math.min(Math.max(limit, 1), 100),
    ads: entries,
  };
}

/**
 * True when PostgREST/schema does not expose `video_url` / `carousel_urls` yet (migration not applied
 * or stale schema cache). We must NOT treat every error mentioning "video_url" as this case — e.g.
 * NOT NULL / constraint messages also contain "video_url" and retrying without the column would
 * silently drop playable URLs on update.
 */
export function isMissingCreativeMediaColumnsError(err: { message?: string; code?: string }): boolean {
  const msg = (err.message ?? "").toLowerCase();
  const code = err.code ?? "";
  if (code === "PGRST204") return true;
  if (!msg) return false;
  const namesMediaColumn = msg.includes("video_url") || msg.includes("carousel_urls");
  if (!namesMediaColumn) return false;
  return (
    msg.includes("schema cache") ||
    msg.includes("could not find the") ||
    msg.includes("undefined column") ||
    (msg.includes("column") && msg.includes("does not exist"))
  );
}

function normalizeCreativeUpsertRows(rows: CreativeUpsertRow[]): CreativeUpsertRow[] {
  return rows.map((r) => ({
    ...r,
    video_url: r.video_url ?? "",
    carousel_urls: Array.isArray(r.carousel_urls) ? r.carousel_urls : [],
  }));
}

/**
 * Fetch all ads + creative data for an ad account and upsert into ad_creatives.
 */
export async function pullCreatives(
  supabase: SupabaseClient,
  userId: string,
  adAccountId: string,
  token: string
): Promise<number> {
  const adFields = `id,name,campaign{name},adset{name},creative{${CREATIVE_FIELDS}}`;

  let url =
    `${GRAPH_BASE}/${encodeURIComponent(adAccountId)}/ads` +
    `?fields=${encodeURIComponent(adFields)}` +
    `&limit=100` +
    `&access_token=${encodeURIComponent(token)}`;

  let total = 0;

  while (url) {
    const res = await fetch(url);
    const data = (await res.json()) as AdsResponse;

    if (data.error) {
      throw new Error(data.error.message);
    }

    const ads = data.data ?? [];
    if (ads.length > 0) {
      const resolved = await Promise.all(ads.map((ad) => resolveAdCreativeRow(ad, token, userId)));
      const rows = normalizeCreativeUpsertRows(resolved.map((r) => r.row));

      for (const { row, debug } of resolved) {
        if (row.creative_type === "video" && !row.video_url) {
          const reason =
            debug.final_video_id == null
              ? "NO_VIDEO_ID"
              : debug.video_resolution?.error_message
                ? "VIDEO_NODE_ERROR"
                : "NO_PLAYABLE_FIELDS";
          serverLogger.warn("Creative sync: video ad without playable URL", {
            ad_id: row.ad_id,
            creative_id: row.creative_id,
            reason,
            final_video_id_prefix: debug.final_video_id?.slice(0, 12) ?? "",
            story_video_data_keys: debug.story_shape.video_data_keys.join(","),
            used_strategy: debug.video_resolution?.used_strategy ?? "",
          });
        }
      }

      const { error: upsertError } = await supabase.from("ad_creatives").upsert(rows, {
        onConflict: "user_id,ad_id",
      });

      if (upsertError) {
        serverLogger.error("ad_creatives upsert failed", {
          component: "meta/creatives",
          message: upsertError.message,
          code: upsertError.code ?? "",
        });

        if (isMissingCreativeMediaColumnsError(upsertError)) {
          serverLogger.warn("Retrying ad_creatives upsert without video_url/carousel_urls (schema missing columns)", {
            component: "meta/creatives",
          });
          const fallbackRows = rows.map(({ video_url, carousel_urls, ...rest }) => rest);
          const { error: retryError } = await supabase
            .from("ad_creatives")
            .upsert(fallbackRows, { onConflict: "user_id,ad_id" });
          if (retryError) {
            throw new Error(retryError.message);
          }
        } else {
          throw new Error(upsertError.message);
        }
      }

      total += rows.length;
    }

    url = data.paging?.next ?? "";
  }

  return total;
}
