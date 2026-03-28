"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2, CheckCircle2, Circle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { OnboardingShell } from "./OnboardingShell";

type AdAccount = {
  id: string;
  name: string;
  account_id: string;
};

export function SelectAccountStep() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const state = searchParams.get("state");

  const [accounts, setAccounts] = useState<AdAccount[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!state) {
      setError("Missing connection state. Please go back and reconnect.");
      setLoading(false);
      return;
    }

    (async () => {
      try {
        const res = await fetch(`/api/meta/flow?state=${encodeURIComponent(state)}`);
        const json = (await res.json()) as {
          ad_accounts?: AdAccount[];
          error?: string;
        };
        if (!res.ok) throw new Error(json.error ?? "Failed to load accounts");

        const list = json.ad_accounts ?? [];
        setAccounts(list);
        if (list.length === 1) setSelected(list[0].id);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load accounts");
      } finally {
        setLoading(false);
      }
    })();
  }, [state]);

  const onContinue = async () => {
    if (!selected || !state) return;
    setSaving(true);
    setError(null);

    const account = accounts.find((a) => a.id === selected);

    try {
      const res = await fetch("/api/meta/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          state,
          ad_account_id: selected,
          account_name: account?.name ?? selected,
        }),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(json.error ?? "Failed to activate account");

      const patchRes = await fetch("/api/onboarding/state", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          onboarding_step: "completed",
          onboarding_completed_at: new Date().toISOString(),
        }),
      });
      if (!patchRes.ok) {
        console.warn("[select-account] onboarding state patch failed, continuing to dashboard");
      }

      router.push("/dashboard");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save account");
      setSaving(false);
    }
  };

  return (
    <OnboardingShell>
      <h1 className="text-[24px] font-semibold tracking-tight text-foreground">
        Select your ad account
      </h1>
      <p className="mt-3 max-w-2xl text-[16px] text-muted-foreground">
        Choose which ad account you&apos;d like to monitor.
      </p>

      {loading && (
        <div className="mt-10 flex items-center gap-3 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span className="text-base">Loading your ad accounts...</span>
        </div>
      )}

      {!loading && accounts.length === 0 && !error && (
        <Alert className="mt-8 w-full max-w-md text-left">
          <AlertDescription>
            No ad accounts found. Make sure your Facebook account has access to a Meta ad account.
          </AlertDescription>
        </Alert>
      )}

      {!loading && accounts.length > 0 && (
        <div className="mt-8 w-full max-w-md space-y-3">
          {accounts.map((account) => {
            const isSelected = selected === account.id;
            return (
              <Button
                key={account.id}
                type="button"
                variant="outline"
                className="h-14 w-full justify-start gap-3 rounded-lg border-input bg-white text-base font-normal shadow-none"
                onClick={() => setSelected(account.id)}
              >
                {isSelected ? (
                  <CheckCircle2 className="h-5 w-5 shrink-0 text-[hsl(250,60%,55%)]" />
                ) : (
                  <Circle className="h-5 w-5 shrink-0 text-muted-foreground" />
                )}
                <div className="flex flex-col items-start text-left">
                  <span className="text-sm font-medium text-foreground">
                    {account.name || account.account_id}
                  </span>
                  <span className="text-xs text-muted-foreground">{account.account_id}</span>
                </div>
              </Button>
            );
          })}
        </div>
      )}

      {error && (
        <Alert variant="destructive" className="mt-6 w-full max-w-md text-left">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <Button
        type="button"
        className="mt-8 h-12 w-full max-w-md rounded-lg bg-[hsl(250,60%,55%)] text-base font-medium text-white hover:bg-[hsl(250,60%,48%)]"
        disabled={!selected || saving || loading}
        onClick={onContinue}
      >
        {saving ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Setting up...
          </>
        ) : (
          "Continue"
        )}
      </Button>
    </OnboardingShell>
  );
}
