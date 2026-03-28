import type { SupabaseClient } from "@supabase/supabase-js";
import type { NormalizedAd } from "./types";
import { fetchDailyMetricsForAdsRange } from "./repository";
import type { AdAIInput, AdSpendTrendPoint, AdVideoSignals } from "./ad_ai_payload";
import { buildAdAIInput } from "./ad_ai_payload";

function computeAvgFrequency(rows: { frequency: number }[]): number | null {
  if (rows.length === 0) return null;
  const sum = rows.reduce((s, r) => s + Number(r.frequency ?? 0), 0);
  return sum / rows.length;
}

function toTrendPoints(rows: { date: string; spend: number; impressions: number; clicks: number; ctr: number }[]): AdSpendTrendPoint[] {
  return rows
    .slice()
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((r) => ({
      date: r.date,
      spend: Number(r.spend),
      impressions: Number(r.impressions),
      clicks: Number(r.clicks),
      ctr: Number(r.ctr),
    }));
}

/**
 * Builds the compact per-ad "fact pack" you can send to the ad-level AI prompt.
 * This intentionally contains creative components (body + link URL),
 * daily spend/CTR trend, and (optionally) video signals.
 */
export async function prepareAdAIInputs(params: {
  supabase: SupabaseClient;
  userId: string;
  adAccountId: string;
  from: string;
  to: string;
  ads: NormalizedAd[];
  account: { ctr: number; cpc: number; cvr: number };
  issuesByAdId?: Record<string, string[]>;
  /** Optional video signals keyed by ad_id (populated via Meta insights on-demand). */
  videoByAdId?: Record<string, AdVideoSignals | null>;
  /** Optional first 0–5s transcript/captions keyed by ad_id. */
  transcript0to5sByAdId?: Record<string, string | null | undefined>;
  /** Optional OCR text of on-creative copy keyed by ad_id. */
  ocrTextByAdId?: Record<string, string | null | undefined>;
  /** Limit daily points per ad to keep tokens low. */
  trendDays?: number;
}): Promise<AdAIInput[]> {
  const { supabase, userId, adAccountId, from, to, ads, account } = params;
  const trendDays = Math.max(3, Math.min(params.trendDays ?? 7, 14));
  const videoByAdId = params.videoByAdId ?? {};
  const issuesByAdId = params.issuesByAdId ?? {};
  const transcript0to5sByAdId = params.transcript0to5sByAdId ?? {};
  const ocrTextByAdId = params.ocrTextByAdId ?? {};
  const adIds = ads.map((a) => a.id);

  const daily = await fetchDailyMetricsForAdsRange(supabase, userId, adAccountId, adIds, from, to);
  const byAd = new Map<string, typeof daily>();
  for (const row of daily) {
    const list = byAd.get(row.ad_id) ?? [];
    list.push(row);
    byAd.set(row.ad_id, list);
  }

  return ads.map((ad) => {
    const rows = byAd.get(ad.id) ?? [];
    const sorted = rows.slice().sort((a, b) => a.date.localeCompare(b.date));
    const tail = sorted.slice(Math.max(0, sorted.length - trendDays));
    const spendTrend: AdSpendTrendPoint[] = toTrendPoints(tail);
    const frequency = computeAvgFrequency(rows);
    const baseVideo = videoByAdId[ad.id] ?? null;
    const transcriptTrimmed = (transcript0to5sByAdId[ad.id] ?? "").trim();
    const transcript0to5s = transcriptTrimmed.length > 0 ? transcriptTrimmed : null;
    const ocrText = ocrTextByAdId[ad.id] ?? null;
    /** Always attach transcript on top of Meta signals when we have a base pack (never gate metrics on transcript). */
    const video = baseVideo ? { ...baseVideo, transcript_0_5s: transcript0to5s } : null;

    return buildAdAIInput({
      ad,
      frequency,
      spendTrend,
      video,
      ruleIssues: issuesByAdId[ad.id] ?? [],
      account,
      ocrText,
    });
  });
}
