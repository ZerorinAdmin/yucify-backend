import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import { z } from "zod";
import { getMetaToken } from "@/lib/meta/token";
import { fetchCreativesDebugReport } from "@/lib/meta/creatives";
import { serverLogger, flushLogs } from "@/lib/logger";

const QuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional().default(25),
});

/**
 * Returns a diagnostic snapshot of Meta creative payloads for the active ad account
 * (no DB writes). Use while logged in: GET /api/meta/creatives-debug?limit=25
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = QuerySchema.safeParse({
    limit: request.nextUrl.searchParams.get("limit") ?? undefined,
  });

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const { token, adAccountId } = await getMetaToken(supabase, user.id);
    const report = await fetchCreativesDebugReport(token, adAccountId, parsed.data.limit);
    return NextResponse.json(report);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    serverLogger.error("Meta creatives-debug failed", {
      endpoint: "/api/meta/creatives-debug",
      error: message,
    });
    after(flushLogs);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
