import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { decrypt, encrypt } from "@/lib/encryption";

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { state?: string; ad_account_id?: string; account_name?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { state, ad_account_id, account_name } = body;
  if (!state || !ad_account_id) {
    return NextResponse.json(
      { error: "Missing state or ad_account_id" },
      { status: 400 }
    );
  }

  const { data: flow, error: flowError } = await supabase
    .from("meta_connect_flow")
    .select("encrypted_access_token, token_expiry, expires_at")
    .eq("state", state)
    .eq("user_id", user.id)
    .single();

  if (flowError || !flow?.encrypted_access_token) {
    return NextResponse.json({ error: "Flow not found or expired" }, { status: 404 });
  }
  if (new Date(flow.expires_at) < new Date()) {
    return NextResponse.json({ error: "Flow expired" }, { status: 410 });
  }

  let accessToken: string;
  try {
    accessToken = decrypt(flow.encrypted_access_token);
  } catch {
    return NextResponse.json({ error: "Invalid token" }, { status: 500 });
  }

  // Use real token_expiry from OAuth response when present; else fallback to 60 days
  const tokenExpiry =
    flow.token_expiry ??
    new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString();
  const encryptedToken = encrypt(accessToken);

  const row: Record<string, unknown> = {
    user_id: user.id,
    ad_account_id,
    encrypted_access_token: encryptedToken,
    token_expiry: tokenExpiry,
    updated_at: new Date().toISOString(),
    is_active: true,
  };
  if (account_name) row.account_name = account_name;

  const { error: upsertError } = await supabase
    .from("meta_accounts")
    .upsert(row, { onConflict: "user_id,ad_account_id" });

  if (upsertError) {
    // If it fails due to account_name column not existing, retry without it
    if (account_name && upsertError.message?.includes("account_name")) {
      delete row.account_name;
      const { error: retryError } = await supabase
        .from("meta_accounts")
        .upsert(row, { onConflict: "user_id,ad_account_id" });
      if (retryError) {
        console.error("[meta/save] Retry upsert failed:", retryError);
        return NextResponse.json({ error: "Failed to save account" }, { status: 500 });
      }
    } else {
      console.error("[meta/save] Upsert failed:", upsertError);
      return NextResponse.json({ error: "Failed to save account" }, { status: 500 });
    }
  }

  await supabase.from("meta_connect_flow").delete().eq("state", state);

  return NextResponse.json({ success: true });
}
