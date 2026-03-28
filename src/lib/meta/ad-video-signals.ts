const META_VERSION = "v21.0";
const GRAPH = `https://graph.facebook.com/${META_VERSION}`;

type InsightRow = Record<string, string | number | undefined>;
type MetaResponse = {
  data?: InsightRow[];
  paging?: { next?: string };
  error?: { message: string };
};

type ActionEntry = { action_type: string; value: string };

function extractVideoMetric(actions: unknown): number {
  if (!Array.isArray(actions)) return 0;
  const entry = (actions as ActionEntry[]).find(
    (a) => a.action_type === "video_view" || a.action_type === "video_play"
  );
  return entry ? Number(entry.value) : Number((actions as ActionEntry[])[0]?.value ?? 0);
}

function extractByActionType(actions: unknown, actionType: string): number {
  if (!Array.isArray(actions)) return 0;
  const entry = (actions as ActionEntry[]).find((a) => a.action_type === actionType);
  return entry ? Number(entry.value) : 0;
}

function extractAvgTimeSeconds(actions: unknown): number {
  if (!Array.isArray(actions) || (actions as ActionEntry[]).length === 0) return 0;
  const first = (actions as ActionEntry[])[0];
  return Number(first?.value ?? 0);
}

async function fetchInsights(params: {
  adId: string;
  token: string;
  fields: string;
  from: string;
  to: string;
}): Promise<InsightRow[]> {
  const { adId, token, fields, from, to } = params;
  const timeRange = `&time_range=${encodeURIComponent(JSON.stringify({ since: from, until: to }))}`;
  let url =
    `${GRAPH}/${encodeURIComponent(adId)}/insights` +
    `?fields=${encodeURIComponent(fields)}` +
    timeRange +
    `&limit=500` +
    `&access_token=${encodeURIComponent(token)}`;

  const all: InsightRow[] = [];
  while (url) {
    const res = await fetch(url);
    const data = (await res.json()) as MetaResponse;
    if (data.error) {
      throw new Error(data.error.message);
    }
    if (data.data) all.push(...data.data);
    url = data.paging?.next ?? "";
  }
  return all;
}

export type AdVideoSignals = {
  plays: number;
  p25: number;
  p50: number;
  p75: number;
  p100: number;
  avg_time_seconds: number;
  impressions: number;
  hook_rate: number | null;
  hold_rate: number | null;
};

export async function fetchAdVideoSignals(params: {
  adId: string;
  token: string;
  from: string;
  to: string;
}): Promise<AdVideoSignals> {
  const { adId, token, from, to } = params;
  const rows = await fetchInsights({
    adId,
    token,
    fields:
      "impressions,actions,video_p25_watched_actions,video_p50_watched_actions,video_p75_watched_actions,video_p100_watched_actions,video_play_actions,video_thruplay_watched_actions,video_avg_time_watched_actions",
    from,
    to,
  });

  // Aggregate across all rows (API may return multiple rows e.g. by date)
  let totalPlays = 0;
  let totalP25 = 0;
  let totalP50 = 0;
  let totalP75 = 0;
  let totalP100 = 0;
  let totalImpressions = 0;
  let totalVideoViews3s = 0;
  let totalThruPlays = 0;
  let avgTimeSum = 0;
  let avgTimeCount = 0;
  let totalVideoViewsFromActions = 0;

  for (const row of rows ?? []) {
    totalVideoViewsFromActions += extractByActionType(row.actions, "video_view");
  }

  for (const row of rows ?? []) {
    totalPlays += extractVideoMetric(row.video_play_actions);
    totalP25 += extractVideoMetric(row.video_p25_watched_actions);
    totalP50 += extractVideoMetric(row.video_p50_watched_actions);
    totalP75 += extractVideoMetric(row.video_p75_watched_actions);
    totalP100 += extractVideoMetric(row.video_p100_watched_actions);
    totalImpressions += Number(row.impressions ?? 0);

    const v3 =
      extractByActionType(row.actions, "video_view") ||
      extractByActionType(row.video_play_actions, "video_view");
    totalVideoViews3s += v3;

    totalThruPlays += extractVideoMetric(row.video_thruplay_watched_actions);
    const at = extractAvgTimeSeconds(row.video_avg_time_watched_actions);
    if (at > 0) {
      avgTimeSum += at;
      avgTimeCount++;
    }
  }

  const vRow = rows?.[0] ?? {};
  let plays =
    totalPlays ||
    extractVideoMetric(vRow.video_play_actions) ||
    totalVideoViewsFromActions ||
    extractByActionType(vRow.actions, "video_view");
  if (plays === 0) {
    plays = Math.max(totalP25, totalP50, totalP75, totalP100);
  }

  const p100 = totalP100 || extractVideoMetric(vRow.video_p100_watched_actions);
  const impressions = totalImpressions || Number(vRow.impressions ?? 0);
  const thruPlays = totalThruPlays || extractVideoMetric(vRow.video_thruplay_watched_actions);
  let videoViews3s =
    totalVideoViews3s ||
    extractByActionType(vRow.actions, "video_view") ||
    extractByActionType(vRow.video_play_actions, "video_view");
  if (videoViews3s === 0) videoViews3s = totalVideoViewsFromActions;

  const avgTimeSeconds =
    avgTimeCount > 0 ? Math.round(avgTimeSum / avgTimeCount) : extractAvgTimeSeconds(vRow.video_avg_time_watched_actions);

  return {
    plays,
    p25: totalP25 || extractVideoMetric(vRow.video_p25_watched_actions),
    p50: totalP50 || extractVideoMetric(vRow.video_p50_watched_actions),
    p75: totalP75 || extractVideoMetric(vRow.video_p75_watched_actions),
    p100,
    avg_time_seconds: avgTimeSeconds,
    impressions,
    hook_rate:
      impressions > 0 && videoViews3s > 0 ? Number(((videoViews3s / impressions) * 100).toFixed(1)) : null,
    hold_rate:
      videoViews3s > 0 && thruPlays > 0 ? Number(((thruPlays / videoViews3s) * 100).toFixed(1)) : null,
  };
}

