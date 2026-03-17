import { createClient } from "@/lib/supabase/server";
import { SyncMetricsButton } from "@/components/features/SyncMetricsButton";
import { TopCreatives } from "@/components/features/TopCreatives";
import { MetricPills } from "@/components/features/MetricPills";
import { AdsTable } from "@/components/features/AdsTable";
import type { AdSummary } from "@/app/(dashboard)/dashboard/page";

export default async function CreativesPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: metaAccount } = user
    ? await supabase
        .from("meta_accounts")
        .select("ad_account_id")
        .eq("user_id", user.id)
        .eq("is_active", true)
        .maybeSingle()
    : { data: null };

  const activeAccountId = metaAccount?.ad_account_id ?? null;
  const connected = !!activeAccountId;

  const { data: creatives } = connected && user
    ? await supabase
        .from("ad_creatives")
        .select("ad_id, ad_name, campaign_name, adset_name, thumbnail_url, image_url, creative_type, body, video_url, carousel_urls")
        .eq("user_id", user.id)
    : { data: null };

  const { data: metrics } = connected && user
    ? await supabase
        .from("ad_metrics")
        .select("ad_id, ad_name, campaign_name, adset_name, date, spend, impressions, reach, clicks, ctr, cpc, frequency, roas")
        .eq("user_id", user.id)
        .eq("ad_account_id", activeAccountId)
        .order("date", { ascending: false })
        .limit(500)
    : { data: null };

  const adSummary = aggregateByAd(metrics ?? [], creatives ?? []);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Top Creatives</h1>
          <p className="text-sm text-muted-foreground">
            All creative assets from your ad account
          </p>
        </div>
        {connected && <SyncMetricsButton />}
      </div>

      {connected ? (
        <>
          <MetricPills ads={adSummary} />
          <TopCreatives ads={adSummary} />
          <AdsTable ads={adSummary} metrics={metrics ?? []} />
        </>
      ) : (
        <p className="text-sm text-muted-foreground">
          Connect your Meta ad account first to see creatives.
        </p>
      )}
    </div>
  );
}

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

type MetricRow = {
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

function aggregateByAd(metrics: MetricRow[], creatives: Creative[]): AdSummary[] {
  const creativeMap = new Map<string, Creative>();
  for (const c of creatives) creativeMap.set(c.ad_id, c);

  const groups = new Map<string, MetricRow[]>();
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
