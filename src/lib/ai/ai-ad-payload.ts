/**
 * Transforms database/ad rows into AI-friendly format and computes aggregated signals.
 */

export type AIAd = {
  text: string | null;
  headline: string | null;
  description: string | null;
  cta: string | null;
  format: string | null;
  landing_page: string | null;
  active_since: string | null;
  active_days: number | null;
  creative_variants: number | null;
  platforms: string[] | null;
};

export type AdSignals = {
  total_ads: number;
  format_distribution: Record<string, number>;
  cta_frequency: Record<string, number>;
  landing_page_frequency: Record<string, number>;
  long_running_ads: number;
  scaled_creatives: number;
  avg_active_days: number;
};

export type AnalysisPhraseSignal = {
  phrase: string;
  count: number;
  cluster: "problem-led" | "benefit-led" | "proof-led" | "mechanism-led" | "trust-led" | "urgency-led";
};

export type AnalysisProductSignal = {
  product_or_theme: string;
  ad_count: number;
  format_mix: Record<string, number>;
  role: "hero" | "test" | "supporting";
  evidence: string[];
};

export type AnalysisCreativeCluster = {
  cluster_key: string;
  weight: number;
  representative_ad: AIAd;
  format_mix: Record<string, number>;
  landing_pages: string[];
  ctas: string[];
  avg_active_days: number | null;
  max_active_days: number | null;
  max_creative_variants: number | null;
  score: number;
  evidence: string[];
};

export type AnalysisContext = {
  unique_creatives: number;
  top_clusters: AnalysisCreativeCluster[];
  product_signals: AnalysisProductSignal[];
  funnel_breakdown: {
    tof: number;
    mof: number;
    bof: number;
    evidence: Record<"tof" | "mof" | "bof", string[]>;
  };
  offer_signals: {
    categories: Record<string, number>;
    most_used: string;
    evidence: string[];
  };
  phrase_signals: AnalysisPhraseSignal[];
  headline_cta_signals: {
    recurring_verbs: string[];
    emotional_triggers: string[];
    urgency_cues: string[];
    dominant_intent: "education" | "conversion" | "mixed";
    top_ctas: Array<{ cta: string; count: number }>;
  };
  angle_hints: {
    by_angle: Record<string, number>;
    scaled: string[];
    tested: string[];
  };
};

export type AIInputPayload = {
  competitor: string;
  signals: AdSignals;
  winning_ads: AIAd[];
  ads_dataset: AIAd[];
  analysis_context: AnalysisContext;
};

/** DB/API row shape - accepts both DB field names and API response names */
export type RawAdInput = {
  ad_text?: string | null;
  ad_headline?: string | null;
  ad_description?: string | null;
  cta?: string | null;
  display_format?: string | null;
  landing_page_url?: string | null;
  landing_page?: string | null;
  ad_start_date?: string | null;
  start_date?: string | null;
  collation_count?: number | null;
  publisher_platforms?: string[] | null;
  is_active?: boolean | null;
};

