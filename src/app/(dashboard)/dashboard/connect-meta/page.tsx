"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

type AdAccount = { id: string; name: string; account_id: string };

export default function ConnectMetaPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const state = searchParams.get("state");

  const [adAccounts, setAdAccounts] = useState<AdAccount[]>([]);
  const [selectedId, setSelectedId] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!state) {
      setError("Missing connection state. Start from the dashboard.");
      setLoading(false);
      return;
    }
    fetch(`/api/meta/flow?state=${encodeURIComponent(state)}`)
      .then((res) => {
        if (!res.ok) throw new Error(res.status === 410 ? "Connection expired. Please try again." : "Failed to load ad accounts");
        return res.json();
      })
      .then((data: { ad_accounts: AdAccount[] }) => {
        setAdAccounts(data.ad_accounts ?? []);
        if (data.ad_accounts?.length === 0) {
          setError("No ad accounts found for this Facebook account.");
        }
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [state]);

  const handleSave = useCallback(async () => {
    if (!state || !selectedId) return;
    setSaving(true);
    setError(null);
    try {
      const selectedAccount = adAccounts.find((a) => a.id === selectedId);
      const res = await fetch("/api/meta/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ state, ad_account_id: selectedId, account_name: selectedAccount?.name }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Failed to save");
      }
      router.replace("/dashboard");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }, [state, selectedId, router]);

  if (loading) {
    return (
      <Card className="w-full max-w-md">
        <CardContent className="pt-6">
          <p className="text-sm text-muted-foreground">Loading ad accounts…</p>
        </CardContent>
      </Card>
    );
  }

  if (error && adAccounts.length === 0) {
    const isNoAccounts = error.includes("No ad accounts");
    return (
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Connect Meta</CardTitle>
          <CardDescription>
            {isNoAccounts
              ? "This Facebook account has no ad accounts we can access."
              : "Select an ad account to connect"}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Alert variant={isNoAccounts ? "default" : "destructive"}>
            <AlertTitle>{isNoAccounts ? "No ad accounts found" : "Error"}</AlertTitle>
            <AlertDescription>
              {isNoAccounts ? (
                <>
                  Create an ad account in{" "}
                  <a
                    href="https://business.facebook.com"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline font-medium"
                  >
                    Meta Business Suite
                  </a>{" "}
                  or Ads Manager, or use a Facebook account that already has access to an ad account. If you use Business Manager, ensure this account has access to at least one ad account.
                </>
              ) : (
                error
              )}
            </AlertDescription>
          </Alert>
          <div className="flex flex-col gap-2">
            <Button asChild>
              <a href="/api/meta/connect">Try again with another account</a>
            </Button>
            <Button variant="outline" onClick={() => router.push("/dashboard")}>
              Back to Dashboard
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle>Select Ad Account</CardTitle>
        <CardDescription>
          Choose the Meta ad account to connect for monitoring
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {error && (
          <Alert variant="destructive">
            <AlertTitle>Error</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        <div className="space-y-2">
          <Label htmlFor="ad-account">Ad account</Label>
          <Select value={selectedId} onValueChange={setSelectedId}>
            <SelectTrigger id="ad-account">
              <SelectValue placeholder="Select an account" />
            </SelectTrigger>
            <SelectContent>
              {adAccounts.map((acc) => (
                <SelectItem key={acc.id} value={acc.id}>
                  {acc.name} ({acc.account_id})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex gap-2">
          <Button onClick={handleSave} disabled={!selectedId || saving}>
            {saving ? "Saving…" : "Connect account"}
          </Button>
          <Button
            variant="outline"
            onClick={() => router.push("/dashboard")}
            disabled={saving}
          >
            Cancel
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
