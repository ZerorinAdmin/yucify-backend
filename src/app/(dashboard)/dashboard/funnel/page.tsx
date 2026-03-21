import { createClient } from "@/lib/supabase/server";
import { AdFunnel } from "@/components/features/AdFunnel";
import { SyncMetricsButton } from "@/components/features/SyncMetricsButton";

export default async function FunnelPage() {
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
  const connected = !!metaAccount?.ad_account_id;

  return (
    <div className="space-y-6 sm:space-y-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
        <div className="min-w-0">
          <h1 className="text-[22px] font-extrabold tracking-tight text-foreground sm:text-[26px]">
            Funnel
          </h1>
          <p className="mt-1 text-[13px] text-muted-foreground">
            {connected
              ? "Conversion funnel by date range"
              : "Connect your Meta ad account to see funnel data"}
          </p>
        </div>
        {connected && (
          <div className="shrink-0 self-stretch sm:self-auto">
            <SyncMetricsButton />
          </div>
        )}
      </div>
      <AdFunnel />
    </div>
  );
}
