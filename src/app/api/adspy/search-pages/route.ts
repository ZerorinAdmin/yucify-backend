import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isBackendConfigured, backendSearchPages } from "@/lib/adspy/backend-client";

const RATE_LIMIT_SEC = 10;
const lastRequest = new Map<string, number>();

function checkRateLimit(userId: string): boolean {
  const now = Date.now();
  const last = lastRequest.get(userId) ?? 0;
  if (now - last < RATE_LIMIT_SEC * 1000) return false;
  lastRequest.set(userId, now);
  return true;
}

/**
 * GET /api/adspy/search-pages?q=<query>&country=<code>
 * Returns advertisers from Meta Ads Library matching the search query.
 * Displays page_id, page_name, logo, verified_status for user selection.
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!checkRateLimit(user.id)) {
    return NextResponse.json(
      { error: "Please wait 10 seconds between searches" },
      { status: 429 }
    );
  }

  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q")?.trim();
  const countryParam = searchParams.get("country")?.trim() ?? "US";
  const country = countryParam === "WW" || countryParam.toUpperCase() === "WORLDWIDE" ? "ALL" : countryParam;

  if (!q) {
    return NextResponse.json(
      { error: "Search query (q) is required" },
      { status: 400 }
    );
  }

  if (!isBackendConfigured()) {
    return NextResponse.json(
      { error: "Scraper backend not configured. Set ADSPY_BACKEND_URL and ADSPY_BACKEND_SECRET." },
      { status: 503 }
    );
  }

  try {
    const { pages } = await backendSearchPages(q, country);

    // Filter to only advertisers whose name matches the search query (e.g. "Nike" -> Nike, Nike US, Nike India)
    const queryWords = q
      .toLowerCase()
      .split(/\s+/)
      .filter((w) => w.length > 0);
    const filtered = pages.filter((p) => {
      const name = (p.page_name ?? "").toLowerCase();
      return queryWords.every((word) => name.includes(word));
    });

    return NextResponse.json({
      pages: filtered.map((p) => ({
        page_id: p.page_id,
        page_name: p.page_name,
        page_icon: p.page_icon ?? null,
        verified_status: p.verified_status ?? false,
      })),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Advertiser search failed";
    console.error("[adspy/search-pages]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
