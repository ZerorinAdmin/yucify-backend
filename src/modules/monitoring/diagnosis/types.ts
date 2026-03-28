/** Account-level problem from deterministic rules (first match wins). */
export type DiagnosisProblemId = "LOW_CTR" | "LOW_CVR" | "HIGH_CPC" | "HEALTHY";

/** Per-ad issue flags from rules. */
export type AdIssueId = "LOW_CTR" | "HIGH_CPC" | "NO_CONVERSIONS";

/** Creative format for segmentation (carousel/unknown excluded from video vs image averages). */
export type CreativeFormat = "video" | "image" | "carousel" | "unknown";

/**
 * One row per ad after aggregating daily `ad_metrics` over the selected range.
 * `ctr` is percentage points (e.g. 1.93 = 1.93%), consistent with Meta + dashboard UI.
 */
export type NormalizedAd = {
  id: string;
  name: string;
  spend: number;
  impressions: number;
  reach: number;
  clicks: number;
  ctr: number;
  cpc: number;
  conversions: number;
  type: CreativeFormat;
  copy: string;
  headline: string;
  description: string;
  cta_type: string;
  link_url: string;
  /** Image or video thumbnail URL from synced Meta creative (empty if not available). */
  previewUrl: string;
  thumbnail_url: string | null;
  image_url: string | null;
  video_url: string | null;
  carousel_urls: string[];
};

export type DiagnosisThresholds = {
  /** Minimum account weighted CTR % to avoid LOW_CTR */
  ctrMin: number;
  /** Minimum CVR (conversions/clicks) for LOW_CVR check */
  cvrMin: number;
  /** Max account weighted CPC (account currency) for HIGH_CPC */
  cpcMax: number;
  minClicksForCvr: number;
  /** Per-ad CTR below this counts toward LOW_CTR impact */
  adCtrThreshold: number;
  /** Per-ad CPC above this counts toward HIGH_CPC impact */
  adCpcThreshold: number;
  minClicksForNoConversions: number;
};

export type SystemMetrics = {
  totalSpend: number;
  totalImpressions: number;
  avgCtr: number;
  avgCpc: number;
  avgFrequency: number;
  totalClicks: number;
  totalConversions: number;
  cvr: number;
};

export type SegmentPerformance = {
  videoCtr: number | null;
  imageCtr: number | null;
  videoSpend: number;
  imageSpend: number;
};

export type DominantFormat = "video" | "image" | "mixed";

export type RulesDiagnosisResult = {
  problem: DiagnosisProblemId;
  metrics: SystemMetrics;
  impactPct: number;
  segment: SegmentPerformance;
  dominantFormat: DominantFormat;
  ads: NormalizedAd[];
  topAds: NormalizedAd[];
  topAdIssues: { ad_id: string; issues: AdIssueId[] }[];
  sampleCopy: string[];
};

export type SystemDiagnosisAI = {
  main_issue: string;
  impact_summary: string;
  source: string;
  why: string[];
  actions: string[];
};

export type AdDiagnosisAI = {
  ad_id: string;
  issue_label: string;
  priority: "high" | "medium" | "low";
  hook_score: number;
  why: string[];
  fix: string[];
  examples: string[];
};

export type AdAhaSpecificityCheck = {
  mentions_caption_token: boolean;
  has_concrete_element: boolean;
};

export type AdAhaStructuredFix = {
  fix: string;
  type: "hook" | "creative" | "audience";
  specificity_check: AdAhaSpecificityCheck;
};

export type AdAhaAuditBlock = {
  reason: string;
  evidence: string[];
  suggestions: string[];
};

export type AdAhaTranscriptChangeType =
  | "specificity"
  | "pattern_interrupt"
  | "outcome_shift"
  | "angle"
  | "emotion"
  | "structure";

export type AdAhaTranscriptSuggestionItem = {
  line: string;
  change_type: AdAhaTranscriptChangeType;
  based_on: string;
};

export type AdAhaTranscriptAudit = {
  reason: string;
  evidence: string[];
  suggestions: AdAhaTranscriptSuggestionItem[];
};

export type AdAhaCaptionAudit = {
  reason: string;
  impact: string;
  evidence: string[];
  suggestions: string[];
};

export type AdAhaOcrAudit = {
  reason: string;
  impact: string;
  evidence: string[];
  suggestions: AdAhaTranscriptSuggestionItem[];
};

export type AdAhaPriorityFix = {
  /** 1–2 sentences: what to do first and which section to open (e.g. hook → Transcript). */
  headline: string;
  /** Biggest lever: transcript = spoken hook; caption = body/CTA; creative_visual = on-screen/OCR; audience = targeting. */
  primary_section: "transcript_0_5s" | "caption" | "creative_visual" | "audience";
  /** Second area after primary (fixes_to_ship = OCR/creative/audience bullets). */
  follow_section: "transcript_0_5s" | "caption" | "fixes_to_ship" | "none";
  /** One sentence tying priority to bottleneck and metrics (CTR, CPC, CVR, hook, etc.). */
  rationale: string;
};

export type AdAhaDiagnosisAI = {
  ad_id: string;
  bottleneck: "CTR" | "CPC" | "CVR" | "HOOK" | "MIXED" | "OTHER";
  evidence: string[];
  fixes: AdAhaStructuredFix[];
  priority_fix: AdAhaPriorityFix;
  audits: {
    caption: AdAhaCaptionAudit;
    transcript_0_5s: AdAhaTranscriptAudit;
    ocr_text: AdAhaOcrAudit;
  };
};

export type DiagnosisResponse = RulesDiagnosisResult & {
  ai?: {
    system: SystemDiagnosisAI | null;
    ads: (AdAhaDiagnosisAI | null)[];
  };
  aiError?: string;
  /** Set by API handlers so clients can key cached AI (not stored in DB). */
  ad_account_id?: string;
};
