import type { SupabaseClient } from "@supabase/supabase-js";
import { buildNormalizedAds } from "./normalize";
import {
  analyzeAdIssues,
  detectPrimaryProblem,
  dominantFormat,
  getDiagnosisThresholds,
  getImpactPct,
  getSystemMetrics,
  getTopAdsBySpend,
  segmentPerformance,
} from "./rules";
import {
  fetchConversionActionsForRange,
  fetchCreativesForUser,
  fetchMetricsForRange,
} from "./repository";
import { runAdAhaBatchAI, runSystemDiagnosisAI } from "./ai";
import type { DiagnosisResponse, RulesDiagnosisResult } from "./types";
import { prepareAdAIInputs } from "./prepare_ad_ai_inputs";
import { getMetaToken } from "@/lib/meta/token";
import { fetchAdVideoSignals } from "@/lib/meta/ad-video-signals";
import {
  fetchTranscribableVideoUrlForAd,
  isFfmpegIngestibleVideoUrl,
} from "@/lib/meta/creatives";
import { serverLogger } from "@/lib/logger";
import { backendTranscribe0to5s, isBackendConfigured } from "@/lib/adspy/backend-client";
import { extractOverlayTextFromImageUrl } from "@/lib/ai/overlay-ocr";

const TOP_N = 3;
const SAMPLE_COPY_MAX_LEN = 200;
const TRANSCRIPT_CACHE_TTL_MS = 1000 * 60 * 60 * 24 * 14; // 14 days
const OCR_CACHE_TTL_MS = 1000 * 60 * 60 * 24 * 14; // 14 days
const OCR_MAX_IMAGES_PER_AD = 3;

/** Visible in `next dev` terminal; serverLogger alone often goes to PostHog only. */
function transcriptDevLog(message: string, details?: Record<string, unknown>): void {
  if (process.env.NODE_ENV === "production") return;
  if (details && Object.keys(details).length > 0) {
    console.warn(`[diagnosis:transcript] ${message}`, details);
  } else {
    console.warn(`[diagnosis:transcript] ${message}`);
  }
}

/** Visible in `next dev` terminal; OCR is best-effort and should never block diagnosis. */
function ocrDevLog(message: string, details?: Record<string, unknown>): void {
  if (process.env.NODE_ENV === "production") return;
  if (details && Object.keys(details).length > 0) {
    console.warn(`[diagnosis:ocr] ${message}`, details);
  } else {
    console.warn(`[diagnosis:ocr] ${message}`);
  }
}

/** Visible in `next dev` terminal for final ad-AI payload checks. */
function adAIDevLog(message: string, details?: Record<string, unknown>): void {
  if (process.env.NODE_ENV === "production") return;
  if (details && Object.keys(details).length > 0) {
    console.warn(`[diagnosis:ad-ai] ${message}`, details);
  } else {
    console.warn(`[diagnosis:ad-ai] ${message}`);
  }
}

const transcriptMemoryCache = new Map<
  string,
  { creativeVideoUrl: string; transcript: string; expiresAt: number }
>();
const ocrMemoryCache = new Map<string, { creativeKey: string; ocrText: string; expiresAt: number }>();

function getTranscriptCacheKey(userId: string, adId: string): string {
  return `${userId}:${adId}`;
}

function getOcrCacheKey(userId: string, adId: string): string {
  return `${userId}:${adId}`;
}

function isFreshIso(updatedAtIso: string | null | undefined): boolean {
  if (!updatedAtIso) return false;
  const t = Date.parse(updatedAtIso);
  if (!Number.isFinite(t)) return false;
  return Date.now() - t < TRANSCRIPT_CACHE_TTL_MS;
}

function isFreshOcrIso(updatedAtIso: string | null | undefined): boolean {
  if (!updatedAtIso) return false;
  const t = Date.parse(updatedAtIso);
  if (!Number.isFinite(t)) return false;
  return Date.now() - t < OCR_CACHE_TTL_MS;
}

