import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getActiveAdAccountId } from "@/lib/meta/token";
import {
  getWeekRanges,
  computeWeeklySummary,
} from "@/lib/weekly/summary";

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
    return NextResponse.json(
      { error: "No active ad account connected" },
      { status: 400 }
    );
  }

  const ranges = getWeekRanges();

  const { data: thisWeekRows, error: thisError } = await supabase
    .from("ad_metrics")
    .select("ad_id, ad_name, date, spend, impressions, reach, clicks, ctr, cpc, frequency, roas")
    .eq("user_id", user.id)
    .eq("ad_account_id", activeAccountId)
    .gte("date", ranges.thisWeek.from)
    .lte("date", ranges.thisWeek.to)
    .order("date", { ascending: true });

  if (thisError) {
    return NextResponse.json({ error: thisError.message }, { status: 500 });
  }

  const { data: previousWeekRows, error: prevError } = await supabase
    .from("ad_metrics")
    .select("ad_id, ad_name, date, spend, impressions, reach, clicks, ctr, cpc, frequency, roas")
    .eq("user_id", user.id)
    .eq("ad_account_id", activeAccountId)
    .gte("date", ranges.previousWeek.from)
    .lte("date", ranges.previousWeek.to)
    .order("date", { ascending: true });

  if (prevError) {
    return NextResponse.json({ error: prevError.message }, { status: 500 });
  }

  const summary = computeWeeklySummary(
    thisWeekRows ?? [],
    previousWeekRows ?? [],
    ranges
  );

  return NextResponse.json(summary);
}
