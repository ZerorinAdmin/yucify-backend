/**
 * AI competitor ad analysis service.
 * Uses derived analytics for factual grounding and a single AI pass for strategy/narrative.
 */

import { z } from "zod";
import type {
  AIAd,
  AIInputPayload,
  AdSignals,
  AnalysisContext,
  AnalysisCreativeCluster,
  AnalysisPhraseSignal,
  AnalysisProductSignal,
} from "./ai-ad-payload";

export type CompetitorAnalysisResult = {
  executive_brief: {
    summary: string;
    audience: string;
    conversion_motion: string;
    moat_signals: string[];
    vulnerabilities: string[];
  };

  total_active_ads: {
    count: number;
    by_format: Record<string, number>;
    dominant_format: string;
    scaling_signal: string;
    evidence: string[];
  };

  product_distribution: Array<{
    product_or_theme: string;
    ad_count: number;
    format_mix: Record<string, number>;
    role: "hero" | "test" | "supporting";
    evidence: string[];
  }>;

  funnel_stage: {
    tof: { count: number; pct: number; summary: string; examples: string[] };
    mof: { count: number; pct: number; summary: string; examples: string[] };
    bof: { count: number; pct: number; summary: string; examples: string[] };
  };

  offers_strategy: {
    categories: Record<string, number>;
    most_used: string;
    dominant_levers: string[];
    summary: string;
    evidence: string[];
  };

  messaging_analysis: {
    top_phrases: Array<{ phrase: string; cluster: string }>;
    clusters: Record<string, string>;
    summary: string;
    evidence: string[];
  };

  headline_cta: {
    recurring_verbs: string[];
    emotional_triggers: string[];
    urgency_cues: string[];
    dominant_intent: "education" | "conversion" | "mixed";
    summary: string;
    evidence: string[];
  };

  creative_angles: {
    by_angle: Record<string, number>;
    scaled: string[];
    tested: string[];
    summary: string;
    evidence: string[];
  };

  hook_patterns: {
    dominant_hook_type: string;
    examples: string[];
    summary: string;
  };

  winning_patterns: Array<{
    pattern_name: string;
    structure: string[];
    frequency: number;
  }>;

  competitor_playbook: {
    steps: string[];
    summary: string;
  };

  strategic_summary: {
    core_strategy: string;
    over_relying_on: string;
    underutilized: string;
    exploitable_gaps: string[];
  };

  recommendations: string[];
};

const RESULT_SCHEMA = z.object({
  executive_brief: z.object({
    summary: z.string(),
    audience: z.string(),
    conversion_motion: z.string(),
    moat_signals: z.array(z.string()),
    vulnerabilities: z.array(z.string()),
  }),
  total_active_ads: z.object({
    count: z.number(),
    by_format: z.record(z.string(), z.number()),
    dominant_format: z.string(),
    scaling_signal: z.string(),
    evidence: z.array(z.string()),
  }),
  product_distribution: z.array(
    z.object({
      product_or_theme: z.string(),
      ad_count: z.number(),
      format_mix: z.record(z.string(), z.number()),
      role: z.enum(["hero", "test", "supporting"]),
      evidence: z.array(z.string()),
    })
  ),
  funnel_stage: z.object({
    tof: z.object({ count: z.number(), pct: z.number(), summary: z.string(), examples: z.array(z.string()) }),
    mof: z.object({ count: z.number(), pct: z.number(), summary: z.string(), examples: z.array(z.string()) }),
    bof: z.object({ count: z.number(), pct: z.number(), summary: z.string(), examples: z.array(z.string()) }),
  }),
  offers_strategy: z.object({
    categories: z.record(z.string(), z.number()),
    most_used: z.string(),
    dominant_levers: z.array(z.string()),
    summary: z.string(),
    evidence: z.array(z.string()),
  }),
  messaging_analysis: z.object({
    top_phrases: z.array(z.object({ phrase: z.string(), cluster: z.string() })),
    clusters: z.record(z.string(), z.string()),
    summary: z.string(),
    evidence: z.array(z.string()),
  }),
  headline_cta: z.object({
    recurring_verbs: z.array(z.string()),
    emotional_triggers: z.array(z.string()),
    urgency_cues: z.array(z.string()),
    dominant_intent: z.enum(["education", "conversion", "mixed"]),
    summary: z.string(),
    evidence: z.array(z.string()),
  }),
  creative_angles: z.object({
    by_angle: z.record(z.string(), z.number()),
    scaled: z.array(z.string()),
    tested: z.array(z.string()),
    summary: z.string(),
    evidence: z.array(z.string()),
  }),
  hook_patterns: z.object({
    dominant_hook_type: z.string(),
    examples: z.array(z.string()),
    summary: z.string(),
  }),
  winning_patterns: z.array(
    z.object({
      pattern_name: z.string(),
      structure: z.array(z.string()),
      frequency: z.number(),
    })
  ),
  competitor_playbook: z.object({
    steps: z.array(z.string()),
    summary: z.string(),
  }),
  strategic_summary: z.object({
    core_strategy: z.string(),
    over_relying_on: z.string(),
    underutilized: z.string(),
    exploitable_gaps: z.array(z.string()),
  }),
  recommendations: z.array(z.string()),
});

