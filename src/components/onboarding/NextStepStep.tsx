"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { OnboardingShell } from "./OnboardingShell";
import { patchOnboardingState } from "./api";

export function NextStepStep() {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onFinish = async () => {
    setSaving(true);
    setError(null);
    try {
      await patchOnboardingState({
        onboarding_completed_at: new Date().toISOString(),
        onboarding_step: "completed",
      });
      router.push("/dashboard");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to complete onboarding");
    } finally {
      setSaving(false);
    }
  };

  return (
    <OnboardingShell>
      <h1 className="text-[24px] font-extrabold tracking-tight text-foreground">
        Start fixing your worst-performing ads
      </h1>
      <p className="mt-3 max-w-2xl text-[16px] text-muted-foreground">
        These ads are costing you the most missed conversions.
      </p>

      {error && (
        <Alert variant="destructive" className="mt-6 w-full max-w-md text-left">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <Button
        type="button"
        className="mt-10 h-12 rounded-lg bg-[hsl(250,60%,55%)] px-8 text-base text-white hover:bg-[hsl(250,60%,48%)]"
        onClick={onFinish}
        disabled={saving}
      >
        {saving ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Finishing...
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
