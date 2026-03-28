import {
  AdAhaDiagnosisBatchSchema,
  AdDiagnosisSchema,
  DiagnosisDateRangeSchema,
  SystemDiagnosisSchema,
} from "../validation";

describe("DiagnosisDateRangeSchema", () => {
  it("accepts valid range", () => {
    expect(DiagnosisDateRangeSchema.parse({ from: "2025-01-01", to: "2025-01-31" })).toEqual({
      from: "2025-01-01",
      to: "2025-01-31",
    });
  });

  it("rejects from > to", () => {
    const r = DiagnosisDateRangeSchema.safeParse({ from: "2025-02-01", to: "2025-01-01" });
    expect(r.success).toBe(false);
  });
});

describe("SystemDiagnosisSchema", () => {
  it("parses valid payload", () => {
    const v = SystemDiagnosisSchema.parse({
      main_issue: "x",
      impact_summary: "y",
      source: "z",
      actions: ["d", "e", "f"],
    });
    expect(v.main_issue).toBe("x");
    expect(v.why).toEqual([]);
  });
});

describe("AdDiagnosisSchema", () => {
  it("rejects hook_score out of range", () => {
    const r = AdDiagnosisSchema.safeParse({
      ad_id: "1",
      issue_label: "Low CTR",
      priority: "high",
      hook_score: 9,
      why: ["a"],
      fix: ["b"],
      examples: ["c"],
    });
    expect(r.success).toBe(false);
  });
});

describe("AdAhaDiagnosisBatchSchema", () => {
  it("parses valid batch payload", () => {
    const fix = {
      fix: "0–2s: Put payoff on-screen with “Example hook line”",
      type: "hook" as const,
      specificity_check: { mentions_caption_token: true, has_concrete_element: true },
    };
    const v = AdAhaDiagnosisBatchSchema.parse({
      ads: [
        {
          ad_id: "1",
          bottleneck: "CTR",
          evidence: ["CTR 1.2% vs account 2.0%", "CPC elevated vs account", "CVR inline with account"],
          fixes: [fix, { ...fix, fix: "Add comparison visual in frame 1", type: "creative" as const }, { ...fix, fix: "Tighten CTA copy to match hook", type: "creative" as const }],
          priority_fix: {
            headline: "Prioritize caption and CTA before iterating on visuals.",
            primary_section: "caption",
            follow_section: "fixes_to_ship",
            rationale: "CTR trails account; clearer next-step copy lifts clicks before new creative tests.",
          },
          audits: {
            caption: {
              reason: "Lacks urgency and a direct CTA",
              impact:
                "Without a clear next step, scrollers do not commit a click; that shows up as CTR below account while spend still buys impressions.",
              evidence: ["Opening line explains product without outcome"],
              suggestions: ["Lead with monthly savings number from offer"],
            },
            ocr_text: {
              reason: "No OCR text detected for this image ad.",
              impact: "On-image message clarity cannot be validated from OCR in this response.",
              evidence: [],
              suggestions: [],
            },
            transcript_0_5s: {
              reason: "Transcript not available for this ad.",
              evidence: [],
              suggestions: [] as [],
            },
          },
        },
      ],
    });
    expect(v.ads[0]?.ad_id).toBe("1");
    expect(v.ads[0]?.fixes).toHaveLength(3);
  });
});