const RESULT_SCHEMA_DESCRIPTION = `
{
  "executive_brief": {
    "summary": "string",
    "audience": "string",
    "conversion_motion": "string",
    "moat_signals": ["string"],
    "vulnerabilities": ["string"]
  },
  "total_active_ads": {
    "count": number,
    "by_format": { "video": number, "image": number, "carousel": number, "collection": number },
    "dominant_format": "string",
    "scaling_signal": "string",
    "evidence": ["string"]
  },
  "product_distribution": [
    {
      "product_or_theme": "string",
      "ad_count": number,
      "format_mix": { "video": number, "image": number, "carousel": number, "collection": number },
      "role": "hero|test|supporting",
      "evidence": ["string"]
    }
  ],
  "funnel_stage": {
    "tof": { "count": number, "pct": number, "summary": "string", "examples": ["string"] },
    "mof": { "count": number, "pct": number, "summary": "string", "examples": ["string"] },
    "bof": { "count": number, "pct": number, "summary": "string", "examples": ["string"] }
  },
  "offers_strategy": {
    "categories": {
      "quantified_outcomes": number,
      "guarantees_risk_reversal": number,
      "proof_validation": number,
      "mechanism_tracking": number,
      "demo_consultation": number,
      "free_resource": number
    },
    "most_used": "string",
    "dominant_levers": ["string"],
    "summary": "string",
    "evidence": ["string"]
  },
  "messaging_analysis": {
    "top_phrases": [
      { "phrase": "string", "cluster": "problem-led|benefit-led|proof-led|mechanism-led|trust-led|urgency-led" }
    ],
    "clusters": {
      "problem-led": "string",
      "benefit-led": "string",
      "proof-led": "string",
      "mechanism-led": "string",
      "trust-led": "string",
      "urgency-led": "string"
    },
    "summary": "string",
    "evidence": ["string"]
  },
  "headline_cta": {
    "recurring_verbs": ["string"],
    "emotional_triggers": ["string"],
    "urgency_cues": ["string"],
    "dominant_intent": "education|conversion|mixed",
    "summary": "string",
    "evidence": ["string"]
  },
  "creative_angles": {
    "by_angle": {
      "UGC": number,
      "testimonials": number,
      "before_after": number,
      "problem_solution": number,
      "demo": number,
      "influencer": number,
      "founder_led": number,
      "brand_film": number
    },
    "scaled": ["string"],
    "tested": ["string"],
    "summary": "string",
    "evidence": ["string"]
  },
  "hook_patterns": {
    "dominant_hook_type": "pain_point|benefit|curiosity|fear|offer",
    "examples": ["string"],
    "summary": "string"
  },
  "winning_patterns": [
    {
      "pattern_name": "string",
      "structure": ["string"],
      "frequency": number
    }
  ],
  "competitor_playbook": {
    "steps": ["string"],
    "summary": "string"
  },
  "strategic_summary": {
    "core_strategy": "string",
    "over_relying_on": "string",
    "underutilized": "string",
    "exploitable_gaps": ["string"]
  },
  "recommendations": ["string"]
}
`;

