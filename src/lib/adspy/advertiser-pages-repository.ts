/**
 * Repository for advertiser_pages cache (Page Discovery).
 */

import { SupabaseClient } from "@supabase/supabase-js";

type SearchPageResult = {
  name: string;
  url: string;
  logo: string | null;
  verified: boolean;
  page_id?: string;
};

const CACHE_HOURS = 24;

export async function getCachedPages(
  supabase: SupabaseClient,
  query: string
): Promise<SearchPageResult[] | null> {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return null;

  const cutoff = new Date();
  cutoff.setHours(cutoff.getHours() - CACHE_HOURS);
  const cutoffStr = cutoff.toISOString();

  const { data: rows } = await supabase
    .from("advertiser_pages")
    .select("page_name, page_url, logo, verified")
    .eq("search_query", normalized)
    .gte("created_at", cutoffStr)
    .order("created_at", { ascending: false })
    .limit(10);

  if (!rows || rows.length === 0) return null;

  return rows.map((r) => ({
    name: r.page_name ?? "Page",
    url: r.page_url,
    logo: r.logo ?? null,
    verified: r.verified ?? false,
  }));
}

export async function upsertAdvertiserPages(
  supabase: SupabaseClient,
  query: string,
  pages: Array<{ name: string; url: string; logo: string | null; verified?: boolean; page_id?: string }>
): Promise<void> {
  const normalized = query.trim().toLowerCase();
  if (!normalized || pages.length === 0) return;

  const rows = pages.map((p) => ({
    search_query: normalized,
    page_id: p.page_id ?? p.url,
    page_name: p.name,
    page_url: p.url,
    logo: p.logo,
    verified: p.verified ?? false,
  }));

  await supabase.from("advertiser_pages").upsert(rows, {
    onConflict: "search_query,page_url",
    ignoreDuplicates: false,
  });
}
