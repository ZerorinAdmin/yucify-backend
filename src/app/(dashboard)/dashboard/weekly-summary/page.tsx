import { createClient } from "@/lib/supabase/server";
import { WeeklySummaryPanel } from "@/components/features/WeeklySummaryPanel";

export default async function WeeklySummaryPage() {
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

  const connected = !!metaAccount?.ad_account_id;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Weekly Summary</h1>
        <p className="text-sm text-muted-foreground">
          Compare this week vs previous week — deterministic stats, no AI
        </p>
      </div>

      {connected ? (
        <WeeklySummaryPanel />
      ) : (
        <p className="text-sm text-muted-foreground">
          Connect your Meta ad account first, then sync metrics to see the weekly
          summary.
        </p>
      )}
    </div>
  );
}