const FORMAT_KEYS = ["VIDEO", "IMAGE", "CAROUSEL", "COLLECTION", "DCO"] as const;
const DEFAULT_FORMATS = ["video", "image", "carousel", "collection"] as const;
const STOPWORDS = new Set([
  "a",
  "an",
  "and",
  "are",
  "as",
  "at",
  "be",
  "by",
  "for",
  "from",
  "how",
  "if",
  "in",
  "into",
  "is",
  "it",
  "of",
  "on",
  "or",
  "that",
  "the",
  "their",
  "this",
  "to",
  "with",
  "your",
  "you",
  "our",
  "we",
  "get",
  "can",
  "today",
  "more",
  "will",
  "now",
]);
const PRODUCT_SLUG_STOPWORDS = new Set([
  "",
  "ad",
  "ads",
  "app",
  "apps",
  "calculator",
  "contact",
  "core",
  "home",
  "index",
  "install",
  "landing",
  "lead",
  "lp",
  "offer",
  "offers",
  "page",
  "plan",
  "product",
  "products",
  "saas",
  "signup",
  "start",
  "software",
  "solution",
  "solutions",
  "tool",
  "tools",
  "web",
]);
const PROBLEM_KEYWORDS = [
  "stress",
  "debt",
  "loan",
  "emi",
  "harassment",
  "overdue",
  "late",
  "pain",
  "struggling",
  "burden",
  "trap",
  "reject",
  "anxiety",
  "sleepless",
  "missed",
  "collection",
];
const BENEFIT_KEYWORDS = [
  "save",
  "reduce",
  "lower",
  "consolidate",
  "combine",
  "settle",
  "simplify",
  "freedom",
  "relief",
  "peace",
  "score",
  "better",
  "faster",
  "plan",
  "single emi",
];
const PROOF_KEYWORDS = [
  "factually",
  "guaranteed",
  "guarantee",
  "verified",
  "proof",
  "proven",
  "results",
  "customers",
  "businesses",
  "case study",
  "data",
];
const MECHANISM_KEYWORDS = [
  "tracking",
  "attribution",
  "ai",
  "measure",
  "source of truth",
  "measurement",
  "demo",
  "platform",
  "system",
];
const TRUST_KEYWORDS = [
  "trusted",
  "real",
  "review",
  "legal",
  "transparent",
  "support",
  "expert",
  "proven",
  "rated",
  "customers",
  "results",
  "story",
  "stories",
  "years",
];
const URGENCY_KEYWORDS = [
  "today",
  "now",
  "limited",
  "before",
  "urgent",
  "hurry",
  "enrol",
  "apply",
  "call",
  "start",
  "sign up",
  "download",
  "install",
];
const CTA_ACTION_KEYWORDS = [
  "apply",
  "book",
  "call",
  "contact",
  "download",
  "enrol",
  "install",
  "register",
  "sign up",
  "signup",
  "start",
  "get",
  "check",
];
const CTA_EDUCATION_KEYWORDS = ["learn", "see", "understand", "discover", "watch", "read", "explore"];
const EMOTION_KEYWORDS = [
  "stress",
  "anxiety",
  "freedom",
  "relief",
  "peace",
  "fear",
  "embarrass",
  "dignity",
  "confidence",
  "hope",
  "control",
];
const CREATIVE_ANGLE_KEYWORDS: Record<string, string[]> = {
  UGC: ["i ", "my ", "we ", "our "],
  testimonials: ["story", "stories", "customer", "case", "helped", "results", "review", "testimonial"],
  before_after: ["before", "after", "used to", "now", "then", "finally"],
  problem_solution: ["struggling", "problem", "stuck", "tired", "solution", "plan", "fix", "help"],
  demo: ["how it works", "step", "calculator", "eligibility", "works", "process", "demo"],
  influencer: ["creator", "influencer"],
  founder_led: ["founder", "ceo", "co-founder"],
  brand_film: ["mission", "brand", "why we", "real stories", "rated", "customers"],
};
const PHRASE_SIGNAL_TOKENS = new Set([
  ...PROBLEM_KEYWORDS,
  ...BENEFIT_KEYWORDS,
  ...PROOF_KEYWORDS,
  ...MECHANISM_KEYWORDS,
  ...TRUST_KEYWORDS,
  ...URGENCY_KEYWORDS,
  "roi",
  "tracking",
  "attribution",
  "profit",
  "growth",
  "conversion",
  "credit",
]);
const PHRASE_NOISE_TOKENS = new Set([
  ...STOPWORDS,
  "least",
  "make",
  "made",
  "ads",
  "ad",
  "using",
  "used",
]);
const HARD_CONVERSION_KEYWORDS = [
  "apply",
  "book",
  "call",
  "contact",
  "download",
  "enrol",
  "install",
  "register",
  "sign up",
  "signup",
  "get demo",
  "demo",
  "check eligibility",
  "check savings",
];
const SOLUTION_PROOF_PATTERN =
  /(roi|tracking|attribution|save|reduce|lower|increase|improve|verified|proof|results|eligibility|calculator|consolidat|settlement|single emi|debt relief|score)/;

function daysSince(dateStr: string | null | undefined): number | null {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return null;
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  return Math.floor(diff / (24 * 60 * 60 * 1000));
}

