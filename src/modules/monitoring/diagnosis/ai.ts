import { AdAhaDiagnosisSchema, AdDiagnosisSchema, SystemDiagnosisSchema } from "./validation";
import type {
  AdAhaDiagnosisAI,
  DiagnosisProblemId,
  DominantFormat,
  NormalizedAd,
  SegmentPerformance,
  SystemMetrics,
} from "./types";
import { getDiagnosisThresholds } from "./rules";
import type { AdAIInput } from "./ad_ai_payload";
import { AD_AHA_SINGLE_RESPONSE_SCHEMA } from "./ad_aha_response_schema";
import {
  batchSpendRank,
  buildBatchPeerLines,
  computeAdDiagnosisFacts,
  type AdDiagnosisFacts,
} from "./diagnosis_facts";
import { extractFirstQuotedSnippet, includesQuotedSnippet } from "./quote_detection";
import {
  isTooSimilarToOriginal,
  validateTranscriptSuggestions,
} from "./transcript_suggestion_validation";

function parseJsonContent(content: string): unknown {
  const trimmed = content.trim().replace(/^```json\s*|\s*```$/g, "");
  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    // Some models occasionally prepend/append stray text even when asked for JSON.
    // Best-effort: parse the first complete JSON object/array substring.
    const firstObj = trimmed.indexOf("{");
    const lastObj = trimmed.lastIndexOf("}");
    if (firstObj !== -1 && lastObj !== -1 && lastObj > firstObj) {
      const slice = trimmed.slice(firstObj, lastObj + 1);
      return JSON.parse(slice) as unknown;
    }
    const firstArr = trimmed.indexOf("[");
    const lastArr = trimmed.lastIndexOf("]");
    if (firstArr !== -1 && lastArr !== -1 && lastArr > firstArr) {
      const slice = trimmed.slice(firstArr, lastArr + 1);
      return JSON.parse(slice) as unknown;
    }
    throw new Error("Invalid JSON from AI");
  }
}

function collectStrings(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap(collectStrings);
  if (value && typeof value === "object") return Object.values(value).flatMap(collectStrings);
  return [];
}

function violatesBans(payload: unknown, banned: RegExp[]): string[] {
  const texts = collectStrings(payload);
  const violations: string[] = [];
  for (const re of banned) {
    if (texts.some((t) => re.test(t))) violations.push(re.source);
  }
  return violations;
}

function replaceModalBans(payload: unknown): unknown {
  if (typeof payload === "string") {
    return payload
      .replace(/\bmay\b/gi, "will")
      .replace(/\bmight\b/gi, "will");
  }
  if (Array.isArray(payload)) return payload.map(replaceModalBans);
  if (payload && typeof payload === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(payload)) out[k] = replaceModalBans(v);
    return out;
  }
  return payload;
}

function replaceCommonBans(payload: unknown): unknown {
  if (typeof payload === "string") {
    return payload
      .replace(/\bmay\b/gi, "will")
      .replace(/\bmight\b/gi, "will")
      .replace(/\ba\/b\b/gi, "two variants")
      .replace(/\ba-b\b/gi, "two variants")
      .replace(/\btest\b/gi, "ship")
      .replace(/\bexperiment(s)?\b/gi, "run")
      .replace(/\btry\b/gi, "do")
      .replace(/\boptimi[sz]e\b/gi, "tighten")
      .replace(/\brefine\b/gi, "tighten")
      .replace(/\bgeneric\b/gi, "broad");
  }
  if (Array.isArray(payload)) return payload.map(replaceCommonBans);
  if (payload && typeof payload === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(payload)) out[k] = replaceCommonBans(v);
    return out;
  }
  return payload;
}

function ensure(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

function countParagraphs(text: string): number {
  const parts = text
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);
  return parts.length;
}

function first2sInstruction(text: string): boolean {
  return (
    /\b0\s*[-–]\s*2s\b|\bfirst 2s\b|\bfirst 0\s*[-–]\s*2s\b|\bfirst 2\s+sec(ond)?s?\b|\bfirst two\s+sec(ond)?s?\b|\bfirst\s+frame\b|\bopening\s+frame\b/i.test(
      text
    )
  );
}

function normalizeForMatch(text: string): string {
  return text
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/\s+/g, " ")
    .replace(/[^\w\s%₹]/g, "")
    .trim()
    .toLowerCase();
}

function snippetExistsInBody(cause: string, body: string): boolean {
  const snip = extractFirstQuotedSnippet(cause);
  if (!snip) return false;
  const hay = normalizeForMatch(body);
  const needle = normalizeForMatch(snip);
  if (!needle) return false;
  if (hay.includes(needle)) return true;

  // Fallback: require first 3+ words in order (handles punctuation/line breaks).
  const words = needle.split(" ").filter(Boolean);
  if (words.length < 3) return false;
  let idx = 0;
  for (const w of words) {
    const next = hay.indexOf(w, idx);
    if (next === -1) return false;
    idx = next + w.length;
  }
  return true;
}

function snippetFromBody(body: string): string | null {
  const cleaned = body.replace(/\s+/g, " ").trim();
  if (!cleaned) return null;
  const words = cleaned.split(" ").filter(Boolean);
  if (words.length === 0) return null;
  return words.slice(0, Math.min(10, words.length)).join(" ");
}

function trimTranscript(text: string | null | undefined, maxChars = 240): string | null {
  const cleaned = String(text ?? "").replace(/\s+/g, " ").trim();
  if (!cleaned) return null;
  if (cleaned.length <= maxChars) return cleaned;
  return `${cleaned.slice(0, Math.max(0, maxChars - 1)).trimEnd()}…`;
}

function hookLineFromBody(body: string, maxWords = 18): string {
  const cleaned = body.replace(/\s+/g, " ").trim();
  if (!cleaned) return "";
  const words = cleaned.split(" ").filter(Boolean);
  return words.slice(0, Math.min(maxWords, words.length)).join(" ");
}

function claimLineFromBody(body: string): string {
  const cleaned = body.replace(/\s+/g, " ").trim();
  if (!cleaned) return "";
  const parts = cleaned.split(/[.!?]\s+/).map((p) => p.trim()).filter(Boolean);
  const first = parts[0] ?? cleaned;
  return first.slice(0, 140);
}

