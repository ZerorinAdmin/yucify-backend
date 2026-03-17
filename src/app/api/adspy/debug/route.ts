import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Debug endpoint for AdSpy scraping diagnostics.
 * Requires Playwright (not available on Vercel). Returns 503 when deployed.
 * Full functionality only when running locally with npm run dev.
 */
export async function GET(_req: NextRequest): Promise<NextResponse> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return NextResponse.json(
    {
      error: "Debug endpoint requires Playwright and is not available on Vercel.",
      message:
        "Run the app locally (npm run dev) for full AdSpy diagnostics. The scraper runs on Fly.io in production.",
    },
    { status: 503 }
  );
}
