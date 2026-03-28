"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { OnboardingShell } from "./OnboardingShell";
import { patchOnboardingState } from "./api";
import { readStoredDiagnosis, type OnboardingDiagnosis } from "./diagnosis-store";

function formatPercent(value: number): string {
  return `${value.toFixed(2)}%`;
}

function formatCurrency(value: number): string {
  return `₹${value.toFixed(2)}`;
}

export function InsightStep() {
  const router = useRouter();
  const [data, setData] = useState<OnboardingDiagnosis | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const cached = readStoredDiagnosis();
    setData(cached);
    setLoading(false);
  }, []);

  const content = useMemo(() => {
    if (!data) {
      return {
        primary: "CTR is your biggest bottleneck",
        happening: "Your ad is being seen, but not enough people click.",
        notProblem: "CPC may not be the core issue yet.",
        fix: "Strengthen the first seconds of your hook and value promise.",
        impact: "Improving CTR can unlock more clicks and conversions from the same spend.",
      };
    }

    const primary =
      data.problem === "LOW_CTR"
        ? "CTR is your biggest bottleneck"
        : data.problem === "HIGH_CPC"
          ? "CPC is consuming too much budget"
          : data.problem === "LOW_CVR"
            ? "Conversion rate is your biggest bottleneck"
            : "Your account is stable, but there is still room to improve";

    return {
      primary,
      happening: `Current CTR is ${formatPercent(data.metrics.avgCtr)} while CVR is ${formatPercent(
        data.metrics.cvr * 100
      )}.`,
      notProblem: `Current CPC is ${formatCurrency(data.metrics.avgCpc)} and may not be the main blocker.`,
      fix: "Your hook is not strong enough in the first seconds. Clarify outcome faster and remove friction.",
      impact: `Fixing this can recover up to ~${Math.round(
        data.impactPct
      )}% of underperforming spend and improve conversion opportunity.`,
    };
  }, [data]);

  const onContinue = async () => {
    setSaving(true);
    setError(null);
    try {
      await patchOnboardingState({
        first_insight_viewed: true,
        onboarding_step: "insight_viewed",
      });
      router.push("/onboarding/next-step");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to continue");
    } finally {
      setSaving(false);
    }
  };

  return (
    <OnboardingShell>
      <h1 className="text-[24px] font-extrabold tracking-tight text-foreground">
        You&apos;re losing clicks before people even enter your funnel
      </h1>

      {loading ? (
        <div className="mt-10 flex items-center gap-2 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading insight...
        </div>
      ) : (
        <div className="mt-8 grid w-full max-w-4xl gap-4 text-left">
          <Card className="rounded-2xl border bg-white">
            <CardContent className="space-y-2 p-5">
              <p className="text-sm uppercase tracking-wide text-muted-foreground">1. Primary Insight</p>
              <p className="text-lg font-semibold">{content.primary}</p>
            </CardContent>
          </Card>
          <Card className="rounded-2xl border bg-white">
            <CardContent className="space-y-2 p-5">
              <p className="text-sm uppercase tracking-wide text-muted-foreground">2. What&apos;s happening</p>
              <p className="text-base">{content.happening}</p>
            </CardContent>
          </Card>
          <Card className="rounded-2xl border bg-white">
            <CardContent className="space-y-2 p-5">
              <p className="text-sm uppercase tracking-wide text-muted-foreground">3. What&apos;s NOT the problem</p>
              <p className="text-base">{content.notProblem}</p>
            </CardContent>
          </Card>
          <Card className="rounded-2xl border bg-white">
            <CardContent className="space-y-2 p-5">
              <p className="text-sm uppercase tracking-wide text-muted-foreground">4. What to fix</p>
              <p className="text-base">{content.fix}</p>
            </CardContent>
          </Card>
          <Card className="rounded-2xl border bg-white">
            <CardContent className="space-y-2 p-5">
              <p className="text-sm uppercase tracking-wide text-muted-foreground">5. Impact</p>
              <p className="text-base">{content.impact}</p>
            </CardContent>
          </Card>
        </div>
      )}

      {error && (
        <Alert variant="destructive" className="mt-6 w-full max-w-md text-left">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <Button
        type="button"
        className="mt-8 h-12 rounded-lg bg-[hsl(250,60%,55%)] px-8 text-base text-white hover:bg-[hsl(250,60%,48%)]"
        onClick={onContinue}
        disabled={saving}
      >
        {saving ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Continuing...
          </>
        ) : (
          <>
            Show me what to fix first <ArrowRight className="ml-2 h-4 w-4" />
          </>
        )}
      </Button>
    </OnboardingShell>
  );
}
