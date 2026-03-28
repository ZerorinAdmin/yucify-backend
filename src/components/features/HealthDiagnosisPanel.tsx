"use client";

import { useCallback, useEffect, useState, type KeyboardEvent } from "react";
import Image from "next/image";
import { AlertCircle, ArrowRight, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AdDetailPanel, type AdDiagnosisAhaInput } from "@/components/features/AdDetailPanel";
import type { AdMetricsDailyRow, AdSummary } from "@/lib/meta/ad-summary";

type DiagnosisProblemId = "LOW_CTR" | "LOW_CVR" | "HIGH_CPC" | "HEALTHY";
type AdIssueId = "LOW_CTR" | "HIGH_CPC" | "NO_CONVERSIONS";

type DiagnosisPayload = {
  problem: DiagnosisProblemId;
  metrics: {
    totalSpend: number;
    totalImpressions: number;
    avgCtr: number;
    avgCpc: number;
    avgFrequency: number;
    totalClicks: number;
    totalConversions: number;
    cvr: number;
  };
  impactPct: number;
  segment: {
    videoCtr: number | null;
    imageCtr: number | null;
    videoSpend: number;
    imageSpend: number;
  };
  dominantFormat: "video" | "image" | "mixed";
  topAds: {
    id: string;
    name: string;
    spend: number;
    ctr: number;
    cpc: number;
    type: string;
    previewUrl?: string;
  }[];
  topAdIssues: { ad_id: string; issues: AdIssueId[] }[];
	  ai?: {
	    system: {
	      main_issue: string;
	      impact_summary: string;
	      source: string;
	      why: string[];
	      actions: string[];
	    } | null;
	    ads: (AdDiagnosisAhaInput | null)[];
	  };
	  aiError?: string;
	};

/** API includes this for cache keying; stripped before storing in React state. */
type DiagnosisApiPayload = DiagnosisPayload & { ad_account_id?: string };

type HealthStatusApi = "HEALTHY" | "DECLINING" | "FATIGUED";

type TopAdRow = DiagnosisPayload["topAds"][number];

const DIAGNOSIS_AI_CACHE_KEY = "repto.diagnosisAi.v3";

type DiagnosisAiCache = {
  from: string;
  to: string;
  adAccountId: string;
  ai: NonNullable<DiagnosisPayload["ai"]>;
  aiError?: string;
};

function readDiagnosisAiCache(): DiagnosisAiCache | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(DIAGNOSIS_AI_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as DiagnosisAiCache;
    if (
      typeof parsed?.from !== "string" ||
      typeof parsed?.to !== "string" ||
      typeof parsed?.adAccountId !== "string" ||
      !parsed?.ai ||
      typeof parsed.ai !== "object"
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function writeDiagnosisAiCache(entry: DiagnosisAiCache): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(DIAGNOSIS_AI_CACHE_KEY, JSON.stringify(entry));
  } catch {
    // private mode / quota
  }
}

function toPanelData(raw: DiagnosisApiPayload): DiagnosisPayload {
  const { ad_account_id: _a, ...rest } = raw;
  return rest;
}

function mergeCachedAi(raw: DiagnosisApiPayload, from: string, to: string): DiagnosisPayload {
  const base = toPanelData(raw);
  const adAccountId = raw.ad_account_id;
  if (!adAccountId) return base;

  const cached = readDiagnosisAiCache();
  if (
    !cached ||
    cached.from !== from ||
    cached.to !== to ||
    cached.adAccountId !== adAccountId ||
    (!cached.ai?.system && (!cached.ai?.ads || cached.ai.ads.length === 0))
  ) {
    return base;
  }

  return {
    ...base,
    ai: cached.ai,
    aiError: cached.aiError,
  };
}

function formatMoney(n: number): string {
  if (n >= 1000) return `₹${(n / 1000).toFixed(2)}K`;
  return `₹${n.toFixed(2)}`;
}

function issuesForAd(payload: DiagnosisPayload, adId: string): AdIssueId[] {
  return payload.topAdIssues.find((x) => x.ad_id === adId)?.issues ?? [];
}

function splitParagraphs(text: string): string[] {
  return text
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);
}

function parseActionLine(line: string): { label: string; text: string } {
  const idx = line.indexOf(":");
  if (idx === -1) return { label: "Action", text: line.trim() };
  return {
    label: line.slice(0, idx).trim(),
    text: line.slice(idx + 1).trim(),
  };
}

