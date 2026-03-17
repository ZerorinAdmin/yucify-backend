"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  TrendingUp,
  TrendingDown,
  Minus,
  DollarSign,
  Eye,
  MousePointerClick,
  BarChart3,
  Repeat,
  Trophy,
  AlertCircle,
} from "lucide-react";
import type {
  WeeklySummaryResult,
  MetricChange,
} from "@/lib/weekly/summary";

function formatCurrency(n: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(n);
}

function ChangeBadge({ change }: { change: MetricChange }) {
  const Icon =
    change.direction === "up"
      ? TrendingUp
      : change.direction === "down"
        ? TrendingDown
        : Minus;
  const color =
    change.direction === "up"
      ? "text-emerald-600 bg-emerald-50"
      : change.direction === "down"
        ? "text-rose-600 bg-rose-50"
        : "text-muted-foreground bg-muted";

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${color}`}
    >
      <Icon className="h-3 w-3" strokeWidth={2} />
      {change.changePct >= 0 ? "+" : ""}
      {change.changePct.toFixed(1)}%
    </span>
  );
}

function MetricRow({
  label,
  thisWeek,
  previousWeek,
  change,
  formatter = (n: number) => n.toLocaleString(),
}: {
  label: string;
  thisWeek: number;
  previousWeek: number;
  change: MetricChange;
  formatter?: (n: number) => string;
}) {
  return (
    <div className="flex items-center justify-between py-2 border-b border-border/50 last:border-0">
      <span className="text-sm text-muted-foreground">{label}</span>
      <div className="flex items-center gap-3">
        <span className="text-sm font-medium tabular-nums">
          {formatter(thisWeek)}
        </span>
        <span className="text-xs text-muted-foreground">
          vs {formatter(previousWeek)}
        </span>
        <ChangeBadge change={change} />
      </div>
    </div>
  );
}

export function WeeklySummaryPanel() {
  const [data, setData] = useState<WeeklySummaryResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/meta/weekly-summary")
      .then((res) => {
        if (!res.ok) throw new Error("Failed to load");
        return res.json();
      })
      .then(setData)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-32 w-full rounded-2xl bg-muted/60 animate-pulse" />
        <div className="grid gap-4 md:grid-cols-2">
          <div className="h-64 rounded-2xl bg-muted/60 animate-pulse" />
          <div className="h-64 rounded-2xl bg-muted/60 animate-pulse" />
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <Card className="rounded-2xl border-border/70">
        <CardContent className="py-12 text-center text-muted-foreground">
          {error ?? "No data available. Sync metrics for both weeks to see the summary."}
        </CardContent>
      </Card>
    );
  }

  const changeMap = new Map(data.metricChanges.map((c) => [c.metric, c]));

  return (
    <div className="space-y-6">
      {/* Biggest change highlight */}
      <Card className="rounded-2xl border-border/70 overflow-hidden">
        <div className="bg-gradient-to-br from-[hsl(250,60%,96%)] to-white p-6">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Biggest change vs previous week
          </p>
          <div className="mt-2 flex items-center gap-3">
            <span className="text-2xl font-bold text-foreground">
              {data.biggestChange.metric}
            </span>
            <ChangeBadge change={data.biggestChange} />
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {data.biggestChange.metric}: {formatMetricValue(data.biggestChange.metric, data.biggestChange.thisWeek)} this week vs{" "}
            {formatMetricValue(data.biggestChange.metric, data.biggestChange.previousWeek)} last week
          </p>
        </div>
      </Card>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Metric comparison */}
        <Card className="rounded-2xl border-border/70">
          <CardHeader>
            <CardTitle className="text-base">Week-over-week comparison</CardTitle>
            <CardDescription>
              This week ({data.thisWeek.from} → {data.thisWeek.to}) vs previous
              week ({data.previousWeek.from} → {data.previousWeek.to})
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-0">
            <MetricRow
              label="Spend"
              thisWeek={data.thisWeek.spend}
              previousWeek={data.previousWeek.spend}
              change={changeMap.get("Spend")!}
              formatter={formatCurrency}
            />
            <MetricRow
              label="Impressions"
              thisWeek={data.thisWeek.impressions}
              previousWeek={data.previousWeek.impressions}
              change={changeMap.get("Impressions")!}
            />
            <MetricRow
              label="Reach"
              thisWeek={data.thisWeek.reach}
              previousWeek={data.previousWeek.reach}
              change={changeMap.get("Reach")!}
            />
            <MetricRow
              label="Clicks"
              thisWeek={data.thisWeek.clicks}
              previousWeek={data.previousWeek.clicks}
              change={changeMap.get("Clicks")!}
            />
            <MetricRow
              label="CTR (%)"
              thisWeek={data.thisWeek.ctr}
              previousWeek={data.previousWeek.ctr}
              change={changeMap.get("CTR")!}
              formatter={(n) => `${n.toFixed(2)}%`}
            />
            <MetricRow
              label="CPC"
              thisWeek={data.thisWeek.cpc}
              previousWeek={data.previousWeek.cpc}
              change={changeMap.get("CPC")!}
              formatter={formatCurrency}
            />
            <MetricRow
              label="ROAS"
              thisWeek={data.thisWeek.roas}
              previousWeek={data.previousWeek.roas}
              change={changeMap.get("ROAS")!}
              formatter={(n) => `${n.toFixed(2)}x`}
            />
            <MetricRow
              label="Frequency"
              thisWeek={data.thisWeek.frequency}
              previousWeek={data.previousWeek.frequency}
              change={changeMap.get("Frequency")!}
              formatter={(n) => n.toFixed(2)}
            />
          </CardContent>
        </Card>

        {/* Top / Worst performers */}
        <Card className="rounded-2xl border-border/70">
          <CardHeader>
            <CardTitle className="text-base">Ad performance this week</CardTitle>
            <CardDescription>
              Top and worst performing ads by ROAS (min spend)
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {data.topPerformingAd ? (
              <div className="flex items-start gap-3 rounded-xl bg-emerald-50/80 p-4">
                <Trophy className="h-5 w-5 shrink-0 text-emerald-600" />
                <div>
                  <p className="text-xs font-medium uppercase text-emerald-700">
                    Top performer
                  </p>
                  <p className="font-medium text-foreground">
                    {data.topPerformingAd.ad_name}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    ROAS {data.topPerformingAd.roas.toFixed(2)}x · Spend{" "}
                    {formatCurrency(data.topPerformingAd.spend)}
                  </p>
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No ads this week</p>
            )}

            {data.worstPerformingAd &&
            data.worstPerformingAd.ad_id !== data.topPerformingAd?.ad_id ? (
              <div className="flex items-start gap-3 rounded-xl bg-rose-50/80 p-4">
                <AlertCircle className="h-5 w-5 shrink-0 text-rose-600" />
                <div>
                  <p className="text-xs font-medium uppercase text-rose-700">
                    Needs attention
                  </p>
                  <p className="font-medium text-foreground">
                    {data.worstPerformingAd.ad_name}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    ROAS {data.worstPerformingAd.roas.toFixed(2)}x · Spend{" "}
                    {formatCurrency(data.worstPerformingAd.spend)}
                  </p>
                </div>
              </div>
            ) : null}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function formatMetricValue(metric: string, value: number): string {
  switch (metric) {
    case "Spend":
    case "CPC":
      return formatCurrency(value);
    case "CTR":
      return `${value.toFixed(2)}%`;
    case "ROAS":
      return `${value.toFixed(2)}x`;
    case "Frequency":
      return value.toFixed(2);
    default:
      return value.toLocaleString();
  }
}
