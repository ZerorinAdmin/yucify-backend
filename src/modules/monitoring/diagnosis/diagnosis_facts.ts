import type { AdAIInput, AdVideoSignals } from "./ad_ai_payload";

export type PrimaryConstraintHint = "CTR" | "CPC" | "CVR" | "HOOK" | "MIXED";

function metaVideoEngagementSummary(video: AdVideoSignals): string | null {
  const parts: string[] = [];
  if (video.hook_rate != null && Number.isFinite(video.hook_rate)) {
    parts.push(`hook_rate ${video.hook_rate}% (3s video views / impressions)`);
  }
  if (video.hold_rate != null && Number.isFinite(video.hold_rate)) {
    parts.push(`hold_rate ${video.hold_rate}% (ThruPlay / 3s views)`);
  }
  if (video.avg_time_seconds != null && video.avg_time_seconds > 0) {
    parts.push(`avg_watch_time ~${Math.round(video.avg_time_seconds)}s`);
  }
  if (video.impressions != null && video.impressions > 0) {
    parts.push(`impressions ${video.impressions}`);
  }
  const plays = video.plays ?? null;
  if (plays != null && plays > 0) {
    parts.push(`video_plays ${plays}`);
    const pct = (n: number | null) => (n == null ? null : Math.round((n / plays) * 100));
    const p25 = pct(video.p25);
    const p50 = pct(video.p50);
    const p75 = pct(video.p75);
    const p100 = pct(video.p100);
    const seg: string[] = [];
    if (p25 != null) seg.push(`25%:${p25}%`);
    if (p50 != null) seg.push(`50%:${p50}%`);
    if (p75 != null) seg.push(`75%:${p75}%`);
    if (p100 != null) seg.push(`100%:${p100}%`);
    if (seg.length) parts.push(`retention_of_viewers ${seg.join(", ")}`);
  }
  if (parts.length === 0) return null;
  return parts.join(" | ");
}

/** Deterministic facts injected into the ad-AI prompt; model must not contradict these numbers. */
export type AdDiagnosisFacts = {
  ctr_pct_vs_account: number | null;
  cpc_pct_vs_account: number | null;
  cvr_pct_vs_account: number | null;
  rule_flags: string[];
  primary_constraint_hint: PrimaryConstraintHint;
  /** Configured per-ad CTR bar (same env as rules); use for “industry standard (X%)” copy in prompts. */
  industry_standard_ctr_pct: number;
  /** True when video signals show a strong hook/early-retention weakness (hook rate, watch time, or p25 cliff). */
  severe_video_hook_weakness: boolean;
  retention_summary: string | null;
  /** Plain-language rollup of Meta video metrics for the model (hook/hold/watch/retention). */
  meta_video_engagement_summary: string | null;
  transcript_0_5s_available: boolean;
};

function safeRatio(a: number, b: number): number | null {
  if (!Number.isFinite(a) || !Number.isFinite(b) || b === 0) return null;
  return Math.round((a / b) * 1000) / 1000;
}

function industryStandardCtrPct(): number {
  return parseFloat(process.env.HEALTH_DIAG_AD_CTR_THRESHOLD ?? "2");
}

/** Below this hook_rate % (3s views / impressions), treat as severe hook weakness when other signals agree. */
function videoHookWeakBelowPct(): number {
  return parseFloat(process.env.HEALTH_DIAG_VIDEO_HOOK_WEAK_BELOW_PCT ?? "12");
}

function isSevereVideoHookCreativeWeakness(video: AdVideoSignals | null | undefined): boolean {
  if (!video) return false;
  const hookWeakBelow = videoHookWeakBelowPct();
  const hook = video.hook_rate;
  if (hook != null && Number.isFinite(hook) && hook < hookWeakBelow) return true;
  const wt = video.avg_time_seconds ?? null;
  if (wt != null && wt > 0 && wt < 3) return true;
  const plays = video.plays ?? null;
  if (plays != null && plays > 0 && video.p25 != null) {
    const p25pct = Math.round((video.p25 / plays) * 100);
    if (p25pct < 30) return true;
  }
  return false;
}

