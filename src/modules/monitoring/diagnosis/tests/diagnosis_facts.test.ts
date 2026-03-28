import type { AdAIInput } from "../ad_ai_payload";
import { batchSpendRank, buildBatchPeerLines, computeAdDiagnosisFacts } from "../diagnosis_facts";

function baseInput(over: Partial<AdAIInput>): AdAIInput {
  return {
    ad_id: "a1",
    ad_name: "Ad one",
    format: "image",
    rule_issues: [],
    account: { ctr: 2, cpc: 5, cvr: 0.01 },
    creative: {
      body: "Some caption text for testing purposes",
      link_url: "https://example.com",
      thumbnail_url: null,
      image_url: null,
      video_url: null,
      carousel_urls: [],
    },
    performance: {
      spend: 100,
      impressions: 10000,
      reach: 8000,
      frequency: 1.2,
      clicks: 100,
      ctr: 1,
      cpc: 8,
      conversions: 2,
      cvr: 0.02,
    },
    video: null,
    spend_trend: [],
    ...over,
  };
}

describe("computeAdDiagnosisFacts", () => {
  it("sets primary hint CTR when LOW_CTR rule flag present", () => {
    const f = computeAdDiagnosisFacts(baseInput({ rule_issues: ["LOW_CTR"] }));
    expect(f.primary_constraint_hint).toBe("CTR");
    expect(f.rule_flags).toContain("LOW_CTR");
  });

  it("sets primary hint CPC when HIGH_CPC rule flag present", () => {
    const f = computeAdDiagnosisFacts(baseInput({ rule_issues: ["HIGH_CPC"] }));
    expect(f.primary_constraint_hint).toBe("CPC");
  });

  it("prefers CPC over LOW_CTR when both rule flags present", () => {
    const f = computeAdDiagnosisFacts(
      baseInput({ rule_issues: ["HIGH_CPC", "LOW_CTR"] })
    );
    expect(f.primary_constraint_hint).toBe("CPC");
  });

  it("prefers HOOK over LOW_CTR when video shows severe hook weakness", () => {
    const f = computeAdDiagnosisFacts(
      baseInput({
        format: "video",
        rule_issues: ["LOW_CTR"],
        video: {
          avg_time_seconds: 2,
          hook_rate: 8,
          hold_rate: 20,
          impressions: 10000,
          p25: 100,
          p50: 50,
          p75: 20,
          p100: 10,
          plays: 1000,
          transcript_0_5s: null,
        },
      })
    );
    expect(f.primary_constraint_hint).toBe("HOOK");
    expect(f.severe_video_hook_weakness).toBe(true);
  });

  it("exposes industry_standard_ctr_pct from HEALTH_DIAG_AD_CTR_THRESHOLD", () => {
    const prev = process.env.HEALTH_DIAG_AD_CTR_THRESHOLD;
    process.env.HEALTH_DIAG_AD_CTR_THRESHOLD = "1.5";
    try {
      const f = computeAdDiagnosisFacts(baseInput({}));
      expect(f.industry_standard_ctr_pct).toBe(1.5);
    } finally {
      if (prev === undefined) delete process.env.HEALTH_DIAG_AD_CTR_THRESHOLD;
      else process.env.HEALTH_DIAG_AD_CTR_THRESHOLD = prev;
    }
  });

  it("computes signed pct deltas vs account", () => {
    const f = computeAdDiagnosisFacts(
      baseInput({
        performance: {
          spend: 100,
          impressions: 10000,
          reach: 8000,
          frequency: 1,
          clicks: 100,
          ctr: 1,
          cpc: 10,
          conversions: 1,
          cvr: 0.01,
        },
        account: { ctr: 2, cpc: 5, cvr: 0.01 },
      })
    );
    expect(f.ctr_pct_vs_account).toBe(-50);
    expect(f.cpc_pct_vs_account).toBe(100);
  });

  it("builds meta_video_engagement_summary for video ads with Meta signals", () => {
    const f = computeAdDiagnosisFacts(
      baseInput({
        format: "video",
        video: {
          avg_time_seconds: 4.2,
          hook_rate: 18.5,
          hold_rate: 42,
          impressions: 10000,
          p25: 800,
          p50: 400,
          p75: 200,
          p100: 100,
          plays: 2000,
          transcript_0_5s: "Get results today",
        },
      })
    );
    expect(f.meta_video_engagement_summary).toContain("hook_rate 18.5%");
    expect(f.meta_video_engagement_summary).toContain("hold_rate 42%");
    expect(f.meta_video_engagement_summary).toContain("avg_watch_time ~4s");
    expect(f.meta_video_engagement_summary).toContain("retention_of_viewers");
    expect(f.transcript_0_5s_available).toBe(true);
  });
});

describe("batch ranking helpers", () => {
  const batch: AdAIInput[] = [
    baseInput({ ad_id: "low", performance: { ...baseInput({}).performance, spend: 50 } }),
    baseInput({ ad_id: "high", performance: { ...baseInput({}).performance, spend: 200 } }),
  ];

  it("batchSpendRank orders by spend descending", () => {
    expect(batchSpendRank(batch, "high")).toBe(1);
    expect(batchSpendRank(batch, "low")).toBe(2);
  });

  it("buildBatchPeerLines excludes target ad", () => {
    const lines = buildBatchPeerLines(batch, "high");
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain("spend 50");
    expect(lines[0]).not.toContain("spend 200");
  });
});
