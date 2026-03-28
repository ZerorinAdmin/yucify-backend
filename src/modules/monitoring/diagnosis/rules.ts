import type {
  AdIssueId,
  DiagnosisProblemId,
  DiagnosisThresholds,
  DominantFormat,
  NormalizedAd,
  SegmentPerformance,
  SystemMetrics,
} from "./types";

export function getDiagnosisThresholds(): DiagnosisThresholds {
  return {
    ctrMin: parseFloat(process.env.HEALTH_DIAG_CTR_MIN ?? "2"),
    cvrMin: parseFloat(process.env.HEALTH_DIAG_CVR_MIN ?? "0.02"),
    cpcMax: parseFloat(process.env.HEALTH_DIAG_CPC_MAX ?? "5"),
    minClicksForCvr: parseInt(process.env.HEALTH_DIAG_MIN_CLICKS ?? "100", 10),
    adCtrThreshold: parseFloat(process.env.HEALTH_DIAG_AD_CTR_THRESHOLD ?? "2"),
    adCpcThreshold: parseFloat(process.env.HEALTH_DIAG_AD_CPC_THRESHOLD ?? "5"),
    minClicksForNoConversions: parseInt(
      process.env.HEALTH_DIAG_NO_CONV_MIN_CLICKS ?? "50",
      10
    ),
  };
}

function weightedAvg(ads: NormalizedAd[], key: "ctr" | "cpc"): number {
  const spend = ads.reduce((s, a) => s + a.spend, 0);
  if (spend <= 0) return 0;
  return ads.reduce((s, a) => s + a[key] * a.spend, 0) / spend;
}

export function getSystemMetrics(ads: NormalizedAd[]): SystemMetrics {
  const totalSpend = ads.reduce((s, a) => s + a.spend, 0);
  const totalImpressions = ads.reduce((s, a) => s + a.impressions, 0);
  const totalReach = ads.reduce((s, a) => s + a.reach, 0);
  const totalClicks = ads.reduce((s, a) => s + a.clicks, 0);
  const totalConversions = ads.reduce((s, a) => s + a.conversions, 0);
  const cvr = totalClicks > 0 ? totalConversions / totalClicks : 0;
  const avgCtr =
    totalImpressions > 0 ? (totalClicks / totalImpressions) * 100 : weightedAvg(ads, "ctr");
  const avgCpc = totalClicks > 0 ? totalSpend / totalClicks : weightedAvg(ads, "cpc");
  const avgFrequency = totalReach > 0 ? totalImpressions / totalReach : 0;

  return {
    totalSpend,
    totalImpressions,
    avgCtr,
    avgCpc,
    avgFrequency,
    totalClicks,
    totalConversions,
    cvr,
  };
}

export function detectPrimaryProblem(
  metrics: SystemMetrics,
  t: DiagnosisThresholds
): DiagnosisProblemId {
  if (metrics.avgCtr < t.ctrMin) return "LOW_CTR";
  if (
    metrics.totalClicks >= t.minClicksForCvr &&
    metrics.cvr < t.cvrMin
  ) {
    return "LOW_CVR";
  }
  if (metrics.avgCpc > t.cpcMax) return "HIGH_CPC";
  return "HEALTHY";
}

export function getImpactPct(
  ads: NormalizedAd[],
  problem: DiagnosisProblemId,
  t: DiagnosisThresholds
): number {
  const totalSpend = ads.reduce((s, a) => s + a.spend, 0);
  if (totalSpend <= 0) return 0;

  const pred = (ad: NormalizedAd): boolean => {
    switch (problem) {
      case "LOW_CTR":
        return ad.ctr < t.adCtrThreshold;
      case "LOW_CVR":
        return ad.clicks >= t.minClicksForCvr && ad.conversions / Math.max(ad.clicks, 1) < t.cvrMin;
      case "HIGH_CPC":
        return ad.cpc > t.adCpcThreshold;
      default:
        return false;
    }
  };

  const affected = ads.filter(pred).reduce((s, a) => s + a.spend, 0);
  return Math.round((affected / totalSpend) * 1000) / 10;
}

export function segmentPerformance(ads: NormalizedAd[]): SegmentPerformance {
  const video = ads.filter((a) => a.type === "video");
  const image = ads.filter((a) => a.type === "image");
  const videoSpend = video.reduce((s, a) => s + a.spend, 0);
  const imageSpend = image.reduce((s, a) => s + a.spend, 0);
  return {
    videoCtr: video.length > 0 ? weightedAvg(video, "ctr") : null,
    imageCtr: image.length > 0 ? weightedAvg(image, "ctr") : null,
    videoSpend,
    imageSpend,
  };
}

export function dominantFormat(ads: NormalizedAd[]): DominantFormat {
  const { videoSpend, imageSpend } = segmentPerformance(ads);
  if (videoSpend === 0 && imageSpend === 0) return "mixed";
  if (videoSpend > imageSpend * 1.05) return "video";
  if (imageSpend > videoSpend * 1.05) return "image";
  return "mixed";
}

export function getTopAdsBySpend(ads: NormalizedAd[], n: number): NormalizedAd[] {
  return [...ads]
    .sort((a, b) => b.spend - a.spend || a.id.localeCompare(b.id))
    .slice(0, n);
}

export function analyzeAdIssues(ad: NormalizedAd, t: DiagnosisThresholds): AdIssueId[] {
  const issues: AdIssueId[] = [];
  if (ad.ctr < t.adCtrThreshold) issues.push("LOW_CTR");
  if (ad.cpc > t.adCpcThreshold) issues.push("HIGH_CPC");
  if (
    ad.clicks >= t.minClicksForNoConversions &&
    ad.conversions === 0
  ) {
    issues.push("NO_CONVERSIONS");
  }
  return issues;
}
