import {
  getUserLimits,
  checkScrapeAllowed,
  checkAnalysisAllowed,
  recordAnalysis,
} from "../limits";

function createMockSupabase(overrides: {
  userLimits?: { daily_scrape_limit: number; daily_analysis_limit: number } | null;
  scrapeCount?: number;
  scrapeError?: Error | null;
  analysisCount?: number;
  analysisError?: Error | null;
  recordError?: Error | null;
}) {
  const {
    userLimits = null,
    scrapeCount = 0,
    scrapeError = null,
    analysisCount = 0,
    analysisError = null,
    recordError = null,
  } = overrides;

  const createCountChain = (count: number, err: Error | null) => {
    const result = () => Promise.resolve({ count, error: err });
    const link = () => ({ eq: link, gte: result });
    return { eq: link, gte: result };
  };

  return {
    from: (table: string) => {
      if (table === "user_usage_limits") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: () => Promise.resolve({ data: userLimits }),
            }),
          }),
        };
      }
      if (table === "competitor_requests") {
        return {
          select: (_cols: string, opts: { count?: string; head?: boolean }) =>
            opts.head ? createCountChain(scrapeCount, scrapeError) : { data: [] },
        };
      }
      if (table === "ai_analysis_requests") {
        return {
          select: (_cols: string, opts: { count?: string; head?: boolean }) =>
            opts.head ? createCountChain(analysisCount, analysisError) : { data: [] },
          insert: () => Promise.resolve({ error: recordError }),
        };
      }
      return {};
    },
  };
}

describe("usage/limits", () => {
  describe("getUserLimits", () => {
    it("returns defaults when no row exists", async () => {
      const supabase = createMockSupabase({ userLimits: null });
      const limits = await getUserLimits(supabase, "user-1");
      expect(limits).toEqual({ dailyScrapeLimit: 4, dailyAnalysisLimit: 3 });
    });

    it("returns overrides when row exists", async () => {
      const supabase = createMockSupabase({
        userLimits: { daily_scrape_limit: 50, daily_analysis_limit: 20 },
      });
      const limits = await getUserLimits(supabase, "user-1");
      expect(limits).toEqual({ dailyScrapeLimit: 50, dailyAnalysisLimit: 20 });
    });
  });

  describe("checkScrapeAllowed", () => {
    it("allows when under limit", async () => {
      const supabase = createMockSupabase({ userLimits: null, scrapeCount: 2 });
      const result = await checkScrapeAllowed(supabase, "user-1");
      expect(result).toEqual({
        allowed: true,
        used: 2,
        limit: 4,
        remaining: 2,
      });
    });

    it("denies when at limit", async () => {
      const supabase = createMockSupabase({ userLimits: null, scrapeCount: 4 });
      const result = await checkScrapeAllowed(supabase, "user-1");
      expect(result).toEqual({
        allowed: false,
        used: 4,
        limit: 4,
        remaining: 0,
      });
    });

    it("denies when over limit", async () => {
      const supabase = createMockSupabase({ userLimits: null, scrapeCount: 6 });
      const result = await checkScrapeAllowed(supabase, "user-1");
      expect(result.allowed).toBe(false);
      expect(result.used).toBe(6);
      expect(result.remaining).toBe(0);
    });

    it("respects per-user override", async () => {
      const supabase = createMockSupabase({
        userLimits: { daily_scrape_limit: 3, daily_analysis_limit: 4 },
        scrapeCount: 2,
      });
      const result = await checkScrapeAllowed(supabase, "user-1");
      expect(result).toEqual({
        allowed: true,
        used: 2,
        limit: 3,
        remaining: 1,
      });
    });
  });

  describe("checkAnalysisAllowed", () => {
    it("allows when under limit", async () => {
      const supabase = createMockSupabase({ userLimits: null, analysisCount: 2 });
      const result = await checkAnalysisAllowed(supabase, "user-1");
      expect(result).toEqual({
        allowed: true,
        used: 2,
        limit: 3,
        remaining: 1,
      });
    });

    it("denies when at limit", async () => {
      const supabase = createMockSupabase({ userLimits: null, analysisCount: 3 });
      const result = await checkAnalysisAllowed(supabase, "user-1");
      expect(result).toEqual({
        allowed: false,
        used: 3,
        limit: 3,
        remaining: 0,
      });
    });
  });

  describe("recordAnalysis", () => {
    it("does not throw on success", async () => {
      const supabase = createMockSupabase({});
      await expect(
        recordAnalysis(supabase, "user-1", "page-1", "Page Name", 10)
      ).resolves.toBeUndefined();
    });

    it("does not throw on error (logs only)", async () => {
      const spy = jest.spyOn(console, "error").mockImplementation(() => {});
      const supabase = createMockSupabase({
        recordError: new Error("DB error"),
      });
      await expect(
        recordAnalysis(supabase, "user-1", "page-1", "Page Name", 10)
      ).resolves.toBeUndefined();
      spy.mockRestore();
    });
  });
});
