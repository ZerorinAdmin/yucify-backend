import { SupabaseClient } from "@supabase/supabase-js";

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

/** Nested fields so Graph returns video_id (shallow object_story_spec often omits it). */
const CREATIVE_FIELDS =
  "id,thumbnail_url,image_url,body," +
  "object_story_spec{video_data{video_id,image_url},link_data{link,child_attachments{picture,link,name}}}," +
  "asset_feed_spec{videos{video_id}}";

function extractVideoId(creative: RawCreative | undefined): string | undefined {
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
): Promise<string | undefined> {
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
      console.warn("[meta/creatives] creative node fetch:", j.error.message);
      return undefined;
    }
    const nestedCreative: RawCreative = {
      id: creativeId,
      object_story_spec: j.object_story_spec,
      asset_feed_spec: j.asset_feed_spec,
    };
    return extractVideoId(nestedCreative);
  } catch {
    return undefined;
  }
}

/**
 * Meta often omits `source` for ad-account videos (policy / token), but may still return
 * `permalink_url` or `embed_html`. HTML5 <video> needs a direct file URL; otherwise we
 * store a Facebook embed plugin URL and render it in an iframe.
 */
async function fetchVideoPlayableUrl(videoId: string, token: string): Promise<string> {
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
      console.warn("[meta/creatives] Video node:", videoId.slice(0, 16), vData.error.message);
      return "";
    }
    const src = vData.source?.trim();
    if (src && /^https?:\/\//i.test(src)) {
      return src;
    }
    const permalink = vData.permalink_url?.trim();
    if (permalink) {
      return `https://www.facebook.com/plugins/video.php?href=${encodeURIComponent(permalink)}&show_text=false&width=560`;
    }
    const html = vData.embed_html;
    if (html && typeof html === "string") {
      const m = html.match(/\ssrc="([^"]+)"/);
      if (m?.[1]) {
        let u = m[1].replace(/&amp;/g, "&");
        if (u.startsWith("//")) u = `https:${u}`;
        if (/^https?:\/\//i.test(u)) return u;
      }
    }
    console.warn("[meta/creatives] Video has no source, permalink, or embed src:", videoId.slice(0, 16));
    return "";
  } catch {
    return "";
  }
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
      console.error("[meta/creatives] Ads API error:", data.error);
      throw new Error(data.error.message);
    }

    const ads = data.data ?? [];
    if (ads.length > 0) {
      const rows = await Promise.all(ads.map(async (ad) => {
        const creative = ad.creative;
        const imageUrl =
          creative?.image_url ??
          creative?.object_story_spec?.video_data?.image_url ??
          "";
        const linkUrl =
          creative?.object_story_spec?.link_data?.link ?? "";
        const hasVideoDataBlock = !!creative?.object_story_spec?.video_data;
        const hasAssetFeedVideos =
          Array.isArray(creative?.asset_feed_spec?.videos) &&
          (creative?.asset_feed_spec?.videos?.length ?? 0) > 0;

        let videoId = extractVideoId(creative);
        if (!videoId && creative?.id && (hasVideoDataBlock || hasAssetFeedVideos)) {
          videoId = await fetchVideoIdFromCreativeNode(creative.id, token);
        }

        const hasVideo = !!videoId || hasVideoDataBlock || hasAssetFeedVideos;
        const childAttachments = creative?.object_story_spec?.link_data?.child_attachments;
        const isCarousel = Array.isArray(childAttachments) && childAttachments.length > 1;

        let videoUrl = "";
        if (videoId) {
          videoUrl = await fetchVideoPlayableUrl(videoId, token);
        }

        const carouselUrls: string[] = isCarousel
          ? childAttachments.map((c) => c.picture ?? "").filter(Boolean)
          : [];

        const creativeType = isCarousel ? "carousel" : hasVideo ? "video" : imageUrl ? "image" : "unknown";

        return {
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
      }));

      const { error: upsertError } = await supabase
        .from("ad_creatives")
        .upsert(rows, { onConflict: "user_id,ad_id" });

      if (upsertError) {
        if (
          upsertError.message?.includes("video_url") ||
          upsertError.message?.includes("carousel_urls")
        ) {
          console.warn("[meta/creatives] New columns not in DB yet, retrying without video_url/carousel_urls");
          const fallbackRows = rows.map(({ video_url, carousel_urls, ...rest }) => rest);
          const { error: retryError } = await supabase
            .from("ad_creatives")
            .upsert(fallbackRows, { onConflict: "user_id,ad_id" });
          if (retryError) {
            console.error("[meta/creatives] Retry upsert error:", retryError);
            throw new Error(retryError.message);
          }
        } else {
          console.error("[meta/creatives] Upsert error:", upsertError);
          throw new Error(upsertError.message);
        }
      }

      total += rows.length;
    }

    url = data.paging?.next ?? "";
  }

  console.log(`[meta/creatives] Upserted ${total} creatives for ${adAccountId}`);
  return total;
}
