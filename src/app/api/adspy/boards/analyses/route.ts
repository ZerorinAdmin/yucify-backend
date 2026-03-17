import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const SaveAnalysisSchema = z.object({
  page_id: z.string().min(1),
  page_name: z.string().min(1),
  analysis: z.any(),
});

export async function GET(): Promise<NextResponse> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("saved_competitor_analyses")
    .select("id, page_id, page_name, analysis_json, ad_count, dominant_format, created_at, updated_at")
    .order("updated_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    analyses: (data ?? []).map((item) => ({
      id: item.id,
      page_id: item.page_id,
      page_name: item.page_name,
      analysis: item.analysis_json,
      ad_count: item.ad_count,
      dominant_format: item.dominant_format,
      created_at: item.created_at,
      updated_at: item.updated_at,
    })),
  });
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = SaveAnalysisSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { page_id, page_name, analysis } = parsed.data;
  const adCount =
    typeof analysis?.total_active_ads?.count === "number" ? analysis.total_active_ads.count : null;
  const dominantFormat =
    typeof analysis?.total_active_ads?.dominant_format === "string"
      ? analysis.total_active_ads.dominant_format
      : null;

  const { data, error } = await supabase
    .from("saved_competitor_analyses")
    .upsert(
      {
        user_id: user.id,
        page_id,
        page_name,
        analysis_json: analysis,
        ad_count: adCount,
        dominant_format: dominantFormat,
        updated_at: new Date().toISOString(),
      },
      {
        onConflict: "user_id,page_id",
        ignoreDuplicates: false,
      }
    )
    .select("id, page_id, page_name, analysis_json, ad_count, dominant_format, created_at, updated_at")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    analysis: {
      id: data.id,
      page_id: data.page_id,
      page_name: data.page_name,
      analysis: data.analysis_json,
      ad_count: data.ad_count,
      dominant_format: data.dominant_format,
      created_at: data.created_at,
      updated_at: data.updated_at,
    },
  });
}
