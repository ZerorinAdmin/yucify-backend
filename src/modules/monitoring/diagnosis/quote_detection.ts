/**
 * Shared quote detection for why.see guardrails and legacy repair helpers.
 * Normalizes typographic / fullwidth / guillemet marks so models are not penalized for Unicode quotes.
 */

function stripInvisibleAndNbsp(text: string): string {
  return text
    .replace(/[\u200B-\u200D\uFEFF\u2060]/g, "")
    .replace(/\u00A0/g, " ");
}

/** Map common opening/closing double marks and guillemets to ASCII ". */
function normalizeDoubleQuotesForDetection(text: string): string {
  return text
    .replace(/[\u201C\u201D\u201E\u201F\u301D\u301E\uFF02]/g, '"')
    .replace(/\u00AB/g, '"')
    .replace(/\u00BB/g, '"');
}

/** Map typographic single quotes / primes often used as string delimiters to ASCII '. */
function normalizeSingleQuotesForDetection(text: string): string {
  return text.replace(/[\u2018\u2019\u2032\u0060\u00B4]/g, "'");
}

/** Prepare text before running quote regexes (strip ZWSP/NBSP, unify quote glyphs). */
export function prepareSeeForQuoteChecks(text: string): string {
  return normalizeSingleQuotesForDetection(
    normalizeDoubleQuotesForDetection(stripInvisibleAndNbsp(text))
  );
}

const RE_ASCII_DOUBLE_QUOTED = /"((?:[^"\\]|\\.){3,})"/;

/** True if the string contains a plausible double-quoted segment (ASCII " after normalize). */
export function includesQuotedSnippet(text: string): boolean {
  const t = prepareSeeForQuoteChecks(text);
  if (RE_ASCII_DOUBLE_QUOTED.test(t)) return true;
  // Outer single quotes, long inner span (avoids most "it's" false opens); min 10 chars.
  return /'([^'\r\n]{10,})'/.test(t);
}

/** True when quotes exist but the inner span has fewer than 3 non-space characters (e.g. "" or "   "). */
export function hasOnlyDegenerateQuotedSnippet(text: string): boolean {
  if (!includesQuotedSnippet(text)) return false;
  const inner = extractFirstQuotedSnippet(text);
  if (!inner) return true;
  return inner.replace(/\s+/g, "").length < 3;
}

/** Hollow placeholder the model uses when it has nothing to quote: only empty or whitespace between quotes. */
export function isHollowQuotedSeePlaceholder(text: string): boolean {
  const t = prepareSeeForQuoteChecks(text).trim();
  if (t === '""' || t === "''") return true;
  if (/^"\s*"$/.test(t)) return true;
  if (/^'\s*'$/.test(t)) return true;
  return false;
}

/** First quoted segment for grounding checks: prefers double quotes, else long single-quoted span. */
export function extractFirstQuotedSnippet(text: string): string | null {
  const t = prepareSeeForQuoteChecks(text);
  const dm = t.match(RE_ASCII_DOUBLE_QUOTED);
  if (dm?.[1]) {
    return dm[1]
      .replace(/\\"/g, '"')
      .replace(/\\\\/g, "\\")
      .trim();
  }
  const sm = t.match(/'([^'\r\n]{10,})'/);
  return sm?.[1]?.trim() ?? null;
}

/** Collapse exotic double-quote glyphs to ASCII for cleaner UI (why.see). */
export function canonicalizeWhySeeDisplayQuotes(text: string): string {
  return prepareSeeForQuoteChecks(text);
}
