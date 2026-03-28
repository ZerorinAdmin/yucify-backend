import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import { handleDiagnosisAnalyzePost } from "@/modules/monitoring/diagnosis/controller";
import { checkAnalysisAllowed, recordAnalysis } from "@/lib/usage/limits";
import { serverLogger, flushLogs } from "@/lib/logger";

/**
 * POST /api/meta/diagnosis/analyze?from=&to=
 * Same date range as GET; runs rules + OpenAI narrative (rate-limited via daily analysis quota).
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
    const result = await handleDiagnosisAnalyzePost(
      supabase,
      user.id,
      request.nextUrl.searchParams
    );

    if (!result.ok) {
      return NextResponse.json(result.body, { status: result.status });
    }

    // System-level analysis only = 1 "analysis unit"
    const topLen = 1;
    await recordAnalysis(
      supabase,
      user.id,
      "health_diagnosis",
      "Health diagnosis",
      Math.max(1, topLen)
    );
    return NextResponse.json(result.body, { status: 200 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    serverLogger.error("Diagnosis analyze failed", {
      endpoint: "/api/meta/diagnosis/analyze",
      error: message,
    });
    after(flushLogs);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