function formatSignalsForPrompt(signals: AdSignals): string {
  const lines: string[] = [];

  lines.push(`Total active ads: ${signals.total_ads}`);

  const formatEntries = Object.entries(signals.format_distribution).filter(([, value]) => value > 0);
  if (formatEntries.length > 0) {
    lines.push(`Exact counts by format: ${formatEntries.map(([key, value]) => `${key}: ${value}`).join(", ")}`);
  }

  const ctaEntries = Object.entries(signals.cta_frequency)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8);
  if (ctaEntries.length > 0) {
    lines.push(`Top CTAs by raw count: ${ctaEntries.map(([key, value]) => `${key}: ${value}`).join(", ")}`);
  }

  const landingPages = Object.entries(signals.landing_page_frequency)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);
  if (landingPages.length > 0) {
    lines.push(`Landing page distribution: ${landingPages.map(([key, value]) => `${key}: ${value}`).join(", ")}`);
  }

  lines.push(`Long-running ads (30+ days): ${signals.long_running_ads}`);
  lines.push(`Ads with 2+ creative variants: ${signals.scaled_creatives}`);
  lines.push(`Average active days: ${signals.avg_active_days}`);

  return lines.join("\n");
}

function formatWinningAdsForPrompt(ads: AIAd[]): string {
  if (ads.length === 0) return "No long-running or scaled representative creatives were detected.";

  return ads
    .map((ad, index) => {
      const parts = [`[Winning cluster ${index + 1}]`];
      if (ad.text) parts.push(`Primary text: ${ad.text.slice(0, 320)}`);
      if (ad.headline) parts.push(`Headline: ${ad.headline}`);
      if (ad.cta) parts.push(`CTA: ${ad.cta}`);
      if (ad.format) parts.push(`Format: ${ad.format}`);
      if (ad.landing_page) parts.push(`Landing page: ${ad.landing_page}`);
      if (ad.active_days != null) parts.push(`Active days: ${ad.active_days}`);
      if (ad.creative_variants != null) parts.push(`Creative variants: ${ad.creative_variants}`);
      return parts.join("\n");
    })
    .join("\n\n");
}

function formatProductSignals(products: AnalysisProductSignal[]): string {
  if (products.length === 0) return "No product groupings were inferred from landing pages or repeated themes.";
  return products
    .map(
      (product, index) =>
        `${index + 1}. ${product.product_or_theme} | ads=${product.ad_count} | role=${product.role} | formats=${Object.entries(
          product.format_mix
        )
          .filter(([, count]) => count > 0)
          .map(([format, count]) => `${format}:${count}`)
          .join(", ")} | evidence=${product.evidence.join(" || ")}`
    )
    .join("\n");
}

function formatPhraseSignals(phrases: AnalysisPhraseSignal[]): string {
  if (phrases.length === 0) return "No stable repeated phrase signals were extracted.";
  return phrases
    .map((signal, index) => `${index + 1}. ${signal.phrase} | count=${signal.count} | cluster=${signal.cluster}`)
    .join("\n");
}

function formatClusters(clusters: AnalysisCreativeCluster[]): string {
  if (clusters.length === 0) return "No representative creative clusters available.";
  return clusters
    .map((cluster, index) => {
      const parts = [
        `[Cluster ${index + 1}] weight=${cluster.weight} score=${cluster.score.toFixed(1)}`,
        `Formats: ${Object.entries(cluster.format_mix)
          .filter(([, count]) => count > 0)
          .map(([format, count]) => `${format}:${count}`)
          .join(", ")}`,
      ];
      if (cluster.ctas.length > 0) parts.push(`CTAs: ${cluster.ctas.join(", ")}`);
      if (cluster.landing_pages.length > 0) parts.push(`Landing pages: ${cluster.landing_pages.join(", ")}`);
      if (cluster.max_active_days != null) parts.push(`Max active days: ${cluster.max_active_days}`);
      if (cluster.max_creative_variants != null) parts.push(`Max variants: ${cluster.max_creative_variants}`);
      parts.push(`Evidence: ${cluster.evidence.join(" || ")}`);
      return parts.join("\n");
    })
    .join("\n\n");
}

