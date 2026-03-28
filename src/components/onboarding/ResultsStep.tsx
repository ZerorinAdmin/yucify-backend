"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { OnboardingShell } from "./OnboardingShell";
import {
  readStoredDiagnosis,
  writeStoredDiagnosis,
  type OnboardingDiagnosis,
} from "./diagnosis-store";

type AdIssue = "LOW_CTR" | "HIGH_CPC" | "NO_CONVERSIONS";

function defaultDateRange(): { from: string; to: string } {
  const toDate = new Date();
  const fromDate = new Date(toDate);
  fromDate.setDate(fromDate.getDate() - 7);
  return {
    from: fromDate.toISOString().slice(0, 10),
    to: toDate.toISOString().slice(0, 10),
  };
}

function severityScore(issues: AdIssue[]): number {
  return issues.reduce((score, issue) => {
    if (issue === "NO_CONVERSIONS") return score + 3;
    if (issue === "HIGH_CPC") return score + 2;
    return score + 1;
  }, 0);
}

function issueLabel(issues: AdIssue[]): string {
  if (issues.includes("NO_CONVERSIONS")) return "🚨 Low engagement";
  if (issues.includes("LOW_CTR")) return "⚠️ Weak CTR";
  if (issues.includes("HIGH_CPC")) return "⚠️ High CPC";
  return "✅ Performing well";
}

function issueInsight(issues: AdIssue[]): string {
  if (issues.includes("NO_CONVERSIONS")) return "People are clicking but not converting.";
  if (issues.includes("LOW_CTR")) return "Users see it but don't click.";
  if (issues.includes("HIGH_CPC")) return "You are paying too much for each click.";
  return "This ad is healthy compared to others.";
}

function formatPercent(value: number): string {
  return `${value.toFixed(2)}%`;
}

function formatCurrency(value: number): string {
  return `₹${value.toFixed(2)}`;
}

export function ResultsStep() {
  const router = useRouter();
  const [data, setData] = useState<OnboardingDiagnosis | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const dateRange = useMemo(() => defaultDateRange(), []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const cached = readStoredDiagnosis();
        if (cached && !cancelled) {
          setData(cached);
          return;
        }

        const res = await fetch(`/api/meta/diagnosis?from=${dateRange.from}&to=${dateRange.to}`);
        const json = (await res.json().catch(() => ({}))) as OnboardingDiagnosis & {
          error?: string;
        };
        if (!res.ok) {
          throw new Error(json.error ?? "Failed to load diagnosis");
        }
        if (!cancelled) {
          setData(json);
          writeStoredDiagnosis(json);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load results");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [dateRange.from, dateRange.to]);

  const rankedAds = useMemo(() => {
    if (!data) return [];
    return data.topAds
      .map((ad) => {
        const issues = data.topAdIssues.find((i) => i.ad_id === ad.id)?.issues ?? [];
        return { ...ad, issues, score: severityScore(issues) };
      })
      .sort((a, b) => b.score - a.score);
  }, [data]);

  return (
    <OnboardingShell>
      <h1 className="text-[24px] font-extrabold tracking-tight text-foreground">
        Your ads — ranked by biggest problems
      </h1>

      {loading && (
        <div className="mt-10 flex items-center gap-2 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading results...
        </div>
      )}

      {error && (
        <Alert variant="destructive" className="mt-8 w-full max-w-xl text-left">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {!loading && !error && rankedAds.length === 0 && (
        <Card className="mt-8 w-full max-w-xl">
          <CardContent className="p-6 text-left">
            <p className="text-base text-foreground">No ads found - try another account.</p>
          </CardContent>
        </Card>
      )}

      {!loading && !error && rankedAds.length > 0 && (
        <div className="mt-8 grid w-full max-w-4xl gap-4 text-left sm:grid-cols-2">
          {rankedAds.map((ad) => (
            <Card key={ad.id} className="rounded-2xl border bg-white">
              <CardContent className="space-y-3 p-5">
                <p className="text-sm font-medium text-muted-foreground">{issueLabel(ad.issues)}</p>
                <p className="text-base font-semibold text-foreground">{ad.name}</p>
                <p className="text-sm text-muted-foreground">{issueInsight(ad.issues)}</p>
                <p className="text-xs text-muted-foreground">
                  CTR {formatPercent(ad.ctr)} · CPC {formatCurrency(ad.cpc)}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Button
        type="button"
        className="mt-8 h-12 rounded-lg bg-[hsl(250,60%,55%)] px-8 text-base text-white hover:bg-[hsl(250,60%,48%)]"
        onClick={() => {
          router.push("/onboarding/insight");
          router.refresh();
        }}
      >
        Diagnose my ads <ArrowRight className="ml-2 h-4 w-4" />
      </Button>
    </OnboardingShell>
  );
}