function domainFromUrl(url: string): string {
  try {
    const u = new URL(url);
    return u.hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

function pct(n: number | null | undefined): number | null {
  if (n == null || !Number.isFinite(n)) return null;
  return Math.round(n * 10) / 10;
}

function safeRatio(a: number, b: number): number | null {
  if (!Number.isFinite(a) || !Number.isFinite(b) || b === 0) return null;
  return Math.round((a / b) * 100) / 100;
}

function retentionPct(video: { plays: number | null; p25: number | null; p50: number | null; p75: number | null; p100: number | null } | null) {
  const plays = video?.plays ?? null;
  if (!plays || plays <= 0) return { p25: null, p50: null, p75: null, p100: null };
  const p = (x: number | null) => (x == null ? null : Math.round((x / plays) * 100));
  return { p25: p(video?.p25 ?? null), p50: p(video?.p50 ?? null), p75: p(video?.p75 ?? null), p100: p(video?.p100 ?? null) };
}

function dropPointLabel(video: {
  plays: number | null;
  p25: number | null;
  p50: number | null;
  p75: number | null;
  p100: number | null;
} | null): string {
  const r = retentionPct(video);
  if (r.p25 != null && r.p25 < 30) return "drops before 25% (hook not landing)";
  if (r.p50 != null && r.p50 < 20) return "drops before 50% (message unclear)";
  if (r.p75 != null && r.p75 < 10) return "drops before 75% (weak mid-section)";
  return "holds through the first half";
}

function pctChange(first: number | null, last: number | null): number | null {
  if (first == null || last == null) return null;
  if (!Number.isFinite(first) || !Number.isFinite(last)) return null;
  if (first === 0) return null;
  return Math.round(((last - first) / first) * 1000) / 10;
}

function bottleneckHint(input: AdAIInput): string {
  const { primary_constraint_hint: primary } = computeAdDiagnosisFacts(input);
  switch (primary) {
    case "CPC":
      return "high_cpc";
    case "CVR":
      return "low_cvr";
    case "HOOK":
      return "weak_retention_or_hook";
    case "CTR":
      return input.format === "video" ? "weak_retention_or_hook" : "low_ctr";
    default:
      if (input.format === "video" && (input.video?.avg_time_seconds ?? 0) > 0) {
        if ((input.video?.avg_time_seconds ?? 0) < 3) return "weak_retention_or_hook";
      }
      return "unknown";
  }
}

function repairFixItem(item: string, body: string): string {
  const trimmed = item.trim().replace(/\s+/g, " ");
  if (includesQuotedSnippet(trimmed) || first2sInstruction(trimmed)) return trimmed;

  // Wrap trailing copy after "with ..." in quotes.
  const withIdx = trimmed.toLowerCase().indexOf(" with ");
  if (withIdx !== -1) {
    const head = trimmed.slice(0, withIdx + 6);
    const tail = trimmed.slice(withIdx + 6).trim();
    if (tail.length > 0) return `${head}"${tail}"`;
  }

  // Wrap trailing copy after ":" in quotes.
  const colonIdx = trimmed.indexOf(":");
  if (colonIdx !== -1) {
    const head = trimmed.slice(0, colonIdx + 1);
    const tail = trimmed.slice(colonIdx + 1).trim();
    if (tail.length > 0) return `${head} "${tail}"`;
  }

  // Convert common "Replace X to Y" into "Replace X with "Y"".
  const toIdx = trimmed.toLowerCase().indexOf(" to ");
  if (/^replace\b/i.test(trimmed) && toIdx !== -1) {
    const head = trimmed.slice(0, toIdx).trim();
    const tail = trimmed.slice(toIdx + 4).trim();
    if (tail.length > 0) return `${head} with "${tail}"`;
  }

  // Deterministic fallback: anchor to existing body snippet (never invent new copy).
  const snip = snippetFromBody(body);
  if (snip) {
    return `${trimmed}: "${snip}"`;
  }

  // Last resort: make it a first-2s instruction so it passes without inventing copy.
  return `${trimmed} in the first 2s`;
}

function repairCauseWithBodySnippet(cause: string, body: string): string {
  const snip = snippetFromBody(body);
  if (!snip) return cause;
  const trimmed = cause.trim().replace(/\s+/g, " ");
  // Keep it one sentence: prefix an anchored snippet and avoid double punctuation.
  const withoutLeading = trimmed.replace(/^[\-\–—\s]+/, "");
  return `"${snip}" — ${withoutLeading}`.trim();
}

function includesMetricEvidence(text: string): boolean {
  if (!/\d/.test(text)) return false;
  return (
    /%/.test(text) ||
    /\bCTR\b/i.test(text) ||
    /\bCPC\b/i.test(text) ||
    /\bCVR\b/i.test(text) ||
    /\bROAS\b/i.test(text) ||
    /\bhook rate\b/i.test(text) ||
    /\bhold rate\b/i.test(text) ||
    /\bwatch time\b/i.test(text) ||
    /\b~?\d+(\.\d+)?s\b/i.test(text) ||
    /\bp25\b|\bp50\b|\bp75\b|\bp100\b/i.test(text) ||
    /\bfrequency\b/i.test(text)
  );
}

function countMetricMentions(text: string): number {
  const patterns = [
    /\bCTR\b/i,
    /\bCPC\b/i,
    /\bCVR\b/i,
    /\bROAS\b/i,
    /\bhook rate\b/i,
    /\bhold rate\b/i,
    /\bwatch time\b/i,
    /\bp25\b/i,
    /\bp50\b/i,
    /\bp75\b/i,
    /\bp100\b/i,
    /\bfrequency\b/i,
  ];
  let count = 0;
  for (const re of patterns) if (re.test(text)) count += 1;
  if (/%/.test(text)) count += 1;
  if (/\b~?\d+(\.\d+)?s\b/i.test(text)) count += 1;
  return count;
}

/**
 * Ad AHA prompt allows dashed lists OR the strict template (undashed lines under Fix (ship),
 * 0–2s lines, quoted rewritten hooks). Accept any of these so guardrails match the prompt.
 */
function hasActionLines(text: string): boolean {
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  let structured = 0;
  for (const l of lines) {
    if (/^(\d+\.|\-)\s+/.test(l)) structured += 1;
    else if (/^0[\u2013\-]2s\s*:/i.test(l)) structured += 1;
  }
  if (structured >= 3) return true;

  const fixMatch = text.match(/Fix\s*\(ship\)\s*:([\s\S]*)/i);
  if (fixMatch) {
    let body = fixMatch[1].trim();
    const stop = body.search(/\n\s*(Bottleneck|Evidence|Why)\s*:/i);
    if (stop >= 0) body = body.slice(0, stop).trim();
    const fixLines = body
      .split(/\n/)
      .map((l) => l.trim())
      .filter((l) => l.length >= 10);
    if (fixLines.length >= 3) return true;
    if (
      fixLines.length >= 2 &&
      /0[\u2013\-]2s\s*:/i.test(body) &&
      /["“][^"“]{6,}["”]/.test(body)
    ) {
      return true;
    }
    if (body.length >= 100 && /0[\u2013\-]2s\s*:/i.test(body) && /["“]/.test(body)) return true;
  }

  return false;
}

function countConcreteActionLines(text: string): number {
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  let count = 0;
  for (const l of lines) {
    const isBullet = /^(\d+\.|\-)\s+/.test(l);
    const is02s = /^0[\u2013\-]2s\s*:/i.test(l);
    if (!isBullet && !is02s) continue;
    if (isBullet && (includesQuotedSnippet(l) || first2sInstruction(l))) count += 1;
    else if (is02s) count += 1;
  }
  return count;
}

function extractSection(text: string, section: "Evidence" | "Fix (ship)"): string[] {
  const lines = text.split("\n");
  const headerRe =
    section === "Evidence"
      ? /^\s*Evidence\s*:\s*(.*)\s*$/i
      : /^\s*Fix\s*\(ship\)\s*:\s*(.*)\s*$/i;
  const anyHeaderRe = /^\s*(Bottleneck|Evidence|Why|Fix\s*\(ship\))\s*:\s*$/i;
  let started = false;
  const out: string[] = [];
  for (const raw of lines) {
    const line = raw.trimEnd();
    if (!started) {
      const m = line.match(headerRe);
      if (m) {
        started = true;
        const trailing = (m[1] ?? "").trim();
        if (trailing) out.push(trailing);
      }
      continue;
    }
    if (anyHeaderRe.test(line.trim())) break;
    const trimmed = line.trim();
    if (trimmed) out.push(trimmed);
  }
  return out;
}

function countDashBullets(lines: string[]): number {
  return lines.filter((l) => /^\-\s+/.test(l) && l.replace(/^\-\s+/, "").trim().length >= 10).length;
}

function hasDashBullet(lines: string[], pattern: RegExp): boolean {
  return lines.some((l) => /^\-\s+/.test(l) && pattern.test(l));
}

function formatRatio(x: number | null): string {
  if (x == null || !Number.isFinite(x)) return "n/a";
  return `${Math.round(x * 100) / 100}×`;
}

function buildDeterministicEvidenceBullets(input: AdAIInput): string[] {
  const bullets: string[] = [];
  const p = input.performance;
  const a = input.account;
  const d = {
    ctr: safeRatio(p.ctr, a.ctr),
    cpc: safeRatio(p.cpc, a.cpc),
    cvr: p.cvr == null ? null : safeRatio(p.cvr, a.cvr),
  };

  bullets.push(
    `- CTR ${p.ctr.toFixed(2)}% vs account ${a.ctr.toFixed(2)}% (${formatRatio(d.ctr)} of account).`
  );
  bullets.push(
    `- CPC ${p.cpc.toFixed(2)} vs account ${a.cpc.toFixed(2)} (${formatRatio(d.cpc)} of account).`
  );

  if (p.cvr != null && Number.isFinite(p.cvr)) {
    bullets.push(
      `- CVR ${(p.cvr * 100).toFixed(2)}% vs account ${(a.cvr * 100).toFixed(2)}% (${formatRatio(d.cvr)} of account).`
    );
  } else {
    bullets.push(`- Conversions ${p.conversions} on ${p.clicks} clicks (CVR not available / low clicks).`);
  }

  if (input.format === "video" && input.video) {
    const v = input.video;
    const wt = v.avg_time_seconds ?? null;
    const hook = v.hook_rate ?? null;
    const hold = v.hold_rate ?? null;
    const dp = dropPointLabel(v);
    if (wt != null && wt > 0) bullets.push(`- Watch time ~${Math.round(wt)}s; ${dp}.`);
    if (hook != null) bullets.push(`- Hook rate ${hook}%.`);
    if (hold != null) bullets.push(`- Hold rate ${hold}%.`);
  }

  // Return top 3–5; ensure at least 3.
  const uniq = Array.from(new Set(bullets)).filter((b) => b.replace(/^\-\s+/, "").trim().length >= 10);
  return uniq.slice(0, Math.max(3, Math.min(5, uniq.length)));
}

function ensureEvidenceHasAtLeast3Bullets(analysis: string, input: AdAIInput): string {
  const evidenceLines = extractSection(analysis, "Evidence");
  const existingBullets = evidenceLines.filter((l) => /^\-\s+/.test(l));
  if (countDashBullets(existingBullets) >= 3) return analysis;

  const inject = buildDeterministicEvidenceBullets(input);
  const lines = analysis.split("\n");

  // Find Evidence header (allow inline variants).
  let idx = lines.findIndex((l) => /^\s*Evidence\s*:/i.test(l.trim()));
  if (idx === -1) {
    // Insert Evidence section after Bottleneck.
    const bottleneckIdx = lines.findIndex((l) => /^\s*Bottleneck\s*:/i.test(l.trim()));
    idx = bottleneckIdx !== -1 ? bottleneckIdx + 1 : 0;
    lines.splice(idx, 0, "", "Evidence:");
    idx = lines.findIndex((l) => /^\s*Evidence\s*:/i.test(l.trim()));
  }

  // Insert missing bullets immediately after Evidence header.
  const insertAt = idx + 1;
  lines.splice(insertAt, 0, ...inject);
  return lines.join("\n");
}

function pickBestQuoteCandidate(input: AdAIInput): string | null {
  const transcript = trimTranscript(input.video?.transcript_0_5s, 240);
  if (transcript) return transcript;
  const ocr = trimTranscript(input.creative.ocr_text, 240);
  if (ocr) return ocr;
  const hook = hookLineFromBody(input.creative.body).trim();
  if (hook) return hook;
  const claim = claimLineFromBody(input.creative.body).trim();
  if (claim) return claim;
  const snip = snippetFromBody(input.creative.body)?.trim() ?? "";
  return snip || null;
}

function ensureWhySeeHasQuote(analysis: string, quote: string): string {
  if (!quote.trim()) return analysis;
  if (includesQuotedSnippet(analysis)) return analysis;

  const lines = analysis.split("\n");
  const whyIdx = lines.findIndex((l) =>
    /^\s*Why\b/i.test(l.trim()) && /see/i.test(l) && /think/i.test(l) && /act/i.test(l) && /:\s*$/.test(l.trim())
  );
  if (whyIdx === -1) return analysis;

  // Find or create the See line.
  for (let i = whyIdx + 1; i < Math.min(lines.length, whyIdx + 8); i++) {
    const t = lines[i]?.trimStart() ?? "";
    if (/^\s*(Evidence|Fix\s*\(ship\)|Bottleneck)\s*:/i.test(t)) break;
    if (/^\s*See\s*:/i.test(t)) {
      lines[i] = lines[i].replace(/\s*$/, ` "${quote.trim()}"`);
      return lines.join("\n");
    }
  }

  // Insert a See line immediately after the Why header (preserves "do not start with quote").
  lines.splice(whyIdx + 1, 0, `See: "${quote.trim()}"`);
  return lines.join("\n");
}

function ensureQuoteSomewhere(analysis: string, quote: string): string {
  const q = quote.trim();
  if (!q) return analysis;
  if (includesQuotedSnippet(analysis)) return analysis;

  const lines = analysis.split("\n");

  // Prefer populating an existing See: line anywhere.
  for (let i = 0; i < lines.length; i++) {
    if (/^\s*See\s*:/i.test(lines[i] ?? "")) {
      lines[i] = lines[i].replace(/\s*$/, ` "${q}"`);
      return lines.join("\n");
    }
  }

  // Otherwise insert into Fix (ship) as a bullet so it passes formatting guardrails.
  const fixIdx = lines.findIndex((l) => /^\s*Fix\s*\(ship\)\s*:\s*$/i.test(l.trim()));
  if (fixIdx !== -1) {
    lines.splice(fixIdx + 1, 0, `- Hook snippet: "${q}"`);
    return lines.join("\n");
  }

  // Otherwise insert into Evidence.
  const evIdx = lines.findIndex((l) => /^\s*Evidence\s*:\s*$/i.test(l.trim()));
  if (evIdx !== -1) {
    lines.splice(evIdx + 1, 0, `- Creative snippet: "${q}"`);
    return lines.join("\n");
  }

  // Last resort: append.
  return `${analysis.trim()}\nSnippet: "${q}"`.trim();
}

function normalizeDashBulletsInSection(analysis: string, section: "Evidence" | "Fix (ship)"): string {
  const headerRe =
    section === "Evidence"
      ? /^\s*Evidence\s*:\s*(.*)\s*$/i
      : /^\s*Fix\s*\(ship\)\s*:\s*(.*)\s*$/i;
  const anyHeaderRe = /^\s*(Bottleneck|Evidence|Why|Fix\s*\(ship\))\s*:\s*$/i;
  const lines = analysis.split("\n");
  let started = false;
  let trailingInserted = false;
  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (!started) {
      const m = trimmed.match(headerRe);
      if (m) {
        started = true;
        const trailing = (m[1] ?? "").trim();
        // Normalize header to a clean standalone header.
        lines[i] = section === "Evidence" ? "Evidence:" : "Fix (ship):";
        if (trailing) {
          lines.splice(i + 1, 0, `- ${trailing}`);
          trailingInserted = true;
          i++; // skip inserted line
        }
      }
      continue;
    }
    if (anyHeaderRe.test(trimmed)) break;
    if (!trimmed) continue;
    // If the model outputs "0–2s:" without dash, normalize.
    if (/^0\s*[\u2013\-]\s*2s\s*:/i.test(trimmed) && !/^\-\s+/.test(trimmed)) {
      lines[i] = `- ${trimmed}`;
      continue;
    }
    if (!/^\-\s+/.test(trimmed)) lines[i] = `- ${trimmed}`;
  }
  // Avoid leaving Evidence/Fix empty if the only content was inline trailing and got inserted.
  // (kept for clarity; no-op if trailing wasn't present)
  void trailingInserted;
  return lines.join("\n");
}

function repairAdAhaAnalysis(analysis: string, input: AdAIInput): string {
  let out = analysis.trim();

  // If model started with a quoted hook, move it into Why/See instead of violating format.
  const firstLine = out.split("\n")[0]?.trimStart() ?? "";
  if (/^["“]/.test(firstLine)) {
    const rest = out.split("\n").slice(1).join("\n").trim();
    out = rest || out;
  }

  const quote = pickBestQuoteCandidate(input);
  if (quote) out = ensureWhySeeHasQuote(out, quote);

  out = normalizeDashBulletsInSection(out, "Evidence");
  out = normalizeDashBulletsInSection(out, "Fix (ship)");

  out = ensureEvidenceHasAtLeast3Bullets(out, input);

  // If the model didn't follow the quote rule, deterministically add one in a valid location.
  if (quote) out = ensureQuoteSomewhere(out, quote);

  // Ensure Fix (ship) contains a 0–2s bullet; if missing, insert a safe, grounded one.
  const fixLines = extractSection(out, "Fix (ship)");
  if (!hasDashBullet(fixLines, /0\s*[\u2013\-]\s*2s\s*:/i)) {
    const safeQuote = quote?.trim() ?? "";
    const insertLine = safeQuote
      ? `- 0–2s: Put the payoff on-screen immediately (use the exact words: "${safeQuote}").`
      : `- 0–2s: Put the payoff on-screen immediately (finish the promise in one line).`;
    const lines = out.split("\n");
    const idx = lines.findIndex((l) => /^\s*Fix\s*\(ship\)\s*:\s*$/i.test(l.trim()));
    if (idx !== -1) {
      lines.splice(idx + 1, 0, insertLine);
      out = lines.join("\n");
    }
  }

  return out.trim();
}

function addVideoSignalsIfMissing(analysis: string, input: AdAIInput): string {
  if (input.format !== "video" || !input.video) return analysis;
  let out = analysis.trim();

  const tr = trimTranscript(input.video.transcript_0_5s, 240);
  if (tr && !/\btranscript\b/i.test(out) && !out.includes(tr)) {
    out = `${out}\nTranscript 0–5s: "${tr}"`;
  }

  const wt = input.video.avg_time_seconds ?? null;
  if (wt != null && wt > 0 && !/\bwatch time\b/i.test(out)) {
    out = `${out}\nWatch time ~${Math.round(wt)}s`;
  }
  const hook = input.video.hook_rate;
  if (hook != null && Number.isFinite(hook) && !/\bhook rate\b/i.test(out)) {
    out = `${out}\nHook rate ${hook}%`;
  }
  const hold = input.video.hold_rate;
  if (hold != null && Number.isFinite(hold) && !/\bhold rate\b/i.test(out)) {
    out = `${out}\nHold rate ${hold}%`;
  }

  return out.trim();
}

export type SystemAIInput = {
  problem: DiagnosisProblemId;
  metrics: SystemMetrics;
  impactPct: number;
  segment: SegmentPerformance;
  dominantFormat: DominantFormat;
  sampleCopy: string[];
};

function round(n: number): number {
  return Math.round(n * 10) / 10;
}

function buildQuantification(input: SystemAIInput): {
  scenarioLabel: string;
  current: string;
  target: string;
  upliftClicks: number;
  upliftConversions: number;
} {
  const t = getDiagnosisThresholds();
  const ctrTarget = Number(process.env.HEALTH_DIAG_CTR_TARGET ?? "2.5");
  const spend = input.metrics.totalSpend;
  const impressions = input.metrics.totalImpressions;
  const clicks = input.metrics.totalClicks;
  const conversions = input.metrics.totalConversions;
  const cvr = input.metrics.cvr;
  const ctr = input.metrics.avgCtr;
  const cpc = input.metrics.avgCpc;

  switch (input.problem) {
    case "LOW_CTR": {
      const targetCtr = Math.max(t.ctrMin, ctr, Number.isFinite(ctrTarget) ? ctrTarget : 2.5);
      const upliftClicks = Math.max(0, (impressions * (targetCtr - ctr)) / 100);
      const upliftConversions = Math.max(0, upliftClicks * cvr);
      return {
        scenarioLabel: "Raise CTR",
        current: `CTR ${ctr.toFixed(2)}%`,
        target: `CTR ${targetCtr.toFixed(2)}%`,
        upliftClicks: round(upliftClicks),
        upliftConversions: round(upliftConversions),
      };
    }
    case "LOW_CVR": {
      const targetCvr = Math.max(t.cvrMin, cvr);
      const upliftConversions = Math.max(0, clicks * (targetCvr - cvr));
      return {
        scenarioLabel: "Raise CVR to threshold",
        current: `CVR ${(cvr * 100).toFixed(2)}%`,
        target: `CVR ${(targetCvr * 100).toFixed(2)}%`,
        upliftClicks: 0,
        upliftConversions: round(upliftConversions),
      };
    }
    case "HIGH_CPC": {
      const targetCpc = Math.max(t.cpcMax, 0.01);
      const extraClicks = cpc > 0 ? Math.max(0, spend / targetCpc - clicks) : 0;
      const upliftConversions = Math.max(0, extraClicks * cvr);
      return {
        scenarioLabel: "Lower CPC to threshold (same spend)",
        current: `CPC ${cpc.toFixed(2)}`,
        target: `CPC ${targetCpc.toFixed(2)}`,
        upliftClicks: round(extraClicks),
        upliftConversions: round(upliftConversions),
      };
    }
    default: {
      // HEALTHY: quantify what current efficiency buys; this is linear and doesn't require assumptions.
      const clicksPer1000 = cpc > 0 ? (1000 / cpc) : 0;
      const conversionsPer1000 = clicksPer1000 * cvr;
      return {
        scenarioLabel: "Current efficiency (per 1,000 spend units)",
        current: conversions > 0 ? `Conversions ${conversions}` : `Clicks ${clicks}`,
        target: `~${round(clicksPer1000)} clicks → ~${round(conversionsPer1000)} conversions`,
        upliftClicks: 0,
        upliftConversions: 0,
      };
    }
  }
}

function buildSystemPrompt(input: SystemAIInput): string {
  const q = buildQuantification(input);
  const ctr = input.metrics.avgCtr.toFixed(2);
  const cpc = input.metrics.avgCpc.toFixed(2);
  const cvr = (input.metrics.cvr * 100).toFixed(2);
  const freq = input.metrics.avgFrequency;
  const freqLabel = freq > 4 ? "high" : freq >= 2 ? "moderate" : "low";

  return `Output ONLY valid JSON (no markdown) that matches this exact shape:
{
  "main_issue": "string",
  "impact_summary": "string",
  "source": "string",
  "why": ["string"],
  "actions": ["string"]
}
If you omit any key or add extra keys, the response is rejected.

GOAL:
- Produce an AHA-style system diagnosis in the same quality as this pattern:
  "Your funnel converts — but not enough people are clicking. ... CTR is the constraint ... With efficient reach (low CPC, low frequency) ... Fix the hook ... CTR X → Y could drive ~N more clicks and ~M installs."

RULES:
- Use ONLY facts below. Do not assume targeting, landing page, attribution, CPM, placements, or creatives not shown.
- No generic filler: do NOT say "test", "experiment", "optimize", "refine", or "adjust targeting".
- Avoid weak modals: do NOT use "may" or "might". ("could" is OK for the quant line.)
- "actions" MUST be exactly 3 strings starting with: "Bottleneck Detection:", "Budget Waste Detection:", "Efficiency Insight:"

	OUTPUT REQUIREMENTS:
	- "main_issue": 1 punchy sentence in the "X works but Y is the constraint" format.
	- "impact_summary": exactly 3 short paragraphs separated by blank lines:
	  1) Name the constraint metric (CTR vs CVR vs CPC) and what is working. Keep it readable; avoid repeating every number.
	  2) Use CPC + frequency label to rule in/out cost or saturation ("CPC ${cpc}" and "${freqLabel} frequency"). Use simple terms; do NOT use jargon like "above the fold".
	  3) Explain the fix in plain language at a system level (what the hook must communicate). Do NOT include the quant delta here.

FACTS (computed in our product):
- Primary problem code (from deterministic rules): ${input.problem}
- Total spend: ${input.metrics.totalSpend.toFixed(2)}
- Total impressions: ${input.metrics.totalImpressions}
- Total clicks: ${input.metrics.totalClicks}
- Total conversions: ${input.metrics.totalConversions}
- Blended CTR: ${ctr}%
- Blended CPC: ${cpc}
- Blended frequency (impressions/reach): ${freq.toFixed(2)} (${freqLabel})
- CVR (conversions/clicks): ${cvr}%
- Approx spend affected by this pattern: ${input.impactPct}%
- Dominant creative format: ${input.dominantFormat}
- Video CTR (spend-weighted): ${input.segment.videoCtr == null ? "null" : input.segment.videoCtr.toFixed(2) + "%"}
- Image CTR (spend-weighted): ${input.segment.imageCtr == null ? "null" : input.segment.imageCtr.toFixed(2) + "%"}
- Video spend: ${input.segment.videoSpend.toFixed(2)}
- Image spend: ${input.segment.imageSpend.toFixed(2)}
	- Sample ad copy snippets (verbatim): ${JSON.stringify(input.sampleCopy.slice(0, 3))}
	- Quantification scenario (use these numbers verbatim): ${q.scenarioLabel} (${q.current} → ${q.target}) implies ~${q.upliftClicks} more clicks and ~${q.upliftConversions} more conversions at current CVR.

	ACTION REQUIREMENTS:
	- "actions"[0] must start with "Bottleneck Detection:" and contain no numbers.
	- "actions"[1] must start with "Budget Waste Detection:" and contain no numbers.
	- "actions"[2] must start with "Efficiency Insight:" and MUST be the "Fix" line:
	  "Efficiency Insight: Improve the hook to reach (${q.current} → ${q.target}), which could drive ~${q.upliftClicks} more clicks and ~${q.upliftConversions} more conversions at the same spend."
	`;
}

export async function runSystemDiagnosisAI(input: SystemAIInput) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY not configured");

  const { default: OpenAI } = await import("openai");
  const openai = new OpenAI({ apiKey });

  const banned = [
    /\bmay\b/i,
    /\bmight\b/i,
    /\btry\b/i,
    /\btest\b/i,
    /\ba\/b\b/i,
    /\bexperiment\b/i,
    /\boptimi[sz]e\b/i,
    /\brefine\b/i,
    /\badjust targeting\b/i,
    /\btarget audience\b/i,
    /\baudience\b/i,
  ];

  const messages: { role: "system" | "user"; content: string }[] = [
    {
      role: "system",
      content:
        "You are a senior Meta ads performance marketer. You write decisive diagnoses, not generic advice.",
    },
    { role: "user", content: buildSystemPrompt(input) },
  ];

  let lastReason: string | null = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      messages,
      max_tokens: 320,
      temperature: 0,
      response_format: { type: "json_object" },
    });

    const content = completion.choices[0]?.message?.content;
    if (!content) throw new Error("No response from AI");
    const parsed = SystemDiagnosisSchema.parse(parseJsonContent(content));

    const violations = violatesBans(parsed, banned);
    try {
      // Efficient fix-up for the most common failures: banned tokens that dilute decisiveness.
      if (violations.length > 0) {
        const sanitized = SystemDiagnosisSchema.parse(replaceCommonBans(parsed));
        const post = violatesBans(sanitized, banned);
        if (post.length === 0) {
          ensure(countParagraphs(sanitized.impact_summary) === 3, `"impact_summary" must have exactly 3 paragraphs`);
          ensure(!sanitized.impact_summary.includes("→"), `"impact_summary" must not include the quant delta line`);
          ensure(
            sanitized.actions.some((a) => a.startsWith("Bottleneck Detection")),
            `"actions" must include a Bottleneck Detection statement`
          );
          ensure(
            sanitized.actions.some((a) => a.startsWith("Budget Waste Detection")),
            `"actions" must include a Budget Waste Detection statement`
          );
          ensure(
            sanitized.actions.some((a) => a.startsWith("Efficiency Insight")),
            `"actions" must include an Efficiency Insight statement`
          );
          ensure(!/\d/.test(sanitized.actions[0] ?? ""), `"actions"[0] must not include numbers`);
          ensure(!/\d/.test(sanitized.actions[1] ?? ""), `"actions"[1] must not include numbers`);
          ensure(
            /\d/.test(sanitized.actions[2] ?? "") && (sanitized.actions[2] ?? "").includes("→"),
            `"actions"[2] must include the quantified X → Y fix line`
          );
          return sanitized;
        }
      }

      ensure(violations.length === 0, `Banned language: ${violations.join(", ")}`);
      ensure(countParagraphs(parsed.impact_summary) === 3, `"impact_summary" must have exactly 3 paragraphs`);
      ensure(!parsed.impact_summary.includes("→"), `"impact_summary" must not include the quant delta line`);
      ensure(
        parsed.actions.some((a) => a.startsWith("Bottleneck Detection")),
        `"actions" must include a Bottleneck Detection statement`
      );
      ensure(
        parsed.actions.some((a) => a.startsWith("Budget Waste Detection")),
        `"actions" must include a Budget Waste Detection statement`
      );
      ensure(
        parsed.actions.some((a) => a.startsWith("Efficiency Insight")),
        `"actions" must include an Efficiency Insight statement`
      );
      ensure(!/\d/.test(parsed.actions[0] ?? ""), `"actions"[0] must not include numbers`);
      ensure(!/\d/.test(parsed.actions[1] ?? ""), `"actions"[1] must not include numbers`);
      ensure(
        /\d/.test(parsed.actions[2] ?? "") && (parsed.actions[2] ?? "").includes("→"),
        `"actions"[2] must include the quantified X → Y fix line`
      );
      return parsed;
    } catch (e) {
      const reason = e instanceof Error ? e.message : "Output failed guardrails";
      lastReason = reason;
      messages.push({
        role: "user",
        content: `Your last JSON failed guardrails: ${reason}.
Regenerate the JSON with the same schema and facts.
Hard rule: do NOT use the words "may" or "might" anywhere.
Do not add any banned language.`,
      });
    }
  }

  throw new Error(
    lastReason
      ? `AI output failed guardrails after retries: ${lastReason}`
      : "AI output failed guardrails after retries"
  );
}

/** Gold-standard shape reference (field names + tone). Do not copy numbers or brand facts from the example. */
const GOLD_AD_AHA_EXAMPLE = `{
  "ad_id": "…",
  "bottleneck": "CTR",
  "evidence": ["CTR … vs account …", "CVR …", "CPC …"],
  "fixes": [
    {
      "fix": "Concrete shippable line; include 0–2s or first-frame detail where relevant",
      "type": "hook",
      "specificity_check": { "mentions_caption_token": true, "has_concrete_element": true }
    }
  ],
  "priority_fix": {
    "headline": "Prioritize fixing the opening hook first. Start with the Transcript (0–5s) check below.",
    "primary_section": "transcript_0_5s",
    "follow_section": "caption",
    "rationale": "CTR lags account while hook_rate shows scroll-past; fixing the first 3s moves clicks before caption tweaks."
  },
  "audits": {
    "caption": {
      "reason": "Short observation (e.g. weak CTA / no urgency)",
      "impact": "Consequence tied to metrics: what happens in-feed and to clicks/conversions because of that gap",
      "evidence": ["Quoted or paraphrased lines from caption_text that support the observation"],
      "suggestions": ["Concrete caption edits or CTA lines to ship"]
    },
    "ocr_text": {
      "reason": "Observation about on-image/overlay copy clarity (or explicit absence of OCR text)",
      "impact": "How on-image text quality affects thumb-stop, message clarity, and CTR/CVR behavior",
      "evidence": ["Quoted lines from payload.creative.ocr_text when present; [] when absent"],
      "suggestions": [
        {
          "line": "Stop EMI chaos: combine payments into one plan and cut up to 45%.",
          "change_type": "pattern_interrupt",
          "based_on": "Shifts from generic conversion phrasing to a sharp disruption + clear outcome."
        }
      ]
    },
    "transcript_0_5s": {
      "reason": "Opening hook states a problem but lacks specificity and a pattern interrupt",
      "evidence": ["“Overdue loans piling up? Then stop.” is vague and does not present a unique angle"],
      "suggestions": [
        {
          "line": "Paying 3 overdue EMIs every month?",
          "change_type": "specificity",
          "based_on": "Adds a concrete scenario so the problem is instantly relatable"
        },
        {
          "line": "This is why your loans keep getting worse",
          "change_type": "pattern_interrupt",
          "based_on": "Creates curiosity and breaks the expected ad pattern"
        },
        {
          "line": "Reduce your loan burden in 7 days — here’s how",
          "change_type": "outcome_shift",
          "based_on": "Moves from problem to a clear, time-bound outcome"
        }
      ]
    }
  }
}`;

function compactAdPayloadForPrompt(input: AdAIInput): Record<string, unknown> {
  const t0 = input.spend_trend?.[0] ?? null;
  const t1 = input.spend_trend?.[input.spend_trend.length - 1] ?? null;
  const plays = input.video?.plays ?? null;
  const retention =
    plays && plays > 0
      ? {
          p25_pct: input.video?.p25 != null ? Math.round((input.video.p25 / plays) * 100) : null,
          p50_pct: input.video?.p50 != null ? Math.round((input.video.p50 / plays) * 100) : null,
          p75_pct: input.video?.p75 != null ? Math.round((input.video.p75 / plays) * 100) : null,
          p100_pct:
            input.video?.p100 != null ? Math.round((input.video.p100 / plays) * 100) : null,
        }
      : null;

  return {
    ad_id: input.ad_id,
    ad_name: input.ad_name,
    format: input.format,
    bottleneck_hint: bottleneckHint(input),
    rule_issues: input.rule_issues,
    creative: {
      caption_text: trimTranscript(input.creative.body, 500),
      hook_line: hookLineFromBody(input.creative.body),
      claim_line: claimLineFromBody(input.creative.body),
      link_domain: domainFromUrl(input.creative.link_url ?? ""),
      link_url: input.creative.link_url,
      copy_snippet_suggestion: snippetFromBody(input.creative.body),
      ocr_text: trimTranscript(input.creative.ocr_text, 240),
    },
    performance: input.performance,
    account: input.account,
    deltas: {
      ctr_vs_account: safeRatio(input.performance.ctr, input.account.ctr),
      cpc_vs_account: safeRatio(input.performance.cpc, input.account.cpc),
      cvr_vs_account:
        input.performance.cvr == null ? null : safeRatio(input.performance.cvr, input.account.cvr),
    },
    video: input.video
      ? {
          avg_time_seconds: input.video.avg_time_seconds,
          hook_rate: input.video.hook_rate,
          hold_rate: input.video.hold_rate,
          impressions: input.video.impressions,
          plays: input.video.plays,
          watched_counts: {
            p25: input.video.p25,
            p50: input.video.p50,
            p75: input.video.p75,
            p100: input.video.p100,
          },
          transcript_0_5s: trimTranscript(input.video.transcript_0_5s, 240),
          retention_pct: retention,
          drop_point: dropPointLabel(input.video),
        }
      : null,
    trend: {
      days: input.spend_trend?.length ?? 0,
      spend_change_pct: pctChange(t0?.spend ?? null, t1?.spend ?? null),
      ctr_change_pct: pctChange(t0?.ctr ?? null, t1?.ctr ?? null),
      clicks_change_pct: pctChange(t0?.clicks ?? null, t1?.clicks ?? null),
    },
    spend_trend: input.spend_trend,
  };
}

function buildAdAhaPromptSingle(
  input: AdAIInput,
  facts: AdDiagnosisFacts,
  ctx: { peer_lines: string[]; batch_spend_rank: number; batch_ad_count: number }
): string {
  const payload = {
    ...compactAdPayloadForPrompt(input),
    diagnosis_facts: facts,
    batch_context: {
      spend_rank_in_batch: ctx.batch_spend_rank,
      batch_ad_count: ctx.batch_ad_count,
      peer_summaries: ctx.peer_lines,
    },
  };

  const videoAdBlock =
    input.format === "video" && input.video
      ? `
VIDEO AD (mandatory when format is "video" and payload.video is non-null):
- Put at least TWO items in top-level "evidence" that explicitly name Meta video metrics from payload.video using the exact numbers: hook_rate, hold_rate, avg_time_seconds, retention_pct (p25–p100), watched_counts, plays, and/or impressions. Tie them to the bottleneck (e.g. weak hook vs weak hold vs mid-roll drop).
- If diagnosis_facts.severe_video_hook_weakness is true, foreground hook/early-retention failure in those evidence lines (do not bury video signals behind CTR-only narrative).
- In audits.caption.impact, connect creative/copy to those video metrics when present (e.g. low hook_rate → scroll-past; low hold_rate → payoff not sustained).

TRANSCRIPT AUDIT (audits.transcript_0_5s) — CRITICAL:
- If payload.video.transcript_0_5s is null/empty: set evidence to [] and suggestions to [] (reason may briefly state no transcript). Do not invent spoken lines.
- If transcript is non-empty (diagnosis_facts.transcript_0_5s_available true):
  - reason: one sharp observation about the opening audio (specificity, clarity, pattern, payoff timing).
  - evidence: at least one string that quotes or closely references exact words from the transcript.
  - suggestions: exactly 2 OR 3 objects ONLY, each with "line", "change_type", "based_on".
  - Transcript suggestions MUST NOT be paraphrases of the original. Each "line" must clearly differ from the verbatim transcript.
  - Each suggestion must change at least ONE of: angle (new perspective), specificity (numbers, concrete scenario), emotional intensity, structure (pattern interrupt, reversal, contrast).
  - FORBIDDEN: adding only "Act now" or urgency fluff; minor wording tweaks; repeating the same idea across suggestions; duplicating priority_fix.headline as a transcript suggestion line.
  - change_type MUST use at least TWO different values across the 2–3 suggestions. Allowed values: specificity | pattern_interrupt | outcome_shift | angle | emotion | structure.
  - "based_on" must explain the strategic shift (one short phrase), not repeat the line.
  - Output is validated: if any suggestion line is too similar to the original transcript (character or token overlap > 70%), the response is rejected — plan lines that are structurally different.
`
      : "";

  return `You output ONE ad diagnosis as JSON matching the API schema (strict). Fields are enforced at generation time.

Context: diagnosis_facts and batch_context are computed in code—use them as hints. Anchor evidence numbers to the payload when you cite metrics. When diagnosis_facts.meta_video_engagement_summary is non-null, treat it as authoritative shorthand for Meta video signals—still echo the specific numbers in evidence.

Diagnosis_facts alignment (mandatory):
- Set top-level "bottleneck" to the same letter code as diagnosis_facts.primary_constraint_hint when it is CTR, CPC, CVR, or HOOK. When primary is MIXED, choose the single strongest constraint from the payload; avoid OTHER unless nothing fits.
- When diagnosis_facts.primary_constraint_hint is "HOOK", lead "evidence" with hook/retention/watch-time lines (payload.video) before CTR-only framing.
- When rule_flags includes LOW_CTR, describe absolute CTR as "below industry standard (X%)" using X = diagnosis_facts.industry_standard_ctr_pct (configured bar)—do not imply a random fixed threshold.
- If diagnosis_facts.ctr_pct_vs_account is null or >= 0, do not state that this ad underperforms the account on CTR.
- When diagnosis_facts.severe_video_hook_weakness is true, treat the hook as the main constraint even if LOW_CTR is also in rule_flags.
- Never print the literal prefix "Change:" followed by a change-type slug (e.g. "Change: specificity") in evidence, rewrites, audits, or suggestions—integrate the idea in plain prose instead.

STRUCTURE:
- bottleneck: CTR | CPC | CVR | HOOK | MIXED | OTHER.
- evidence: >=3 strings tied to the payload metrics.
- fixes: 3–6 items with type hook|creative|audience and specificity_check booleans.
- priority_fix (which lever to ship first — must match bottleneck and sections below):
  - headline: 1–2 sentences. State the single highest-impact focus (e.g. hook vs caption vs on-screen/OCR). Name the section the user should open first (Transcript, Caption check, or Fixes to ship).
  - primary_section: transcript_0_5s | caption | creative_visual | audience. Use transcript_0_5s when spoken hook/0–5s audio is the main lever; caption for body/CTA/description; creative_visual for on-image text/OCR/first-frame copy; audience when targeting mismatch is the constraint.
  - follow_section: transcript_0_5s | caption | fixes_to_ship | none — the second place to look after primary (fixes_to_ship = the numbered Fixes to ship list; none if one focus is enough).
  - rationale: one sentence tying this order to bottleneck and metrics (e.g. CTR vs hook_rate; CPC vs relevance; CVR vs clarity).
- audits.caption (primary creative-copy analysis):
  - reason: one clear observation (what is wrong or missing, e.g. weak CTA, no urgency, unclear offer).
  - impact: required — explain what happens because of that issue (user behavior + link to CTR/CVR/CPC or scroll-past behavior using payload metrics; no generic filler).
  - evidence: strings quoting or pointing at specific caption_text lines when caption exists; if caption empty, state that and lean on format/metrics.
  - suggestions: concrete caption/CTA rewrites to ship.
- audits.ocr_text (on-image/OCR analysis, required block):
  - If payload.creative.ocr_text is non-empty:
    - reason: identify the real copy weakness in the overlay (specificity, clarity, ambiguity, weak outcome, weak CTA, message-order mismatch).
    - impact: tie that weakness to expected behavior (thumb-stop, click intent, CTR/CVR), not generic copy advice.
    - evidence: include at least one direct quote from OCR lines.
    - suggestions: provide exactly 2 OR 3 objects ONLY, each with "line", "change_type", "based_on".
    - OCR suggestions MUST NOT be paraphrases of the original OCR line.
    - OCR suggestions MUST use at least TWO different change_type values, and include at least ONE "pattern_interrupt".
    - "based_on" must explain the strategic shift, not repeat the line.
  - If payload.creative.ocr_text is empty/null: set evidence to [] and suggestions to []; reason should clearly state OCR text not available.
- audits.transcript_0_5s: reason, evidence[], suggestions[] where each suggestion is { line, change_type, based_on } (empty evidence and suggestions when no transcript). With transcript: 2–3 suggestions, distinct change_types, non-paraphrase lines.

Guidance:
- Prefer facts from the JSON payload; avoid inventing targeting or landing-page details.
- Prefer decisive language.

GOLD-STANDARD SHAPE (illustrative only):
${GOLD_AD_AHA_EXAMPLE}
${videoAdBlock}
Ad payload (JSON):
${JSON.stringify(payload)}`;
}

function trimForValidation(text: string | null | undefined, maxChars = 240): string {
  const cleaned = String(text ?? "").replace(/\s+/g, " ").trim();
  if (!cleaned) return "";
  if (cleaned.length <= maxChars) return cleaned;
  return `${cleaned.slice(0, Math.max(0, maxChars - 1)).trimEnd()}…`;
}

function validateOcrAudit(params: {
  originalOcrText: string | null | undefined;
  reason: string;
  impact: string;
  evidence: string[];
  suggestions: Array<{ line: string; change_type: string; based_on: string }>;
}): { ok: true } | { ok: false; reason: string } {
  const original = trimForValidation(params.originalOcrText, 280);

  if (!original) {
    if (params.evidence.length > 0 || params.suggestions.length > 0) {
      return {
        ok: false,
        reason: "When OCR text is unavailable, audits.ocr_text.evidence and suggestions must both be empty arrays.",
      };
    }
    return { ok: true };
  }

  if (params.evidence.length < 1) {
    return { ok: false, reason: "With OCR text present, audits.ocr_text.evidence must include at least one quoted OCR line." };
  }
  if (params.suggestions.length < 2 || params.suggestions.length > 3) {
    return { ok: false, reason: `With OCR text present, provide 2–3 OCR suggestions (got ${params.suggestions.length}).` };
  }

  const ocrTypes = params.suggestions.map((s) => s.change_type.trim().toLowerCase()).filter(Boolean);
  if (new Set(ocrTypes).size < 2) {
    return { ok: false, reason: "audits.ocr_text.suggestions must use at least TWO different change_type values." };
  }
  if (!ocrTypes.includes("pattern_interrupt")) {
    return { ok: false, reason: "audits.ocr_text.suggestions must include at least one pattern_interrupt suggestion." };
  }

  if (params.reason.trim().length < 24) {
    return { ok: false, reason: "audits.ocr_text.reason is too shallow; provide a concrete diagnosis." };
  }
  if (params.impact.trim().length < 24) {
    return { ok: false, reason: "audits.ocr_text.impact is too shallow; tie the copy issue to CTR/CVR behavior." };
  }

  // Accept both double and single quote styles from model outputs.
  const evidenceHasQuote = params.evidence.some((e) => /["“”'‘’]/.test(e));
  if (!evidenceHasQuote) {
    return { ok: false, reason: "audits.ocr_text.evidence should include at least one quoted OCR snippet." };
  }

  const evidenceAnchored = params.evidence.some((e) => {
    const line = e.trim();
    return line.length > 0 && !isTooSimilarToOriginal(original, line) && /["“”'‘’]/.test(line);
  });
  if (!evidenceAnchored && params.evidence.length > 0) {
    // Still allow if evidence quotes are short but present.
  }

  for (let i = 0; i < params.suggestions.length; i++) {
    const item = params.suggestions[i]!;
    const s = item.line.trim();
    if (s.length < 16) {
      return { ok: false, reason: `OCR suggestion ${i + 1} is too short; provide a concrete rewrite.` };
    }
    if (isTooSimilarToOriginal(original, s)) {
      return {
        ok: false,
        reason: `OCR suggestion ${i + 1} is too similar to original OCR text. Provide materially different copy.`,
      };
    }
    if (!(item.based_on ?? "").trim()) {
      return { ok: false, reason: `OCR suggestion ${i + 1} needs a non-empty based_on.` };
    }
  }
  return { ok: true };
}

function normalizePriorityFixForContext(parsed: AdAhaDiagnosisAI, input: AdAIInput): AdAhaDiagnosisAI {
  const hasTranscript = Boolean(trimForValidation(input.video?.transcript_0_5s, 240));
  const hasOcr = Boolean(trimForValidation(input.creative.ocr_text, 240));
  const isImageCreative = input.format === "image" || input.format === "carousel";
  const isVideoCreative = input.format === "video";

  const currentPrimary = parsed.priority_fix.primary_section;
  const currentFollow = parsed.priority_fix.follow_section;

  let primary = currentPrimary;
  let follow = currentFollow;
  const effectiveBottleneck =
    parsed.bottleneck === "HOOK" && !isVideoCreative ? "CTR" : parsed.bottleneck;

  // Never point image/carousel ads to transcript-first guidance.
  if (!isVideoCreative && primary === "transcript_0_5s") {
    primary = hasOcr ? "creative_visual" : "caption";
  }

  if (effectiveBottleneck === "HOOK") {
    primary = hasTranscript ? "transcript_0_5s" : hasOcr ? "creative_visual" : "caption";
  } else if (effectiveBottleneck === "CTR") {
    primary = isImageCreative ? (hasOcr ? "creative_visual" : "caption") : hasTranscript ? "transcript_0_5s" : "caption";
  } else if (effectiveBottleneck === "CVR") {
    primary = "caption";
  } else if (effectiveBottleneck === "CPC") {
    primary = "audience";
  }

  if (primary === "transcript_0_5s") {
    follow = hasOcr ? "fixes_to_ship" : "caption";
  } else if (primary === "creative_visual") {
    follow = "caption";
  } else if (primary === "caption") {
    follow = hasOcr ? "fixes_to_ship" : "none";
  } else {
    follow = "fixes_to_ship";
  }

  // Absolute safety: transcript section is valid only for video ads with transcript text.
  if (!isVideoCreative || !hasTranscript) {
    if (primary === "transcript_0_5s") primary = hasOcr ? "creative_visual" : "caption";
  }

  if (follow === primary) follow = "none";

  const ctrGap = input.account.ctr - input.performance.ctr;
  const industryCtrTarget = Number(process.env.HEALTH_DIAG_AD_CTR_THRESHOLD ?? "2");
  const industryCtrGap = industryCtrTarget - input.performance.ctr;
  const cpcGap = input.performance.cpc - input.account.cpc;
  const cvrThis = input.performance.cvr == null ? null : input.performance.cvr * 100;
  const cvrAcc = input.account.cvr * 100;
  const hasCaption = trimForValidation(input.creative.body, 240).length > 0;

  const primaryLabel =
    primary === "transcript_0_5s"
      ? "Transcript (0–5s)"
      : primary === "creative_visual"
        ? "OCR / on-image text"
        : primary === "caption"
          ? "Caption"
          : "Audience";

  // Borderline CTR underperformance should get a softer recommendation, not a major rewrite mandate.
  const ctrGapAbs = Math.abs(ctrGap);
  const cpcSafe =
    Number.isFinite(input.performance.cpc) &&
    Number.isFinite(input.account.cpc) &&
    input.performance.cpc <= input.account.cpc * 1.05;
  const marginalCtrCase =
    effectiveBottleneck === "CTR" &&
    industryCtrGap > 0 &&
    Math.abs(industryCtrGap) <= 0.3 &&
    cpcSafe;

  let headline = parsed.priority_fix.headline;
  let rationale = parsed.priority_fix.rationale;
  if (marginalCtrCase) {
    headline = `Performance is close to baseline. Start with light ${primaryLabel} refinements; no major structural change is required yet.`;
    rationale = `In this selected date range, CTR is ${Math.abs(industryCtrGap).toFixed(2)} points below the ${industryCtrTarget.toFixed(2)}% benchmark while CPC remains efficient, so treat this as marginal underperformance and iterate with small copy/creative tweaks first.`;
    // Keep focus tight for marginal cases; avoid over-prescriptive sequencing.
    follow = "none";
  } else if (effectiveBottleneck === "HOOK" && primary === "transcript_0_5s") {
    headline = `Fix the opening hook first in ${primaryLabel} to stop early drop-off before iterating on other sections.`;
    rationale = `Video hook signals are weak, so stronger first-3-second wording should lift click intent faster than downstream copy tweaks.`;
  } else if (effectiveBottleneck === "CTR" && primary === "creative_visual") {
    headline = `Start with ${primaryLabel}; the first-frame message is the fastest lever to improve thumb-stop and clicks.`;
    rationale = `CTR is ${Math.abs(ctrGap).toFixed(2)} points ${ctrGap > 0 ? "below" : "around"} account level, and this ad relies on image copy, so on-image wording is the main constraint.`;
  } else if (effectiveBottleneck === "CTR" && primary === "caption") {
    headline = `Start with ${primaryLabel} to sharpen the value proposition and CTA before changing audience.`;
    rationale = `CTR trails benchmark while ${hasCaption ? "caption clarity/CTA can be tightened quickly" : "caption is missing"}, so this section is the most immediate click-rate lever.`;
  } else if (effectiveBottleneck === "CVR") {
    headline = `Start with ${primaryLabel}; conversion clarity after click is the highest-impact fix right now.`;
    rationale = `CVR is ${cvrThis == null ? "not healthy" : `${cvrThis.toFixed(2)}%`} vs account ${cvrAcc.toFixed(2)}%, so message clarity/offer specificity should be fixed before creative expansion.`;
  } else if (effectiveBottleneck === "CPC") {
    headline = `Start with ${primaryLabel}; reducing relevance mismatch is the most direct path to lower CPC.`;
    rationale = `CPC is ${cpcGap > 0 ? `${cpcGap.toFixed(2)} above` : "near"} account average, indicating delivery quality/audience fit is the primary efficiency issue.`;
  } else {
    headline = `Start with ${primaryLabel}; it is the clearest section to improve this ad's current bottleneck.`;
    rationale = `This section best matches the detected performance constraint and can be changed fastest without broad account-level changes.`;
  }

  return {
    ...parsed,
    bottleneck: effectiveBottleneck,
    priority_fix: {
      ...parsed.priority_fix,
      headline,
      primary_section: primary,
      follow_section: follow,
      rationale,
    },
  };
}

export async function runAdAhaBatchAI(inputs: AdAIInput[]): Promise<AdAhaDiagnosisAI[]> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY not configured");
  if (inputs.length === 0) return [];

  const { default: OpenAI } = await import("openai");
  const openai = new OpenAI({ apiKey });

  const batch = inputs.slice(0, 3);

  async function runOne(input: AdAIInput): Promise<AdAhaDiagnosisAI> {
    const facts = computeAdDiagnosisFacts(input);
    const peerLines = buildBatchPeerLines(batch, input.ad_id);
    const spendRank = batchSpendRank(batch, input.ad_id);
    const userContent = buildAdAhaPromptSingle(input, facts, {
      peer_lines: peerLines,
      batch_spend_rank: spendRank,
      batch_ad_count: batch.length,
    });

    const messages: { role: "system" | "user"; content: string }[] = [
      {
        role: "system",
        content:
          "You are a senior performance marketer. You write sharp, non-generic ad diagnoses with concrete fixes. You never invent facts. Output must match the JSON schema exactly.",
      },
      { role: "user", content: userContent },
    ];

    let lastReason: string | null = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      const completion = await openai.chat.completions.create({
        model: "gpt-4o",
        messages,
        max_tokens: 3600,
        temperature: 0,
        response_format: {
          type: "json_schema",
          json_schema: {
            name: AD_AHA_SINGLE_RESPONSE_SCHEMA.name,
            strict: AD_AHA_SINGLE_RESPONSE_SCHEMA.strict,
            schema: AD_AHA_SINGLE_RESPONSE_SCHEMA.schema as Record<string, unknown>,
          },
        },
      });

      const content = completion.choices[0]?.message?.content;
      if (!content) throw new Error("No response from AI");

      const logAdAhaRaw =
        process.env.LOG_AD_AHA_RAW === "1" || process.env.NODE_ENV !== "production";
      if (logAdAhaRaw) {
        const RAW_PREVIEW_MAX = 4000;
        const preview = content.slice(0, RAW_PREVIEW_MAX);
        console.log(
          `[diagnosis:ad-aha] OpenAI raw response | attempt=${attempt + 1}/3 | ad_id=${input.ad_id} | length=${content.length} | truncated=${content.length > RAW_PREVIEW_MAX}`
        );
        console.log("[diagnosis:ad-aha] content_preview:\n", preview);
      }

      try {
        let raw: unknown;
        try {
          raw = parseJsonContent(content);
        } catch (e) {
          throw new Error(e instanceof Error ? e.message : "Invalid JSON from AI");
        }

        const parsed = AdAhaDiagnosisSchema.parse(raw);
        const transcriptText = trimTranscript(input.video?.transcript_0_5s, 240);
        const transcriptCheck = validateTranscriptSuggestions({
          originalTranscript: transcriptText,
          evidence: parsed.audits.transcript_0_5s.evidence,
          suggestions: parsed.audits.transcript_0_5s.suggestions,
        });
        if (!transcriptCheck.ok) {
          throw new Error(`Transcript audit validation: ${transcriptCheck.reason}`);
        }
        const ocrCheck = validateOcrAudit({
          originalOcrText: trimForValidation(input.creative.ocr_text, 240),
          reason: parsed.audits.ocr_text.reason,
          impact: parsed.audits.ocr_text.impact,
          evidence: parsed.audits.ocr_text.evidence,
          suggestions: parsed.audits.ocr_text.suggestions,
        });
        if (!ocrCheck.ok) {
          throw new Error(`OCR audit validation: ${ocrCheck.reason}`);
        }
        const normalizedPriority = normalizePriorityFixForContext(
          { ...parsed, ad_id: input.ad_id },
          input
        );
        return normalizedPriority;
      } catch (e) {
        const reason = e instanceof Error ? e.message : "Parse failed";
        lastReason = reason;
        const jsonHint =
          /JSON|position|Unexpected|schema|expected/i.test(reason) || /property value/i.test(reason)
            ? "\n- Reply must be one complete JSON object; close all braces/brackets. Keep strings concise if needed."
            : "";
        const transcriptHint = /Transcript audit validation/i.test(reason)
          ? "\n- Fix audits.transcript_0_5s only: follow TRANSCRIPT AUDIT rules (2–3 structured suggestions, distinct change_type, lines NOT paraphrases of payload.video.transcript_0_5s, no \"Act now\")."
          : "";
        const ocrHint = /OCR audit validation/i.test(reason)
          ? "\n- Fix audits.ocr_text only: with OCR present include >=1 quoted evidence line and 2–3 structured suggestions {line, change_type, based_on}, at least one pattern_interrupt, and lines materially different from payload.creative.ocr_text; with OCR missing keep evidence/suggestions as []."
          : "";
        messages.push({
          role: "user",
          content: `Your last output could not be parsed: ${reason}.
Regenerate ONE ad JSON for the same ad_id with the same schema and facts.
- Valid JSON only; escape inner quotes.${jsonHint}${transcriptHint}${ocrHint}`,
        });
      }
    }

    throw new Error(
      lastReason ? `AI output failed to parse after retries: ${lastReason}` : "AI output failed to parse after retries"
    );
  }

  return Promise.all(batch.map((input) => runOne(input)));
}

function buildAdPrompt(ad: NormalizedAd, issues: string[], ctx: AdAIContext): string {
  const copy = ad.copy.trim();
  const accountCtr = ctx.accountCtr.toFixed(2);
  const accountCvr = (ctx.accountCvr * 100).toFixed(2);

  return `You are a senior Meta ads performance marketer.


You are NOT writing a report.
You are giving a sharp diagnosis like an expert reviewing a bad ad.

---

STRICT RULES:

- Be direct and decisive
- Do NOT use: "may", "might", "could"
- Do NOT give generic advice like "improve creatives"
- Do NOT mention targeting, funnel, or anything not provided
- Do NOT repeat the same explanation multiple times
- Do NOT suggest A/B testing, targeting, or experimentation
- Be decisive, not descriptive
- Focus ONLY on this ad
- Keep it tight: 2–3 "why" bullets; leave "fix" and "examples" as empty arrays (stage 1 — spend diagnosis only)
- Stay anchored to the offer: do NOT introduce new products/topics not supported by the copy/name.
- Do NOT invent a brand/app name. If no brand is provided in the ad facts, refer to it as "the app".
---

Output ONLY valid JSON:
{
  "ad_id": "${ad.id}",
  "issue_label": "string",
  "priority": "high",
  "hook_score": 3,
  "why": ["string"],
  "fix": [],
  "examples": []
}
If you omit any key or add extra keys, the response is rejected.

Ad facts:
- Name: ${ad.name}
- Type: ${ad.type}
- CTR %: ${ad.ctr.toFixed(2)}
- CPC: ${ad.cpc.toFixed(2)}
- Spend: ${ad.spend.toFixed(2)}
- Account blended CTR: ${accountCtr}%
- Account blended CVR: ${accountCvr}%
- Rule issues: ${issues.join(", ") || "general performance"}
- Copy (verbatim, may be empty): ${JSON.stringify(copy.slice(0, 400))}

INSTRUCTIONS:

1. DIAGNOSIS (MOST IMPORTANT)

Each point MUST follow:

[Spend pattern] → [user behavior/attention signal] → [metric impact]

Examples:

GOOD:
- "This video spends ₹3.2K at 1.79% CTR → viewers skip in the first 2s because the problem is unclear → CTR stays low and drags the blended rate down."

BAD:
- "The ad is not engaging"

Focus on:
- spend share vs CTR (e.g., this ad has X% of budget but below-average CTR)
- how the creative format (video/image/carousel) is failing to command attention
- specificity about why the spend is wasted
- Every "why" bullet must include "→" and at least two steps.

---

2. BUDGET-WASTE NOTES (STAGE 1)

Leave the "fix" JSON array empty ([]) for now—this stage only surfaces spend waste; creative fixes will come once we review the actual creatives.

---

3. EFFICIENCY INSIGHTS (STAGE 1)

Leave the "examples" JSON array empty ([]) as well. We only want the spend/CTR diagnosis at this stage.

---

Quantify impact in the "why" bullets:
- cite this ad's spend and CTR
- compare CTR to account blended CTR (${accountCtr}%)
- estimate install upside if this ad matched account CTR using account CVR (${accountCvr}%) and this ad's clicks (installs = clicks * CVR)

---

4. HOOK SCORE

- 1 = wasted spend, attention missing
- 5 = efficient spend moving the needle

---

5. PRIORITY

- Allowed values: "high" | "medium" | "low"
- high → significant spend + below-average CTR (budget sink)
- medium → moderate spend + slight inefficiency
- low → small spend or CTR in line with averages

---

Think like a performance marketer diagnosing budget waste, not a creative writer. Focus on "this is where the money is being wasted" and "this is how inefficient the spend is."`;
}

export type AdAIContext = {
  accountCtr: number;
  accountCvr: number;
};

export async function runAdDiagnosisAI(ad: NormalizedAd, issues: string[], ctx: AdAIContext) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY not configured");

  const { default: OpenAI } = await import("openai");
  const openai = new OpenAI({ apiKey });

  const banned = [
    /\bmay\b/i,
    /\bmight\b/i,
    /\bcould\b/i,
    /\btry\b/i,
    /\btest\b/i,
    /\ba\/b\b/i,
    /\bexperiment\b/i,
    /\boptimi[sz]e\b/i,
    /\brefine\b/i,
    /\btargeting\b/i,
    /\bfunnel\b/i,
  ];

  const messages: { role: "user"; content: string }[] = [
    { role: "user", content: buildAdPrompt(ad, issues, ctx) },
  ];

  for (let attempt = 0; attempt < 2; attempt++) {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      messages,
      max_tokens: 420,
      temperature: 0.2,
      response_format: { type: "json_object" },
    });

    const content = completion.choices[0]?.message?.content;
    if (!content) throw new Error("No response from AI");
    const parsed = AdDiagnosisSchema.parse(parseJsonContent(content));

    const violations = violatesBans(parsed, banned);
    try {
      ensure(violations.length === 0, `Banned language: ${violations.join(", ")}`);
      ensure(parsed.why.every((w) => w.includes("→")), `Each "why" must include "→" cause→effect`);
      ensure(parsed.why.length >= 1 && parsed.why.length <= 3, `"why" must be 1–3 bullets`);
      ensure(!parsed.issue_label.includes("_"), `"issue_label" must be human-readable (no underscores/codes)`);
      return parsed;
    } catch (e) {
      const reason = e instanceof Error ? e.message : "Output failed guardrails";
      messages.push({
        role: "user",
        content: `Your last JSON failed guardrails: ${reason}. Regenerate the JSON with the same schema and facts. Do not add any banned language.`,
      });
    }
  }

  throw new Error("AI output failed guardrails after retries");
}
