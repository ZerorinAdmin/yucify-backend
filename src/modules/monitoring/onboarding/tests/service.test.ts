import {
  getRequiredOnboardingRoute,
  shouldRedirectFromOnboarding,
} from "../service";
import type { OnboardingProfile } from "../types";

function profile(overrides: Partial<OnboardingProfile>): OnboardingProfile {
  return {
    persona: null,
    referral_source: null,
    onboarding_step: null,
    meta_connected: false,
    first_insight_viewed: false,
    onboarding_completed_at: null,
    ...overrides,
  };
}

describe("onboarding service routing", () => {
  it("sends incomplete users to intro", () => {
    expect(getRequiredOnboardingRoute(profile({ onboarding_step: null }))).toBe(
      "/onboarding/intro"
    );
  });

  it("allows intro and blocks later routes when step is empty", () => {
    const p = profile({ onboarding_step: null });
    expect(shouldRedirectFromOnboarding(p, "/onboarding/intro")).toBeNull();
    expect(shouldRedirectFromOnboarding(p, "/onboarding/proof")).toBe(
      "/onboarding/intro"
    );
  });

  it("blocks completed users from onboarding", () => {
    const p = profile({
      onboarding_step: "completed",
      onboarding_completed_at: new Date().toISOString(),
    });
    expect(shouldRedirectFromOnboarding(p, "/onboarding/intro")).toBe("/dashboard");
  });

  it("redirects from connect to intro when previous steps are not done", () => {
    const p = profile({ onboarding_step: "intro_completed" });
    expect(shouldRedirectFromOnboarding(p, "/onboarding/connect")).toBe(
      "/onboarding/proof"
    );
  });
});
