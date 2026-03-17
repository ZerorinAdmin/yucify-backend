import { SupabaseClient } from "@supabase/supabase-js";
import { decrypt, encrypt } from "@/lib/encryption";

const META_VERSION = "v21.0";

type MetaAccount = {
  id: string;
  user_id: string;
  ad_account_id: string;
  encrypted_access_token: string;
  token_expiry: string;
};

/**
 * Get a valid Meta access token for the current user.
 * Decrypts the stored token, checks expiry, and refreshes if needed.
 * Returns { token, adAccountId } or throws.
 */
export async function getMetaToken(
  supabase: SupabaseClient,
  userId: string
): Promise<{ token: string; adAccountId: string }> {
  const { data: account, error } = await supabase
    .from("meta_accounts")
    .select("id, user_id, ad_account_id, encrypted_access_token, token_expiry")
    .eq("user_id", userId)
    .eq("is_active", true)
    .maybeSingle();

  if (error || !account) {
    throw new Error("No Meta account connected");
  }

  const meta = account as MetaAccount;
  let token = decrypt(meta.encrypted_access_token);
  const expiry = new Date(meta.token_expiry);
  const now = new Date();
  const bufferMs = 24 * 60 * 60 * 1000; // refresh if <24h left

  if (expiry.getTime() - now.getTime() < bufferMs) {
    try {
      token = await refreshToken(token);
      const newExpiry = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString();
      const encryptedToken = encrypt(token);

      await supabase
        .from("meta_accounts")
        .update({
          encrypted_access_token: encryptedToken,
          token_expiry: newExpiry,
          updated_at: new Date().toISOString(),
        })
        .eq("id", meta.id);

      console.log("[meta/token] Refreshed token for user:", userId);
    } catch (err) {
      console.error("[meta/token] Token refresh failed:", err);
      if (expiry < now) {
        throw new Error("Meta token expired and refresh failed. Please reconnect.");
      }
    }
  }

  return { token, adAccountId: meta.ad_account_id };
}

/**
 * Get the active ad account ID for a user (for filtering data).
 * Returns null if no account is connected.
 */
export async function getActiveAdAccountId(
  supabase: SupabaseClient,
  userId: string
): Promise<string | null> {
  const { data } = await supabase
    .from("meta_accounts")
    .select("ad_account_id")
    .eq("user_id", userId)
    .eq("is_active", true)
    .maybeSingle();
  return data?.ad_account_id ?? null;
}

async function refreshToken(currentToken: string): Promise<string> {
  const appId = process.env.META_APP_ID;
  const appSecret = process.env.META_APP_SECRET;
  if (!appId || !appSecret) {
    throw new Error("META_APP_ID or META_APP_SECRET not configured");
  }

  const res = await fetch(
    `https://graph.facebook.com/${META_VERSION}/oauth/access_token?grant_type=fb_exchange_token&client_id=${encodeURIComponent(appId)}&client_secret=${encodeURIComponent(appSecret)}&fb_exchange_token=${encodeURIComponent(currentToken)}`
  );
  const data = (await res.json()) as {
    access_token?: string;
    error?: { message: string };
  };

  if (!data.access_token) {
    throw new Error(data.error?.message ?? "Token refresh returned no token");
  }

  return data.access_token;
}