function extractLandingPageKey(url: string | null | undefined): string | null {
  if (!url?.trim()) return null;
  try {
    const u = url.trim();
    if (!u.startsWith("http")) return u; // already domain/path
    const parsed = new URL(u);
    const host = parsed.hostname.replace(/^www\./, "");
    const path = parsed.pathname === "/" ? "" : parsed.pathname;
    return path ? `${host}${path}` : host;
  } catch {
    return url.trim();
  }
}

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function normalizeForKey(value: string | null | undefined): string {
  if (!value) return "";
  return normalizeWhitespace(value.toLowerCase().replace(/[^\p{L}\p{N}\s%]/gu, " "));
}

function toFormatBucket(format: string | null | undefined): string {
  const normalized = format?.trim().toUpperCase();
  if (!normalized) return "unknown";
  if (normalized === "VIDEO") return "video";
  if (normalized === "IMAGE") return "image";
  if (normalized === "CAROUSEL") return "carousel";
  if (normalized === "COLLECTION") return "collection";
  if (normalized === "DCO") return "collection";
  return normalized.toLowerCase();
}

function makeFormatMix(): Record<string, number> {
  const mix: Record<string, number> = {};
  for (const key of DEFAULT_FORMATS) mix[key] = 0;
  return mix;
}

function incrementCount(map: Record<string, number>, key: string, amount = 1) {
  map[key] = (map[key] ?? 0) + amount;
}

function candidateAdTexts(ad: AIAd): string[] {
  return [ad.text, ad.headline, ad.description].filter((value): value is string => Boolean(value?.trim()));
}

function summarizeAdEvidence(ad: AIAd): string {
  const main = ad.text ?? ad.headline ?? ad.description ?? "No copy";
  const trimmed = normalizeWhitespace(main).slice(0, 140);
  const cta = ad.cta ? ` | CTA: ${ad.cta}` : "";
  const lp = ad.landing_page ? ` | LP: ${extractLandingPageKey(ad.landing_page)}` : "";
  return `${trimmed}${cta}${lp}`;
}

function bestRepresentativeAd(ads: AIAd[]): AIAd {
  return [...ads].sort((a, b) => scoreAdForPriority(b) - scoreAdForPriority(a))[0] ?? ads[0];
}

function scoreAdForPriority(ad: AIAd): number {
  const textLen = Math.min(ad.text?.length ?? 0, 280) / 40;
  const days = Math.max(0, ad.active_days ?? 0) / 10;
  const variants = Math.max(0, ad.creative_variants ?? 0) * 2;
  const lp = ad.landing_page ? 1.5 : 0;
  return textLen + days + variants + lp;
}

function makeClusterKey(ad: AIAd): string {
  const textKey = normalizeForKey(ad.text ?? "").slice(0, 220);
  const headlineKey = normalizeForKey(ad.headline ?? "").slice(0, 120);
  const lpKey = extractLandingPageKey(ad.landing_page) ?? "";
  const formatKey = toFormatBucket(ad.format);
  return [textKey || "-", headlineKey || "-", lpKey || "-", formatKey].join("|");
}

function buildCreativeClusters(ads: AIAd[]): AnalysisCreativeCluster[] {
  const groups = new Map<string, AIAd[]>();

  for (const ad of ads) {
    const key = makeClusterKey(ad);
    const list = groups.get(key) ?? [];
    list.push(ad);
    groups.set(key, list);
  }

  const clusters = Array.from(groups.entries()).map(([cluster_key, groupedAds]) => {
    const representative = bestRepresentativeAd(groupedAds);
    const format_mix = makeFormatMix();
    const landingPages = new Set<string>();
    const ctas = new Set<string>();

    let totalDays = 0;
    let countDays = 0;
    let maxActiveDays: number | null = null;
    let maxCreativeVariants: number | null = null;

    for (const ad of groupedAds) {
      incrementCount(format_mix, toFormatBucket(ad.format));
      if (ad.landing_page) landingPages.add(extractLandingPageKey(ad.landing_page) ?? ad.landing_page);
      if (ad.cta) ctas.add(ad.cta);

      if (ad.active_days != null && ad.active_days >= 0) {
        totalDays += ad.active_days;
        countDays++;
        maxActiveDays = maxActiveDays == null ? ad.active_days : Math.max(maxActiveDays, ad.active_days);
      }

      if (ad.creative_variants != null) {
        maxCreativeVariants =
          maxCreativeVariants == null ? ad.creative_variants : Math.max(maxCreativeVariants, ad.creative_variants);
      }
    }

    const avgActiveDays = countDays > 0 ? Math.round(totalDays / countDays) : null;
    const score =
      groupedAds.length * 4 +
      Math.max(0, maxActiveDays ?? 0) / 12 +
      Math.max(0, maxCreativeVariants ?? 0) * 2 +
      scoreAdForPriority(representative);

    return {
      cluster_key,
      weight: groupedAds.length,
      representative_ad: representative,
      format_mix,
      landing_pages: Array.from(landingPages).slice(0, 3),
      ctas: Array.from(ctas).slice(0, 3),
      avg_active_days: avgActiveDays,
      max_active_days: maxActiveDays,
      max_creative_variants: maxCreativeVariants,
      score,
      evidence: groupedAds
        .slice()
        .sort((a, b) => scoreAdForPriority(b) - scoreAdForPriority(a))
        .slice(0, 2)
        .map(summarizeAdEvidence),
    };
  });

  return clusters.sort((a, b) => b.score - a.score);
}

