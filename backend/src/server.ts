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
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { mkdtemp, rm } from "node:fs/promises";

const app = express();
app.use(express.json());

const BACKEND_SECRET = process.env.BACKEND_SECRET;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
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

/**
 * Prefer FFMPEG_PATH, then common Homebrew locations (macOS GUI/Cursor often lack brew on PATH),
 * else rely on PATH (Docker/Linux).
 */
function resolveFfmpegBinary(): string {
  const fromEnv = process.env.FFMPEG_PATH?.trim();
  if (fromEnv) {
    if (existsSync(fromEnv)) return fromEnv;
    console.warn(`[backend] FFMPEG_PATH is set but file not found: ${fromEnv}`);
  }
  const candidates = ["/opt/homebrew/bin/ffmpeg", "/usr/local/bin/ffmpeg"];
  for (const c of candidates) {
    if (existsSync(c)) return c;
  }
  return "ffmpeg";
}

const FFMPEG_BIN = resolveFfmpegBinary();

async function runFfmpegExtractFirst5sAudio(params: { videoUrl: string; outPath: string }): Promise<void> {
  const { videoUrl, outPath } = params;
  await new Promise<void>((resolve, reject) => {
    const child = spawn(
      FFMPEG_BIN,
      [
        "-hide_banner",
        "-loglevel",
        "error",
        "-ss",
        "0",
        "-t",
        "5",
        "-i",
        videoUrl,
        "-vn",
        "-ac",
        "1",
        "-ar",
        "16000",
        "-f",
        "mp3",
        outPath,
      ],
      { stdio: ["ignore", "ignore", "pipe"] }
    );
    let stderr = "";
    child.stderr.on("data", (d) => (stderr += String(d)));
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(stderr.trim() || `ffmpeg failed with code ${code}`));
    });
  });
}

async function openaiTranscribeMp3(buffer: Buffer): Promise<string> {
  if (!OPENAI_API_KEY) throw new Error("OPENAI_API_KEY not configured on backend");

  // Node fetch supports File/FormData in this runtime (Playwright base image uses Node 22).
  const file = new File([buffer], "audio.mp3", { type: "audio/mpeg" });
  const form = new FormData();
  form.set("model", "gpt-4o-mini-transcribe");
  form.set("file", file);
  form.set("response_format", "json");

  const res = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${OPENAI_API_KEY}` },
    body: form,
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`OpenAI transcription failed (${res.status}): ${body.slice(0, 200)}`);
  }
  const json = (await res.json()) as { text?: string };
  return String(json.text ?? "").trim();
}

/** POST /transcribe-0-5s - body: { video_url } */
app.post("/transcribe-0-5s", async (req, res) => {
  try {
    const videoUrl = (req.body?.video_url as string | undefined)?.trim();
    if (!videoUrl || typeof videoUrl !== "string") {
      res.status(400).json({ error: "video_url is required" });
      return;
    }
    if (!/^https?:\/\//i.test(videoUrl)) {
      res.status(400).json({ error: "video_url must be http(s)" });
      return;
    }

    const dir = await mkdtemp(path.join(os.tmpdir(), "repto-transcribe-"));
    const outPath = path.join(dir, "audio.mp3");
    try {
      await runFfmpegExtractFirst5sAudio({ videoUrl, outPath });
      const audio = await readFile(outPath);
      const text = await openaiTranscribeMp3(audio);
      // Keep response small; caller already hard-trims before putting into AI prompt.
      res.json({ transcript_0_5s: text });
    } finally {
      await rm(dir, { recursive: true, force: true }).catch(() => {});
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Transcription failed";
    console.error("[backend] transcribe-0-5s:", message);
    res.status(500).json({ error: message });
  }
});

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
  console.log(`[backend] Transcription ffmpeg: ${FFMPEG_BIN}`);
});
