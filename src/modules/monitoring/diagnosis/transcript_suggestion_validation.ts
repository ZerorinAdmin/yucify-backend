/**
 * Hard checks for audits.transcript_0_5s.suggestions vs original 0–5s transcript.
 * Rejects near-paraphrases so the model must propose structurally different hooks.
 */

const STOPWORDS = new Set([
  "a",
  "an",
  "the",
  "and",
  "or",
  "but",
  "in",
  "on",
  "at",
  "to",
  "for",
  "of",
  "is",
  "are",
  "was",
  "were",
  "be",
  "been",
  "being",
  "have",
  "has",
  "had",
  "do",
  "does",
  "did",
  "will",
  "your",
  "you",
  "we",
  "our",
  "it",
  "this",
  "that",
  "with",
  "from",
  "as",
  "by",
]);

export type TranscriptSuggestionInput = {
  line: string;
  change_type: string;
  based_on: string;
};

function tokenize(text: string): Set<string> {
  const raw = text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]+/gu, " ")
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length > 1 && !STOPWORDS.has(t));
  return new Set(raw);
}

function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const row = new Array<number>(n + 1);
  for (let j = 0; j <= n; j++) row[j] = j;
  for (let i = 1; i <= m; i++) {
    let prev = row[0]!;
    row[0] = i;
    for (let j = 1; j <= n; j++) {
      const tmp = row[j]!;
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      row[j] = Math.min(row[j]! + 1, row[j - 1]! + 1, prev + cost);
      prev = tmp;
    }
  }
  return row[n]!;
}

/** 1 = identical, 0 = very different (normalized by max length). */
export function charSimilarityRatio(a: string, b: string): number {
  const s1 = a.toLowerCase().trim();
  const s2 = b.toLowerCase().trim();
  if (s1.length === 0 && s2.length === 0) return 1;
  if (s1.length === 0 || s2.length === 0) return 0;
  const dist = levenshtein(s1, s2);
  return 1 - dist / Math.max(s1.length, s2.length);
}

/** Share of shorter token multiset covered by intersection (0–1). */
export function tokenOverlapRatio(a: string, b: string): number {
  const ta = tokenize(a);
  const tb = tokenize(b);
  if (ta.size === 0 || tb.size === 0) return 0;
  let inter = 0;
  for (const t of ta) {
    if (tb.has(t)) inter += 1;
  }
  return inter / Math.min(ta.size, tb.size);
}

const SIM_THRESHOLD = 0.7;

export function isTooSimilarToOriginal(original: string, suggestionLine: string): boolean {
  const o = original.trim();
  const s = suggestionLine.trim();
  if (!o || !s) return false;
  if (charSimilarityRatio(o, s) > SIM_THRESHOLD) return true;
  if (tokenOverlapRatio(o, s) > SIM_THRESHOLD) return true;
  return false;
}

const BANNED_PHRASES = /\bact\s+now\b/i;

export function validateTranscriptSuggestions(params: {
  originalTranscript: string | null | undefined;
  evidence: string[];
  suggestions: TranscriptSuggestionInput[];
}): { ok: true } | { ok: false; reason: string } {
  const orig = (params.originalTranscript ?? "").trim();

  if (!orig) {
    if (params.evidence.length > 0 || params.suggestions.length > 0) {
      return {
        ok: false,
        reason:
          "When no transcript is available, transcript_0_5s.evidence and suggestions must both be empty arrays.",
      };
    }
    return { ok: true };
  }

  if (params.evidence.length < 1) {
    return {
      ok: false,
      reason: "With transcript present, transcript_0_5s.evidence must include at least one quoted or specific observation.",
    };
  }

  if (params.suggestions.length < 2 || params.suggestions.length > 3) {
    return {
      ok: false,
      reason: `With transcript present, provide 2–3 transcript suggestions (got ${params.suggestions.length}).`,
    };
  }

  const types = params.suggestions.map((x) => x.change_type.trim().toLowerCase());
  const uniqueTypes = new Set(types);
  if (uniqueTypes.size < 2) {
    return {
      ok: false,
      reason: "transcript_0_5s.suggestions must use at least TWO different change_type values.",
    };
  }

  for (let i = 0; i < params.suggestions.length; i++) {
    const item = params.suggestions[i]!;
    const line = item.line.trim();
    if (!line) {
      return { ok: false, reason: `Suggestion ${i + 1} has empty line.` };
    }
    if (BANNED_PHRASES.test(line)) {
      return {
        ok: false,
        reason: `Suggestion ${i + 1} must not use the phrase "Act now" (banned).`,
      };
    }
    if (isTooSimilarToOriginal(orig, line)) {
      return {
        ok: false,
        reason: `Suggestion ${i + 1} is too similar to the original transcript (char or token overlap > ${SIM_THRESHOLD}). Rewrite with a different angle, structure, or specificity.`,
      };
    }
    if (!(item.based_on ?? "").trim()) {
      return { ok: false, reason: `Suggestion ${i + 1} needs a non-empty based_on.` };
    }
  }

  return { ok: true };
}