function tokenize(value: string): string[] {
  return normalizeForKey(value)
    .split(" ")
    .map((token) => token.trim())
    .filter((token) => token.length > 2 && !STOPWORDS.has(token));
}

function classifyPhraseCluster(phrase: string): AnalysisPhraseSignal["cluster"] {
  if (URGENCY_KEYWORDS.some((keyword) => phrase.includes(keyword))) return "urgency-led";
  if (PROOF_KEYWORDS.some((keyword) => phrase.includes(keyword))) return "proof-led";
  if (MECHANISM_KEYWORDS.some((keyword) => phrase.includes(keyword))) return "mechanism-led";
  if (TRUST_KEYWORDS.some((keyword) => phrase.includes(keyword))) return "trust-led";
  if (BENEFIT_KEYWORDS.some((keyword) => phrase.includes(keyword))) return "benefit-led";
  if (PROBLEM_KEYWORDS.some((keyword) => phrase.includes(keyword))) return "problem-led";
  return "problem-led";
}

function buildPhraseSignals(clusters: AnalysisCreativeCluster[]): AnalysisPhraseSignal[] {
  const phraseCounts = new Map<string, number>();

  for (const cluster of clusters) {
    const source = candidateAdTexts(cluster.representative_ad).join(" ");
    const tokens = tokenize(source);
    const localSeen = new Set<string>();

    for (let size = 2; size <= 4; size++) {
      for (let i = 0; i <= tokens.length - size; i++) {
        const phrase = tokens.slice(i, i + size).join(" ");
        if (phrase.length < 8 || phrase.length > 42) continue;
        if (!isMeaningfulPhrase(phrase)) continue;
        if (localSeen.has(phrase)) continue;
        localSeen.add(phrase);
        phraseCounts.set(phrase, (phraseCounts.get(phrase) ?? 0) + cluster.weight);
      }
    }
  }

  return Array.from(phraseCounts.entries())
    .filter(([, count]) => count >= 2)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15)
    .map(([phrase, count]) => ({
      phrase,
      count,
      cluster: classifyPhraseCluster(phrase),
    }));
}

function isMeaningfulPhrase(phrase: string): boolean {
  const tokens = phrase.split(" ").filter(Boolean);
  if (tokens.length === 0) return false;
  if (PHRASE_NOISE_TOKENS.has(tokens[0]) || PHRASE_NOISE_TOKENS.has(tokens[tokens.length - 1])) return false;
  return tokens.some((token) => PHRASE_SIGNAL_TOKENS.has(token)) || /\d+%/.test(phrase);
}

function deriveProductLabel(key: string, evidenceText: string): string {
  const path = key.includes("/") ? key.split("/").slice(1).join("/") : "";
  const slug = path
    .split("/")
    .flatMap((segment) => segment.split(/[-_]/))
    .map((segment) => segment.trim().toLowerCase())
    .find((segment) => !PRODUCT_SLUG_STOPWORDS.has(segment));

  if (slug) {
    return slug.replace(/\b\w/g, (char) => char.toUpperCase());
  }

  const fallbackTokens = Array.from(
    new Set(tokenize(evidenceText).filter((token) => !PRODUCT_SLUG_STOPWORDS.has(token)))
  ).slice(0, 3);
  if (fallbackTokens.length > 0) {
    return fallbackTokens.join(" ").replace(/\b\w/g, (char) => char.toUpperCase());
  }

  return "Core Offer";
}

