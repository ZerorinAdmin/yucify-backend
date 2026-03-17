/**
 * GET /api/usage — returns current user's daily usage (scrape + analysis).
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  checkScrapeAllowed,
  checkAnalysisAllowed,
} from "@/lib/usage/limits";

export async function GET(): Promise<NextResponse> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [scrape, analysis] = await Promise.all([
    checkScrapeAllowed(supabase, user.id),
    checkAnalysisAllowed(supabase, user.id),
  ]);

  return NextResponse.json({
    scrape: {
      used: scrape.used,
      limit: scrape.limit,
      remaining: scrape.remaining,
    },
    analysis: {
      used: analysis.used,
      limit: analysis.limit,
      remaining: analysis.remaining,
    },
  });
}
