import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { DashboardLayoutClient } from "@/components/layout/DashboardLayoutClient";
import { requiresOnboardingRedirect } from "@/lib/onboarding/server";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/");
  }

  const needsOnboarding = await requiresOnboardingRedirect(supabase, user.id);
  if (needsOnboarding) {
    redirect("/onboarding/intro");
  }

  const { data: accounts } = await supabase
    .from("meta_accounts")
    .select("id, ad_account_id, account_name, is_active")
    .eq("user_id", user.id)
    .order("created_at", { ascending: true });

  const accountProps = (accounts ?? []).map((a) => ({
    id: a.id,
    ad_account_id: a.ad_account_id,
    account_name: a.account_name || a.ad_account_id,
    is_active: !!a.is_active,
  }));

  return (
    <DashboardLayoutClient accounts={accountProps}>
      {children}
    </DashboardLayoutClient>
  );
}