function buildProductSignals(clusters: AnalysisCreativeCluster[]): AnalysisProductSignal[] {
  const groups = new Map<
    string,
    { ad_count: number; format_mix: Record<string, number>; evidence: string[]; raw_label: string }
  >();

  for (const cluster of clusters) {
    const landingKey =
      cluster.landing_pages[0] ??
      extractLandingPageKey(cluster.representative_ad.landing_page) ??
      `theme:${normalizeForKey(cluster.representative_ad.headline ?? cluster.representative_ad.text ?? "").slice(0, 40)}`;

    const entry =
      groups.get(landingKey) ??
      {
        ad_count: 0,
        format_mix: makeFormatMix(),
        evidence: [],
        raw_label: deriveProductLabel(
          landingKey,
          `${cluster.representative_ad.headline ?? ""} ${cluster.representative_ad.text ?? ""}`
        ),
      };

    entry.ad_count += cluster.weight;
    for (const [format, count] of Object.entries(cluster.format_mix)) {
      incrementCount(entry.format_mix, format, count);
    }
    for (const evidence of cluster.evidence) {
      if (entry.evidence.length >= 3) break;
      if (!entry.evidence.includes(evidence)) entry.evidence.push(evidence);
    }
    groups.set(landingKey, entry);
  }

  const ordered = Array.from(groups.values()).sort((a, b) => b.ad_count - a.ad_count).slice(0, 6);
  return ordered.map((entry, index) => ({
    product_or_theme: entry.raw_label,
    ad_count: entry.ad_count,
    format_mix: entry.format_mix,
    role: index < 2 ? "hero" : index < 4 ? "supporting" : "test",
    evidence: entry.evidence,
  }));
}

function classifyFunnelStage(ad: AIAd): "tof" | "mof" | "bof" {
  const source = normalizeForKey([ad.text, ad.headline, ad.description, ad.cta].filter(Boolean).join(" "));
  const cta = normalizeForKey(ad.cta ?? "");
  const hasHardAction = HARD_CONVERSION_KEYWORDS.some((keyword) => cta.includes(keyword) || source.includes(keyword));
  const hasEducation = CTA_EDUCATION_KEYWORDS.some((keyword) => cta.includes(keyword) || source.includes(keyword));
  const hasSolutionOrProof = SOLUTION_PROOF_PATTERN.test(source);
  const hasBrandStory = /(story|stories|mission|brand|real results|why|awareness)/.test(source);

  if (hasHardAction && hasSolutionOrProof) return "bof";
  if (hasSolutionOrProof) return "mof";
  if (hasEducation || hasBrandStory) return "tof";
  return "mof";
}

function buildFunnelBreakdown(clusters: AnalysisCreativeCluster[]) {
  const counts = { tof: 0, mof: 0, bof: 0 };
  const evidence: Record<"tof" | "mof" | "bof", string[]> = { tof: [], mof: [], bof: [] };

  for (const cluster of clusters) {
    const stage = classifyFunnelStage(cluster.representative_ad);
    counts[stage] += cluster.weight;
    if (evidence[stage].length < 3) {
      evidence[stage].push(cluster.evidence[0] ?? summarizeAdEvidence(cluster.representative_ad));
    }
  }

  return { ...counts, evidence };
}

