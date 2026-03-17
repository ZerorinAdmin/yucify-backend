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
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[26px] font-extrabold tracking-tight text-foreground">
            Funnel
          </h1>
          <p className="text-[13px] text-muted-foreground mt-1">
            {connected
              ? "Conversion funnel by date range"
              : "Connect your Meta ad account to see funnel data"}
          </p>
        </div>
        {connected && <SyncMetricsButton />}
      </div>
      <AdFunnel />
    </div>
  );
}
