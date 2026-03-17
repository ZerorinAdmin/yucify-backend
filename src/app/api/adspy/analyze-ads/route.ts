import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { analyzeCompetitorAds } from "@/lib/ai/competitor-analysis";
import { transformToAIAds, buildAIInputPayload } from "@/lib/ai/ai-ad-payload";
import { checkAnalysisAllowed, recordAnalysis } from "@/lib/usage/limits";
import { z } from "zod";

const AdForAnalysisSchema = z.object({
  ad_id: z.string(),
  ad_text: z.string(),
  ad_headline: z.string().nullable(),
  ad_description: z.string().nullable(),
  display_format: z.string().nullable(),
  cta: z.string().nullable(),
  is_active: z.boolean().nullable(),
  landing_page: z.string().nullable().optional(),
  start_date: z.string().nullable().optional(),
  collation_count: z.number().nullable().optional(),
  publisher_platforms: z.array(z.string()).nullable().optional(),
});

const RequestSchema = z.object({
  page_id: z.string().min(1),
  page_name: z.string().min(1),
  ads: z.array(AdForAnalysisSchema).min(2),
});

export async function POST(req: NextRequest): Promise<NextResponse> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { allowed, used, limit } = await checkAnalysisAllowed(supabase, user.id);
  if (!allowed) {
    return NextResponse.json(
      {
        error: "Daily AI analysis limit reached. Resets at midnight UTC.",
        used,
        limit,
      },
      { status: 429 }
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = RequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { page_id, page_name, ads } = parsed.data;

  try {
    const activeAds = ads.filter((a) => a.is_active !== false);
    if (activeAds.length < 2) {
      return NextResponse.json(
        { error: "Not enough active ads for analysis. Need at least 2 active ads." },
        { status: 400 }
      );
    }

    const rawAds = activeAds.map((a) => ({
      ad_text: a.ad_text,
      ad_headline: a.ad_headline,
      ad_description: a.ad_description,
      cta: a.cta,
      display_format: a.display_format,
      landing_page: a.landing_page ?? undefined,
      start_date: a.start_date ?? undefined,
      collation_count: a.collation_count ?? undefined,
      publisher_platforms: a.publisher_platforms ?? undefined,
      is_active: a.is_active,
    }));

    const aiAds = transformToAIAds(rawAds);
    const payload = buildAIInputPayload(page_name, aiAds);
    const result = await analyzeCompetitorAds(payload);

    await recordAnalysis(supabase, user.id, page_id, page_name, activeAds.length);

    return NextResponse.json(result);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Analysis failed";
    console.error("[adspy/analyze-ads]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