function buildOfferSignals(clusters: AnalysisCreativeCluster[]) {
  const categories: Record<string, number> = {
    quantified_outcomes: 0,
    guarantees_risk_reversal: 0,
    proof_validation: 0,
    mechanism_tracking: 0,
    demo_consultation: 0,
    free_resource: 0,
  };

  const evidence: string[] = [];

  for (const cluster of clusters) {
    const source = normalizeForKey(candidateAdTexts(cluster.representative_ad).join(" "));
    if (/\d+\s?%|percent|save|reduce|lower|increase|improve|lift/.test(source)) {
      categories.quantified_outcomes += cluster.weight;
      if (evidence.length < 4) evidence.push(cluster.evidence[0] ?? summarizeAdEvidence(cluster.representative_ad));
    }
    if (/(guarantee|guaranteed|or you don t pay|risk free|no risk)/.test(source)) {
      categories.guarantees_risk_reversal += cluster.weight;
    }
    if (/(verified|proven|factually|results|customers|businesses|rated|case study)/.test(source)) {
      categories.proof_validation += cluster.weight;
    }
    if (/(tracking|attribution|ai|platform|measurement|source of truth)/.test(source)) {
      categories.mechanism_tracking += cluster.weight;
    }
    if (/(book demo|demo|book a call|talk to sales|contact us|learn more)/.test(source)) {
      categories.demo_consultation += cluster.weight;
    }
    if (/\bfree\b|\btrial\b|\bguide\b|\bcalculator\b|\bassessment\b/.test(source)) {
      categories.free_resource += cluster.weight;
    }
  }

  const most_used =
    Object.entries(categories).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "quantified_outcomes";

  return { categories, most_used, evidence };
}

function topKeywordsByList(source: string[], keywords: string[], limit: number): string[] {
  const counts = new Map<string, number>();
  for (const text of source) {
    const normalized = normalizeForKey(text);
    for (const keyword of keywords) {
      if (normalized.includes(keyword)) counts.set(keyword, (counts.get(keyword) ?? 0) + 1);
    }
  }
  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([keyword]) => keyword);
}

function buildHeadlineCtaSignals(clusters: AnalysisCreativeCluster[]) {
  const headlineTexts = clusters.flatMap((cluster) =>
    [cluster.representative_ad.headline, cluster.representative_ad.cta].filter((value): value is string => Boolean(value))
  );

  const ctaCounts = new Map<string, number>();
  let conversionCount = 0;
  let educationCount = 0;

  for (const cluster of clusters) {
    if (cluster.representative_ad.cta) {
      ctaCounts.set(
        cluster.representative_ad.cta,
        (ctaCounts.get(cluster.representative_ad.cta) ?? 0) + cluster.weight
      );
    }

    const stage = classifyFunnelStage(cluster.representative_ad);
    if (stage === "bof") conversionCount += cluster.weight;
    if (stage === "tof") educationCount += cluster.weight;
  }

  const dominant_intent: AnalysisContext["headline_cta_signals"]["dominant_intent"] =
    conversionCount > educationCount * 1.5
      ? "conversion"
      : educationCount > conversionCount * 1.2
        ? "education"
        : "mixed";

  return {
    recurring_verbs: topKeywordsByList(headlineTexts, [...CTA_ACTION_KEYWORDS, ...CTA_EDUCATION_KEYWORDS], 8),
    emotional_triggers: topKeywordsByList(
      clusters.flatMap((cluster) => candidateAdTexts(cluster.representative_ad)),
      EMOTION_KEYWORDS,
      6
    ),
    urgency_cues: topKeywordsByList(headlineTexts, URGENCY_KEYWORDS, 6),
    dominant_intent,
    top_ctas: Array.from(ctaCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([cta, count]) => ({ cta, count })),
  };
}

function buildAngleHints(clusters: AnalysisCreativeCluster[]) {
  const by_angle: Record<string, number> = {
    UGC: 0,
    testimonials: 0,
    before_after: 0,
    problem_solution: 0,
    demo: 0,
    influencer: 0,
    founder_led: 0,
    brand_film: 0,
  };

  for (const cluster of clusters) {
    const source = ` ${normalizeForKey(candidateAdTexts(cluster.representative_ad).join(" "))} `;
    for (const [angle, keywords] of Object.entries(CREATIVE_ANGLE_KEYWORDS)) {
      if (keywords.some((keyword) => source.includes(keyword))) {
        by_angle[angle] += cluster.weight;
      }
    }
  }

  const sorted = Object.entries(by_angle).sort((a, b) => b[1] - a[1]);
  return {
    by_angle,
    scaled: sorted.filter(([, count]) => count > 0).slice(0, 3).map(([angle]) => angle),
    tested: sorted.filter(([, count]) => count > 0).slice(3, 6).map(([angle]) => angle),
  };
}

