/**
 * Shared type definitions for AdSpy results (backend copy).
 */

export type DebugSource = {
  ad_text?: "graphql" | "dom" | "html" | "snapshot" | "merge";
  ad_headline?: "graphql" | "html" | "snapshot" | "merge";
  ad_description?: "graphql" | "html" | "snapshot" | "merge";
  image_url?: "graphql" | "dom" | "html" | "snapshot" | "cdn_correlation" | "positional";
  video_url?: "graphql" | "dom" | "html" | "snapshot" | "cdn_correlation" | "positional";
  carousel_urls?: "graphql" | "dom" | "html" | "snapshot" | "cdn_correlation" | "positional";
  cta?: "graphql" | "dom" | "html" | "snapshot" | "merge";
};

export type ScrapedAd = {
  ad_id: string;
  page_id: string;
  page_name?: string;
  ad_text: string;
  ad_headline?: string | null;
  ad_description?: string | null;
  image_url: string | null;
  video_url: string | null;
  carousel_urls?: string[];
  cta: string | null;
  landing_page_url: string | null;
  ad_start_date: string | null;
  ad_snapshot_url: string | null;
  display_format?: string | null;
  is_active?: boolean | null;
  collation_id?: string | null;
  collation_count?: number | null;
  publisher_platforms?: string[] | null;
  industry?: string | null;
  _debug_source?: DebugSource;
};
