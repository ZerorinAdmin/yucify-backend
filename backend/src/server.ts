import "dotenv/config";

/**
 * Repto backend - AdSpy scraper service for Fly.io.
 * Exposes scrape, search-pages, resolve-page endpoints.
 * Vercel API routes proxy to this service.
 *
 * Scraper is lazy-loaded so the server starts quickly and Fly.io can reach it
 * before Playwright initializes.
 */

import express from "express";

const app = express();
app.use(express.json());

const BACKEND_SECRET = process.env.BACKEND_SECRET;
const PORT = Number(process.env.PORT) || 8080;

/** Health check - public, no auth. Fly.io uses this to verify the app is up. */
app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

function requireSecret(req: express.Request, res: express.Response, next: express.NextFunction) {
  const secret = req.headers["x-backend-secret"];
  if (!BACKEND_SECRET || secret !== BACKEND_SECRET) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  next();
}

app.use(requireSecret);

/** POST /scrape - body: { page_id, country?, active_status? } */
app.post("/scrape", async (req, res) => {
  try {
    const { page_id, country = "US", active_status = "active" } = req.body;
    if (!page_id || typeof page_id !== "string") {
      res.status(400).json({ error: "page_id is required" });
      return;
    }
    const { scrapePageAds } = await import("./adspy/scraper.js");
    const countryNorm =
      (country as string).toUpperCase() === "WW" || (country as string).toUpperCase() === "WORLDWIDE"
        ? "ALL"
        : (country as string);
    let result = await scrapePageAds(page_id.trim(), countryNorm, { activeStatus: active_status });
    if (result.ads.length === 0 && countryNorm !== "ALL") {
      result = await scrapePageAds(page_id.trim(), "ALL", { activeStatus: "all" });
    }
    res.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Scraping failed";
    console.error("[backend] scrape:", message);
    res.status(500).json({ error: message });
  }
});

/** GET /search-pages?q=&country= */
app.get("/search-pages", async (req, res) => {
  try {
    const q = (req.query.q as string)?.trim();
    const countryParam = (req.query.country as string)?.trim() ?? "US";
    const country =
      countryParam === "WW" || countryParam.toUpperCase() === "WORLDWIDE" ? "ALL" : countryParam;
    if (!q) {
      res.status(400).json({ error: "q is required" });
      return;
    }
    const { searchPages } = await import("./adspy/scraper.js");
    const pages = await searchPages(q, country);
    res.json({ pages });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Search failed";
    console.error("[backend] search-pages:", message);
    res.status(500).json({ error: message });
  }
});

/** POST /resolve-page - body: { page_url, page_name?, country? } */
app.post("/resolve-page", async (req, res) => {
  try {
    const { page_url, page_name, country = "ALL" } = req.body;
    if (!page_url || typeof page_url !== "string") {
      res.status(400).json({ error: "page_url is required" });
      return;
    }
    const { resolvePageFromUrl } = await import("./adspy/page-resolver.js");
    const countryNorm =
      (country as string).toUpperCase() === "WW" || (country as string).toUpperCase() === "WORLDWIDE"
        ? "ALL"
        : (country as string);
    const resolved = await resolvePageFromUrl(page_url.trim(), {
      pageName: (page_name as string)?.trim(),
      country: countryNorm,
    });
    res.json({ page_id: resolved.page_id, page_name: resolved.page_name });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Resolve failed";
    console.error("[backend] resolve-page:", message);
    res.status(500).json({ error: message });
  }
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`[backend] Listening on 0.0.0.0:${PORT}`);
});
