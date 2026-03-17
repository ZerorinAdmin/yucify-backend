import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isBackendConfigured, backendResolvePage } from "@/lib/adspy/backend-client";

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
 * POST /api/adspy/resolve-page
 * Input: { page_url: "https://facebook.com/nike" }
 * Returns: { page_id: "...", page_name: "..." }
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!checkRateLimit(user.id)) {
    return NextResponse.json(
      { error: "Please wait 10 seconds between resolution requests" },
      { status: 429 }
    );
  }

  let body: { page_url?: string; page_name?: string; country?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body" },
      { status: 400 }
    );
  }

  const pageUrl = body.page_url?.trim();
  if (!pageUrl) {
    return NextResponse.json(
      { error: "page_url is required" },
      { status: 400 }
    );
  }

  const pageName = body.page_name?.trim();
  const countryParam = body.country?.trim() ?? "WW";
  const country = countryParam === "WW" || countryParam.toUpperCase() === "WORLDWIDE" ? "ALL" : countryParam;

  if (!isBackendConfigured()) {
    return NextResponse.json(
      { error: "Scraper backend not configured. Set ADSPY_BACKEND_URL and ADSPY_BACKEND_SECRET." },
      { status: 503 }
    );
  }

  try {
    const resolved = await backendResolvePage(pageUrl, { pageName, country });
    return NextResponse.json({
      page_id: resolved.page_id,
      page_name: resolved.page_name,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not resolve page";
    console.error("[adspy/resolve-page]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
