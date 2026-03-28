"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { OnboardingShell } from "./OnboardingShell";
import { patchOnboardingState } from "./api";
import { writeStoredDiagnosis, type OnboardingDiagnosis } from "./diagnosis-store";

const LOADING_MESSAGES = [
  "Scanning performance data...",
  "Detecting bottlenecks...",
  "Calculating missed conversions...",
];

function defaultDateRange(): { from: string; to: string } {
  const toDate = new Date();
  const fromDate = new Date(toDate);
  fromDate.setDate(fromDate.getDate() - 7);
  return {
    from: fromDate.toISOString().slice(0, 10),
    to: toDate.toISOString().slice(0, 10),
  };
}

export function AnalyzingStep() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const state = searchParams.get("state");
  const [activeMessageIdx, setActiveMessageIdx] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const dateRange = useMemo(() => defaultDateRange(), []);

  useEffect(() => {
    const id = window.setInterval(() => {
      setActiveMessageIdx((prev) => (prev + 1) % LOADING_MESSAGES.length);
    }, 900);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        // If we returned from Meta OAuth, activate the first discovered ad account.
        if (state) {
          const flowRes = await fetch(`/api/meta/flow?state=${encodeURIComponent(state)}`);
          const flowJson = (await flowRes.json().catch(() => ({}))) as {
            ad_accounts?: { id: string; name: string; account_id: string }[];
            error?: string;
          };
          if (!flowRes.ok) {
            throw new Error(flowJson.error ?? "Failed to load Meta account data");
          }

          const firstAccount = flowJson.ad_accounts?.[0];
          if (!firstAccount) {
            throw new Error("No ad accounts found for this Meta account. Try another account.");
          }

          const saveRes = await fetch("/api/meta/save", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              state,
              ad_account_id: firstAccount.id,
              account_name: firstAccount.name,
            }),
          });
          const saveJson = (await saveRes.json().catch(() => ({}))) as { error?: string };
          if (!saveRes.ok) {
            throw new Error(saveJson.error ?? "Failed to activate Meta account");
          }

          await patchOnboardingState({
            meta_connected: true,
            onboarding_step: "meta_connected",
          });
        }

        const diagnosisRes = await fetch(
          `/api/meta/diagnosis?from=${dateRange.from}&to=${dateRange.to}`
        );
        const diagnosisJson = (await diagnosisRes.json().catch(() => ({}))) as
          | OnboardingDiagnosis
          | { error?: string };
        if (!diagnosisRes.ok) {
          const msg =
            "error" in diagnosisJson && diagnosisJson.error
              ? diagnosisJson.error
              : "Failed to analyze ads";
          throw new Error(msg);
        }

        writeStoredDiagnosis(diagnosisJson as OnboardingDiagnosis);
        await new Promise((resolve) => window.setTimeout(resolve, 1300));
        if (!cancelled) {
          router.push("/onboarding/results");
          router.refresh();
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Analysis failed");
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [dateRange.from, dateRange.to, router, state]);

  return (
    <OnboardingShell>
      <h1 className="text-[24px] font-extrabold tracking-tight text-foreground">
        Analyzing your ads...
      </h1>

      <div className="mt-10 flex w-full max-w-lg flex-col items-start gap-4 rounded-2xl border bg-white p-6 text-left">
        {LOADING_MESSAGES.map((message, idx) => {
          const active = idx === activeMessageIdx;
          return (
            <div
              key={message}
              className={`flex items-center gap-3 text-base ${active ? "text-foreground" : "text-muted-foreground"}`}
            >
              {active ? (
                <Loader2 className="h-4 w-4 animate-spin text-[hsl(250,60%,55%)]" />
              ) : (
                <span className="h-2 w-2 rounded-full bg-muted-foreground/50" />
              )}
              <span>{message}</span>
            </div>
          );
        })}
      </div>

      {error && (
        <Alert variant="destructive" className="mt-6 w-full max-w-lg text-left">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
    </OnboardingShell>
  );
}
