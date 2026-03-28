import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { aggregateAdSummaries } from "@/lib/meta/ad-summary";
import { HealthDiagnosisPanel } from "@/components/features/HealthDiagnosisPanel";

export const metadata: Metadata = {
  title: "AD Diagnosis",
};

function defaultDateRange() {
  const today = new Date();
  const from = new Date(today);
  from.setDate(from.getDate() - 7);
  return {
    from: from.toISOString().split("T")[0],
    to: today.toISOString().split("T")[0],
  };
}

export default async function HealthPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const params = await searchParams;
  const defaults = defaultDateRange();
  const from = params.from ?? defaults.from;
  const to = params.to ?? defaults.to;

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
        .select("*")
        .eq("user_id", user.id)
    : { data: null };

  const metricsQuery = connected && user
    ? supabase
        .from("ad_metrics")
        .select("ad_id, ad_name, campaign_name, adset_name, date, spend, impressions, reach, clicks, ctr, cpc, frequency, roas")
        .eq("user_id", user.id)
        .eq("ad_account_id", activeAccountId)
        .gte("date", from)
        .lte("date", to)
        .order("date", { ascending: false })
        .order("ad_name", { ascending: true })
        .limit(200)
    : null;

  const { data: metrics } = metricsQuery ? await metricsQuery : { data: null };
  const adSummaries = aggregateAdSummaries(metrics ?? [], creatives ?? []);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">AD Diagnosis</h1>
        <p className="text-sm text-muted-foreground">
        Find where you are losing money, and what’s working


        </p>
      </div>

      {connected ? (
        <HealthDiagnosisPanel
          initialFrom={from}
          initialTo={to}
          ads={adSummaries}
          metrics={metrics ?? []}
        />
      ) : (
        <p className="text-sm text-muted-foreground">
          Connect your Meta ad account first, then sync metrics to see health data.
        </p>
      )}
    </div>
  );
}
