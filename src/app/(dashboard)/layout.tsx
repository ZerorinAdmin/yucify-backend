import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { Sidebar } from "@/components/layout/Sidebar";

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

  const { data: accounts } = await supabase
    .from("meta_accounts")
    .select("id, ad_account_id, account_name, is_active")
    .eq("user_id", user.id)
    .order("created_at", { ascending: true });

  return (
    <div className="flex h-screen overflow-hidden bg-[hsl(240,10%,97.5%)]">
      <Sidebar
        accounts={(accounts ?? []).map((a) => ({
          id: a.id,
          ad_account_id: a.ad_account_id,
          account_name: a.account_name || a.ad_account_id,
          is_active: !!a.is_active,
        }))}
      />
      <main className="flex-1 overflow-auto">
        <div className="mx-auto max-w-[1400px] px-8 py-8">{children}</div>
      </main>
    </div>
  );
}