function formatAnalysisContext(context: AnalysisContext): string {
  const funnelTotal = context.funnel_breakdown.tof + context.funnel_breakdown.mof + context.funnel_breakdown.bof;
  return [
    `Unique analysis clusters: ${context.unique_creatives}`,
    "",
    "PRODUCT / THEME SIGNALS",
    formatProductSignals(context.product_signals),
    "",
    "FUNNEL HEURISTIC COUNTS",
    `TOF: ${context.funnel_breakdown.tof}`,
    `MOF: ${context.funnel_breakdown.mof}`,
    `BOF: ${context.funnel_breakdown.bof}`,
    `Heuristic total: ${funnelTotal}`,
    `TOF evidence: ${context.funnel_breakdown.evidence.tof.join(" || ") || "None"}`,
    `MOF evidence: ${context.funnel_breakdown.evidence.mof.join(" || ") || "None"}`,
    `BOF evidence: ${context.funnel_breakdown.evidence.bof.join(" || ") || "None"}`,
    "",
    "OFFER SIGNALS",
    `Offer category counts: ${Object.entries(context.offer_signals.categories)
      .map(([key, value]) => `${key}: ${value}`)
      .join(", ")}`,
    `Most-used offer category: ${context.offer_signals.most_used}`,
    `Offer evidence: ${context.offer_signals.evidence.join(" || ") || "None"}`,
    "",
    "MESSAGING SIGNALS",
    formatPhraseSignals(context.phrase_signals),
    "",
    "HEADLINE / CTA SIGNALS",
    `Recurring verbs: ${context.headline_cta_signals.recurring_verbs.join(", ") || "None"}`,
    `Emotional triggers: ${context.headline_cta_signals.emotional_triggers.join(", ") || "None"}`,
    `Urgency cues: ${context.headline_cta_signals.urgency_cues.join(", ") || "None"}`,
    `Dominant intent hint: ${context.headline_cta_signals.dominant_intent}`,
    `Top CTAs: ${context.headline_cta_signals.top_ctas.map((entry) => `${entry.cta}: ${entry.count}`).join(", ") || "None"}`,
    "",
    "CREATIVE ANGLE HINTS",
    `By angle: ${Object.entries(context.angle_hints.by_angle)
      .filter(([, value]) => value > 0)
      .map(([key, value]) => `${key}: ${value}`)
      .join(", ") || "None"}`,
    `Scaled angle hints: ${context.angle_hints.scaled.join(", ") || "None"}`,
    `Tested angle hints: ${context.angle_hints.tested.join(", ") || "None"}`,
    "",
    "TOP REPRESENTATIVE CREATIVE CLUSTERS",
    formatClusters(context.top_clusters),
  ].join("\n");
}

function buildPromptFromPayload(payload: AIInputPayload): string {
  return `
You are a senior paid media strategist writing a high-detail competitor analysis.

Your task is to reverse engineer the advertising strategy of ${payload.competitor}.

Important rules:
- Use the exact numeric counts provided in FACTS and DERIVED ANALYSIS. Do not invent different counts.
- Raw ad count is the source of truth for total active ads and format counts.
- Derived clusters are analysis-only groupings used to reduce noise and identify repeated creative patterns.
- If a section is uncertain, say so in the summary text, but still return complete JSON.
- Be specific, strategic, and evidence-grounded. Avoid generic filler.
- Write this like a premium teardown, not a generic AI summary.
- The executive_brief should create an immediate "aha" moment: what they sell, who they are targeting, how they convert, what proof they lean on, and where they are vulnerable.
- Every major section should include concrete evidence snippets copied or paraphrased from the supplied evidence.
- For SaaS / B2B style brands, prefer taxonomies like quantified outcomes, proof, guarantees, mechanism, and demo motion instead of retail discount language.
- Do not call quantified ROI claims "discounts" unless the evidence is truly a price discount.

FACTS
${formatSignalsForPrompt(payload.signals)}

WINNING / SCALING REPRESENTATIVE ADS
${formatWinningAdsForPrompt(payload.winning_ads)}

DERIVED ANALYSIS
${formatAnalysisContext(payload.analysis_context)}

Return JSON matching this schema:
${RESULT_SCHEMA_DESCRIPTION}
`;
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

export async function analyzeCompetitorAds(payload: AIInputPayload): Promise<CompetitorAnalysisResult> {
  if (payload.ads_dataset.length < 2) {
    throw new Error("Not enough ads for analysis.");
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY not configured.");

  const prompt = buildPromptFromPayload(payload);

  const { default: OpenAI } = await import("openai");
  const openai = new OpenAI({ apiKey });

  const completion = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [{ role: "user", content: prompt }],
    max_tokens: 2500,
    temperature: 0.2,
    top_p: 0.9,
    response_format: { type: "json_object" },
  });

  const content = completion.choices[0]?.message?.content;
  if (!content) throw new Error("No response from AI.");

  const parsed = RESULT_SCHEMA.parse(parseJsonContent(content));
  return parsed;
}
