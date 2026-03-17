import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const state = searchParams.get("state");

  if (!state) {
    return NextResponse.json({ error: "Missing state" }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: flow, error } = await supabase
    .from("meta_connect_flow")
    .select("ad_accounts, expires_at")
    .eq("state", state)
    .eq("user_id", user.id)
    .single();

  if (error || !flow) {
    return NextResponse.json({ error: "Flow not found" }, { status: 404 });
  }
  if (new Date(flow.expires_at) < new Date()) {
    return NextResponse.json({ error: "Flow expired" }, { status: 410 });
  }

  return NextResponse.json({ ad_accounts: flow.ad_accounts ?? [] });
}
