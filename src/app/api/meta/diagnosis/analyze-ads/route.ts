import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import { handleDiagnosisAnalyzeAdsPost } from "@/modules/monitoring/diagnosis/controller";
import { checkAnalysisAllowed, recordAnalysis } from "@/lib/usage/limits";
import { serverLogger, flushLogs } from "@/lib/logger";

/**
 * POST /api/meta/diagnosis/analyze-ads?from=&to=
 * Runs per-ad AHA analysis for the top 3 ads (rate-limited via daily analysis quota).
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const usage = await checkAnalysisAllowed(supabase, user.id);
  if (!usage.allowed) {
    return NextResponse.json(
      {
        error: "Daily AI analysis limit reached",
        used: usage.used,
        limit: usage.limit,
      },
      { status: 429 }
    );
  }

  try {
    const result = await handleDiagnosisAnalyzeAdsPost(supabase, user.id, request.nextUrl.searchParams);

    if (!result.ok) {
      return NextResponse.json(result.body, { status: result.status });
    }

    const topLen = "topAds" in result.body ? Math.min(3, result.body.topAds.length) : 3;
    await recordAnalysis(
      supabase,
      user.id,
      "health_diagnosis",
      "Health diagnosis (ads)",
      Math.max(1, topLen)
    );
    after(flushLogs);
    return NextResponse.json(result.body, { status: 200 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    serverLogger.error("Diagnosis analyze-ads failed", {
      endpoint: "/api/meta/diagnosis/analyze-ads",
      error: message,
    });
    after(flushLogs);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
