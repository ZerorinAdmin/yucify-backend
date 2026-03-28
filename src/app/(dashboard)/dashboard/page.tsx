import { createClient } from "@/lib/supabase/server";
import { aggregateAdSummaries } from "@/lib/meta/ad-summary";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { SyncMetricsButton } from "@/components/features/SyncMetricsButton";
import { DashboardClient } from "@/components/features/DashboardClient";

export type { AdSummary } from "@/lib/meta/ad-summary";

const META_ERROR_MESSAGES: Record<string, string> = {
  error: "Something went wrong during Meta connection.",
  invalid_state: "Invalid or expired connection link. Please try again.",
  expired: "Connection flow expired. Please connect again.",
  config: "Meta app is not configured. Check server environment.",
  token_failed:
    "Could not get access token from Meta. Check that your Facebook app has redirect URI exactly: http://localhost:3000/api/meta/callback",
  encrypt_failed: "Could not save token securely. Please try again.",
};

function getDefaultDateRange() {
  const today = new Date();
  const from = new Date(today);
  from.setDate(from.getDate() - 7);
  return {
    from: from.toISOString().split("T")[0],
    to: today.toISOString().split("T")[0],
  };
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ meta?: string; from?: string; to?: string }>;
}) {
  const params = await searchParams;
  const { meta: metaError } = params;
  const metaErrorMessage = metaError ? META_ERROR_MESSAGES[metaError] : null;

  const { from: dateFrom, to: dateTo } = params.from && params.to
    ? { from: params.from, to: params.to }
    : getDefaultDateRange();
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: metaAccounts } = user
    ? await supabase
        .from("meta_accounts")
        .select("id, ad_account_id, account_name, is_active")
        .eq("user_id", user.id)
        .order("created_at", { ascending: true })
    : { data: [] };

  const metaAccount = metaAccounts?.find((a) => a.is_active) ?? metaAccounts?.[0];
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
        .gte("date", dateFrom)
        .lte("date", dateTo)
        .order("date", { ascending: false })
        .order("ad_name", { ascending: true })
        .limit(200)
    : null;

  const { data: metrics } = metricsQuery ? await metricsQuery : { data: null };

  // Aggregate metrics per ad for the summary cards
  const adSummary = aggregateAdSummaries(metrics ?? [], creatives ?? []);

  return (
    <div className="space-y-6 sm:space-y-8">
      {/* Page header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
        <div className="min-w-0">
          <h1 className="text-[22px] font-extrabold tracking-tight text-foreground sm:text-[26px]">Dashboard</h1>
          {connected ? (
            <div className="flex items-center gap-2 mt-1">
              <span className="h-2 w-2 rounded-full bg-emerald-400" />
              <p className="text-[13px] text-muted-foreground">
                Connected: <span className="font-medium text-foreground">{metaAccount?.account_name || metaAccount?.ad_account_id}</span>
              </p>
            </div>
          ) : (
            <p className="text-[13px] text-muted-foreground mt-1">
              Connect your Meta ad account to get started
            </p>
          )}
        </div>
        {connected && (
          <div className="shrink-0 self-stretch sm:self-auto">
            <SyncMetricsButton />
          </div>
        )}
      </div>

      {metaErrorMessage && (
        <Alert variant="destructive" className="rounded-2xl">
          <AlertTitle>Meta connection</AlertTitle>
          <AlertDescription>{metaErrorMessage}</AlertDescription>
        </Alert>
      )}

      {!connected && (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-border/70 py-20 bg-white">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-[hsl(250,60%,96%)]">
            <svg className="h-8 w-8 text-[hsl(250,60%,55%)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m9.86-2.03a4.5 4.5 0 00-1.242-7.244l4.5-4.5a4.5 4.5 0 016.364 6.364l-1.757 1.757" />
            </svg>
          </div>
          <h3 className="mt-5 text-lg font-semibold text-foreground">Connect your ad account</h3>
          <p className="mt-1.5 text-[13px] text-muted-foreground max-w-sm text-center leading-relaxed">
            Link your Meta ad account to start monitoring creative performance and track KPIs
          </p>
          <Button className="mt-6 rounded-xl bg-[hsl(250,60%,55%)] text-white hover:bg-[hsl(250,60%,48%)] transition-colors px-6" asChild>
            <a href="/api/meta/connect">Connect with Facebook</a>
          </Button>
        </div>
      )}

      {connected && (
        <>
          <DashboardClient
            ads={adSummary}
            metrics={metrics ?? []}
            dateFrom={dateFrom}
            dateTo={dateTo}
          />
        </>
      )}
    </div>
  );
}
