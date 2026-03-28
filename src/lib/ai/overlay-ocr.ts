import { z } from "zod";
import sharp from "sharp";

const OVERLAY_OCR_RESULT_SCHEMA = z.object({
  overlay_text: z.string(),
});

/** Longest edge (px). Keeps overlay text readable while limiting Vision detail / token cost. */
const VISION_MAX_EDGE_PX = 1024;
/** JPEG quality (lower = smaller payload, fewer Vision tiles vs huge PNGs). */
const VISION_JPEG_QUALITY = 82;
/** Reject downloads larger than this (bytes). */
const MAX_IMAGE_FETCH_BYTES = 15 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 30_000;

function ocrFetchDevLog(message: string, details?: Record<string, unknown>): void {
  if (process.env.NODE_ENV === "production") return;
  if (details && Object.keys(details).length > 0) {
    console.warn(`[ocr:fetch] ${message}`, details);
  } else {
    console.warn(`[ocr:fetch] ${message}`);
  }
}

function parseJsonContent(content: string): unknown {
  const trimmed = content.trim();
  if (trimmed.startsWith("{")) return JSON.parse(trimmed);

  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start >= 0 && end > start) {
    return JSON.parse(trimmed.slice(start, end + 1));
  }

  throw new Error("AI response did not contain JSON.");
}

function normalizeOverlayText(text: string): string {
  // Preserve line breaks (carousel slides may be joined upstream), but de-noise whitespace.
  const lines = String(text ?? "")
    // Models sometimes return literal "\n" sequences instead of newlines.
    .replace(/\\r\\n/g, "\n")
    .replace(/\\n/g, "\n")
    .split(/\r?\n/)
    .map((l) => l.replace(/\s+/g, " ").trim())
    .filter(Boolean);
  return lines.join("\n").trim();
}

function trimOverlayText(text: string, maxChars = 600): string {
  const cleaned = normalizeOverlayText(text);
  if (!cleaned) return "";
  if (cleaned.length <= maxChars) return cleaned;
  return `${cleaned.slice(0, Math.max(0, maxChars - 1)).trimEnd()}…`;
}

const GENERIC_NON_BRAND_SINGLE_WORDS = new Set([
  "sale",
  "save",
  "off",
  "free",
  "new",
  "now",
  "today",
  "deal",
  "deals",
  "offer",
  "offers",
  "shop",
  "buy",
  "get",
  "limited",
  "limited-time",
  "limitedtime",
  "bonus",
  "gift",
  "win",
  "join",
  "try",
]);

function looksLikeBrandOnly(text: string): boolean {
  const cleaned = normalizeOverlayText(text);
  if (!cleaned) return false;
  if (cleaned.includes("\n")) return false;

  const token = cleaned.replace(/[“”"']/g, "").trim();
  const lower = token.toLowerCase();
  if (GENERIC_NON_BRAND_SINGLE_WORDS.has(lower)) return false;

  // Heuristic: single-token, letter-only, not too long. These are often packaging/logo OCR false-positives.
  if (!/^[a-z0-9&.\- ]+$/i.test(token)) return false;
  const parts = token.split(/\s+/).filter(Boolean);
  if (parts.length !== 1) return false;
  if (token.length < 2 || token.length > 18) return false;
  if (/\d/.test(token)) return false;
  return true;
}

/**
 * Download image bytes from the creative URL (Facebook CDN, etc.) and downscale to JPEG
 * so OpenAI Vision does not pull remote URLs (often blocked) and does not receive huge PNGs.
 */
export async function fetchAndNormalizeImageForVision(imageUrl: string): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  let res: Response;
  ocrFetchDevLog("starting image fetch", { imageUrl });
  try {
    res = await fetch(imageUrl, {
      redirect: "follow",
      signal: controller.signal,
      headers: {
        Accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
        "User-Agent":
          "Mozilla/5.0 (compatible; Repto/1.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Referer: "https://www.facebook.com/",
      },
    });
    ocrFetchDevLog("image fetch completed", {
      imageUrl,
      status: res.status,
      ok: res.ok,
      contentType: res.headers.get("content-type") ?? "",
      contentLength: res.headers.get("content-length") ?? "",
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    ocrFetchDevLog("image fetch failed", { imageUrl, error: msg });
    throw new Error(`Failed to download image: ${msg}`);
  } finally {
    clearTimeout(timeout);
  }

  if (!res.ok) {
    throw new Error(`Image download HTTP ${res.status}`);
  }

  const lenHeader = res.headers.get("content-length");
  if (lenHeader) {
    const n = Number(lenHeader);
    if (Number.isFinite(n) && n > MAX_IMAGE_FETCH_BYTES) {
      throw new Error(`Image too large (${n} bytes)`);
    }
  }

  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length > MAX_IMAGE_FETCH_BYTES) {
    throw new Error(`Image too large (${buf.length} bytes)`);
  }
  if (buf.length === 0) {
    throw new Error("Empty image response");
  }

  let jpeg: Buffer;
  try {
    jpeg = await sharp(buf)
      .rotate()
      .resize({
        width: VISION_MAX_EDGE_PX,
        height: VISION_MAX_EDGE_PX,
        fit: "inside",
        withoutEnlargement: true,
      })
      .jpeg({
        quality: VISION_JPEG_QUALITY,
        mozjpeg: true,
        chromaSubsampling: "4:2:0",
      })
      .toBuffer();
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(`Image normalize failed: ${msg}`);
  }

  return `data:image/jpeg;base64,${jpeg.toString("base64")}`;
}

export async function extractOverlayTextFromImageUrl(params: {
  imageUrl: string;
  model?: string;
}): Promise<string | null> {
  const imageUrl = params.imageUrl.trim();
  if (!/^https?:\/\//i.test(imageUrl)) return null;

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY not configured");

  const dataUrl = await fetchAndNormalizeImageForVision(imageUrl);

  const { default: OpenAI } = await import("openai");
  const openai = new OpenAI({ apiKey });

  const system = [
    "You extract overlay/added text from ad images.",
    "Overlay text means text intentionally placed on top of the creative (headline, offer, CTA, badge, captions, banners).",
    "Do NOT include text that is part of the photographed product/packaging, brand logos, labels on bottles/boxes, model names on the product, UI chrome, or watermarks.",
    "If uncertain whether a word is packaging/logo text, omit it.",
    'Return ONLY valid JSON: {"overlay_text":"..."}',
    "If there is no overlay text, return an empty string for overlay_text.",
  ].join("\n");

  const user = [
    "Extract ONLY the overlay/added text from this ad image.",
    "Exclude any brand/product names that appear on the product image itself (packaging/logo).",
    "Keep original casing where possible. Preserve line breaks when the overlay is clearly multi-line.",
  ].join("\n");

  const completion = await openai.chat.completions.create({
    model: params.model ?? "gpt-4o-mini",
    temperature: 0,
    max_tokens: 280,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: system },
      {
        role: "user",
        content: [
          { type: "text", text: user },
          { type: "image_url", image_url: { url: dataUrl, detail: "low" } },
        ],
      },
    ],
  });

  const content = completion.choices[0]?.message?.content ?? "";
  const parsed = OVERLAY_OCR_RESULT_SCHEMA.parse(parseJsonContent(content));
  const trimmed = trimOverlayText(parsed.overlay_text, 600);
  if (!trimmed) return null;

  // Post-filter: avoid returning lone brand-like tokens when the model mistakenly OCRs packaging/logos.
  if (looksLikeBrandOnly(trimmed)) return null;

  return trimmed;
}
