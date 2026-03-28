import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const { id } = await params;
  if (!id) {
    return NextResponse.json({ error: "Analysis ID required" }, { status: 400 });
  }

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
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!data) {
    return NextResponse.json({ error: "Analysis not found" }, { status: 404 });
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

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const { id } = await params;
  if (!id) {
    return NextResponse.json({ error: "Analysis ID required" }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: owned, error: ownedError } = await supabase
    .from("saved_competitor_analyses")
    .select("id")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (ownedError) {
    return NextResponse.json({ error: ownedError.message }, { status: 500 });
  }

  if (!owned) {
    return NextResponse.json({ error: "Analysis not found" }, { status: 404 });
  }

  const { data: deletedRows, error } = await supabase
    .from("saved_competitor_analyses")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id)
    .select("id");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (deletedRows?.length) {
    return NextResponse.json({ ok: true });
  }

  // RLS often has no DELETE policy yet — user-scoped delete affects 0 rows with no error.
  // Safe fallback: service role delete with the same id + user_id filters (ownership already verified above).
  if (process.env.SUPABASE_SERVICE_ROLE_KEY) {
    try {
      const service = createServiceClient();
      const { data: svcDeleted, error: svcError } = await service
        .from("saved_competitor_analyses")
        .delete()
        .eq("id", id)
        .eq("user_id", user.id)
        .select("id");

      if (svcError) {
        return NextResponse.json({ error: svcError.message }, { status: 500 });
      }
      if (svcDeleted?.length) {
        return NextResponse.json({ ok: true });
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : "Failed to delete analysis";
      return NextResponse.json({ error: message }, { status: 500 });
    }
  }

  return NextResponse.json(
    {
      error:
        "Nothing was deleted: missing DELETE policy on saved_competitor_analyses. Run the SQL migration 20260326000002_saved_competitor_analyses_delete_policy.sql in the Supabase SQL editor (Dashboard → SQL → New query → paste → Run), or set SUPABASE_SERVICE_ROLE_KEY in this app’s env for a dev-only fallback.",
    },
    { status: 409 }
  );
}
