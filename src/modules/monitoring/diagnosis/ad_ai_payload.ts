import type { NormalizedAd } from "./types";

export type AdVideoSignals = {
  avg_time_seconds: number | null;
  hook_rate: number | null;
  hold_rate: number | null;
  impressions: number | null;
  p25: number | null;
  p50: number | null;
  p75: number | null;
  p100: number | null;
  plays: number | null;
  /**
   * Optional transcript/captions for the first 0–5s of the video.
   * This should be plain text (no timestamps) and kept short upstream to avoid token bloat.
   */
  transcript_0_5s?: string | null;
};

export type AdSpendTrendPoint = {
  date: string; // YYYY-MM-DD
  spend: number;
  impressions: number;
  clicks: number;
  ctr: number;
};

export type AdAIInput = {
  ad_id: string;
  ad_name: string;
  format: NormalizedAd["type"];
  rule_issues: string[];
  account: {
    ctr: number;
    cpc: number;
    cvr: number;
  };
  creative: {
    body: string;
    link_url: string;
    thumbnail_url: string | null;
    image_url: string | null;
    video_url: string | null;
    carousel_urls: string[];
    /**
     * Optional OCR result for on-creative text (image or keyframe text).
     * Keep this short upstream to avoid token bloat.
     */
    ocr_text?: string | null;
  };
  performance: {
    spend: number;
    impressions: number;
    reach: number;
    frequency: number | null;
    clicks: number;
    ctr: number;
    cpc: number;
    conversions: number;
    cvr: number | null; // conversions/clicks
  };
  video: AdVideoSignals | null;
  spend_trend: AdSpendTrendPoint[]; // last N points, newest last
};

export function buildAdAIInput(params: {
  ad: NormalizedAd;
  frequency: number | null;
  spendTrend: AdSpendTrendPoint[];
  video: AdVideoSignals | null;
  ruleIssues?: string[];
  account: { ctr: number; cpc: number; cvr: number };
  ocrText?: string | null;
}): AdAIInput {
  const { ad, frequency, spendTrend, video, ruleIssues, account, ocrText } = params;
  const cvr = ad.clicks > 0 ? ad.conversions / ad.clicks : null;

  return {
    ad_id: ad.id,
    ad_name: ad.name,
    format: ad.type,
    rule_issues: ruleIssues ?? [],
    account,
    creative: {
      body: ad.copy ?? "",
      link_url: ad.link_url ?? "",
      thumbnail_url: ad.thumbnail_url,
      image_url: ad.image_url,
      video_url: ad.video_url,
      carousel_urls: ad.carousel_urls ?? [],
      ...(ocrText ? { ocr_text: ocrText } : {}),
    },
    performance: {
      spend: ad.spend,
      impressions: ad.impressions,
      reach: ad.reach,
      frequency,
      clicks: ad.clicks,
      ctr: ad.ctr,
      cpc: ad.cpc,
      conversions: ad.conversions,
      cvr,
    },
    video,
    spend_trend: spendTrend,
  };
}
