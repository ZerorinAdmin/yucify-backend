import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { ad_account_id?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { ad_account_id } = body;
  if (!ad_account_id) {
    return NextResponse.json(
      { error: "Missing ad_account_id" },
      { status: 400 }
    );
  }

  const { data: account, error: fetchError } = await supabase
    .from("meta_accounts")
    .select("id")
    .eq("user_id", user.id)
    .eq("ad_account_id", ad_account_id)
    .single();

  if (fetchError || !account) {
    return NextResponse.json({ error: "Account not found" }, { status: 404 });
  }

  const { error: updateError } = await supabase
    .from("meta_accounts")
    .update({ is_active: true, updated_at: new Date().toISOString() })
    .eq("id", account.id);

  if (updateError) {
    console.error("[meta/switch-account] Update failed:", updateError);
    return NextResponse.json({ error: "Failed to switch account" }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
