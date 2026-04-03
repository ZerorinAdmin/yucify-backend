"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Circle, CheckCircle2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { OnboardingShell } from "./OnboardingShell";
import { patchOnboardingState } from "./api";

type PersonaOption = {
  value: "own_product" | "clients" | "freelancer_consultant" | "exploring";
  label: string;
};

const PERSONA_OPTIONS: PersonaOption[] = [
  { value: "own_product", label: "Running ads for my own product" },
  { value: "clients", label: "Managing ads for clients" },
  { value: "freelancer_consultant", label: "Freelancing / consulting" },
  { value: "exploring", label: "Just exploring" },
];

type ReferralOption = {
  value:
    | "facebook"
    | "instagram"
    | "friends"
    | "reddit"
    | "linkedin"
    | "twitter_x"
    | "google"
    | "others";
  label: string;
};

const REFERRAL_OPTIONS: ReferralOption[] = [
  { value: "facebook", label: "Facebook" },
  { value: "instagram", label: "Instagram" },
  { value: "friends", label: "Friends" },
  { value: "reddit", label: "Reddit" },
  { value: "linkedin", label: "LinkedIn" },
  { value: "twitter_x", label: "Twitter (X)" },
  { value: "google", label: "Google" },
  { value: "others", label: "Others" },
];

export function IntroStep() {
  const router = useRouter();
  const [persona, setPersona] = useState<PersonaOption["value"] | null>(null);
  const [referralSource, setReferralSource] = useState<ReferralOption["value"] | "">("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const SIGNUP_PIXEL_KEY = "repto_signup_tracked";
    if (localStorage.getItem(SIGNUP_PIXEL_KEY)) return;

    const eventId = `cr_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;

    if (typeof window !== "undefined" && typeof window.fbq === "function") {
      window.fbq("track", "CompleteRegistration", {}, { eventID: eventId });
    }

    const fbp = document.cookie.match(/(?:^|;\s*)_fbp=([^;]*)/)?.[1];
    const fbc = document.cookie.match(/(?:^|;\s*)_fbc=([^;]*)/)?.[1];

    fetch("/api/meta/capi", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        eventName: "CompleteRegistration",
        eventId,
        eventSourceUrl: window.location.href,
        ...(fbp ? { fbp } : {}),
        ...(fbc ? { fbc } : {}),
      }),
    }).catch(() => {});

    localStorage.setItem(SIGNUP_PIXEL_KEY, "1");
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/onboarding/state");
        if (!res.ok) return;
        const json = (await res.json()) as {
          persona?: PersonaOption["value"] | null;
          referral_source?: ReferralOption["value"] | null;
        };
        if (!cancelled && json.persona) {
          setPersona(json.persona);
        }
        if (!cancelled && json.referral_source) {
          setReferralSource(json.referral_source);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const canContinue = useMemo(() => !!persona && !saving, [persona, saving]);

  const onContinue = async () => {
    if (!persona) return;
    setSaving(true);
    setError(null);
    try {
      await patchOnboardingState({
        persona,
        referral_source: referralSource || undefined,
        onboarding_step: "intro_completed",
      });
      router.push("/onboarding/proof");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to continue");
    } finally {
      setSaving(false);
    }
  };

  return (
    <OnboardingShell>
      <h1 className="text-[24px] font-medium tracking-tight text-foreground">
        Find what&apos;s killing your ads in 30 seconds
      </h1>
      <p className="mt-3 max-w-2xl text-[14px] text-muted-foreground">
        We analyze your ads and show exactly what&apos;s stopping clicks, conversions, and scale.
      </p>

      <div className="mt-10 w-full max-w-md text-left">
        <Label className="mb-3 block text-base font-medium text-muted-foreground">
          Let&apos;s tailor insights for you
        </Label>
        <div className="space-y-3">
          {PERSONA_OPTIONS.map((option) => {
            const selected = persona === option.value;
            return (
              <Button
                key={option.value}
                type="button"
                variant="outline"
                className="h-12 w-full justify-start gap-3 rounded-lg border-input bg-white text-base font-normal shadow-none"
                onClick={() => setPersona(option.value)}
              >
                {selected ? (
                  <CheckCircle2 className="h-4 w-4 text-[hsl(250,60%,55%)]" />
                ) : (
                  <Circle className="h-4 w-4 text-muted-foreground" />
                )}
                {option.label}
              </Button>
            );
          })}
        </div>
      </div>

      <div className="mt-8 w-full max-w-md text-left">
        <Label htmlFor="onboarding-referral" className="mb-3 block text-base font-medium text-muted-foreground">
          Where did you hear about us?
        </Label>
        <Select value={referralSource} onValueChange={(value) => setReferralSource(value as ReferralOption["value"])}>
          <SelectTrigger
            id="onboarding-referral"
            className="h-12 rounded-lg border-input bg-white text-base shadow-none"
          >
            <SelectValue placeholder="Select an option" />
          </SelectTrigger>
          <SelectContent>
            {REFERRAL_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {error && (
        <Alert variant="destructive" className="mt-6 w-full max-w-md text-left">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <Button
        type="button"
        className="mt-8 h-12 w-full max-w-md rounded-lg bg-[hsl(250,60%,55%)] text-base font-medium text-white hover:bg-[hsl(250,60%,48%)]"
        disabled={!canContinue || loading}
        onClick={onContinue}
      >
        {saving ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Continuing...
          </>
        ) : (
          "Continue"
        )}
      </Button>
    </OnboardingShell>
  );
}
