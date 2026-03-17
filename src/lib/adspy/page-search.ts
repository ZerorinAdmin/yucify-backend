/**
 * Page Discovery: Search Facebook pages by brand name.
 * Uses https://www.facebook.com/search/pages?q=<query>
 * Does NOT modify ad scraping logic.
 */

import { chromium } from "playwright";
import type { BrowserContext, Page } from "playwright";
import path from "path";

const USER_AGENTS = [
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
];

const MAX_PAGES = 10;
const PROFILE_PATH = process.env.ADSPY_FACEBOOK_PROFILE;
const HEADLESS = process.env.ADSPY_HEADLESS !== "false";

function randomUserAgent(): string {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function createContext(): Promise<{
  context: BrowserContext;
  close: () => Promise<void>;
}> {
  if (PROFILE_PATH) {
    const resolved = path.resolve(process.cwd(), PROFILE_PATH);
    const context = await chromium.launchPersistentContext(resolved, {
      headless: HEADLESS,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
      viewport: { width: 1280, height: 900 },
      locale: "en-US",
      userAgent: randomUserAgent(),
      extraHTTPHeaders: { "Accept-Language": "en-US,en;q=0.9" },
    });
    return { context, close: () => context.close() };
  }
  const browser = await chromium.launch({
    headless: HEADLESS,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });
  const context = await browser.newContext({
    userAgent: randomUserAgent(),
    viewport: { width: 1280, height: 900 },
    locale: "en-US",
    extraHTTPHeaders: { "Accept-Language": "en-US,en;q=0.9" },
  });
  return { context, close: () => browser.close() };
}

async function verifyLoginStatus(page: Page): Promise<void> {
  if (!PROFILE_PATH) return;
  await page.goto("https://www.facebook.com", {
    waitUntil: "domcontentloaded",
    timeout: 45000,
  });
  await delay(2000);
  const count = await page.locator('[aria-label="Your profile"]').count();
  if (!HEADLESS && count === 0) {
    try {
      await page.locator('[aria-label="Your profile"]').first().waitFor({ state: "visible", timeout: 180_000 });
    } catch {
      // Proceed without login
    }
  }
}

export type SearchPageResult = {
  name: string;
  url: string;
  logo: string | null;
  verified: boolean;
};

/**
 * Search Facebook pages by query. Opens facebook.com/search/pages?q=<query>
 * and extracts page_name, page_url, page_logo for up to 10 results.
 */
export async function searchFacebookPages(query: string): Promise<SearchPageResult[]> {
  const { context, close } = await createContext();

  try {
    const page = await context.newPage();
    await verifyLoginStatus(page);

    const url = `https://www.facebook.com/search/pages?q=${encodeURIComponent(query)}`;
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45000 });
    await delay(5000);

    // Scroll to trigger lazy-loaded images
    await page.evaluate(() => window.scrollBy(0, 600));
    await delay(2000);
    await page.evaluate(() => window.scrollBy(0, 600));
    await delay(1500);

    const results = await page.evaluate((max) => {
      const items: { name: string; url: string; logo: string | null; verified: boolean }[] = [];
      const seen = new Set<string>();

      function extractLogo(container: Element): string | null {
        // 1. img with src (profile pic - exclude emoji, icons, tiny UI elements)
        const imgs = container.querySelectorAll("img");
        for (const img of imgs) {
          let src = img.getAttribute("src") ?? img.getAttribute("data-src");
          if (!src && img.getAttribute("srcset")) {
            const first = img.getAttribute("srcset")?.split(",")[0]?.trim().split(/\s+/)[0];
            if (first) src = first;
          }
          if (!src || !src.startsWith("http")) continue;
          if (src.includes("emoji") || src.includes("safe_image") || src.includes("rsrc.php/v3/y5/r/") || src.includes("1f")) continue;
          const w = img.naturalWidth || img.width || 0;
          const h = img.naturalHeight || img.height || 0;
          if ((w >= 32 || h >= 32) && (w <= 600 || h <= 600)) return src;
          if ((w === 0 && h === 0) && (src.includes("fbcdn") || src.includes("facebook"))) return src;
        }
        // 2. SVG image element (Facebook uses SVG for avatars)
        const svgImages = container.querySelectorAll("image");
        for (const el of svgImages) {
          const href = el.getAttribute("href") ?? (el as SVGImageElement).href?.baseVal ?? el.getAttribute("xlink:href");
          if (href && href.startsWith("http") && !href.includes("emoji")) return href;
        }
        // 3. background-image in style
        const styled = container.querySelectorAll("[style*='background-image'], [style*='background: url']");
        for (const el of styled) {
          const style = (el as HTMLElement).style?.backgroundImage ?? el.getAttribute("style") ?? "";
          const m = style.match(/url\\(['"]?([^'")\s]+)['"]?\\)/);
          if (m?.[1] && m[1].startsWith("http") && !m[1].includes("emoji")) return m[1];
        }
        return null;
      }

      function extractVerified(container: Element): boolean {
        const text = (container.textContent ?? "").toLowerCase();
        if (text.includes("verified")) return true;
        const verifiedEl = container.querySelector('[aria-label*="Verified"], [aria-label*="verified"], [title*="Verified"], [title*="verified"]');
        return !!verifiedEl;
      }

      /** Extract official page name only - strip "verified", "verified id", "account", "official page" etc. */
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

      function normalizeUrl(href: string): string {
        const profileMatch = href.match(/facebook\.com\/profile\.php\?id=(\d+)/);
        if (profileMatch) return "https://www.facebook.com/profile.php?id=" + profileMatch[1];
        return href.split("?")[0].replace(/\/$/, "");
      }

      // Strategy 1: Iterate by result containers (articles/cards) first to get logo + name + url together
      const articles = document.querySelectorAll("[role='article'], [data-pagelet]");
      for (const art of articles) {
        const link = art.querySelector('a[href*="facebook.com/"]');
        if (!link) continue;
        const href = (link as HTMLAnchorElement).href;
        if (href.includes("/groups/") || href.includes("/events/") || href.includes("/search/") || href.includes("/reel/") || href.includes("/watch/")) continue;
        const profileMatch = href.match(/facebook\.com\/profile\.php\?id=(\d+)/);
        const match = profileMatch ? ["profile.php", profileMatch[1]] : (href.match(/facebook\.com\/([^/?#]+)(?:\/|$|\?)/) ?? href.match(/facebook\.com\/pages\/([^/]+)/));
        if (!match || (!profileMatch && (match[1] === "pages" || match[1] === "profile.php" || match[1] === "pg"))) continue;

        const normalizedUrl = normalizeUrl(href);
        if (seen.has(normalizedUrl)) continue;
        seen.add(normalizedUrl);

        const nameEl = art.querySelector("[dir='auto']");
        const rawName = (nameEl?.textContent ?? "").trim().replace(/\s+/g, " ").slice(0, 150) || (profileMatch ? "Page" : match[1]);
        const name = cleanPageName(rawName) || (profileMatch ? "Page" : match[1]);
        const logo = extractLogo(art);
        const verified = extractVerified(art);

        items.push({ name, url: normalizedUrl, logo, verified });
        if (items.length >= max) break;
      }

      // Strategy 2: Fallback - links with closest container
      if (items.length < max) {
        const links = document.querySelectorAll('a[href*="facebook.com/"]');
        for (const link of links) {
          const href = (link as HTMLAnchorElement).href;
          if (!href || seen.has(href)) continue;
          if (href.includes("/groups/") || href.includes("/events/") || href.includes("/search/")) continue;
          const profileMatch = href.match(/facebook\.com\/profile\.php\?id=(\d+)/);
          const match = profileMatch ? ["profile.php", profileMatch[1]] : href.match(/facebook\.com\/([^/?#]+)(?:\/|$|\?)/);
          if (!match || (!profileMatch && (match[1] === "pages" || match[1] === "profile.php" || match[1] === "pg"))) continue;

          const normalizedUrl = normalizeUrl(href);
          if (seen.has(normalizedUrl)) continue;
          seen.add(normalizedUrl);

          const container = link.closest("[role='article'], [data-pagelet]") ?? link.parentElement ?? link;
          const nameEl = container.querySelector("[dir='auto']") ?? link.querySelector("[dir='auto']");
          const rawName = (nameEl?.textContent ?? "").trim().replace(/\s+/g, " ").slice(0, 150) || (profileMatch ? "Page" : match[1]);
          const name = cleanPageName(rawName) || (profileMatch ? "Page" : match[1]);
          const logo = extractLogo(container);
          const verified = extractVerified(container);

          items.push({ name, url: normalizedUrl, logo, verified });
          if (items.length >= max) break;
        }
      }

      return items.slice(0, max);
    }, MAX_PAGES);

    return results;
  } finally {
    await close();
  }
}
