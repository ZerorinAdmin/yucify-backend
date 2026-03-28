import type { SupabaseClient } from "@supabase/supabase-js";
import { DiagnosisDateRangeSchema } from "./validation";
import { getActiveAdAccountId } from "@/lib/meta/token";
import { getDiagnosisRulesOnly, getDiagnosisWithAdsAI, getDiagnosisWithSystemAI } from "./service";

export async function handleDiagnosisGet(
  supabase: SupabaseClient,
  userId: string,
  searchParams: URLSearchParams
) {
  const parsed = DiagnosisDateRangeSchema.safeParse({
    from: searchParams.get("from") ?? "",
    to: searchParams.get("to") ?? "",
  });
  if (!parsed.success) {
    return { ok: false as const, status: 400, body: { error: parsed.error.flatten() } };
  }

  const adAccountId = await getActiveAdAccountId(supabase, userId);
  if (!adAccountId) {
    return {
      ok: false as const,
      status: 400,
      body: { error: "No active Meta ad account" },
    };
  }

  const data = await getDiagnosisRulesOnly(
    supabase,
    userId,
    adAccountId,
    parsed.data.from,
    parsed.data.to
  );
  return { ok: true as const, status: 200, body: { ...data, ad_account_id: adAccountId } };
}

export async function handleDiagnosisAnalyzePost(
  supabase: SupabaseClient,
  userId: string,
  searchParams: URLSearchParams
) {
  const parsed = DiagnosisDateRangeSchema.safeParse({
    from: searchParams.get("from") ?? "",
    to: searchParams.get("to") ?? "",
  });
  if (!parsed.success) {
    return { ok: false as const, status: 400, body: { error: parsed.error.flatten() } };
  }

  const adAccountId = await getActiveAdAccountId(supabase, userId);
  if (!adAccountId) {
    return {
      ok: false as const,
      status: 400,
      body: { error: "No active Meta ad account" },
    };
  }

  // Default analyze endpoint: system-level only (Refresh Verdict).
  const data = await getDiagnosisWithSystemAI(supabase, userId, adAccountId, parsed.data.from, parsed.data.to);
  return { ok: true as const, status: 200, body: { ...data, ad_account_id: adAccountId } };
}

export async function handleDiagnosisAnalyzeAdsPost(
  supabase: SupabaseClient,
  userId: string,
  searchParams: URLSearchParams
) {
  const parsed = DiagnosisDateRangeSchema.safeParse({
    from: searchParams.get("from") ?? "",
    to: searchParams.get("to") ?? "",
  });
  if (!parsed.success) {
    return { ok: false as const, status: 400, body: { error: parsed.error.flatten() } };
  }

  const adAccountId = await getActiveAdAccountId(supabase, userId);
  if (!adAccountId) {
    return {
      ok: false as const,
      status: 400,
      body: { error: "No active Meta ad account" },
    };
  }

  const data = await getDiagnosisWithAdsAI(supabase, userId, adAccountId, parsed.data.from, parsed.data.to);
  return { ok: true as const, status: 200, body: { ...data, ad_account_id: adAccountId } };
}
