/**
 * Client for the AdSpy backend (Fly.io).
 * When ADSPY_BACKEND_URL is set, Vercel API routes proxy scrape/search/resolve to the backend.
 */

import type { ScrapedAd } from "./types";

const BACKEND_URL = process.env.ADSPY_BACKEND_URL?.replace(/\/$/, "");
const BACKEND_SECRET = process.env.ADSPY_BACKEND_SECRET;

export function isBackendConfigured(): boolean {
  return Boolean(BACKEND_URL && BACKEND_SECRET);
}

async function fetchBackend(
  path: string,
  options: { method?: string; body?: unknown } = {}
): Promise<Response> {
  if (!BACKEND_URL || !BACKEND_SECRET) {
    throw new Error("ADSPY_BACKEND_URL and ADSPY_BACKEND_SECRET must be set");
  }
  const { method = "GET", body } = options;
  const res = await fetch(`${BACKEND_URL}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      "X-Backend-Secret": BACKEND_SECRET,
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  return res;
}

export async function backendScrape(
  pageId: string,
  country: string,
  activeStatus: "active" | "all" = "active"
): Promise<{ page_id: string; page_name: string; ads: ScrapedAd[] }> {
  const res = await fetchBackend("/scrape", {
    method: "POST",
    body: { page_id: pageId, country, active_status: activeStatus },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error((err as { error?: string }).error ?? "Scraping failed");
  }
  return res.json();
}

export async function backendSearchPages(
  q: string,
  country: string
): Promise<{ pages: Array<{ page_id: string; page_name?: string; page_icon?: string; verified_status?: boolean }> }> {
  const params = new URLSearchParams({ q, country });
  const res = await fetchBackend(`/search-pages?${params}`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error((err as { error?: string }).error ?? "Search failed");
  }
  return res.json();
}

export async function backendResolvePage(
  pageUrl: string,
  options?: { pageName?: string; country?: string }
): Promise<{ page_id: string; page_name: string }> {
  const res = await fetchBackend("/resolve-page", {
    method: "POST",
    body: { page_url: pageUrl, page_name: options?.pageName, country: options?.country ?? "ALL" },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error((err as { error?: string }).error ?? "Resolve failed");
  }
  return res.json();
}
