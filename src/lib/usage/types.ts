/**
 * Usage limit types for daily scrape and AI analysis enforcement.
 */

export type UsageCheckResult = {
  allowed: boolean;
  used: number;
  limit: number;
  remaining: number;
};

export type UserLimits = {
  dailyScrapeLimit: number;
  dailyAnalysisLimit: number;
};
