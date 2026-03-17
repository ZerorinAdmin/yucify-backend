/**
 * Weekly summary: deterministic comparison of this week vs previous week.
 * No AI — pure rule-based stats.
 */

export type WeekMetrics = {
  from: string;
  to: string;
  spend: number;
  impressions: number;
  reach: number;
  clicks: number;
  ctr: number;
  cpc: number;
  frequency: number;
  roas: number;
  adCount: number;
};

export type MetricChange = {
  metric: string;
  changePct: number;
  direction: "up" | "down" | "flat";
  thisWeek: number;
  previousWeek: number;
};

export type AdPerformance = {
  ad_id: string;
  ad_name: string;
  spend: number;
  roas: number;
  impressions: number;
  clicks: number;
};

export type WeeklySummaryResult = {
  thisWeek: WeekMetrics;
  previousWeek: WeekMetrics;
  biggestChange: MetricChange;
  metricChanges: MetricChange[];
  topPerformingAd: AdPerformance | null;
  worstPerformingAd: AdPerformance | null;
};

type MetricRow = {
  ad_id: string;
  ad_name: string;
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

/** Get date range for "this week" (last 7 days) and "previous week" (7 days before that). */
export function getWeekRanges(): {
  thisWeek: { from: string; to: string };
  previousWeek: { from: string; to: string };
} {
  const today = new Date();
  const thisTo = new Date(today);
  thisTo.setDate(thisTo.getDate() - 1); // yesterday as end (more complete data)
  const thisFrom = new Date(thisTo);
  thisFrom.setDate(thisFrom.getDate() - 6);

  const prevTo = new Date(thisFrom);
  prevTo.setDate(prevTo.getDate() - 1);
  const prevFrom = new Date(prevTo);
  prevFrom.setDate(prevFrom.getDate() - 6);

  const fmt = (d: Date) => d.toISOString().split("T")[0];
  return {
    thisWeek: { from: fmt(thisFrom), to: fmt(thisTo) },
    previousWeek: { from: fmt(prevFrom), to: fmt(prevTo) },
  };
}

function aggregateMetrics(rows: MetricRow[]): WeekMetrics {
  const spend = rows.reduce((s, r) => s + Number(r.spend), 0);
  const impressions = rows.reduce((s, r) => s + Number(r.impressions), 0);
  const reach = rows.reduce((s, r) => s + Number(r.reach ?? 0), 0);
  const clicks = rows.reduce((s, r) => s + Number(r.clicks), 0);
  const adIds = new Set(rows.map((r) => r.ad_id));

  const ctr = impressions > 0 ? (clicks / impressions) * 100 : 0;
  const cpc = clicks > 0 ? spend / clicks : 0;
  const frequency =
    rows.length > 0
      ? rows.reduce((s, r) => s + Number(r.frequency), 0) / rows.length
      : 0;
  const roas =
    rows.length > 0
      ? rows.reduce((s, r) => s + Number(r.roas), 0) / rows.length
      : 0;

  return {
    from: rows.length > 0 ? rows[0].date : "",
    to: rows.length > 0 ? rows[rows.length - 1].date : "",
    spend,
    impressions,
    reach,
    clicks,
    ctr,
    cpc,
    frequency,
    roas,
    adCount: adIds.size,
  };
}

function computeChange(
  metric: string,
  thisVal: number,
  prevVal: number
): MetricChange {
  let changePct = 0;
  let direction: "up" | "down" | "flat" = "flat";

  if (prevVal !== 0) {
    changePct = ((thisVal - prevVal) / prevVal) * 100;
    direction = changePct > 0 ? "up" : changePct < 0 ? "down" : "flat";
  } else if (thisVal !== 0) {
    changePct = 100;
    direction = "up";
  }

  return {
    metric,
    changePct,
    direction,
    thisWeek: thisVal,
    previousWeek: prevVal,
  };
}

function aggregateByAd(rows: MetricRow[]): AdPerformance[] {
  const byAd = new Map<string, MetricRow[]>();
  for (const r of rows) {
    const list = byAd.get(r.ad_id) ?? [];
    list.push(r);
    byAd.set(r.ad_id, list);
  }

  const results: AdPerformance[] = [];
  for (const [adId, list] of byAd) {
    const spend = list.reduce((s, r) => s + Number(r.spend), 0);
    const impressions = list.reduce((s, r) => s + Number(r.impressions), 0);
    const clicks = list.reduce((s, r) => s + Number(r.clicks), 0);
    const roas =
      list.length > 0
        ? list.reduce((s, r) => s + Number(r.roas), 0) / list.length
        : 0;

    results.push({
      ad_id: adId,
      ad_name: list[0]?.ad_name ?? adId,
      spend,
      roas,
      impressions,
      clicks,
    });
  }

  return results;
}

/**
 * Compute weekly summary by comparing this week vs previous week.
 * Deterministic, no AI.
 */
export function computeWeeklySummary(
  thisWeekRows: MetricRow[],
  previousWeekRows: MetricRow[],
  ranges: { thisWeek: { from: string; to: string }; previousWeek: { from: string; to: string } }
): WeeklySummaryResult {
  const thisWeek = aggregateMetrics(thisWeekRows);
  const previousWeek = aggregateMetrics(previousWeekRows);
  thisWeek.from = ranges.thisWeek.from;
  thisWeek.to = ranges.thisWeek.to;
  previousWeek.from = ranges.previousWeek.from;
  previousWeek.to = ranges.previousWeek.to;

  const metricChanges: MetricChange[] = [
    computeChange("Spend", thisWeek.spend, previousWeek.spend),
    computeChange("Impressions", thisWeek.impressions, previousWeek.impressions),
    computeChange("Reach", thisWeek.reach, previousWeek.reach),
    computeChange("Clicks", thisWeek.clicks, previousWeek.clicks),
    computeChange("CTR", thisWeek.ctr, previousWeek.ctr),
    computeChange("CPC", thisWeek.cpc, previousWeek.cpc),
    computeChange("Frequency", thisWeek.frequency, previousWeek.frequency),
    computeChange("ROAS", thisWeek.roas, previousWeek.roas),
  ];

  const biggestChange = metricChanges.reduce((a, b) =>
    Math.abs(a.changePct) >= Math.abs(b.changePct) ? a : b
  );

  const thisWeekAds = aggregateByAd(thisWeekRows);
  const topPerformingAd =
    thisWeekAds.length > 0
      ? [...thisWeekAds].sort((a, b) => b.roas - a.roas)[0]
      : null;
  const worstPerformingAd =
    thisWeekAds.length > 0
      ? [...thisWeekAds].filter((a) => a.spend > 0).sort((a, b) => a.roas - b.roas)[0] ??
        thisWeekAds.sort((a, b) => a.roas - b.roas)[0]
      : null;

  return {
    thisWeek,
    previousWeek,
    biggestChange,
    metricChanges,
    topPerformingAd,
    worstPerformingAd,
  };
}
