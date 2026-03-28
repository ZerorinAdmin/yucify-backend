import type { CreativeFormat, NormalizedAd } from "./types";

export type MetricDayRow = {
  ad_id: string;
  ad_name: string;
  date: string;
  spend: number;
  impressions: number;
  reach: number;
  clicks: number;
  ctr: number;
  cpc: number;
  frequency: number;
};

function weightedAvgBy(
  rows: MetricDayRow[],
  valueKey: "ctr" | "cpc",
  weightKey: "impressions" | "clicks"
): number {
  const denom = rows.reduce((s, r) => s + Number(r[weightKey] ?? 0), 0);
  if (denom <= 0) {
    if (rows.length === 0) return 0;
    return rows.reduce((s, r) => s + Number(r[valueKey] ?? 0), 0) / rows.length;
  }
  return rows.reduce((s, r) => s + Number(r[valueKey] ?? 0) * Number(r[weightKey] ?? 0), 0) / denom;
}

export type CreativeRow = {
  ad_id: string;
  creative_type: string;
  body: string | null;
  headline: string | null;
  description: string | null;
  cta_type: string | null;
  link_url: string | null;
  thumbnail_url: string | null;
  image_url: string | null;
  video_url: string | null;
  carousel_urls: string[];
};

function previewUrlFromCreative(cr: CreativeRow | undefined): string {
  if (!cr) return "";
  const img = cr.image_url?.trim();
  if (img) return img;
  const thumb = cr.thumbnail_url?.trim();
  if (thumb) return thumb;
  const first = cr.carousel_urls.find((u) => typeof u === "string" && u.trim().length > 0);
  return first?.trim() ?? "";
}

const CONVERSION_ACTION_TYPES = new Set([
  "omni_purchase",
  "purchase",
  "mobile_app_install",
  "app_install",
  "lead",
  "complete_registration",
]);

function mapCreativeType(raw: string): CreativeFormat {
  const t = raw.toLowerCase();
  if (t === "video") return "video";
  if (t === "image") return "image";
  if (t === "carousel") return "carousel";
  return "unknown";
}

/**
 * Aggregate daily metrics per ad; join creatives; attach conversion counts from `ad_actions`.
 */
export function buildNormalizedAds(
  metrics: MetricDayRow[],
  creatives: CreativeRow[],
  actionRows: { ad_id: string; action_type: string; action_count: number }[]
): NormalizedAd[] {
  const creativeMap = new Map(creatives.map((c) => [c.ad_id, c]));
  const conversionsByAd = new Map<string, number>();

  for (const row of actionRows) {
    if (!CONVERSION_ACTION_TYPES.has(row.action_type)) continue;
    conversionsByAd.set(
      row.ad_id,
      (conversionsByAd.get(row.ad_id) ?? 0) + Number(row.action_count)
    );
  }

  const byAd = new Map<
    string,
    {
      name: string;
      spend: number;
      impressions: number;
      reach: number;
      clicks: number;
    }
  >();

  for (const row of metrics) {
    const cur = byAd.get(row.ad_id);
    if (!cur) {
      byAd.set(row.ad_id, {
        name: row.ad_name,
        spend: Number(row.spend),
        impressions: Number(row.impressions),
        reach: Number(row.reach),
        clicks: Number(row.clicks),
      });
    } else {
      cur.spend += Number(row.spend);
      cur.impressions += Number(row.impressions);
      cur.reach += Number(row.reach);
      cur.clicks += Number(row.clicks);
    }
  }

  const results: NormalizedAd[] = [];
  for (const [adId, agg] of byAd) {
    const cr = creativeMap.get(adId);
    const rows = metrics.filter((m) => m.ad_id === adId);
    const impressions = agg.impressions;
    const clicks = agg.clicks;
    // Keep diagnosis aligned to Meta-provided daily metrics, instead of recomputing from totals.
    const ctr = weightedAvgBy(rows, "ctr", "impressions");
    const cpc = weightedAvgBy(rows, "cpc", "clicks");

    results.push({
      id: adId,
      name: agg.name,
      spend: agg.spend,
      impressions,
      reach: agg.reach,
      clicks,
      ctr,
      cpc,
      conversions: conversionsByAd.get(adId) ?? 0,
      type: mapCreativeType(cr?.creative_type ?? "unknown"),
      copy: (cr?.body ?? "").slice(0, 500),
      headline: (cr?.headline ?? "").slice(0, 200),
      description: (cr?.description ?? "").slice(0, 200),
      cta_type: (cr?.cta_type ?? "").slice(0, 50),
      link_url: (cr?.link_url ?? "").slice(0, 500),
      previewUrl: previewUrlFromCreative(cr),
      thumbnail_url: cr?.thumbnail_url ?? null,
      image_url: cr?.image_url ?? null,
      video_url: cr?.video_url ?? null,
      carousel_urls: cr?.carousel_urls ?? [],
    });
  }

  return results;
}
