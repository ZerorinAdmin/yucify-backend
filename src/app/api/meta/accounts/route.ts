import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: accounts, error } = await supabase
    .from("meta_accounts")
    .select("id, ad_account_id, account_name, is_active")
    .eq("user_id", user.id)
    .order("created_at", { ascending: true });

  if (error) {
    console.error("[meta/accounts] List failed:", error);
    return NextResponse.json({ error: "Failed to list accounts" }, { status: 500 });
  }

  return NextResponse.json({
    accounts: (accounts ?? []).map((a) => ({
      id: a.id,
      ad_account_id: a.ad_account_id,
      account_name: a.account_name || a.ad_account_id,
      is_active: !!a.is_active,
    })),
  });
}
