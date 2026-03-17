import { createClient } from "@/lib/supabase/server";
import { CreativeHealthPanel } from "@/components/features/CreativeHealthPanel";

export default async function HealthPage() {
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
        <h1 className="text-2xl font-bold tracking-tight">Health Monitor</h1>
        <p className="text-sm text-muted-foreground">
          Rule-based health analysis for your ads — hover a badge for details
        </p>
      </div>

      {connected ? (
        <CreativeHealthPanel />
      ) : (
        <p className="text-sm text-muted-foreground">
          Connect your Meta ad account first, then sync metrics to see health data.
        </p>
      )}
    </div>
  );
}
