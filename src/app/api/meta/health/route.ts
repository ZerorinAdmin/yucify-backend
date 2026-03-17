import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getActiveAdAccountId } from "@/lib/meta/token";
import { analyzeAllAds, AdHealthResult } from "@/lib/health/engine";
import { detectAndAlert } from "@/lib/health/alerts";

export async function GET(): Promise<NextResponse> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const activeAccountId = await getActiveAdAccountId(supabase, user.id);
  if (!activeAccountId) {
    return NextResponse.json({ results: [] as AdHealthResult[], alerts: 0 });
  }

  const { data: rows, error } = await supabase
    .from("ad_metrics")
    .select("ad_id, ad_name, date, spend, impressions, clicks, ctr, cpc, frequency, roas")
    .eq("user_id", user.id)
    .eq("ad_account_id", activeAccountId)
    .order("ad_id", { ascending: true })
    .order("date", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!rows || rows.length === 0) {
    return NextResponse.json({ results: [] as AdHealthResult[], alerts: 0 });
  }

  const results = analyzeAllAds(rows);

  // Detect transitions and enqueue email alerts (non-blocking write)
  const transitions = await detectAndAlert(
    supabase,
    user.id,
    user.email ?? "",
    results
  );

  return NextResponse.json({ results, alerts: transitions.length });
}
