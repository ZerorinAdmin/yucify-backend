"use client";

import Image from "next/image";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { OnboardingShell } from "./OnboardingShell";
import { patchOnboardingState } from "./api";

export function ConnectStep() {
  const router = useRouter();
  const [skipping, setSkipping] = useState(false);

  const onSkip = async () => {
    setSkipping(true);
    try {
      await patchOnboardingState({
        onboarding_step: "completed",
        onboarding_completed_at: new Date().toISOString(),
      });
      router.push("/dashboard");
      router.refresh();
    } catch {
      router.push("/dashboard");
    }
  };

  return (
    <OnboardingShell className="min-h-[calc(100dvh-80px)]">
      <div className="flex items-center justify-center">
        <div className="flex items-center">
          <div className="flex h-[72px] w-[72px] items-center justify-center rounded-full border-[2.5px] border-dashed border-[#d8cfd7] bg-transparent">
            <Image
              src="/meta-icon.webp"
              alt="Meta"
              width={32}
              height={32}
              className="h-8 w-8 object-contain"
              priority
            />
          </div>
          <div className="h-0 w-[48px] border-t-[2.5px] border-dashed border-[#d8cfd7]" />
          <div className="flex h-[72px] w-[72px] items-center justify-center rounded-full border-[2.5px] border-dashed border-[#d8cfd7] bg-transparent">
            <Image
              src="/yucify-icon.png"
              alt="Yucify"
              width={32}
              height={32}
              className="h-8 w-8 object-contain"
              priority
            />
          </div>
        </div>
      </div>

      <h1 className="text-[24px] font-semibold tracking-tight text-foreground">
        See what&apos;s wasting your ad spend
      </h1>
      <p className="mt-3 max-w-3xl text-[16px] text-muted-foreground">
        Connect your Meta account to uncover hidden performance issues in your ads.
      </p>

      <ul className="mt-9 w-full max-w-xl list-disc space-y-1 pl-6 text-left text-[16px] text-muted-foreground">
        <li>Instantly find why your ad is not working</li>
        <li>Get clear, actionable fixes not just data</li>
        <li>Turn ad metrics into simple, understandable insights</li>
        <li>No manual analysis or guesswork required</li>
      </ul>

      <div className="mt-12 flex w-full max-w-md flex-col gap-3">
        <Button
          asChild
          className="h-12 rounded-lg bg-[hsl(250,60%,55%)] text-base font-medium text-white hover:bg-[hsl(250,60%,48%)]"
        >
          <a href="/api/meta/connect?next=%2Fonboarding%2Fanalyzing">Connect account</a>
        </Button>
        <Button
          type="button"
          variant="outline"
          className="h-12 rounded-lg border-input bg-white text-base font-normal shadow-none"
          disabled={skipping}
          onClick={onSkip}
        >
          {skipping ? "Redirecting..." : "I don\u0027t need insights"}
        </Button>
      </div>

      <p className="mt-auto pt-20 text-sm text-muted-foreground">
        Secure &nbsp;•&nbsp; No posting/editing permissions &nbsp;•&nbsp; Trusted by multiple
        founders
      </p>
    </OnboardingShell>
  );
}
