"use client";

import { useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import {
  FunnelChart,
  Funnel,
  Cell,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
} from "recharts";
import { ArrowDown, TrendingDown, Filter } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type FunnelStage = {
  name: string;
  value: number;
  fill: string;
  rate: number;
  label?: string;
};

type FunnelData = {
  funnelType: string;
  funnelLabel: string;
  stages: FunnelStage[];
  ads: { id: string; name: string }[];
  availableTypes: { key: string; label: string }[];
};

function formatCompact(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}

const FUNNEL_COLORS = [
  "#7C5CFC",
  "#6366f1",
  "#14b8a6",
  "#0ea5e9",
  "#f43f5e",
  "#f59e0b",
  "#8b5cf6",
  "#ec4899",
];

export function AdFunnel() {
  const searchParams = useSearchParams();
  const dateFrom = searchParams.get("from");
  const dateTo = searchParams.get("to");

  const [data, setData] = useState<FunnelData | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedAd, setSelectedAd] = useState<string>("all");
  const [ads, setAds] = useState<{ id: string; name: string }[]>([]);

  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams();
    if (dateFrom && dateTo) {
      params.set("from", dateFrom);
      params.set("to", dateTo);
    }
    if (selectedAd !== "all") params.set("ad_id", selectedAd);
    const url = `/api/meta/funnel?${params.toString()}`;
    fetch(url)
      .then((r) => r.json())
      .then((d) => {
        if (!d.error) {
          setData(d);
          if (Array.isArray(d.ads)) {
            setAds(d.ads);
          }
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [selectedAd, dateFrom, dateTo]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-pulse text-muted-foreground text-[14px]">Loading funnel data…</div>
      </div>
    );
  }

  if (!data || data.stages.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-center">
        <Filter className="h-10 w-10 text-muted-foreground/30 mb-3" strokeWidth={1.2} />
        <p className="text-[15px] font-semibold text-foreground">No funnel data available</p>
        <p className="text-[13px] text-muted-foreground mt-1">Sync your metrics first to see the ad funnel</p>
      </div>
    );
  }

  const maxValue = data.stages[0]?.value ?? 1;
  const stagesWithLabel = data.stages.map((s) => ({
    ...s,
    label: s.label ?? `${s.name} · ${formatCompact(s.value)}`,
  }));

  return (
    <div className="space-y-5 sm:space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
        <div className="min-w-0">
          <h2 className="text-[18px] font-extrabold text-foreground sm:text-[20px]">Ad Funnel</h2>
          <p className="mt-1 text-[13px] text-muted-foreground">
            Detected funnel: <span className="font-semibold text-foreground">{data.funnelLabel}</span>
          </p>
        </div>
        <div className="w-full shrink-0 sm:w-[min(100%,280px)]">
          <Select value={selectedAd} onValueChange={setSelectedAd}>
            <SelectTrigger className="h-10 w-full rounded-xl border-border/60 bg-white text-[13px] font-medium">
              <SelectValue placeholder="All Ads" />
            </SelectTrigger>
            <SelectContent align="end" className="rounded-xl">
              <SelectItem value="all" className="text-[13px]">
                All Ads
              </SelectItem>
              {ads.map((ad) => (
                <SelectItem key={ad.id} value={ad.id} className="text-[13px]">
                  <span className="line-clamp-2 text-left break-words">{ad.name}</span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 lg:gap-8">
        {/* Chart first: top on mobile, left column on desktop */}
        <div className="rounded-2xl border border-border/50 bg-gradient-to-br from-white to-muted/20 p-4 shadow-sm sm:p-6">
          <h3 className="mb-3 text-[15px] font-bold text-foreground sm:mb-4">Funnel Chart</h3>
          <div className="h-[300px] sm:h-[380px] lg:h-[440px]">
            <ResponsiveContainer width="100%" height="100%">
              <FunnelChart margin={{ top: 12, right: 8, bottom: 12, left: 8 }}>
                <defs>
                  {stagesWithLabel.map((_, i) => (
                    <linearGradient key={i} id={`funnel-grad-${i}`} x1="0" y1="0" x2="1" y2="1">
                      <stop offset="0%" stopColor={FUNNEL_COLORS[i % FUNNEL_COLORS.length]} stopOpacity={1} />
                      <stop offset="100%" stopColor={FUNNEL_COLORS[i % FUNNEL_COLORS.length]} stopOpacity={0.8} />
                    </linearGradient>
                  ))}
                </defs>
                <RechartsTooltip
                  contentStyle={{
                    backgroundColor: "#fff",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: 12,
                    fontSize: 13,
                    boxShadow: "0 8px 24px rgba(0,0,0,0.1)",
                  }}
                  formatter={(value: unknown, _name: unknown, props: { payload?: { name: string } }) => [
                    formatCompact(Number(value)),
                    props?.payload?.name ?? "",
                  ]}
                />
                <Funnel
                  dataKey="value"
                  data={stagesWithLabel}
                  isAnimationActive
                  animationDuration={1000}
                  animationEasing="ease-out"
                >
                  {stagesWithLabel.map((_, i) => (
                    <Cell
                      key={i}
                      fill={`url(#funnel-grad-${i})`}
                      stroke="rgba(255,255,255,0.7)"
                      strokeWidth={1.5}
                    />
                  ))}
                </Funnel>
              </FunnelChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Breakdown second: below chart on mobile, right column on desktop */}
        <div className="space-y-2 sm:space-y-3">
          <h3 className="mb-1 text-[15px] font-bold text-foreground">Stage Breakdown</h3>
          {data.stages.map((stage, i) => {
            const linearPct = maxValue > 0 ? (stage.value / maxValue) * 100 : 0;
            // Sqrt scaling keeps order vs top stage but avoids hairline bars for small shares
            const visualBarPct =
              maxValue > 0 && stage.value > 0
                ? Math.sqrt(stage.value / maxValue) * 100
                : 0;
            const barWidthPct =
              stage.value <= 0
                ? 0
                : Math.min(100, Math.max(visualBarPct, linearPct < 1 ? 8 : 3));
            const dropOff = i > 0 ? data.stages[i - 1].value - stage.value : 0;
            const dropPct = i > 0 && data.stages[i - 1].value > 0
              ? ((dropOff / data.stages[i - 1].value) * 100).toFixed(1)
              : null;
            const isConversionOver100 = stage.rate > 100;
            const color = FUNNEL_COLORS[i % FUNNEL_COLORS.length];

            return (
              <div key={stage.name}>
                {i > 0 && (
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1 py-1 pl-2 sm:pl-4">
                    <ArrowDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground/40" />
                    {isConversionOver100 ? (
                      <span className="text-[12px] text-amber-600" title="Meta counts Clicks and Link Clicks differently; Link Clicks can exceed Clicks">
                        Different definitions
                      </span>
                    ) : (
                      <>
                        <span className="text-[12px] text-muted-foreground">
                          {stage.rate}% conversion
                        </span>
                        {dropPct && Number(dropPct) > 0 && (
                          <span className="flex items-center gap-0.5 text-[12px] text-rose-500">
                            <TrendingDown className="h-3 w-3" />
                            {formatCompact(dropOff)} drop-off ({dropPct}%)
                          </span>
                        )}
                      </>
                    )}
                  </div>
                )}
                <div className="rounded-xl border border-border/40 bg-white p-3 transition-all hover:border-border/60 hover:shadow-md sm:p-4">
                  <div className="mb-2 flex items-start justify-between gap-3">
                    <span className="flex min-w-0 items-center gap-2">
                      <span
                        className="mt-1 h-2.5 w-2.5 shrink-0 rounded-sm"
                        style={{ backgroundColor: color }}
                      />
                      <span className="text-[13px] font-semibold leading-snug text-foreground">
                        {stage.name}
                      </span>
                    </span>
                    <span className="shrink-0 text-[14px] font-extrabold tabular-nums text-foreground sm:text-[15px]">
                      {formatCompact(stage.value)}
                    </span>
                  </div>
                  <div className="h-2.5 overflow-hidden rounded-full bg-muted/50">
                    <div
                      className="h-full min-w-[4px] rounded-full transition-all duration-700"
                      style={{
                        width: `${barWidthPct}%`,
                        backgroundColor: color,
                      }}
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
