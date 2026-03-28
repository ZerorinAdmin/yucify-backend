export const ONBOARDING_DIAGNOSIS_STORAGE_KEY = "onboarding.diagnosis.v1";

export type OnboardingDiagnosis = {
  problem: "LOW_CTR" | "LOW_CVR" | "HIGH_CPC" | "HEALTHY";
  metrics: {
    avgCtr: number;
    avgCpc: number;
    cvr: number;
  };
  topAds: {
    id: string;
    name: string;
    ctr: number;
    cpc: number;
    spend: number;
    previewUrl?: string;
  }[];
  topAdIssues: { ad_id: string; issues: ("LOW_CTR" | "HIGH_CPC" | "NO_CONVERSIONS")[] }[];
  impactPct: number;
};

export function readStoredDiagnosis(): OnboardingDiagnosis | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(ONBOARDING_DIAGNOSIS_STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as OnboardingDiagnosis;
  } catch {
    return null;
  }
}

export function writeStoredDiagnosis(data: OnboardingDiagnosis): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(ONBOARDING_DIAGNOSIS_STORAGE_KEY, JSON.stringify(data));
  } catch {
    // ignore storage failures
  }
}
