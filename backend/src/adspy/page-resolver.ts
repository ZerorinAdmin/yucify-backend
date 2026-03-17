/**
 * Page Discovery: Resolve page_url to page_id.
 * Uses recursive JSON scan to find page IDs in GraphQL (data.page, data.profile,
 * data.viewer, data.nodes, etc.). Falls back to Ads Library keyword search if
 * GraphQL resolution fails.
 */

import { chromium } from "playwright";
import type { BrowserContext, Page } from "playwright";
import path from "path";
import {
  extractAdvertisersFromGraphQL,
  extractPageIdsFromHtml,
} from "./ads-library-extract";

const USER_AGENTS = [
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
];

const PROFILE_PATH = process.env.ADSPY_FACEBOOK_PROFILE;
const HEADLESS = process.env.ADSPY_HEADLESS !== "false";

function randomUserAgent(): string {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

const STEALTH_ARGS = ["--no-sandbox", "--disable-setuid-sandbox", "--disable-blink-features=AutomationControlled"];

async function createContext(): Promise<{
  context: BrowserContext;
  close: () => Promise<void>;
}> {
  if (PROFILE_PATH) {
    const resolved = path.resolve(process.cwd(), PROFILE_PATH);
    const context = await chromium.launchPersistentContext(resolved, {
      headless: HEADLESS,
      args: STEALTH_ARGS,
      viewport: { width: 1280, height: 900 },
      locale: "en-US",
      userAgent: randomUserAgent(),
      extraHTTPHeaders: { "Accept-Language": "en-US,en;q=0.9" },
    });
    return { context, close: () => context.close() };
  }
  const browser = await chromium.launch({ headless: HEADLESS, args: STEALTH_ARGS });
  const context = await browser.newContext({
    userAgent: randomUserAgent(),
    viewport: { width: 1280, height: 900 },
    locale: "en-US",
    extraHTTPHeaders: { "Accept-Language": "en-US,en;q=0.9" },
  });
  return { context, close: () => browser.close() };
}

/** When using persistent profile, ensure session is loaded before resolving. */
async function verifyLoginStatus(page: Page): Promise<void> {
  if (!PROFILE_PATH) return;
  await page.goto("https://www.facebook.com", {
    waitUntil: "domcontentloaded",
    timeout: 45000,
  });
  await delay(3000);
  const count = await page.locator('[aria-label="Your profile"], [aria-label="Account"]').count();
  if (!HEADLESS && count === 0) {
    try {
      await page.locator('[aria-label="Your profile"], [aria-label="Account"]').first().waitFor({ state: "visible", timeout: 120_000 });
    } catch {
      // Proceed - session may load differently
    }
  }
}

export type ResolvedPage = {
  page_id: string;
  page_name: string;
};

/** Extract numeric page_id from node.id (may be "Page:123" or "123"). */
function extractNumericId(id: string | number | null | undefined): string | null {
  if (id == null) return null;
  const str = String(id);
  const match = str.match(/(\d{8,})/);
  return match?.[1] ?? null;
}

/** Recursively scan JSON for Facebook page node (id + name/username). */
function findPageNode(obj: unknown): { id: string; name?: string } | null {
  if (!obj || typeof obj !== "object") return null;

  const o = obj as Record<string, unknown>;
  if (
    o.id &&
    typeof o.id === "string" &&
    o.id.length >= 10 &&
    (o.name || o.username)
  ) {
    return {
      id: o.id,
      name: (o.name ?? o.username) as string,
    };
  }

  for (const key in o) {
    const result = findPageNode(o[key]);
    if (result) return result;
  }

  return null;
}

/** Extract page_id from URL if already present (profile.php?id=, etc.). */
function extractPageIdFromUrl(url: string): string | null {
  const m = url.match(/profile\.php\?id=(\d+)/) ?? url.match(/[?&]brand_redir=(\d+)/) ?? url.match(/view_all_page_id=(\d+)/) ?? url.match(/\/pages\/[^/]+\/(\d+)/);
  if (m?.[1] && /^\d{8,}$/.test(m[1])) return m[1];
  return null;
}

function extractPageNameFromUrl(url: string): string | null {
  const m = url.match(/facebook\.com\/([^/?#]+)(?:\/|$|\?)/) ?? url.match(/facebook\.com\/pages\/([^/]+)/);
  if (!m || m[1] === "pages" || m[1] === "profile.php" || m[1] === "pg") return null;
  return m[1].trim() || null;
}

/** Known page_ids for common brands when GraphQL + Ads Library both fail. */
const KNOWN_PAGES: Record<string, { page_id: string; page_name: string }> = {
  nike: { page_id: "15087023444", page_name: "Nike" },
  "coca-cola": { page_id: "40796308305", page_name: "Coca-Cola" },
  adidas: { page_id: "205865296158", page_name: "adidas" },
};

/** Normalize for comparison: lowercase, collapse spaces, strip punctuation. */
function normalizeForMatch(s: string): string {
  return s
    .toLowerCase()
    .replace(/[''`]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Check if search term matches a known page (e.g. "adidas" -> adidas). */
function getKnownPageForSearchTerm(searchTerm: string): { page_id: string; page_name: string } | null {
  const key = normalizeForMatch(searchTerm).replace(/\s+/g, "-");
  for (const [knownKey, known] of Object.entries(KNOWN_PAGES)) {
    if (key.includes(knownKey) || knownKey.includes(key)) {
      return known;
    }
  }
  return null;
}

/** Validate that Ads Library result matches the search term (avoids wrong advertisers). */
function pageNameMatchesSearchTerm(pageName: string | undefined, searchTerm: string): boolean {
  if (!pageName || !searchTerm) return false;
  const a = normalizeForMatch(pageName);
  const b = normalizeForMatch(searchTerm);
  if (!a || !b) return false;
  return a.includes(b) || b.includes(a);
}

/** Strip "verified", "verified id", "account", "official page" etc. - display official name only. */
function cleanPageName(raw: string): string {
  const s = raw
    .replace(/\s+/g, " ")
    .replace(/\bverified\s+id\b/gi, "")
    .replace(/\bverified\b/gi, "")
    .replace(/\bofficial\s+page\b/gi, "")
    .replace(/\baccount\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();
  return s.slice(0, 150) || raw.slice(0, 150);
}

/** Fallback: Ads Library keyword search - GraphQL interception, DOM, then HTML regex. */
async function resolveViaAdsLibrary(
  context: BrowserContext,
  searchTerm: string,
  country: string = "ALL"
): Promise<ResolvedPage | null> {
  const page = await context.newPage();
  const graphqlAdvertisers: { page_id: string; page_name?: string }[] = [];

  try {
    // Intercept GraphQL responses for Ads Library (ad_library_main, search_results, etc.)
    page.on("response", async (res) => {
      if (!res.url().includes("graphql")) return;
      try {
        const json = await res.json().catch(() => null);
        if (!json) return;
        const advertisers = extractAdvertisersFromGraphQL(json);
        for (const a of advertisers) {
          if (a.page_id && !graphqlAdvertisers.some((x) => x.page_id === a.page_id)) {
            graphqlAdvertisers.push(a);
          }
        }
      } catch {
        // ignore
      }
    });

    const adsLibraryUrl = `https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=${country}&is_targeted_country=false&media_type=all&search_type=keyword&q=${encodeURIComponent(searchTerm)}&source=fb-logo`;

    const graphqlPromise = page.waitForResponse(
      (res) => res.url().includes("graphql") && res.request().method() === "POST",
      { timeout: 8000 }
    );
    await page.goto(adsLibraryUrl, { waitUntil: "domcontentloaded", timeout: 45000 });
    await graphqlPromise;
    await delay(1500);

    for (let i = 0; i < 2; i++) {
      await page.evaluate(() => window.scrollBy(0, 500));
      await delay(2000);
    }

    // 1) GraphQL interception (highest fidelity) - dedupe by page_id
    const uniqueAdvertisers = new Map<string, { page_id: string; page_name?: string }>();
    for (const adv of graphqlAdvertisers) {
      if (!uniqueAdvertisers.has(adv.page_id)) {
        uniqueAdvertisers.set(adv.page_id, adv);
      }
    }
    const deduped = Array.from(uniqueAdvertisers.values());

    if (deduped.length > 0) {
      const first = deduped[0];
      console.log("[resolver] Ads Library GraphQL OK:", { searchTerm, country, page_id: first.page_id });
      return {
        page_id: first.page_id,
        page_name: first.page_name ? cleanPageName(first.page_name) : searchTerm,
      };
    }

    // 2) DOM extraction (broader selectors)
    const domResult = await page.evaluate(() => {
      const seen = new Set<string>();
      const selectors = [
        'a[href*="view_all_page_id="]',
        'a[href*="page_id="]',
        '[href*="view_all_page_id="]',
        'a[href*="ads/library"]',
      ];
      for (const sel of selectors) {
        const links = document.querySelectorAll(sel);
        for (const a of links) {
          const href = (a as HTMLAnchorElement).href || a.getAttribute("data-href") || a.getAttribute("href") || "";
          const m = href.match(/view_all_page_id=(\d+)/) ?? href.match(/[?&]page_id=(\d+)/);
          if (m?.[1] && m[1].length >= 8 && !seen.has(m[1])) {
            seen.add(m[1]);
            const nameEl = a.querySelector("[dir='auto']") ?? a.closest("[dir='auto']") ?? a;
            const name = (nameEl?.textContent ?? "").trim().replace(/\s+/g, " ").slice(0, 100);
            return { page_id: m[1], page_name: name || undefined };
          }
        }
      }
      return { page_id: null as string | null, linkCount: document.querySelectorAll('a[href*="view_all_page_id"], a[href*="page_id="]').length };
    });

    if (domResult?.page_id) {
      console.log("[resolver] Ads Library DOM OK:", { searchTerm, country, page_id: domResult.page_id });
      return {
        page_id: domResult.page_id,
        page_name: domResult.page_name ? cleanPageName(domResult.page_name) : searchTerm,
      };
    }

    // 3) Raw HTML regex fallback
    const html = await page.content();
    const ids = extractPageIdsFromHtml(html);
    if (ids.length > 0) {
      console.log("[resolver] Ads Library HTML regex OK:", { searchTerm, country, page_id: ids[0] });
      return { page_id: ids[0], page_name: searchTerm };
    }

    console.warn("[resolver] Ads Library fallback: no page_id", {
      searchTerm,
      country,
      linkCount: (domResult as { linkCount?: number })?.linkCount ?? 0,
      graphqlCount: deduped.length,
    });
  } catch {
    // Fall through
  } finally {
    await page.close();
  }
  return null;
}

export type ResolveOptions = {
  pageName?: string;
  country?: string;
};

/**
 * Resolve page_url to page_id.
 * 1) Fast path: If URL contains profile.php?id=XXX, return immediately.
 * 2) GraphQL: Recursive JSON scan for page node (data.page, data.profile, etc.).
 * 3) Known pages: If search term matches (e.g. "adidas"), use known page_id before Ads Library.
 * 4) Ads Library: Keyword search - validate result matches search term; reject mismatches (e.g. "Culture Circle" for "adidas").
 * 5) Last resort: Known pages again.
 */
export async function resolvePageFromUrl(
  pageUrl: string,
  options: ResolveOptions = {}
): Promise<ResolvedPage> {
  const { pageName: pageNameHint, country = "ALL" } = options;

  let url = pageUrl.trim();
  if (!url.startsWith("http")) {
    url = url.includes("facebook.com") ? `https://${url}` : `https://www.facebook.com/${url}`;
  }

  // 1️⃣ Fast path: URL already has page_id
  const fromUrl = extractPageIdFromUrl(url);
  if (fromUrl) {
    const pageName = extractPageNameFromUrl(url) ?? pageNameHint ?? "Page";
    return { page_id: fromUrl, page_name: pageName };
  }

  const { context, close } = await createContext();

  try {
    const page = await context.newPage();
    await verifyLoginStatus(page);

    let resolvedId: string | null = null;
    let resolvedName: string | null = null;

    page.on("response", async (res) => {
      if (!res.url().includes("graphql")) return;

      try {
        const json = await res.json().catch(() => null);
        if (!json) return;

        const node = findPageNode(json);

        if (node && !resolvedId) {
          const numericId = extractNumericId(node.id);
          if (numericId) {
            resolvedId = numericId;
            resolvedName = node.name ? cleanPageName(node.name.trim()) : null;
            console.log("[resolver] GraphQL page:", node);
          }
        }
      } catch {
        // ignore parse errors
      }
    });

    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45000 });

    // Wait for GraphQL responses
    await delay(7000);

    await page.close();

    if (resolvedId) {
      return {
        page_id: resolvedId,
        page_name: resolvedName ?? pageNameHint ?? extractPageNameFromUrl(url) ?? "Page",
      };
    }

    // 3️⃣ Fallback: Ads Library keyword search - try page_name first (e.g. "Adidas"), then URL-derived (e.g. "AdidasUS")
    const urlTerm = extractPageNameFromUrl(url);
    const searchTerms = [
      ...(pageNameHint ? [cleanPageName(pageNameHint) || pageNameHint] : []),
      ...(urlTerm && urlTerm !== pageNameHint ? [urlTerm] : []),
    ];
    if (searchTerms.length === 0 && urlTerm) searchTerms.push(urlTerm);
    const uniqueTerms = [...new Set(searchTerms.filter(Boolean))];

    // 3️⃣ Check known pages BEFORE Ads Library (avoids wrong results from keyword search)
    for (const term of uniqueTerms) {
      const known = getKnownPageForSearchTerm(term);
      if (known) {
        console.log("[resolver] Using known page_id for", term);
        return { page_id: known.page_id, page_name: known.page_name };
      }
    }

    // 4️⃣ Ads Library keyword search - validate results match search term
    console.log("[resolver] GraphQL failed, trying Ads Library fallback:", { url, searchTerms: uniqueTerms, country });

    for (const term of uniqueTerms) {
      const fromAdsLibrary = await resolveViaAdsLibrary(context, term, country);
      if (fromAdsLibrary) {
        if (pageNameMatchesSearchTerm(fromAdsLibrary.page_name, term)) {
          return fromAdsLibrary;
        }
        console.warn("[resolver] Ads Library result rejected (name mismatch):", {
          returned: fromAdsLibrary.page_name,
          expected: term,
        });
      }
    }

    // 5️⃣ Last resort: known page_ids (retry in case of edge cases)
    for (const term of uniqueTerms) {
      const known = getKnownPageForSearchTerm(term);
      if (known) {
        console.log("[resolver] Using known page_id for", term);
        return { page_id: known.page_id, page_name: known.page_name };
      }
    }

    throw new Error("Unable to resolve advertiser page ID via GraphQL or Ads Library");
  } finally {
    await close();
  }
}
