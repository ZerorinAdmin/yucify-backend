import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { handleDiagnosisGet } from "@/modules/monitoring/diagnosis/controller";
import { serverLogger, flushLogs } from "@/lib/logger";
import { after } from "next/server";

/**
 * GET /api/meta/diagnosis?from=YYYY-MM-DD&to=YYYY-MM-DD
 * Rule-based account diagnosis (no AI). Requires auth + active Meta account.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await handleDiagnosisGet(supabase, user.id, request.nextUrl.searchParams);
    return NextResponse.json(result.body, { status: result.status });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    serverLogger.error("Diagnosis GET failed", { endpoint: "/api/meta/diagnosis", error: message });
    after(flushLogs);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
