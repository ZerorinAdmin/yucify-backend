import {
  detectPrimaryProblem,
  dominantFormat,
  getDiagnosisThresholds,
  getImpactPct,
  getSystemMetrics,
  getTopAdsBySpend,
  analyzeAdIssues,
  segmentPerformance,
} from "../rules";
import type { NormalizedAd } from "../types";

const t = {
  ctrMin: 2,
  cvrMin: 0.02,
  cpcMax: 5,
  minClicksForCvr: 100,
  adCtrThreshold: 2,
  adCpcThreshold: 5,
  minClicksForNoConversions: 50,
};

function ad(p: Partial<NormalizedAd> & Pick<NormalizedAd, "id">): NormalizedAd {
  return {
    name: p.name ?? p.id,
    spend: p.spend ?? 100,
    impressions: p.impressions ?? 1000,
    reach: p.reach ?? 800,
    clicks: p.clicks ?? 20,
    ctr: p.ctr ?? 2,
    cpc: p.cpc ?? 2,
    conversions: p.conversions ?? 0,
    type: p.type ?? "image",
    copy: p.copy ?? "",
    headline: p.headline ?? "",
    description: p.description ?? "",
    cta_type: p.cta_type ?? "",
    link_url: p.link_url ?? "",
    thumbnail_url: p.thumbnail_url ?? null,
    image_url: p.image_url ?? null,
    video_url: p.video_url ?? null,
    carousel_urls: p.carousel_urls ?? [],
    ...p,
    previewUrl: p.previewUrl ?? "",
  };
}

describe("getSystemMetrics", () => {
  it("aggregates totals and CVR", () => {
    const m = getSystemMetrics([
      ad({ id: "a", spend: 100, clicks: 10, impressions: 1000, conversions: 1 }),
      ad({ id: "b", spend: 100, clicks: 10, impressions: 1000, conversions: 1 }),
    ]);
    expect(m.totalSpend).toBe(200);
    expect(m.totalClicks).toBe(20);
    expect(m.totalConversions).toBe(2);
    expect(m.cvr).toBeCloseTo(0.1);
  });
});

describe("detectPrimaryProblem", () => {
  it("returns LOW_CTR when blended CTR below min", () => {
    const metrics = {
      totalSpend: 100,
      totalImpressions: 10000,
      avgCtr: 1,
      avgCpc: 2,
      avgFrequency: 1.5,
      totalClicks: 200,
      totalConversions: 10,
      cvr: 0.05,
    };
    expect(detectPrimaryProblem(metrics, t)).toBe("LOW_CTR");
  });

  it("returns HIGH_CPC when CTR ok but CPC high", () => {
    const metrics = {
      totalSpend: 100,
      totalImpressions: 10000,
      avgCtr: 3,
      avgCpc: 8,
      avgFrequency: 1.5,
      totalClicks: 200,
      totalConversions: 10,
      cvr: 0.05,
    };
    expect(detectPrimaryProblem(metrics, t)).toBe("HIGH_CPC");
  });

  it("returns HEALTHY when within thresholds", () => {
    const metrics = {
      totalSpend: 100,
      totalImpressions: 10000,
      avgCtr: 3,
      avgCpc: 2,
      avgFrequency: 1.5,
      totalClicks: 200,
      totalConversions: 10,
      cvr: 0.05,
    };
    expect(detectPrimaryProblem(metrics, t)).toBe("HEALTHY");
  });
});

describe("getImpactPct", () => {
  it("computes spend share for LOW_CTR", () => {
    const ads = [
      ad({ id: "1", spend: 50, ctr: 1 }),
      ad({ id: "2", spend: 50, ctr: 3 }),
    ];
    expect(getImpactPct(ads, "LOW_CTR", t)).toBe(50);
  });
});

describe("segmentPerformance", () => {
  it("returns null CTR for empty segment", () => {
    const s = segmentPerformance([ad({ id: "1", type: "video", ctr: 2, spend: 100 })]);
    expect(s.videoCtr).toBe(2);
    expect(s.imageCtr).toBeNull();
  });
});

describe("dominantFormat", () => {
  it("prefers video when video spend dominates", () => {
    const ads = [
      ad({ id: "v", type: "video", spend: 200 }),
      ad({ id: "i", type: "image", spend: 50 }),
    ];
    expect(dominantFormat(ads)).toBe("video");
  });
});

describe("getTopAdsBySpend", () => {
  it("returns top n stable sort", () => {
    const ads = [ad({ id: "b", spend: 10 }), ad({ id: "a", spend: 20 }), ad({ id: "c", spend: 15 })];
    const top = getTopAdsBySpend(ads, 2);
    expect(top.map((x) => x.id)).toEqual(["a", "c"]);
  });
});

describe("analyzeAdIssues", () => {
  it("flags NO_CONVERSIONS when clicks high and zero conversions", () => {
    const issues = analyzeAdIssues(
      ad({ id: "x", ctr: 3, cpc: 2, clicks: 60, conversions: 0 }),
      t
    );
    expect(issues).toContain("NO_CONVERSIONS");
  });
});

describe("getDiagnosisThresholds", () => {
  it("reads numeric env when set", () => {
    const prev = process.env.HEALTH_DIAG_CTR_MIN;
    process.env.HEALTH_DIAG_CTR_MIN = "3.5";
    expect(getDiagnosisThresholds().ctrMin).toBe(3.5);
    if (prev === undefined) delete process.env.HEALTH_DIAG_CTR_MIN;
    else process.env.HEALTH_DIAG_CTR_MIN = prev;
  });
});
