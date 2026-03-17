import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getMetaToken } from "@/lib/meta/token";

const META_VERSION = "v21.0";
const GRAPH = `https://graph.facebook.com/${META_VERSION}`;

type InsightRow = Record<string, string | number | undefined>;
type MetaResponse = {
  data?: InsightRow[];
  paging?: { next?: string };
  error?: { message: string };
};

async function fetchInsights(
  adId: string,
  token: string,
  fields: string,
  breakdowns?: string,
  dateFrom?: string,
  dateTo?: string,
): Promise<InsightRow[]> {
  const timeRange = dateFrom && dateTo
    ? `&time_range=${encodeURIComponent(JSON.stringify({ since: dateFrom, until: dateTo }))}`
    : "&date_preset=last_30d";

  let url =
    `${GRAPH}/${encodeURIComponent(adId)}/insights` +
    `?fields=${encodeURIComponent(fields)}` +
    (breakdowns ? `&breakdowns=${encodeURIComponent(breakdowns)}` : "") +
    timeRange +
    `&limit=500` +
    `&access_token=${encodeURIComponent(token)}`;

  const all: InsightRow[] = [];

  while (url) {
    const res = await fetch(url);
    const data = (await res.json()) as MetaResponse;
    if (data.error) {
      console.error(`[ad-breakdowns] API error:`, data.error);
      break;
    }
    if (data.data) all.push(...data.data);
    url = data.paging?.next ?? "";
  }

  return all;
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const adId = searchParams.get("ad_id");
    const dateFrom = searchParams.get("from") ?? undefined;
    const dateTo = searchParams.get("to") ?? undefined;

    if (!adId) {
      return NextResponse.json({ error: "ad_id is required" }, { status: 400 });
    }

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const { token } = await getMetaToken(supabase, user.id);

    const [placementRows, demoRows, videoRows] = await Promise.all([
      fetchInsights(
        adId,
        token,
        "impressions,spend,clicks,reach",
        "publisher_platform,platform_position",
        dateFrom,
        dateTo,
      ),
      fetchInsights(
        adId,
        token,
        "impressions,spend,clicks,reach",
        "age,gender",
        dateFrom,
        dateTo,
      ),
      fetchInsights(
        adId,
        token,
        "impressions,actions,video_p25_watched_actions,video_p50_watched_actions,video_p75_watched_actions,video_p100_watched_actions,video_play_actions,video_thruplay_watched_actions,video_avg_time_watched_actions",
        undefined,
        dateFrom,
        dateTo,
      ),
    ]);

    const placements = placementRows.map((r) => ({
      platform: String(r.publisher_platform ?? "unknown"),
      position: String(r.platform_position ?? "unknown"),
      impressions: Number(r.impressions ?? 0),
      spend: Number(r.spend ?? 0),
      clicks: Number(r.clicks ?? 0),
      reach: Number(r.reach ?? 0),
    }));

    const demographics = demoRows.map((r) => ({
      age: String(r.age ?? "unknown"),
      gender: String(r.gender ?? "unknown"),
      impressions: Number(r.impressions ?? 0),
      spend: Number(r.spend ?? 0),
      clicks: Number(r.clicks ?? 0),
      reach: Number(r.reach ?? 0),
    }));

    type ActionEntry = { action_type: string; value: string };
    const extractVideoMetric = (actions: unknown): number => {
      if (!Array.isArray(actions)) return 0;
      const entry = (actions as ActionEntry[]).find(
        (a) => a.action_type === "video_view" || a.action_type === "video_play",
      );
      return entry ? Number(entry.value) : Number((actions as ActionEntry[])[0]?.value ?? 0);
    };
    const extractByActionType = (actions: unknown, actionType: string): number => {
      if (!Array.isArray(actions)) return 0;
      const entry = (actions as ActionEntry[]).find((a) => a.action_type === actionType);
      return entry ? Number(entry.value) : 0;
    };
    const extractAvgTimeSeconds = (actions: unknown): number => {
      if (!Array.isArray(actions) || (actions as ActionEntry[]).length === 0) return 0;
      const first = (actions as ActionEntry[])[0];
      return Number(first?.value ?? 0);
    };

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
    for (const row of videoRows ?? []) {
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
    const vRow = videoRows?.[0] ?? {};
    const plays = totalPlays || extractVideoMetric(vRow.video_play_actions);
    const p100 = totalP100 || extractVideoMetric(vRow.video_p100_watched_actions);
    const impressions = totalImpressions || Number(vRow.impressions ?? 0);
    let videoViews3s =
      totalVideoViews3s ||
      extractByActionType(vRow.actions, "video_view") ||
      extractByActionType(vRow.video_play_actions, "video_view");
    // Hook rate = 3-second video views ÷ impressions (per Meta Ads Manager)
    const thruPlays = totalThruPlays || extractVideoMetric(vRow.video_thruplay_watched_actions);
    const avgTimeSeconds = avgTimeCount > 0 ? Math.round(avgTimeSum / avgTimeCount) : extractAvgTimeSeconds(vRow.video_avg_time_watched_actions);

    const video = {
      plays,
      p25: totalP25 || extractVideoMetric(vRow.video_p25_watched_actions),
      p50: totalP50 || extractVideoMetric(vRow.video_p50_watched_actions),
      p75: totalP75 || extractVideoMetric(vRow.video_p75_watched_actions),
      p100,
      avg_time_seconds: avgTimeSeconds,
      impressions,
      // Hook Rate = (3-second video views ÷ impressions) × 100
      hook_rate:
        impressions > 0 && videoViews3s > 0
          ? Number(((videoViews3s / impressions) * 100).toFixed(1))
          : null,
      // Hold Rate = (ThruPlays ÷ 3-second video views) × 100
      hold_rate:
        videoViews3s > 0 && thruPlays > 0
          ? Number(((thruPlays / videoViews3s) * 100).toFixed(1))
          : null,
    };

    return NextResponse.json({ placements, demographics, video });
  } catch (err) {
    console.error("[ad-breakdowns] Error:", err);
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
