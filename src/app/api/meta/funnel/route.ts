import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getActiveAdAccountId } from "@/lib/meta/token";
import { parseAndValidateDateRange, getDefaultDateRange } from "@/lib/date";

type FunnelStage = { name: string; value: number; fill: string };

const STAGE_COLORS = [
  "#7C5CFC", "#8b6cfc", "#9f85fd", "#b39dfe", "#c7b5fe",
  "#daccff", "#ede5ff",
];

const FUNNEL_DEFINITIONS: Record<string, { label: string; stages: string[] }> = {
  app_install: {
    label: "App Install",
    stages: ["impressions", "reach", "link_click", "mobile_app_install", "app_custom_event", "purchase"],
  },
  ecommerce: {
    label: "E-Commerce",
    stages: ["impressions", "reach", "link_click", "landing_page_view", "add_to_cart", "initiate_checkout", "purchase"],
  },
  lead_gen: {
    label: "Lead Generation",
    stages: ["impressions", "reach", "link_click", "landing_page_view", "complete_registration", "lead"],
  },
  traffic: {
    label: "Traffic & Engagement",
    stages: ["impressions", "reach", "link_click", "landing_page_view", "post_engagement", "page_engagement"],
  },
};

const STAGE_LABELS: Record<string, string> = {
  impressions: "Impressions",
  reach: "Reach",
  clicks: "Clicks",
  link_click: "Link Clicks",
  landing_page_view: "Landing Page Views",
  mobile_app_install: "App Installs",
  app_custom_event: "In-App Events",
  add_to_cart: "Add to Cart",
  initiate_checkout: "Checkout Initiated",
  purchase: "Purchases",
  omni_purchase: "Purchases",
  complete_registration: "Registrations",
  lead: "Leads",
  post_engagement: "Engagements",
  page_engagement: "Page Engagements",
  video_view: "Video Views",
  comment: "Comments",
  like: "Likes",
  post_reaction: "Reactions",
};

function detectFunnelType(actionTypes: Set<string>): string {
  if (actionTypes.has("mobile_app_install")) return "app_install";
  if (actionTypes.has("add_to_cart") || actionTypes.has("initiate_checkout")) return "ecommerce";
  if (actionTypes.has("complete_registration") || actionTypes.has("lead")) return "lead_gen";
  return "traffic";
}

export async function GET(req: Request): Promise<NextResponse> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const activeAccountId = await getActiveAdAccountId(supabase, user.id);
  if (!activeAccountId) {
    return NextResponse.json({ error: "No Meta account connected" }, { status: 400 });
  }

  const { searchParams } = new URL(req.url);
  const adId = searchParams.get("ad_id");
  const fromParam = searchParams.get("from");
  const toParam = searchParams.get("to");

  const dateRange = parseAndValidateDateRange(fromParam, toParam) ?? getDefaultDateRange();
  const { from: dateFrom, to: dateTo } = dateRange;

  const metricsQuery = supabase
    .from("ad_metrics")
    .select("ad_id, ad_name, impressions, reach, clicks")
    .eq("user_id", user.id)
    .eq("ad_account_id", activeAccountId)
    .gte("date", dateFrom)
    .lte("date", dateTo);
  if (adId) metricsQuery.eq("ad_id", adId);

  const { data: metricsRows } = await metricsQuery;

  const adIdsFromMetrics = [...new Set((metricsRows ?? []).map((r) => r.ad_id))];
  const actionsQuery = supabase
    .from("ad_actions")
    .select("ad_id, action_type, action_count, action_value")
    .eq("user_id", user.id)
    .gte("date", dateFrom)
    .lte("date", dateTo);
  if (adId) {
    actionsQuery.eq("ad_id", adId);
  } else if (adIdsFromMetrics.length > 0) {
    actionsQuery.in("ad_id", adIdsFromMetrics);
  }

  const { data: actionRows } = await actionsQuery;

  const adNames = new Map<string, string>();
  for (const row of metricsRows ?? []) {
    if (row.ad_name && !adNames.has(row.ad_id)) {
      adNames.set(row.ad_id, row.ad_name);
    }
  }

  let totalImpressions = 0;
  let totalReach = 0;
  let totalClicks = 0;

  for (const row of metricsRows ?? []) {
    totalImpressions += Number(row.impressions ?? 0);
    totalReach += Number(row.reach ?? 0);
    totalClicks += Number(row.clicks ?? 0);
  }

  const actionTotals = new Map<string, { count: number; value: number }>();
  for (const row of actionRows ?? []) {
    const existing = actionTotals.get(row.action_type) ?? { count: 0, value: 0 };
    existing.count += Number(row.action_count ?? 0);
    existing.value += Number(row.action_value ?? 0);
    actionTotals.set(row.action_type, existing);
  }

  const allActionTypes = new Set(actionTotals.keys());
  const funnelType = detectFunnelType(allActionTypes);
  const definition = FUNNEL_DEFINITIONS[funnelType];

  const coreMetrics: Record<string, number> = {
    impressions: totalImpressions,
    reach: totalReach,
    clicks: totalClicks,
  };

  const stages: FunnelStage[] = [];
  let colorIdx = 0;

  for (const stageKey of definition.stages) {
    let value = 0;
    if (coreMetrics[stageKey] !== undefined) {
      value = coreMetrics[stageKey];
    } else if (stageKey === "purchase" || stageKey === "omni_purchase") {
      value = (actionTotals.get("purchase")?.count ?? 0) + (actionTotals.get("omni_purchase")?.count ?? 0);
    } else {
      value = actionTotals.get(stageKey)?.count ?? 0;
    }

    if (value > 0 || stages.length > 0) {
      stages.push({
        name: STAGE_LABELS[stageKey] ?? stageKey,
        value: Math.round(value),
        fill: STAGE_COLORS[colorIdx % STAGE_COLORS.length],
      });
    }
    colorIdx++;
  }

  const formatCompact = (n: number) => {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
    return n.toLocaleString();
  };

  const stagesWithRate = stages.map((s, i) => ({
    ...s,
    rate: i === 0 ? 100 : stages[i - 1].value > 0 ? Number(((s.value / stages[i - 1].value) * 100).toFixed(1)) : 0,
    label: `${s.name} · ${formatCompact(s.value)}`,
  }));

  const adsList = Array.from(adNames.entries()).map(([id, name]) => ({ id, name }));

  return NextResponse.json({
    funnelType,
    funnelLabel: definition.label,
    stages: stagesWithRate,
    ads: adsList,
    availableTypes: Object.entries(FUNNEL_DEFINITIONS).map(([key, def]) => ({ key, label: def.label })),
  });
}