function resolveImageUrlsForOcr(ad: { image_url: string | null; thumbnail_url: string | null; carousel_urls: string[]; previewUrl?: string; type?: string }): string[] {
  const urls: string[] = [];
  const push = (u: string | null | undefined) => {
    const s = (u ?? "").trim();
    if (!s) return;
    if (!/^https?:\/\//i.test(s)) return;
    urls.push(s);
  };

  if (ad.type === "carousel") {
    for (const u of ad.carousel_urls ?? []) push(u);
  } else {
    push(ad.image_url);
    push(ad.thumbnail_url);
    push(ad.previewUrl);
  }

  // Dedup while preserving order.
  const seen = new Set<string>();
  const uniq: string[] = [];
  for (const u of urls) {
    if (seen.has(u)) continue;
    seen.add(u);
    uniq.push(u);
  }
  return uniq.slice(0, OCR_MAX_IMAGES_PER_AD);
}

function buildCreativeKeyForOcr(ad: { image_url: string | null; thumbnail_url: string | null; carousel_urls: string[] }): string {
  const img = (ad.image_url ?? "").trim();
  const thumb = (ad.thumbnail_url ?? "").trim();
  const carousel = (ad.carousel_urls ?? []).map((u) => String(u ?? "").trim()).filter(Boolean).join("|");
  // Use a deterministic string so we can invalidate when the creative changes.
  return [img, thumb, carousel].join("||");
}

async function getOrCreateOverlayOcrText(params: {
  supabase: SupabaseClient;
  userId: string;
  adId: string;
  creativeKey: string;
  imageUrls: string[];
  /** When true, label results as Slide 1/2/... for multi-image creatives. */
  labelSlides?: boolean;
}): Promise<string | null> {
  const { supabase, userId, adId, creativeKey, imageUrls } = params;
  const stableKey = (creativeKey ?? "").trim();

  if (imageUrls.length === 0) return null;

  // 1) In-memory cache (best-effort, per warm instance)
  const key = getOcrCacheKey(userId, adId);
  const mem = ocrMemoryCache.get(key);
  if (mem && mem.creativeKey === stableKey && mem.expiresAt > Date.now()) {
    const t = mem.ocrText.trim();
    return t.length > 0 ? t : null;
  }

  // 2) Supabase cache (secure via RLS; best-effort)
  try {
    const { data, error } = await supabase
      .from("ad_creative_overlay_text")
      .select("ocr_text, creative_key, updated_at")
      .eq("user_id", userId)
      .eq("ad_id", adId)
      .maybeSingle();
    if (error) {
      serverLogger.warn("OCR cache read failed", {
        ad_id: adId,
        message: error.message,
        code: error.code,
      });
      ocrDevLog("cache read failed", { ad_id: adId, message: error.message, code: error.code });
    } else if (data && isFreshOcrIso(data.updated_at)) {
      const rowKey = (data.creative_key ?? "").trim();
      if (!stableKey || rowKey === stableKey) {
        const cached = String(data.ocr_text ?? "").trim();
        ocrMemoryCache.set(key, {
          creativeKey: stableKey,
          ocrText: cached,
          expiresAt: Date.now() + OCR_CACHE_TTL_MS,
        });
        return cached.length > 0 ? cached : null;
      }
    }
  } catch (e) {
    const err = e instanceof Error ? e.message : String(e);
    serverLogger.warn("OCR cache read exception", { ad_id: adId, error: err });
    ocrDevLog("cache read exception", { ad_id: adId, error: err });
  }

  // 3) Extract via OpenAI Vision (best-effort)
  ocrDevLog("calling OpenAI vision for overlay OCR", {
    ad_id: adId,
    urls: imageUrls.length,
  });

  const pieces: string[] = [];
  for (let i = 0; i < Math.min(imageUrls.length, OCR_MAX_IMAGES_PER_AD); i++) {
    const url = imageUrls[i]!;
    try {
      const text = await extractOverlayTextFromImageUrl({ imageUrl: url });
      if (!text) continue;
      if (params.labelSlides && imageUrls.length > 1) pieces.push(`Slide ${i + 1}: ${text}`);
      else pieces.push(text);
    } catch (e) {
      const err = e instanceof Error ? e.message : String(e);
      serverLogger.warn("OpenAI vision OCR failed for image", { ad_id: adId, error: err });
      ocrDevLog("vision OCR failed for image", { ad_id: adId, error: err });
    }
  }

  const combined = pieces.join("\n").trim();
  ocrMemoryCache.set(key, {
    creativeKey: stableKey,
    ocrText: combined,
    expiresAt: Date.now() + OCR_CACHE_TTL_MS,
  });

  try {
    const { error: upsertError } = await supabase.from("ad_creative_overlay_text").upsert(
      {
        user_id: userId,
        ad_id: adId,
        creative_key: stableKey,
        ocr_text: combined,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,ad_id" }
    );
    if (upsertError) {
      serverLogger.warn("OCR cache upsert failed", { ad_id: adId, message: upsertError.message, code: upsertError.code });
      ocrDevLog("cache upsert failed (OCR still returned to AI)", {
        ad_id: adId,
        message: upsertError.message,
        code: upsertError.code,
      });
    }
  } catch (e) {
    const err = e instanceof Error ? e.message : String(e);
    serverLogger.warn("OCR cache upsert exception", { ad_id: adId, error: err });
    ocrDevLog("cache upsert exception", { ad_id: adId, error: err });
  }

  return combined.length > 0 ? combined : null;
}

async function getOrCreateTranscript0to5s(params: {
  supabase: SupabaseClient;
  userId: string;
  adId: string;
  /** From ad_creatives — used for cache invalidation (may be Facebook embed URL). */
  creativeVideoUrl: string | null;
  /** Direct stream URL for ffmpeg (Meta Graph `source` or other ingestible URL). */
  downloadUrl: string;
}): Promise<string | null> {
  const { supabase, userId, adId, creativeVideoUrl, downloadUrl } = params;
  const stableCreativeKey = (creativeVideoUrl ?? "").trim();

  // 1) In-memory cache (best-effort, per warm instance)
  const key = getTranscriptCacheKey(userId, adId);
  const mem = transcriptMemoryCache.get(key);
  if (
    mem &&
    mem.creativeVideoUrl === stableCreativeKey &&
    mem.expiresAt > Date.now()
  ) {
    return mem.transcript;
  }

  // 2) Supabase cache (secure via RLS; best-effort)
  try {
    const { data, error } = await supabase
      .from("ad_video_transcripts_0_5s")
      .select("transcript_0_5s, video_url, updated_at")
      .eq("user_id", userId)
      .eq("ad_id", adId)
      .maybeSingle();
    if (error) {
      serverLogger.warn("Transcript cache read failed", {
        ad_id: adId,
        message: error.message,
        code: error.code,
      });
      transcriptDevLog("cache read failed", { ad_id: adId, message: error.message, code: error.code });
    } else if (data?.transcript_0_5s && isFreshIso(data.updated_at)) {
      const rowUrl = (data.video_url ?? "").trim();
      if (!stableCreativeKey || rowUrl === stableCreativeKey) {
        transcriptMemoryCache.set(key, {
          creativeVideoUrl: stableCreativeKey,
          transcript: data.transcript_0_5s,
          expiresAt: Date.now() + TRANSCRIPT_CACHE_TTL_MS,
        });
        return data.transcript_0_5s;
      }
    }
  } catch (e) {
    const err = e instanceof Error ? e.message : String(e);
    serverLogger.warn("Transcript cache read exception", {
      ad_id: adId,
      error: err,
    });
    transcriptDevLog("cache read exception", { ad_id: adId, error: err });
  }

  // 3) Transcribe via Fly backend (only if configured)
  if (!isBackendConfigured()) {
    serverLogger.warn(
      "Transcript 0–5s skipped: Fly backend not configured (set ADSPY_BACKEND_URL and ADSPY_BACKEND_SECRET)",
      { ad_id: adId }
    );
    transcriptDevLog(
      "skipped: ADSPY_BACKEND_URL / ADSPY_BACKEND_SECRET not set on Next server",
      { ad_id: adId }
    );
    return null;
  }
  transcriptDevLog("calling transcribe backend", {
    ad_id: adId,
    url_preview:
      downloadUrl.length > 72 ? `${downloadUrl.slice(0, 72)}…` : downloadUrl,
  });
  const t = await backendTranscribe0to5s(downloadUrl);
  const transcript = (t.transcript_0_5s || "").trim();
  if (!transcript) {
    transcriptDevLog("backend returned empty transcript_0_5s", { ad_id: adId });
    return null;
  }
  transcriptDevLog("transcript ok", { ad_id: adId, chars: transcript.length });

  transcriptMemoryCache.set(key, {
    creativeVideoUrl: stableCreativeKey,
    transcript,
    expiresAt: Date.now() + TRANSCRIPT_CACHE_TTL_MS,
  });

  const { error: upsertError } = await supabase.from("ad_video_transcripts_0_5s").upsert(
    {
      user_id: userId,
      ad_id: adId,
      video_url: stableCreativeKey,
      transcript_0_5s: transcript,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id,ad_id" }
  );
  if (upsertError) {
    serverLogger.warn("Transcript cache upsert failed", {
      ad_id: adId,
      message: upsertError.message,
      code: upsertError.code,
    });
    transcriptDevLog("cache upsert failed (transcript still returned to AI)", {
      ad_id: adId,
      message: upsertError.message,
      code: upsertError.code,
    });
  }

  return transcript;
}

async function resolveDownloadUrlForTranscription(
  adId: string,
  creativeVideoUrl: string | null | undefined,
  token: string
): Promise<string | null> {
  const graph = await fetchTranscribableVideoUrlForAd(adId, token);
  if (graph) return graph;
  const stored = (creativeVideoUrl ?? "").trim();
  if (stored && isFfmpegIngestibleVideoUrl(stored)) return stored;
  return null;
}

/** Verbatim copy snippets for system AI — same ads as `topAds` (top spenders). */
function sampleCopyFromTopAds(topAds: RulesDiagnosisResult["topAds"]): string[] {
  return topAds.map((a) => a.copy.slice(0, SAMPLE_COPY_MAX_LEN));
}

export async function computeRulesDiagnosis(
  supabase: SupabaseClient,
  userId: string,
  adAccountId: string,
  from: string,
  to: string
): Promise<RulesDiagnosisResult> {
  const [metricRows, creatives, actions] = await Promise.all([
    fetchMetricsForRange(supabase, userId, adAccountId, from, to),
    fetchCreativesForUser(supabase, userId),
    fetchConversionActionsForRange(supabase, userId, from, to),
  ]);

  const ads = buildNormalizedAds(metricRows, creatives, actions);
  const t = getDiagnosisThresholds();
  const metrics = getSystemMetrics(ads);
  const problem = detectPrimaryProblem(metrics, t);
  const impactPct = getImpactPct(ads, problem, t);
  const segment = segmentPerformance(ads);
  const topAds = getTopAdsBySpend(ads, TOP_N);
  const topAdIssues = topAds.map((ad) => ({
    ad_id: ad.id,
    issues: analyzeAdIssues(ad, t),
  }));

  return {
    problem,
    metrics,
    impactPct,
    segment,
    dominantFormat: dominantFormat(ads),
    ads,
    topAds,
    topAdIssues,
    sampleCopy: sampleCopyFromTopAds(topAds),
  };
}

export async function getDiagnosisRulesOnly(
  supabase: SupabaseClient,
  userId: string,
  adAccountId: string,
  from: string,
  to: string
): Promise<DiagnosisResponse> {
  const rules = await computeRulesDiagnosis(supabase, userId, adAccountId, from, to);
  return { ...rules };
}

export async function getDiagnosisWithAI(
  supabase: SupabaseClient,
  userId: string,
  adAccountId: string,
  from: string,
  to: string
): Promise<DiagnosisResponse> {
  // Backwards compatible: runs both system + ad analysis.
  const rules = await computeRulesDiagnosis(supabase, userId, adAccountId, from, to);
  const [systemResult, adsResult] = await Promise.allSettled([
    (async () => {
      const systemInput = {
        problem: rules.problem,
        metrics: rules.metrics,
        impactPct: rules.impactPct,
        segment: rules.segment,
        dominantFormat: rules.dominantFormat,
        sampleCopy: rules.sampleCopy,
      };
      return runSystemDiagnosisAI(systemInput);
    })(),
    (async () => {
      const topAds = rules.topAds.slice(0, 3);
      const { token } = await getMetaToken(supabase, userId);
      const videoByAdId: Record<string, Awaited<ReturnType<typeof fetchAdVideoSignals>> | null> =
        {};
      const transcript0to5sByAdId: Record<string, string | null> = {};
      const ocrTextByAdId: Record<string, string | null> = {};
      await Promise.all(
        topAds.map(async (ad) => {
          videoByAdId[ad.id] = null;
          transcript0to5sByAdId[ad.id] = null;
          ocrTextByAdId[ad.id] = null;

          if (ad.type === "video") {
            try {
              videoByAdId[ad.id] = await fetchAdVideoSignals({ adId: ad.id, token, from, to });
            } catch {
              videoByAdId[ad.id] = null;
            }

            const downloadUrl = await resolveDownloadUrlForTranscription(ad.id, ad.video_url, token);
            if (!downloadUrl) {
              const skipDetails = {
                ad_id: ad.id,
                has_stored_video_url: Boolean(ad.video_url?.trim()),
                stored_is_embed:
                  Boolean(ad.video_url?.trim()) && !isFfmpegIngestibleVideoUrl(ad.video_url ?? ""),
              };
              serverLogger.warn(
                "Transcript 0–5s skipped: no ffmpeg-ingestible URL (need Meta Graph video source, or a direct CDN URL in ad_creatives)",
                skipDetails
              );
              transcriptDevLog(
                "skipped: no direct video URL (Graph source missing or stored URL is embed only)",
                skipDetails
              );
              transcript0to5sByAdId[ad.id] = null;
            } else {
              try {
                transcript0to5sByAdId[ad.id] = await getOrCreateTranscript0to5s({
                  supabase,
                  userId,
                  adId: ad.id,
                  creativeVideoUrl: ad.video_url ?? null,
                  downloadUrl,
                });
              } catch (e) {
                const err = e instanceof Error ? e.message : String(e);
                serverLogger.warn("Transcript 0–5s failed", {
                  ad_id: ad.id,
                  error: err,
                });
                transcriptDevLog("transcribe failed", { ad_id: ad.id, error: err });
                transcript0to5sByAdId[ad.id] = null;
              }
            }
          }

          // Image-based ads: extract on-image overlay text (best-effort).
          if (ad.type === "image" || ad.type === "carousel") {
            const urls = resolveImageUrlsForOcr(ad);
            const creativeKey = buildCreativeKeyForOcr(ad);
            ocrDevLog("ad eligible for OCR", {
              ad_id: ad.id,
              ad_type: ad.type,
              urls: urls.length,
              has_image_url: Boolean(ad.image_url?.trim()),
              has_thumbnail_url: Boolean(ad.thumbnail_url?.trim()),
              carousel_count: ad.carousel_urls?.length ?? 0,
            });
            if (urls.length === 0) {
              ocrDevLog("OCR skipped: no valid image URLs", {
                ad_id: ad.id,
                ad_type: ad.type,
              });
            }
            try {
              ocrTextByAdId[ad.id] = await getOrCreateOverlayOcrText({
                supabase,
                userId,
                adId: ad.id,
                creativeKey,
                imageUrls: urls,
                labelSlides: ad.type === "carousel",
              });
              ocrDevLog("OCR result ready", {
                ad_id: ad.id,
                chars: (ocrTextByAdId[ad.id] ?? "").length,
                has_text: Boolean((ocrTextByAdId[ad.id] ?? "").trim()),
              });
            } catch (e) {
              const err = e instanceof Error ? e.message : String(e);
              serverLogger.warn("Overlay OCR failed", { ad_id: ad.id, error: err });
              ocrDevLog("overlay OCR failed", { ad_id: ad.id, error: err });
              ocrTextByAdId[ad.id] = null;
            }
          }
        })
      );

      const issuesByAdId: Record<string, string[]> = {};
      for (const row of rules.topAdIssues) issuesByAdId[row.ad_id] = row.issues;

      const adInputs = await prepareAdAIInputs({
        supabase,
        userId,
        adAccountId,
        from,
        to,
        ads: topAds,
        account: { ctr: rules.metrics.avgCtr, cpc: rules.metrics.avgCpc, cvr: rules.metrics.cvr },
        issuesByAdId,
        videoByAdId,
        transcript0to5sByAdId,
        ocrTextByAdId,
        trendDays: 5,
      });
      return runAdAhaBatchAI(adInputs);
    })(),
  ]);

  const system = systemResult.status === "fulfilled" ? systemResult.value : null;
  const ads = adsResult.status === "fulfilled" ? adsResult.value : [];
  const aiError =
    systemResult.status === "rejected"
      ? (systemResult.reason instanceof Error ? systemResult.reason.message : "System AI failed")
      : adsResult.status === "rejected"
        ? (adsResult.reason instanceof Error ? adsResult.reason.message : "Ad AI failed")
        : undefined;

  return {
    ...rules,
    ai: { system, ads },
    ...(aiError ? { aiError } : {}),
  };
}

export async function getDiagnosisWithSystemAI(
  supabase: SupabaseClient,
  userId: string,
  adAccountId: string,
  from: string,
  to: string
): Promise<DiagnosisResponse> {
  const rules = await computeRulesDiagnosis(supabase, userId, adAccountId, from, to);
  try {
    const systemInput = {
      problem: rules.problem,
      metrics: rules.metrics,
      impactPct: rules.impactPct,
      segment: rules.segment,
      dominantFormat: rules.dominantFormat,
      sampleCopy: rules.sampleCopy,
    };
    const system = await runSystemDiagnosisAI(systemInput);
    return { ...rules, ai: { system, ads: [] } };
  } catch (e) {
    const message = e instanceof Error ? e.message : "AI analysis failed";
    return { ...rules, ai: { system: null, ads: [] }, aiError: message };
  }
}

export async function getDiagnosisWithAdsAI(
  supabase: SupabaseClient,
  userId: string,
  adAccountId: string,
  from: string,
  to: string
): Promise<DiagnosisResponse> {
  const rules = await computeRulesDiagnosis(supabase, userId, adAccountId, from, to);

  try {
    const topAds = rules.topAds.slice(0, 3);
    const { token } = await getMetaToken(supabase, userId);
    const videoByAdId: Record<string, Awaited<ReturnType<typeof fetchAdVideoSignals>> | null> = {};
    const transcript0to5sByAdId: Record<string, string | null> = {};
    const ocrTextByAdId: Record<string, string | null> = {};

    await Promise.all(
      topAds.map(async (ad) => {
        videoByAdId[ad.id] = null;
        transcript0to5sByAdId[ad.id] = null;
        ocrTextByAdId[ad.id] = null;

        if (ad.type === "video") {
          try {
            videoByAdId[ad.id] = await fetchAdVideoSignals({ adId: ad.id, token, from, to });
          } catch {
            videoByAdId[ad.id] = null;
          }

          const downloadUrl = await resolveDownloadUrlForTranscription(ad.id, ad.video_url, token);
          if (!downloadUrl) {
            const skipDetails = {
              ad_id: ad.id,
              has_stored_video_url: Boolean(ad.video_url?.trim()),
              stored_is_embed:
                Boolean(ad.video_url?.trim()) && !isFfmpegIngestibleVideoUrl(ad.video_url ?? ""),
            };
            serverLogger.warn(
              "Transcript 0–5s skipped: no ffmpeg-ingestible URL (need Meta Graph video source, or a direct CDN URL in ad_creatives)",
              skipDetails
            );
            transcriptDevLog(
              "skipped: no direct video URL (Graph source missing or stored URL is embed only)",
              skipDetails
            );
            transcript0to5sByAdId[ad.id] = null;
          } else {
            try {
              transcript0to5sByAdId[ad.id] = await getOrCreateTranscript0to5s({
                supabase,
                userId,
                adId: ad.id,
                creativeVideoUrl: ad.video_url ?? null,
                downloadUrl,
              });
            } catch (e) {
              const err = e instanceof Error ? e.message : String(e);
              serverLogger.warn("Transcript 0–5s failed", {
                ad_id: ad.id,
                error: err,
              });
              transcriptDevLog("transcribe failed", { ad_id: ad.id, error: err });
              transcript0to5sByAdId[ad.id] = null;
            }
          }
        }

        if (ad.type === "image" || ad.type === "carousel") {
          const urls = resolveImageUrlsForOcr(ad);
          const creativeKey = buildCreativeKeyForOcr(ad);
          ocrDevLog("ad eligible for OCR", {
            ad_id: ad.id,
            ad_type: ad.type,
            urls: urls.length,
            has_image_url: Boolean(ad.image_url?.trim()),
            has_thumbnail_url: Boolean(ad.thumbnail_url?.trim()),
            carousel_count: ad.carousel_urls?.length ?? 0,
          });
          if (urls.length === 0) {
            ocrDevLog("OCR skipped: no valid image URLs", {
              ad_id: ad.id,
              ad_type: ad.type,
            });
          }
          try {
            ocrTextByAdId[ad.id] = await getOrCreateOverlayOcrText({
              supabase,
              userId,
              adId: ad.id,
              creativeKey,
              imageUrls: urls,
              labelSlides: ad.type === "carousel",
            });
            ocrDevLog("OCR result ready", {
              ad_id: ad.id,
              chars: (ocrTextByAdId[ad.id] ?? "").length,
              has_text: Boolean((ocrTextByAdId[ad.id] ?? "").trim()),
            });
          } catch (e) {
            const err = e instanceof Error ? e.message : String(e);
            serverLogger.warn("Overlay OCR failed", { ad_id: ad.id, error: err });
            ocrDevLog("overlay OCR failed", { ad_id: ad.id, error: err });
            ocrTextByAdId[ad.id] = null;
          }
        }
      })
    );

    const issuesByAdId: Record<string, string[]> = {};
    for (const row of rules.topAdIssues) issuesByAdId[row.ad_id] = row.issues;

    const adInputs = await prepareAdAIInputs({
      supabase,
      userId,
      adAccountId,
      from,
      to,
      ads: topAds,
      account: { ctr: rules.metrics.avgCtr, cpc: rules.metrics.avgCpc, cvr: rules.metrics.cvr },
      issuesByAdId,
      videoByAdId,
      transcript0to5sByAdId,
      ocrTextByAdId,
      trendDays: 5,
    });

    // Debug telemetry: confirms which creative fields are present in DB for ad-level AI.
    for (const input of adInputs.slice(0, 3)) {
      const body = input.creative.body ?? "";
      const logPayload = {
        ad_id: input.ad_id,
        date_from: from,
        date_to: to,
        format: input.format,
        ctr: Number(input.performance.ctr.toFixed(4)),
        cpc: Number(input.performance.cpc.toFixed(4)),
        clicks: input.performance.clicks,
        impressions: input.performance.impressions,
        spend: Number(input.performance.spend.toFixed(4)),
        body_len: body.length,
        body_present: body.trim().length > 0,
        link_present: (input.creative.link_url ?? "").trim().length > 0,
        ocr_text_len: (input.creative.ocr_text ?? "").trim().length,
        transcript_len: (input.video?.transcript_0_5s ?? "").trim().length,
      };
      serverLogger.info("Diagnosis ad AI input prepared", {
        ...logPayload,
      });
      adAIDevLog("input prepared", logPayload);
    }

    const ads = await runAdAhaBatchAI(adInputs);
    return { ...rules, ai: { system: null, ads } };
  } catch (e) {
    const message = e instanceof Error ? e.message : "AI analysis failed";
    return { ...rules, ai: { system: null, ads: [] }, aiError: message };
  }
}
