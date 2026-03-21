"use client";

import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { CalendarDays, RefreshCw, Loader2, Check } from "lucide-react";

const STORAGE_KEY = "dashboard_date_range";

function formatDate(d: Date): string {
  return d.toISOString().split("T")[0];
}

function formatDisplay(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function getDefaultRange() {
  const today = new Date();
  const from = new Date(today);
  from.setDate(from.getDate() - 7);
  return { from: formatDate(from), to: formatDate(today) };
}

function getStoredRange(): { from: string; to: string } | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed?.from && parsed?.to) return parsed;
  } catch {}
  return null;
}

function storeRange(from: string, to: string) {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ from, to }));
  } catch {}
}

export function SyncMetricsButton() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState(false);
  const [synced, setSynced] = useState(false);

  const defaultRange = getDefaultRange();
  const urlFrom = searchParams.get("from");
  const urlTo = searchParams.get("to");
  const hasUrlParams = !!urlFrom && !!urlTo;

  const initialFrom = urlFrom ?? getStoredRange()?.from ?? defaultRange.from;
  const initialTo = urlTo ?? getStoredRange()?.to ?? defaultRange.to;

  const [dateFrom, setDateFrom] = useState(initialFrom);
  const [dateTo, setDateTo] = useState(initialTo);
  const hasRestored = useRef(false);

  useEffect(() => {
    if (hasUrlParams) {
      setDateFrom(urlFrom!);
      setDateTo(urlTo!);
      hasRestored.current = false;
    } else if (!hasRestored.current) {
      const stored = getStoredRange();
      if (stored) {
        hasRestored.current = true;
        setDateFrom(stored.from);
        setDateTo(stored.to);
        router.replace(`${pathname}?from=${stored.from}&to=${stored.to}`);
      } else {
        setDateFrom(defaultRange.from);
        setDateTo(defaultRange.to);
      }
    }
  }, [urlFrom, urlTo, hasUrlParams, pathname, router]);

  const updateUrl = (from: string, to: string) => {
    storeRange(from, to);
    const params = new URLSearchParams(searchParams.toString());
    params.set("from", from);
    params.set("to", to);
    router.push(`${pathname}?${params.toString()}`);
  };

  const handleSync = async () => {
    setLoading(true);
    setSynced(false);
    try {
      const res = await fetch("/api/meta/metrics", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date_from: dateFrom, date_to: dateTo }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to sync");
      setSynced(true);
      router.refresh();
      setTimeout(() => setSynced(false), 3000);
    } catch {
      setSynced(false);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center sm:gap-2">
      <Popover
        onOpenChange={(open) => {
          if (!open) updateUrl(dateFrom, dateTo);
        }}
      >
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            className="h-9 w-full justify-start gap-2 rounded-xl border-border/70 bg-white text-[13px] font-normal text-foreground hover:bg-muted/40 sm:w-auto"
          >
            <CalendarDays className="h-4 w-4 shrink-0 text-muted-foreground" strokeWidth={1.7} />
            <span className="min-w-0 truncate text-left font-medium">
              {formatDisplay(dateFrom)}{" "}
              <span className="text-muted-foreground">—</span>{" "}
              {formatDisplay(dateTo)}
            </span>
          </Button>
        </PopoverTrigger>
        <PopoverContent
          align="end"
          className="w-[min(100vw-2rem,22rem)] space-y-4 rounded-2xl p-4 sm:w-auto"
        >
          <p className="text-[13px] font-semibold text-foreground">Date Range</p>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:gap-3">
            <div className="min-w-0 flex-1 space-y-1.5">
              <Label htmlFor="date-from" className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                From
              </Label>
              <Input
                id="date-from"
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="w-full rounded-xl border-border/70 bg-muted/30 text-[13px]"
              />
            </div>
            <span className="hidden text-muted-foreground sm:mb-2 sm:inline">—</span>
            <div className="min-w-0 flex-1 space-y-1.5">
              <Label htmlFor="date-to" className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                To
              </Label>
              <Input
                id="date-to"
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="w-full rounded-xl border-border/70 bg-muted/30 text-[13px]"
              />
            </div>
          </div>
          <div className="flex flex-wrap gap-2 pt-1">
            {[
              { label: "7d", days: 7 },
              { label: "30d", days: 30 },
              { label: "90d", days: 90 },
              { label: "6m", days: 180 },
            ].map((p) => (
              <Button
                key={p.label}
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  const to = new Date();
                  const from = new Date(to.getTime() - p.days * 86400000);
                  const fromStr = formatDate(from);
                  const toStr = formatDate(to);
                  setDateFrom(fromStr);
                  setDateTo(toStr);
                  updateUrl(fromStr, toStr);
                }}
                className="h-8 rounded-lg border-border/70 px-3 text-[11px] font-medium text-muted-foreground hover:text-foreground"
              >
                {p.label}
              </Button>
            ))}
          </div>
        </PopoverContent>
      </Popover>

      <Button
        className="h-9 w-full gap-2 rounded-xl bg-foreground px-4 text-[13px] font-medium text-white transition-colors hover:bg-foreground/90 sm:w-auto"
        onClick={handleSync}
        disabled={loading}
      >
        {loading ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            Syncing…
          </>
        ) : synced ? (
          <>
            <Check className="h-4 w-4" />
            Synced
          </>
        ) : (
          <>
            <RefreshCw className="h-4 w-4" strokeWidth={1.8} />
            Sync
          </>
        )}
      </Button>
    </div>
  );
}
