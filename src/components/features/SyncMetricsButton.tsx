"use client";

import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
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
    <div className="flex items-center gap-2">
      <Popover
        onOpenChange={(open) => {
          if (!open) updateUrl(dateFrom, dateTo);
        }}
      >
        <PopoverTrigger asChild>
          <button className="flex items-center gap-2 rounded-xl border border-border/70 bg-white px-3.5 py-2 text-[13px] text-foreground hover:bg-muted/40 transition-colors">
            <CalendarDays className="h-4 w-4 text-muted-foreground" strokeWidth={1.7} />
            <span className="font-medium">{formatDisplay(dateFrom)}</span>
            <span className="text-muted-foreground">—</span>
            <span className="font-medium">{formatDisplay(dateTo)}</span>
          </button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-auto p-4 rounded-2xl space-y-4">
          <p className="text-[13px] font-semibold text-foreground">Date Range</p>
          <div className="flex items-center gap-3">
            <div className="space-y-1.5">
              <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">From</label>
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="block w-[150px] rounded-xl border border-border/70 bg-muted/30 px-3 py-2 text-[13px] text-foreground outline-none focus:ring-2 focus:ring-foreground/10"
              />
            </div>
            <span className="text-muted-foreground mt-5">—</span>
            <div className="space-y-1.5">
              <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">To</label>
              <input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="block w-[150px] rounded-xl border border-border/70 bg-muted/30 px-3 py-2 text-[13px] text-foreground outline-none focus:ring-2 focus:ring-foreground/10"
              />
            </div>
          </div>
          <div className="flex gap-2 pt-1">
            {[
              { label: "7d", days: 7 },
              { label: "30d", days: 30 },
              { label: "90d", days: 90 },
              { label: "6m", days: 180 },
            ].map((p) => (
              <button
                key={p.label}
                onClick={() => {
                  const to = new Date();
                  const from = new Date(to.getTime() - p.days * 86400000);
                  const fromStr = formatDate(from);
                  const toStr = formatDate(to);
                  setDateFrom(fromStr);
                  setDateTo(toStr);
                  updateUrl(fromStr, toStr);
                }}
                className="rounded-lg border border-border/70 px-3 py-1 text-[11px] font-medium text-muted-foreground hover:bg-muted/50 hover:text-foreground transition-colors"
              >
                {p.label}
              </button>
            ))}
          </div>
        </PopoverContent>
      </Popover>

      <Button
        className="h-9 rounded-xl gap-2 bg-foreground text-white hover:bg-foreground/90 transition-colors font-medium text-[13px] px-4"
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
