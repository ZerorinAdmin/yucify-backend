import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { getMetaToken } from "@/lib/meta/token";
import { pullMetrics } from "@/lib/meta/metrics";
import { pullCreatives } from "@/lib/meta/creatives";

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { date_from?: string; date_to?: string };
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  const today = new Date();
  const sevenDaysAgo = new Date(today);
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  const dateFrom = body.date_from ?? sevenDaysAgo.toISOString().split("T")[0];
  const dateTo = body.date_to ?? today.toISOString().split("T")[0];

  try {
    const { token, adAccountId } = await getMetaToken(supabase, user.id);

    const [metricsCount, creativesCount] = await Promise.all([
      pullMetrics(supabase, user.id, adAccountId, token, dateFrom, dateTo),
      pullCreatives(supabase, user.id, adAccountId, token),
    ]);

    return NextResponse.json({
      success: true,
      rows: metricsCount,
      creatives: creativesCount,
      date_from: dateFrom,
      date_to: dateTo,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[api/meta/metrics]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
