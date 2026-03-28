"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { OnboardingShell } from "./OnboardingShell";
import { patchOnboardingState } from "./api";
import { cn } from "@/lib/utils";

export function ProofStep() {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onContinue = async () => {
    setSaving(true);
    setError(null);
    try {
      await patchOnboardingState({ onboarding_step: "proof_seen" });
      router.push("/onboarding/connect");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to continue");
    } finally {
      setSaving(false);
    }
  };

  return (
    <OnboardingShell className="max-w-6xl">
      <h1 className="text-[24px] font-medium tracking-tight text-foreground">
        Here&apos;s what you&apos;ll see in seconds
      </h1>
      <p className="mt-3 text-[16px] text-muted-foreground">
        Connect account, and get instant insights
      </p>

      <div className="relative mt-0 w-full max-w-5xl min-h-[560px] overflow-visible rounded-3xl bg-transparent pb-2 md:min-h-[580px] md:pb-0">
        <Image
          src="/big-heart.png"
          alt=""
          width={460}
          height={460}
          className="pointer-events-none absolute left-1/2 top-[42px] z-0 w-[16.5rem] -translate-x-1/2 object-contain opacity-95 select-none md:w-[21rem]"
          priority={false}
        />

        <div className="relative z-[1] text-left">
          <div className="space-y-4 p-4 md:hidden">
            <InfoTile
              title="Diagnosis"
              body="CTR is the constraint metric, with a blended rate of 1.75%. The conversion rate is strong at 31.68%, indicating that once users click, they are likely to convert."
            />
            <InfoTile
              title="Why it matters"
              body="You&apos;re losing ~32% potential traffic before your funnel even starts."
            />
            <InfoTile
              title="What to change"
              body="Change the first 3 seconds of your creative to clearly show the outcome."
            />
            <InfoTile
              title="Efficiency insight"
              body="Improve the hook to reach (CTR 1.75% -> CTR 2.50%), which could drive ~827 more clicks and ~262 more conversions at the same spend."
            />
            <InfoTile
              title="Budget waste detection"
              body="No significant budget waste detected due to low frequency and reasonable CPC."
            />
          </div>

          <div className="hidden md:block">
            <InfoTile
              title="Diagnosis"
              body="CTR is the constraint metric, with a blended rate of 1.75%. The conversion rate is strong at 31.68%, indicating that once users click, they are likely to convert."
              className="absolute left-[100px] top-[42px] z-[2] w-[350px]"
            />
            <InfoTile
              title="Why it matters"
              body="You&apos;re losing ~32% potential traffic before your funnel even starts."
              className="absolute right-[180px] top-[52px] z-[2] w-[340px]"
            />
            <InfoTile
              title="What to change"
              body="Change the first 3 seconds of your creative to clearly show the outcome."
              className="absolute left-[100px] top-[232px] z-[2] w-[320px]"
            />
            <InfoTile
              title="Efficiency insight"
              body="Improve the hook to reach (CTR 1.75% -> CTR 2.50%), which could drive ~827 more clicks and ~262 more conversions at the same spend."
              className="absolute right-[100px] top-[192px] z-[2] w-[365px]"
            />
            <InfoTile
              title="Budget waste detection"
              body="No significant budget waste detected due to low frequency and reasonable CPC."
              className="absolute left-[130px] top-[380px] z-[2] w-[350px]"
            />
          </div>
        </div>
      </div>

      {error && (
        <Alert variant="destructive" className="mt-6 w-full max-w-md text-left">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <Button
        type="button"
        onClick={onContinue}
        disabled={saving}
        className="mt-4 h-12 rounded-lg bg-[hsl(250,60%,55%)] px-8 text-base text-white hover:bg-[hsl(250,60%,48%)] md:mt-3"
      >
        {saving ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Continuing...
          </>
        ) : (
          "Show my ad insights"
        )}
      </Button>
    </OnboardingShell>
  );
}

function CardTitleDot({ variant = "glass" }: { variant?: "glass" | "onBlue" }) {
  return (
    <span
      className={cn(
        "inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full",
        variant === "onBlue"
          ? "bg-white"
          : "bg-white/95 shadow-sm ring-1 ring-white/60 dark:bg-white/90 dark:ring-white/25"
      )}
      aria-hidden
    >
      <span className="h-2.5 w-2.5 rounded-full bg-violet-500 dark:bg-violet-400" />
    </span>
  );
}

function InfoTile({
  title,
  body,
  className,
}: {
  title: string;
  body: string;
  className?: string;
}) {
  const baseGlass =
    "w-full max-w-none rounded-2xl border border-white/40 bg-white/[0.45] p-5 shadow-none backdrop-blur-[64px] dark:border-white/40 dark:bg-white/[0.08]";

  return (
    <div className={cn(baseGlass, className)}>
      <div className="flex items-center gap-2">
        <CardTitleDot variant="glass" />
        <p className="text-xs font-semibold uppercase tracking-wide text-violet-700 dark:text-violet-300">
          {title}
        </p>
      </div>
      <p className="mt-3 text-sm leading-relaxed text-slate-800 dark:text-slate-200">{body}</p>
    </div>
  );
}
