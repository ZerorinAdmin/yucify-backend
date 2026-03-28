import { createClient } from "@/lib/supabase/server";
import { SyncMetricsButton } from "@/components/features/SyncMetricsButton";
import { TopCreatives } from "@/components/features/TopCreatives";
import { MetricPills } from "@/components/features/MetricPills";
import { AdsTable } from "@/components/features/AdsTable";
import { aggregateAdSummaries } from "@/lib/meta/ad-summary";

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

  const adSummary = aggregateAdSummaries(metrics ?? [], creatives ?? []);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
        <div className="min-w-0">
          <h1 className="text-xl font-bold tracking-tight sm:text-2xl">Top Creatives</h1>
          <p className="text-sm text-muted-foreground">
            All creative assets from your ad account
          </p>
        </div>
        {connected && (
          <div className="shrink-0 self-stretch sm:self-auto">
            <SyncMetricsButton />
          </div>
        )}
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