/**
 * Transforms raw DB/API rows into AIAd format.
 * Excludes: ad_id, scraped_at, ad_snapshot_url, industry
 */
export function transformToAIAds(rows: RawAdInput[]): AIAd[] {
  return rows.map((r) => {
    const startDate = r.ad_start_date ?? r.start_date ?? null;
    const activeDays = daysSince(startDate);
    const landingPage = r.landing_page_url ?? r.landing_page ?? null;

    return {
      text: r.ad_text?.trim() || null,
      headline: r.ad_headline?.trim() || null,
      description: r.ad_description?.trim() || null,
      cta: r.cta?.trim() || null,
      format: r.display_format?.trim() || null,
      landing_page: landingPage?.trim() || null,
      active_since: startDate ?? null,
      active_days: activeDays,
      creative_variants: r.collation_count ?? null,
      platforms: Array.isArray(r.publisher_platforms) ? r.publisher_platforms : null,
    };
  });
}

/**
 * Computes aggregated signals from AIAd array.
 */
export function computeAdSignals(ads: AIAd[]): AdSignals {
  const format_distribution: Record<string, number> = {};
  for (const k of FORMAT_KEYS) format_distribution[k] = 0;

  const cta_frequency: Record<string, number> = {};
  const landing_page_frequency: Record<string, number> = {};

  let long_running_ads = 0;
  let scaled_creatives = 0;
  let total_active_days = 0;
  let count_with_days = 0;

  for (const ad of ads) {
    const format = ad.format?.toUpperCase().trim();
    if (format && FORMAT_KEYS.includes(format as (typeof FORMAT_KEYS)[number])) {
      format_distribution[format]++;
    } else if (format) {
      format_distribution[format] = (format_distribution[format] ?? 0) + 1;
    }

    if (ad.cta) {
      const key = ad.cta.trim();
      cta_frequency[key] = (cta_frequency[key] ?? 0) + 1;
    }

    const lpKey = extractLandingPageKey(ad.landing_page);
    if (lpKey) {
      landing_page_frequency[lpKey] = (landing_page_frequency[lpKey] ?? 0) + 1;
    }

    if (ad.active_days != null && ad.active_days >= 30) long_running_ads++;
    if (ad.creative_variants != null && ad.creative_variants >= 2) scaled_creatives++;

    if (ad.active_days != null && ad.active_days >= 0) {
      total_active_days += ad.active_days;
      count_with_days++;
    }
  }

  return {
    total_ads: ads.length,
    format_distribution,
    cta_frequency,
    landing_page_frequency,
    long_running_ads,
    scaled_creatives,
    avg_active_days: count_with_days > 0 ? Math.round(total_active_days / count_with_days) : 0,
  };
}

/**
 * Detects likely winning ads: active_days >= 30 OR creative_variants >= 2.
 * Returns top 5.
 */
export function detectWinningAds(ads: AIAd[]): AIAd[] {
  return buildCreativeClusters(ads)
    .filter(
      (cluster) =>
        (cluster.max_active_days != null && cluster.max_active_days >= 30) ||
        (cluster.max_creative_variants != null && cluster.max_creative_variants >= 2)
    )
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)
    .map((cluster) => cluster.representative_ad);
}

export function buildAnalysisContext(ads: AIAd[]): AnalysisContext {
  const clusters = buildCreativeClusters(ads);
  return {
    unique_creatives: clusters.length,
    top_clusters: clusters.slice(0, 15),
    product_signals: buildProductSignals(clusters),
    funnel_breakdown: buildFunnelBreakdown(clusters),
    offer_signals: buildOfferSignals(clusters),
    phrase_signals: buildPhraseSignals(clusters),
    headline_cta_signals: buildHeadlineCtaSignals(clusters),
    angle_hints: buildAngleHints(clusters),
  };
}

/**
 * Builds the full AI input payload.
 */
export function buildAIInputPayload(competitor: string, ads: AIAd[]): AIInputPayload {
  const signals = computeAdSignals(ads);
  const winning_ads = detectWinningAds(ads);
  const analysis_context = buildAnalysisContext(ads);
  return {
    competitor,
    signals,
    winning_ads,
    ads_dataset: ads,
    analysis_context,
  };
}
