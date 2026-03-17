import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";

const META_VERSION = "v21.0";

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    const origin = request.nextUrl.origin;
    return NextResponse.redirect(`${origin}/`);
  }

  const appId = process.env.META_APP_ID;
  const appSecret = process.env.META_APP_SECRET;
  if (!appId || !appSecret) {
    return NextResponse.json(
      { error: "Meta app not configured" },
      { status: 500 }
    );
  }

  const state = randomUUID();
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

  const { error } = await supabase.from("meta_connect_flow").insert({
    state,
    user_id: user.id,
    ad_accounts: [],
    expires_at: expiresAt,
  });

  if (error) {
    // Log for debugging (table missing / RLS / etc.)
    console.error("[meta/connect] insert meta_connect_flow failed:", error.message, error.code);
    const isTableMissing = error.code === "42P01" || error.message?.includes("does not exist");
    return NextResponse.json(
      {
        error: isTableMissing
          ? "Database not set up for Meta connection. Run the migration: supabase/migrations/20250301000002_meta_account_connection.sql"
          : "Failed to start connection flow",
      },
      { status: 500 }
    );
  }

  const origin = request.nextUrl.origin;
  const redirectUri = `${origin}/api/meta/callback`;
  const scope = "ads_read,business_management";
  const url = `https://www.facebook.com/${META_VERSION}/dialog/oauth?client_id=${encodeURIComponent(appId)}&redirect_uri=${encodeURIComponent(redirectUri)}&state=${encodeURIComponent(state)}&scope=${encodeURIComponent(scope)}`;

  return NextResponse.redirect(url);
}
