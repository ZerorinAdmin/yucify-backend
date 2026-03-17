import { SupabaseClient } from "@supabase/supabase-js";

const META_VERSION = "v21.0";
const GRAPH_BASE = `https://graph.facebook.com/${META_VERSION}`;
const FIELDS =
  "ad_id,ad_name,campaign_name,adset_name,spend,impressions,reach,clicks,ctr,cpc,frequency,purchase_roas,actions,action_values,cost_per_action_type";

type ActionEntry = { action_type: string; value: string };

type RawInsight = {
  ad_id: string;
  ad_name: string;
  campaign_name: string;
  adset_name: string;
  spend: string;
  impressions: string;
  reach: string;
  clicks: string;
  ctr: string;
  cpc: string;
  frequency: string;
  purchase_roas?: ActionEntry[];
  actions?: ActionEntry[];
  action_values?: ActionEntry[];
  cost_per_action_type?: ActionEntry[];
  date_start: string;
  date_stop: string;
};

type InsightsResponse = {
  data?: RawInsight[];
  paging?: { next?: string };
  error?: { message: string; code?: number };
};

/**
 * Pull daily ad-level metrics from Meta for a date range.
 * Upserts into ad_metrics (core metrics) and ad_actions (conversion breakdowns).
 * Returns the number of metric rows upserted.
 */
export async function pullMetrics(
  supabase: SupabaseClient,
  userId: string,
  adAccountId: string,
  token: string,
  dateFrom: string,
  dateTo: string
): Promise<number> {
  let url =
    `${GRAPH_BASE}/${encodeURIComponent(adAccountId)}/insights` +
    `?fields=${encodeURIComponent(FIELDS)}` +
    `&level=ad` +
    `&time_increment=1` +
    `&time_range=${encodeURIComponent(JSON.stringify({ since: dateFrom, until: dateTo }))}` +
    `&limit=500` +
    `&access_token=${encodeURIComponent(token)}`;

  let totalRows = 0;

  while (url) {
    const res = await fetch(url);
    const data = (await res.json()) as InsightsResponse;

    if (data.error) {
      console.error("[meta/metrics] Insights API error:", data.error);
      throw new Error(data.error.message);
    }

    const insights = data.data ?? [];
    if (insights.length > 0) {
      const metricRows = insights.map((row) => ({
        user_id: userId,
        ad_account_id: adAccountId,
        ad_id: row.ad_id,
        ad_name: row.ad_name ?? "",
        campaign_name: row.campaign_name ?? "",
        adset_name: row.adset_name ?? "",
        date: row.date_start,
        spend: parseFloat(row.spend) || 0,
        impressions: parseInt(row.impressions) || 0,
        reach: parseInt(row.reach) || 0,
        clicks: parseInt(row.clicks) || 0,
        ctr: parseFloat(row.ctr) || 0,
        cpc: parseFloat(row.cpc) || 0,
        frequency: parseFloat(row.frequency) || 0,
        roas: extractRoas(row.purchase_roas),
      }));

      const { error: upsertError } = await supabase
        .from("ad_metrics")
        .upsert(metricRows, { onConflict: "user_id,ad_id,date" });

      if (upsertError) {
        console.error("[meta/metrics] Upsert error:", upsertError);
        throw new Error(upsertError.message);
      }

      // Extract and upsert actions
      const actionRows = extractActions(insights, userId);
      if (actionRows.length > 0) {
        const { error: actionsError } = await supabase
          .from("ad_actions")
          .upsert(actionRows, { onConflict: "user_id,ad_id,date,action_type" });

        if (actionsError) {
          console.error("[meta/metrics] Actions upsert error:", actionsError);
        }
      }

      totalRows += metricRows.length;
    }

    url = data.paging?.next ?? "";
  }

  console.log(
    `[meta/metrics] Upserted ${totalRows} rows for ${adAccountId} (${dateFrom} → ${dateTo})`
  );
  return totalRows;
}

function extractRoas(purchaseRoas?: ActionEntry[]): number {
  if (!purchaseRoas || purchaseRoas.length === 0) return 0;
  const entry = purchaseRoas.find(
    (r) => r.action_type === "omni_purchase" || r.action_type === "purchase"
  );
  return entry ? parseFloat(entry.value) || 0 : parseFloat(purchaseRoas[0].value) || 0;
}

/**
 * Flatten actions + action_values from each insight row into normalized rows.
 * Merges count from `actions` and monetary value from `action_values` by action_type.
 */
function extractActions(
  insights: RawInsight[],
  userId: string
): {
  user_id: string;
  ad_id: string;
  date: string;
  action_type: string;
  action_count: number;
  action_value: number;
}[] {
  const rows: {
    user_id: string;
    ad_id: string;
    date: string;
    action_type: string;
    action_count: number;
    action_value: number;
  }[] = [];

  for (const insight of insights) {
    const actionCounts = new Map<string, number>();
    const actionValues = new Map<string, number>();

    for (const a of insight.actions ?? []) {
      actionCounts.set(a.action_type, parseFloat(a.value) || 0);
    }
    for (const a of insight.action_values ?? []) {
      actionValues.set(a.action_type, parseFloat(a.value) || 0);
    }

    const allTypes = new Set([...actionCounts.keys(), ...actionValues.keys()]);

    for (const actionType of allTypes) {
      rows.push({
        user_id: userId,
        ad_id: insight.ad_id,
        date: insight.date_start,
        action_type: actionType,
        action_count: actionCounts.get(actionType) ?? 0,
        action_value: actionValues.get(actionType) ?? 0,
      });
    }
  }

  return rows;
}
