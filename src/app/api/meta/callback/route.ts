import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { encrypt } from "@/lib/encryption";

const META_VERSION = "v21.0";
const GRAPH_BASE = `https://graph.facebook.com/${META_VERSION}`;

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const origin = process.env.NEXT_PUBLIC_SITE_URL ?? request.nextUrl.origin;
  const redirectUri = `${origin}/api/meta/callback`;

  if (!code || !state) {
    console.error("[meta/callback] Missing code or state. URL searchParams:", Object.fromEntries(searchParams));
    return NextResponse.redirect(`${origin}/dashboard?meta=error`);
  }

  const supabase = await createClient();
  const { data: flow, error: flowError } = await supabase
    .from("meta_connect_flow")
    .select("user_id, expires_at, return_path")
    .eq("state", state)
    .single();

  if (flowError || !flow) {
    return NextResponse.redirect(`${origin}/dashboard?meta=invalid_state`);
  }
  if (new Date(flow.expires_at) < new Date()) {
    return NextResponse.redirect(`${origin}/dashboard?meta=expired`);
  }

  const appId = process.env.META_APP_ID;
  const appSecret = process.env.META_APP_SECRET;
  if (!appId || !appSecret) {
    return NextResponse.redirect(`${origin}/dashboard?meta=config`);
  }

  // Exchange code for short-lived token
  const tokenRes = await fetch(
    `${GRAPH_BASE}/oauth/access_token?client_id=${encodeURIComponent(appId)}&redirect_uri=${encodeURIComponent(redirectUri)}&client_secret=${encodeURIComponent(appSecret)}&code=${encodeURIComponent(code)}`
  );
  const tokenData = (await tokenRes.json()) as {
    access_token?: string;
    error?: { message: string; code?: number; error_user_msg?: string };
  };

  if (!tokenData.access_token) {
    console.error("[meta/callback] Token exchange failed. redirect_uri used:", redirectUri, "Meta response:", tokenData);
    return NextResponse.redirect(`${origin}/dashboard?meta=token_failed`);
  }

  // Exchange for long-lived token
  const longLivedRes = await fetch(
    `${GRAPH_BASE}/oauth/access_token?grant_type=fb_exchange_token&client_id=${encodeURIComponent(appId)}&client_secret=${encodeURIComponent(appSecret)}&fb_exchange_token=${encodeURIComponent(tokenData.access_token)}`
  );
  const longLived = (await longLivedRes.json()) as {
    access_token?: string;
    expires_in?: number;
    error?: { message: string };
  };

  const accessToken = longLived.access_token ?? tokenData.access_token;
  const expiresIn = longLived.expires_in ?? 3600;
  const tokenExpiry = new Date(Date.now() + expiresIn * 1000).toISOString();

  // Fetch ad accounts
  const accountsRes = await fetch(
    `${GRAPH_BASE}/me/adaccounts?fields=id,name,account_id&access_token=${encodeURIComponent(accessToken)}`
  );
  const accountsData = (await accountsRes.json()) as {
    data?: { id: string; name: string; account_id: string }[];
    error?: { message: string; code?: number };
  };

  const adAccounts = accountsData.data ?? [];
  if (accountsData.error) {
    console.warn("[meta/callback] Ad accounts API error (token still saved):", accountsData.error);
  }
  if (adAccounts.length === 0) {
    console.warn("[meta/callback] No ad accounts returned for token. Permissions or Business Manager may be needed.");
  }

  try {
    const encryptedToken = encrypt(accessToken);
    await supabase
      .from("meta_connect_flow")
      .update({
        encrypted_access_token: encryptedToken,
        token_expiry: tokenExpiry,
        ad_accounts: adAccounts,
      })
      .eq("state", state);
  } catch (err) {
    console.error("[meta/callback] Encrypt or DB update failed:", err);
    return NextResponse.redirect(`${origin}/dashboard?meta=encrypt_failed`);
  }

  const returnPath =
    flow.return_path && String(flow.return_path).startsWith("/")
      ? String(flow.return_path)
      : "/dashboard/connect-meta";
  const separator = returnPath.includes("?") ? "&" : "?";
  return NextResponse.redirect(
    `${origin}${returnPath}${separator}state=${encodeURIComponent(state)}`
  );
}
