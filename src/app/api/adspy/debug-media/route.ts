import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Diagnostic endpoint to find root cause of missing ad graphics.
 * GET /api/adspy/debug-media?page_id=15087023444
 *
 * Returns:
 * 1. DB state: What's stored in competitor_ads (image_url, video_url)
 * 2. API response shape: What the client receives
 * 3. Sample raw snapshot: If we have any, show structure hints
 */
export async function GET(
  req: Request
): Promise<NextResponse> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const pageId = searchParams.get("page_id") ?? "15087023444";

  const result: Record<string, unknown> = {
    page_id: pageId,
    steps: {},
  };

  // Step 1: What's in the database?
  const { data: dbRows } = await supabase
    .from("competitor_ads")
    .select("ad_id, ad_text, image_url, video_url, scraped_at")
    .eq("page_id", pageId)
    .order("scraped_at", { ascending: false })
    .limit(5);

  const dbSummary = (dbRows ?? []).map((r) => ({
    ad_id: r.ad_id,
    has_image_url: !!r.image_url,
    has_video_url: !!r.video_url,
    image_url_preview: r.image_url
      ? `${r.image_url.slice(0, 60)}...`
      : null,
    video_url_preview: r.video_url
      ? `${r.video_url.slice(0, 60)}...`
      : null,
  }));

  const withMedia = (dbRows ?? []).filter((r) => r.image_url || r.video_url).length;
  result.steps = {
    "1_db": {
      total_sampled: dbRows?.length ?? 0,
      with_media: withMedia,
      verdict:
        withMedia === 0
          ? "ROOT CAUSE: No image_url or video_url stored in DB. Issue is in scraper extraction."
          : "DB has media URLs. Issue may be downstream (API or frontend).",
      sample_rows: dbSummary,
    },
  };

  return NextResponse.json(result);
}
