import { createClient } from "@/lib/supabase/server";
import { AlertHistory } from "@/components/features/AlertHistory";

export default async function AlertsPage() {
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
        <h1 className="text-2xl font-bold tracking-tight">Email Alerts</h1>
        <p className="text-sm text-muted-foreground">
          Get notified when an ad transitions from Healthy to Declining or Fatigued
        </p>
      </div>

      {connected ? (
        <AlertHistory />
      ) : (
        <p className="text-sm text-muted-foreground">
          Connect your Meta ad account first to enable alerts.
        </p>
      )}
    </div>
  );
}