function dropPointLabel(video: {
  plays: number | null;
  p25: number | null;
  p50: number | null;
  p75: number | null;
  p100: number | null;
} | null): string {
  const plays = video?.plays ?? null;
  if (!plays || plays <= 0) return "insufficient play data";
  const p = (x: number | null) => (x == null ? null : Math.round((x / plays) * 100));
  const p25 = p(video?.p25 ?? null);
  const p50 = p(video?.p50 ?? null);
  const p75 = p(video?.p75 ?? null);
  if (p25 != null && p25 < 30) return "drops before 25% (hook not landing)";
  if (p50 != null && p50 < 20) return "drops before 50% (message unclear)";
  if (p75 != null && p75 < 10) return "drops before 75% (weak mid-section)";
  return "holds through the first half";
}

function trimTranscript(text: string | null | undefined, maxChars = 240): string | null {
  const cleaned = String(text ?? "").replace(/\s+/g, " ").trim();
  if (!cleaned) return null;
  if (cleaned.length <= maxChars) return cleaned;
  return `${cleaned.slice(0, Math.max(0, maxChars - 1)).trimEnd()}…`;
}

export function computeAdDiagnosisFacts(input: AdAIInput): AdDiagnosisFacts {
  const p = input.performance;
  const a = input.account;
  const ctrR = safeRatio(p.ctr, a.ctr);
  const cpcR = safeRatio(p.cpc, a.cpc);
  const cvrR = p.cvr == null ? null : safeRatio(p.cvr, a.cvr);

  const pctDelta = (r: number | null) =>
    r == null || !Number.isFinite(r) ? null : Math.round((r - 1) * 1000) / 10;

  const issues = input.rule_issues ?? [];
  const severeVideoHook =
    input.format === "video" && isSevereVideoHookCreativeWeakness(input.video);

  let primary: PrimaryConstraintHint = "MIXED";
  if (issues.includes("HIGH_CPC")) primary = "CPC";
  else if (issues.includes("NO_CONVERSIONS")) primary = "CVR";
  else if (severeVideoHook) primary = "HOOK";
  else if (issues.includes("LOW_CTR")) primary = "CTR";
  else if (input.format === "video" && input.video) {
    const dp = dropPointLabel(input.video);
    if (dp.includes("drops before") && dp.includes("25%")) primary = "HOOK";
    else if ((input.video.avg_time_seconds ?? 0) > 0 && (input.video.avg_time_seconds ?? 0) < 3) {
      primary = "HOOK";
    }
  }

  const v = input.format === "video" ? input.video : null;

  return {
    ctr_pct_vs_account: pctDelta(ctrR),
    cpc_pct_vs_account: pctDelta(cpcR),
    cvr_pct_vs_account: pctDelta(cvrR),
    rule_flags: [...issues],
    primary_constraint_hint: primary,
    industry_standard_ctr_pct: industryStandardCtrPct(),
    severe_video_hook_weakness: severeVideoHook,
    retention_summary: v ? dropPointLabel(v) : null,
    meta_video_engagement_summary: v ? metaVideoEngagementSummary(v) : null,
    transcript_0_5s_available: Boolean(trimTranscript(input.video?.transcript_0_5s, 240)),
  };
}

/** Spend-ranked peers in this batch (deterministic). Excludes `forAdId`. */
export function buildBatchPeerLines(all: AdAIInput[], forAdId: string): string[] {
  const sorted = [...all].sort((a, b) => b.performance.spend - a.performance.spend);
  return sorted
    .filter((x) => x.ad_id !== forAdId)
    .map((x) => {
      const rank = sorted.findIndex((a) => a.ad_id === x.ad_id) + 1;
      const ctrD = computeAdDiagnosisFacts(x).ctr_pct_vs_account;
      const cvrD = computeAdDiagnosisFacts(x).cvr_pct_vs_account;
      const ctrPart = ctrD == null ? "" : ` CTR ${ctrD >= 0 ? "+" : ""}${ctrD}% vs account`;
      const cvrPart = cvrD == null ? "" : ` CVR ${cvrD >= 0 ? "+" : ""}${cvrD}% vs account`;
      return `Rank ${rank} by spend: "${x.ad_name.slice(0, 48)}" — spend ${x.performance.spend.toFixed(0)}${ctrPart}${cvrPart}; hint=${computeAdDiagnosisFacts(x).primary_constraint_hint}`;
    });
}

export function batchSpendRank(all: AdAIInput[], adId: string): number {
  const sorted = [...all].sort((a, b) => b.performance.spend - a.performance.spend);
  const idx = sorted.findIndex((a) => a.ad_id === adId);
  return idx === -1 ? 0 : idx + 1;
}