export function HealthDiagnosisPanel({
  initialFrom,
  initialTo,
  ads,
  metrics,
}: {
  initialFrom: string;
  initialTo: string;
  ads: AdSummary[];
  metrics: AdMetricsDailyRow[];
}) {
  const [data, setData] = useState<DiagnosisPayload | null>(null);
  const [detailAd, setDetailAd] = useState<AdSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [aiVerdictLoading, setAiVerdictLoading] = useState(false);
  const [aiAdsLoading, setAiAdsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [healthCounts, setHealthCounts] = useState({
    healthy: 0,
    declining: 0,
    fatigued: 0,
  });
  const [healthLoading, setHealthLoading] = useState(true);

  const qs = useCallback(
    () =>
      new URLSearchParams({
        from: initialFrom,
        to: initialTo,
      }).toString(),
    [initialFrom, initialTo]
  );

  const loadHealthCounts = useCallback(async () => {
    setHealthLoading(true);
    try {
      const res = await fetch("/api/meta/health");
      const json = (await res.json()) as { results?: { status: HealthStatusApi }[]; error?: string };
      if (!res.ok) return;
      const results = json.results ?? [];
      let healthy = 0;
      let declining = 0;
      let fatigued = 0;
      for (const r of results) {
        if (r.status === "HEALTHY") healthy += 1;
        else if (r.status === "DECLINING") declining += 1;
        else if (r.status === "FATIGUED") fatigued += 1;
      }
      setHealthCounts({ healthy, declining, fatigued });
    } finally {
      setHealthLoading(false);
    }
  }, []);

  const loadRules = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/meta/diagnosis?${qs()}`);
      const json = await res.json();
      if (!res.ok) {
        setError(typeof json.error === "string" ? json.error : "Could not load diagnosis");
        setData(null);
        return;
      }
      setData(mergeCachedAi(json as DiagnosisApiPayload, initialFrom, initialTo));
    } catch {
      setError("Network error");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [qs, initialFrom, initialTo]);

  useEffect(() => {
    loadRules();
  }, [loadRules]);

  useEffect(() => {
    void loadHealthCounts();
  }, [loadHealthCounts]);

  const refreshVerdict = async () => {
    setAiVerdictLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/meta/diagnosis/analyze?${qs()}`, { method: "POST" });
      const json = await res.json() as DiagnosisApiPayload & { error?: string };
      if (res.status === 429) {
        setError(json.error ?? "AI limit reached for today");
        return;
      }
      if (!res.ok) {
        setError(typeof json.error === "string" ? json.error : "AI analysis failed");
        return;
      }
      const raw = json as DiagnosisApiPayload;
      setData((prev) => {
        const prevAi = prev?.ai ?? readDiagnosisAiCache()?.ai ?? { system: null, ads: [] };
        const nextAi = {
          system: raw.ai?.system ?? null,
          ads: prevAi.ads ?? [],
        };
        if (raw.ad_account_id && (nextAi.system || (nextAi.ads?.length ?? 0) > 0)) {
          writeDiagnosisAiCache({
            from: initialFrom,
            to: initialTo,
            adAccountId: raw.ad_account_id,
            ai: nextAi,
            ...(raw.aiError !== undefined ? { aiError: raw.aiError } : {}),
          });
        }
        return {
          ...toPanelData(raw),
          ai: nextAi,
          ...(raw.aiError !== undefined ? { aiError: raw.aiError } : {}),
        };
      });
    } catch {
      setError("Network error");
    } finally {
      setAiVerdictLoading(false);
    }
  };

  const diagnoseAds = async () => {
    setAiAdsLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/meta/diagnosis/analyze-ads?${qs()}`, { method: "POST" });
      const json = (await res.json()) as DiagnosisApiPayload & { error?: string };
      if (res.status === 429) {
        setError(json.error ?? "AI limit reached for today");
        return;
      }
      if (!res.ok) {
        setError(typeof json.error === "string" ? json.error : "AI analysis failed");
        return;
      }
      const raw = json as DiagnosisApiPayload;
      setData((prev) => {
        const prevAi = prev?.ai ?? readDiagnosisAiCache()?.ai ?? { system: null, ads: [] };
        const nextAi = {
          system: prevAi.system ?? null,
          ads: raw.ai?.ads ?? [],
        };
        if (raw.ad_account_id && (nextAi.system || (nextAi.ads?.length ?? 0) > 0)) {
          writeDiagnosisAiCache({
            from: initialFrom,
            to: initialTo,
            adAccountId: raw.ad_account_id,
            ai: nextAi,
            ...(raw.aiError !== undefined ? { aiError: raw.aiError } : {}),
          });
        }
        return {
          ...toPanelData(raw),
          ai: nextAi,
          ...(raw.aiError !== undefined ? { aiError: raw.aiError } : {}),
        };
      });
    } catch {
      setError("Network error");
    } finally {
      setAiAdsLoading(false);
    }
  };

  if (loading && !data) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Account diagnosis</CardTitle>
          <CardDescription>Loading metrics for the selected range…</CardDescription>
        </CardHeader>
        <CardContent className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span className="text-sm">Analyzing</span>
        </CardContent>
      </Card>
    );
  }

  if (error && !data) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>Error</AlertTitle>
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    );
  }

  if (!data) return null;

  /** Top spenders whose metrics + copy snippets are sent to account-level AI (same order as backend `topAds`). */
  const aiContextAds = data.topAds.slice(0, 3);
  const noAds = aiContextAds.length === 0 && data.metrics.totalSpend === 0;
  const hasSystemAI = Boolean(data.ai?.system);
  const sys = data.ai?.system ?? null;
  const summaryParagraphs = sys ? splitParagraphs(sys.impact_summary) : [];
  const actions = sys ? sys.actions.map(parseActionLine) : [];
  const actionMap = new Map(actions.map((a) => [a.label.toLowerCase(), a.text]));

  const diagnosisText = summaryParagraphs[0] ?? "";
  const notText = summaryParagraphs[1] ?? "";
  const changeText = summaryParagraphs[2] ?? "";

  const bottleneckText = pickAction(actionMap, "bottleneck detection");
  const wasteText = pickAction(actionMap, "budget waste detection");
  const efficiencyText = pickAction(actionMap, "efficiency insight");

  const glassShadow = "0 18px 18px 0 rgba(119, 111, 221, 0.34)";
  const glassCardClass =
    "rounded-2xl border border-white/40 bg-white/[0.22] p-5 shadow-none backdrop-blur-[64px] dark:border-white/40 dark:bg-white/[0.08]";

  return (
    <div className="space-y-4">
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {noAds ? (
        <Card>
          <CardContent className="p-6">
            <p className="text-sm text-muted-foreground">
              No spend in this range. Sync metrics for these dates or widen the range.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
          {/* Left: AI analysis — glass cards over heart */}
          <div className="relative min-h-[min(820px,85vh)] overflow-visible rounded-3xl bg-transparent">
            <Image
              src="/big-heart.png"
              alt=""
              width={480}
              height={480}
              className="pointer-events-none absolute left-1/2 top-[60%] z-0 w-[min(100%,19rem)] max-w-none -translate-x-1/2 -translate-y-1/2 object-contain opacity-90 select-none sm:w-[min(95%,22rem)] lg:w-[min(92%,25rem)]"
              priority={false}
            />

            <div className="relative z-[1] space-y-4 p-5 sm:p-6">
              <div
                className="rounded-2xl bg-blue-600 px-6 py-5 text-white"
                style={{ boxShadow: glassShadow }}
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-3">
                      <CardTitleDot variant="onBlue" />
                      <p className="text-xs font-semibold uppercase tracking-wide text-white/80">
                        Overall verdict
                      </p>
                    </div>
                    <p className="mt-2 text-lg font-semibold leading-snug text-white">
                      {sys?.main_issue ??
                        "Use Refresh Verdict to generate an account-level analysis from your current metrics."}
                    </p>
                  </div>
                </div>
              </div>

              {data.aiError && !hasSystemAI && (
                <Alert>
                  <AlertDescription>AI unavailable: {data.aiError}</AlertDescription>
                </Alert>
              )}
              {data.aiError && hasSystemAI && (data.ai?.ads?.length ?? 0) === 0 && (
                <Alert>
                  <AlertDescription>Ad analysis unavailable: {data.aiError}</AlertDescription>
                </Alert>
              )}

              <div className="grid grid-cols-1 items-start gap-4 pt-8 sm:grid-cols-2 sm:gap-x-8 sm:gap-y-6 sm:pt-10 md:gap-x-10 md:gap-y-8 md:pt-12">
                <div className="relative z-[2] justify-self-start sm:translate-x-2 sm:-translate-y-1 md:translate-x-3 md:-translate-y-2">
                  <InfoTile title="Diagnosis" body={diagnosisText} />
                </div>
                <div className="relative z-[1] justify-self-end sm:-translate-x-5 sm:-translate-y-1 md:-translate-x-10 md:-translate-y-2">
                  <InfoTile title="What it’s not" body={notText} />
                </div>
                <div className="relative z-[2] justify-self-start sm:-translate-y-2 sm:-translate-x-5 md:-translate-y-3 md:-translate-x-8">
                  <InfoTile title="What to change" body={changeText} />
                </div>
                <div className="relative z-[1] justify-self-end sm:translate-y-3 md:translate-y-5">
                  <InfoTile title="Bottleneck detection" body={bottleneckText} />
                </div>
                <div className="relative z-[2] justify-self-start sm:translate-x-2 sm:-translate-y-3 md:translate-x-3 md:-translate-y-2">
                  <InfoTile title="Budget waste detection" body={wasteText} />
                </div>
                <div className="relative z-[1] justify-self-end sm:-translate-x-6 sm:-translate-y-2 md:-translate-x-12 md:-translate-y-1">
                  <InfoTile title="Efficiency insight" body={efficiencyText} />
                </div>
              </div>
            </div>
          </div>

          {/* Right: Top ads included in AI account diagnosis */}
          <div className="space-y-3">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h3 className="text-lg font-semibold">Affected Ads</h3>
                <p className="text-xs text-muted-foreground">
                  Top 3 ads by spend and most affected ads.
                </p>
              </div>
              <div className="flex shrink-0 flex-wrap gap-2 sm:justify-end">
                <Button
                  size="sm"
                  className="rounded-full"
                  onClick={refreshVerdict}
                  disabled={aiVerdictLoading || noAds}
                >
                  {aiVerdictLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Refresh Verdict"}
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  className="rounded-full"
                  onClick={diagnoseAds}
                  disabled={aiAdsLoading || noAds}
                >
                  {aiAdsLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Diagnose Ads"}
                </Button>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 sm:gap-4">
              {[0, 1, 2].map((slot) => (
                <AffectedAdGridCard
                  key={aiContextAds[slot]?.id ?? `empty-${slot}`}
                  ad={aiContextAds[slot] ?? null}
                  data={data}
                  ads={ads}
                  onOpenDetail={setDetailAd}
                />
              ))}
              <AdsHealthSummaryCard
                healthy={healthCounts.healthy}
                fatigued={healthCounts.fatigued}
                declining={healthCounts.declining}
                loading={healthLoading}
              />
            </div>
          </div>
        </div>
      )}

      <AdDetailPanel
        ad={detailAd}
        metrics={metrics}
        dateFrom={initialFrom}
        dateTo={initialTo}
        open={detailAd !== null}
        onClose={() => setDetailAd(null)}
        variant="diagnosis"
        aha={detailAd ? (data.ai?.ads?.find((x) => x?.ad_id === detailAd.ad_id) ?? null) : null}
        ahaError={detailAd && (data.ai?.ads?.length ?? 0) === 0 ? (data.aiError ?? null) : null}
      />
    </div>
  );
}

function AffectedAdGridCard({
  ad,
  data,
  ads,
  onOpenDetail,
}: {
  ad: TopAdRow | null;
  data: DiagnosisPayload;
  ads: AdSummary[];
  onOpenDetail: (ad: AdSummary) => void;
}) {
  if (!ad) {
    return (
      <div className="flex h-[348px] flex-col items-center justify-center rounded-2xl border border-dashed border-muted-foreground/20 bg-muted/15 p-4 text-center text-xs text-muted-foreground">
        No top ad in this slot
      </div>
    );
  }

  const issues = issuesForAd(data, ad.id);

  const openDetail = () => {
    const row = ads.find((a) => a.ad_id === ad.id);
    if (row) onOpenDetail(row);
  };

  const onKeyCard = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      openDetail();
    }
  };

  return (
    <div
      role="button"
      tabIndex={0}
      className="relative h-[348px] cursor-pointer overflow-hidden rounded-2xl border bg-card shadow-none transition-shadow duration-200 hover:shadow-[0_34px_34px_rgba(119,111,221,0.08)]"
      onClick={openDetail}
      onKeyDown={onKeyCard}
      aria-label={`Open details for ${ad.name}`}
    >
      {ad.previewUrl ? (
        <img src={ad.previewUrl} alt="" className="absolute inset-0 h-full w-full object-cover" />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center bg-muted">
          <span className="text-xl font-semibold text-muted-foreground">{initials(ad.name)}</span>
        </div>
      )}

      <div className="absolute right-2 top-2 z-[1] flex max-w-[85%] flex-wrap justify-end gap-1">
        {issues.length === 0 ? (
          <Badge variant="secondary" className="text-[10px] font-semibold uppercase shadow-none">
            OK
          </Badge>
        ) : (
          issues.map((iss) => (
            <Badge key={iss} variant="secondary" className="text-[10px] font-semibold uppercase shadow-none">
              {iss.replace(/_/g, " ")}
            </Badge>
          ))
        )}
      </div>

      <div className="absolute inset-x-0 bottom-12 z-[1] bg-gradient-to-t from-black/45 to-transparent px-3 pb-1 pt-6">
        <p className="truncate text-sm font-semibold text-white drop-shadow-sm">{ad.name}</p>
        <p className="text-xs text-white/90 drop-shadow-sm">Spend {formatMoney(ad.spend)}</p>
      </div>

      <div
        className="pointer-events-none absolute bottom-0 left-0 right-0 z-[2] flex items-center justify-between bg-white/[0.24] px-3 py-3 text-left text-sm text-neutral-900 backdrop-blur-[24px]"
        aria-hidden
      >
        Read diagnosis
        <ArrowRight className="h-4 w-4 shrink-0 opacity-70" aria-hidden />
      </div>
    </div>
  );
}

function AdsHealthSummaryCard({
  healthy,
  fatigued,
  declining,
  loading,
}: {
  healthy: number;
  fatigued: number;
  declining: number;
  loading: boolean;
}) {
  return (
    <div className="relative flex h-[348px] flex-col overflow-hidden rounded-2xl bg-blue-600 p-5 text-white shadow-lg shadow-blue-600/20">
      <p className="text-xs font-semibold uppercase tracking-wide text-white/80">Ads health</p>
      <div className="relative z-[1] mt-5 flex flex-col gap-2 pl-4">
        {loading ? (
          <Loader2 className="h-8 w-8 animate-spin text-white/80" />
        ) : (
          <>
            <div className="flex items-baseline gap-2">
              <span className="text-6xl font-medium tabular-nums leading-none tracking-tight">{healthy}</span>
              <span className="text-base font-medium text-white/70">Healthy</span>
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-6xl font-medium tabular-nums leading-none tracking-tight">{fatigued}</span>
              <span className="text-base font-medium text-white/70">Fatigued</span>
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-6xl font-medium tabular-nums leading-none tracking-tight">{declining}</span>
              <span className="text-base font-medium text-white/70">Declining</span>
            </div>
          </>
        )}
      </div>
      <Image
        src="/small-heart.png"
        alt=""
        width={280}
        height={308}
        className="pointer-events-none absolute bottom-1 right-0 w-[min(72%,13.5rem)] max-w-[220px] object-contain drop-shadow-md sm:max-w-[240px]"
      />
    </div>
  );
}

/** White disc + purple center dot (matches diagnosis UI reference). */
function CardTitleDot({ variant = "glass" }: { variant?: "glass" | "onBlue" }) {
  return (
    <span
      className={cn(
        "inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full",
        variant === "onBlue"
          ? "bg-white"
          : "bg-white/95 shadow-sm ring-1 ring-white/60 dark:bg-white/90 dark:ring-white/25"
      )}
      aria-hidden
    >
      <span className="h-2.5 w-2.5 rounded-full bg-violet-500 dark:bg-violet-400" />
    </span>
  );
}

function InfoTile({
  title,
  body,
}: {
  title: string;
  body: string;
}) {
  const baseGlass =
    "w-full max-w-none rounded-2xl border border-white/40 bg-white/[0.45] p-5 shadow-none backdrop-blur-[64px] dark:border-white/40 dark:bg-white/[0.08] sm:max-w-[16.75rem] md:max-w-[17.25rem] lg:max-w-[17.75rem]";

  return (
    <div className={baseGlass}>
      <div className="flex items-center gap-2">
        <CardTitleDot variant="glass" />
        <p className="text-xs font-semibold uppercase tracking-wide text-violet-700 dark:text-violet-300">
          {title}
        </p>
      </div>
      <p className="mt-3 text-sm leading-relaxed text-slate-800 dark:text-slate-200">
        {body || "Use Refresh Verdict to populate this section."}
      </p>
    </div>
  );
}

function pickAction(map: Map<string, string>, label: string): string {
  for (const [k, v] of map) {
    if (k.startsWith(label)) return v;
  }
  return "";
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const first = parts[0]?.[0] ?? "A";
  const second = parts.length > 1 ? parts[1]?.[0] : parts[0]?.[1];
  return `${first}${second ?? ""}`.toUpperCase();
}
