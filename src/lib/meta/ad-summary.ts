/**
 * Roll up daily ad_metrics + ad_creatives into AdSummary rows (dashboard, creatives, diagnosis).
 */

export type AdSummary = {
  ad_id: string;
  ad_name: string;
  campaign_name: string;
  adset_name: string;
  thumbnail_url: string;
  image_url: string;
  creative_type: string;
  body: string;
  video_url: string;
  carousel_urls: string[];
  total_spend: number;
  total_impressions: number;
  total_reach: number;
  total_clicks: number;
  avg_ctr: number;
  avg_cpc: number;
  avg_frequency: number;
  avg_roas: number;
  first_date: string;
  days_count: number;
};

type Creative = {
  ad_id: string;
  ad_name: string;
  campaign_name: string;
  adset_name: string;
  thumbnail_url: string;
  image_url: string;
  creative_type: string;
  body: string;
  video_url?: string;
  carousel_urls?: string[];
};

export type AdMetricsDailyRow = {
  ad_id: string;
  ad_name: string;
  campaign_name?: string;
  adset_name?: string;
  date: string;
  spend: number;
  impressions: number;
  reach?: number;
  clicks: number;
  ctr: number;
  cpc: number;
  frequency: number;
  roas: number;
};

export function aggregateAdSummaries(
  metrics: AdMetricsDailyRow[],
  creatives: Creative[]
): AdSummary[] {
  const creativeMap = new Map<string, Creative>();
  for (const c of creatives) creativeMap.set(c.ad_id, c);

  const groups = new Map<string, AdMetricsDailyRow[]>();
  for (const m of metrics) {
    const existing = groups.get(m.ad_id) ?? [];
    existing.push(m);
    groups.set(m.ad_id, existing);
  }

  const results: AdSummary[] = [];

  for (const [adId, rows] of groups) {
    const creative = creativeMap.get(adId);
    const totalSpend = rows.reduce((s, r) => s + Number(r.spend), 0);
    const totalImpressions = rows.reduce((s, r) => s + Number(r.impressions), 0);
    const totalReach = rows.reduce((s, r) => s + Number(r.reach ?? 0), 0);
    const totalClicks = rows.reduce((s, r) => s + Number(r.clicks), 0);
    const avgCtr = rows.reduce((s, r) => s + Number(r.ctr), 0) / rows.length;
    const avgCpc = rows.reduce((s, r) => s + Number(r.cpc), 0) / rows.length;
    const avgFreq = rows.reduce((s, r) => s + Number(r.frequency), 0) / rows.length;
    const avgRoas = rows.reduce((s, r) => s + Number(r.roas), 0) / rows.length;
    const dates = rows.map((r) => r.date).sort();

    results.push({
      ad_id: adId,
      ad_name: creative?.ad_name || rows[0]?.ad_name || adId,
      campaign_name: creative?.campaign_name || rows[0]?.campaign_name || "",
      adset_name: creative?.adset_name || rows[0]?.adset_name || "",
      thumbnail_url: creative?.thumbnail_url || "",
      image_url: creative?.image_url || "",
      creative_type: creative?.creative_type || "unknown",
      body: creative?.body || "",
      video_url: creative?.video_url || "",
      carousel_urls: creative?.carousel_urls || [],
      total_spend: totalSpend,
      total_impressions: totalImpressions,
      total_reach: totalReach,
      total_clicks: totalClicks,
      avg_ctr: avgCtr,
      avg_cpc: avgCpc,
      avg_frequency: avgFreq,
      avg_roas: avgRoas,
      first_date: dates[0] ?? "",
      days_count: rows.length,
    });
  }

  return results.sort((a, b) => b.total_spend - a.total_spend);
}
