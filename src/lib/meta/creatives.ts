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

type RawAd = {
  id: string;
  name: string;
  campaign?: { name: string };
  adset?: { name: string };
  creative?: {
    id: string;
    thumbnail_url?: string;
    image_url?: string;
    body?: string;
    object_story_spec?: {
      link_data?: { link?: string; image_hash?: string; child_attachments?: ChildAttachment[] };
      video_data?: { image_url?: string; video_id?: string };
    };
  };
};

type AdsResponse = {
  data?: RawAd[];
  paging?: { next?: string };
  error?: { message: string };
};

/**
 * Fetch all ads + creative data for an ad account and upsert into ad_creatives.
 */
export async function pullCreatives(
  supabase: SupabaseClient,
  userId: string,
  adAccountId: string,
  token: string
): Promise<number> {
  const adFields = "id,name,campaign{name},adset{name},creative{id,thumbnail_url,image_url,body,object_story_spec}"

  async function fetchVideoSource(videoId: string): Promise<string> {
    try {
      const vRes = await fetch(
        `${GRAPH_BASE}/${videoId}?fields=source&access_token=${encodeURIComponent(token)}`
      );
      const vData = (await vRes.json()) as { source?: string; error?: { message: string } };
      return vData.source ?? "";
    } catch {
      return "";
    }
  }

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
        const videoId = creative?.object_story_spec?.video_data?.video_id;
        const hasVideo = !!videoId || !!creative?.object_story_spec?.video_data;
        const childAttachments = creative?.object_story_spec?.link_data?.child_attachments;
        const isCarousel = Array.isArray(childAttachments) && childAttachments.length > 1;

        let videoUrl = "";
        if (videoId) {
          videoUrl = await fetchVideoSource(videoId);
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
