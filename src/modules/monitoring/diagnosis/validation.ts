import { z } from "zod";

export const DiagnosisDateRangeSchema = z
  .object({
    from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  })
  .refine((d) => d.from <= d.to, { message: "from must be <= to" });

export type DiagnosisDateRangeInput = z.infer<typeof DiagnosisDateRangeSchema>;

export const SystemDiagnosisSchema = z
  .object({
    main_issue: z.string().min(1),
    impact_summary: z.string().min(1),
    source: z.string().min(1),
    why: z.array(z.string().min(1)).optional().default([]),
    actions: z.array(z.string().min(1)).length(3),
  })
  .strict();

export const AdDiagnosisSchema = z
  .object({
    ad_id: z.string().min(1),
    issue_label: z.string().min(1),
    priority: z.enum(["high", "medium", "low"]),
    hook_score: z.number().int().min(1).max(5),
    why: z.array(z.string()).min(1),
    fix: z.array(z.string()),
    examples: z.array(z.string()),
  })
  .strict();

export const AdAhaBottleneckSchema = z.enum(["CTR", "CPC", "CVR", "HOOK", "MIXED", "OTHER"]);

export const AdAhaSpecificityCheckSchema = z
  .object({
    mentions_caption_token: z.boolean(),
    has_concrete_element: z.boolean(),
  })
  .strict();

export const AdAhaStructuredFixSchema = z
  .object({
    fix: z.string().min(1),
    type: z.enum(["hook", "creative", "audience"]),
    specificity_check: AdAhaSpecificityCheckSchema,
  })
  .strict();

export const AdAhaAuditBlockSchema = z
  .object({
    reason: z.string().min(1),
    evidence: z.array(z.string().min(1)),
    suggestions: z.array(z.string().min(1)),
  })
  .strict();

/** Caption audit: observation + consequence chain + proof + fixes. */
export const AdAhaCaptionAuditSchema = z
  .object({
    reason: z.string().min(1),
    impact: z.string().min(1),
    evidence: z.array(z.string().min(1)),
    suggestions: z.array(z.string().min(1)),
  })
  .strict();

/** OCR/on-image text audit: extracted overlay text implications + concrete rewrites. */
export const AdAhaOcrAuditSchema = z
  .object({
    reason: z.string().min(1),
    impact: z.string().min(1),
    evidence: z.array(z.string().min(1)),
    suggestions: z.array(z.lazy(() => AdAhaTranscriptSuggestionItemSchema)),
  })
  .strict();

export const AdAhaTranscriptChangeTypeSchema = z.enum([
  "specificity",
  "pattern_interrupt",
  "outcome_shift",
  "angle",
  "emotion",
  "structure",
]);

export const AdAhaTranscriptSuggestionItemSchema = z
  .object({
    line: z.string().min(1),
    change_type: AdAhaTranscriptChangeTypeSchema,
    based_on: z.string().min(1),
  })
  .strict();

/** 0–5s audio transcript audit: structured replacement lines (not string paraphrases). */
export const AdAhaTranscriptAuditSchema = z
  .object({
    reason: z.string().min(1),
    evidence: z.array(z.string().min(1)),
    suggestions: z.array(AdAhaTranscriptSuggestionItemSchema),
  })
  .strict();

/** Where to focus first vs next — aligns with Caption / Transcript / Fixes sections in the UI. */
export const AdAhaPriorityFixSchema = z
  .object({
    headline: z.string().min(1),
    primary_section: z.enum(["transcript_0_5s", "caption", "creative_visual", "audience"]),
    follow_section: z.enum(["transcript_0_5s", "caption", "fixes_to_ship", "none"]),
    rationale: z.string().min(1),
  })
  .strict();

export const AdAhaDiagnosisSchema = z
  .object({
    ad_id: z.string().min(1),
    bottleneck: AdAhaBottleneckSchema,
    evidence: z.array(z.string().min(1)).min(3),
    fixes: z.array(AdAhaStructuredFixSchema).min(3).max(6),
    priority_fix: AdAhaPriorityFixSchema,
    audits: z
      .object({
        caption: AdAhaCaptionAuditSchema,
        transcript_0_5s: AdAhaTranscriptAuditSchema,
        ocr_text: AdAhaOcrAuditSchema,
      })
      .strict(),
  })
  .strict();

export const AdAhaDiagnosisBatchSchema = z
  .object({
    ads: z.array(AdAhaDiagnosisSchema).min(1).max(3),
  })
  .strict();
