"use client";

import { useState } from "react";
import {
  LayoutGrid,
  BarChart3,
  TrendingUp,
  Plus,
  X,
} from "lucide-react";
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import type { AdSummary } from "@/app/(dashboard)/dashboard/page";

type MetricDef = {
  id: string;
  label: string;
  accessor: (ad: AdSummary) => number;
  format: (n: number) => string;
  color: string;
};

function formatCurrency(n: number): string {
  if (n >= 1000) return `₹${(n / 1000).toFixed(2)}K`;
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(n);
}

const ALL_METRICS: MetricDef[] = [
  { id: "spend",       label: "Spend",       accessor: (a) => a.total_spend,       format: formatCurrency, color: "#7C5CFC" },
  { id: "impressions", label: "Impressions", accessor: (a) => a.total_impressions,  format: (n) => n >= 1000 ? `${(n / 1000).toFixed(1)}K` : n.toLocaleString(), color: "#34d399" },
  { id: "reach",        label: "Reach",       accessor: (a) => a.total_reach,        format: (n) => n >= 1000 ? `${(n / 1000).toFixed(1)}K` : n.toLocaleString(), color: "#14b8a6" },
  { id: "clicks",      label: "Clicks",      accessor: (a) => a.total_clicks,       format: (n) => n.toLocaleString(), color: "#f43f5e" },
  { id: "ctr",         label: "CTR",         accessor: (a) => a.avg_ctr,            format: (n) => `${n.toFixed(2)}%`, color: "#f59e0b" },
  { id: "cpc",         label: "CPC",         accessor: (a) => a.avg_cpc,            format: formatCurrency, color: "#ec4899" },
  { id: "roas",        label: "ROAS",        accessor: (a) => a.avg_roas,           format: (n) => `${n.toFixed(2)}x`, color: "#3b82f6" },
  { id: "frequency",   label: "Frequency",   accessor: (a) => a.avg_frequency,      format: (n) => n.toFixed(2), color: "#a855f7" },
];

const METRIC_MAP = new Map(ALL_METRICS.map((m) => [m.id, m]));
const DEFAULT_METRICS = ["spend", "impressions", "cpc", "ctr"];

type ViewMode = "card" | "bar" | "line";

export function CreativeVisualizer({ ads, onAdClick }: { ads: AdSummary[]; onAdClick?: (ad: AdSummary) => void }) {
  const [view, setView] = useState<ViewMode>("card");
  const [selectedMetrics, setSelectedMetrics] = useState<string[]>(DEFAULT_METRICS);

  const addMetric = (id: string) => {
    if (!selectedMetrics.includes(id)) setSelectedMetrics([...selectedMetrics, id]);
  };
  const removeMetric = (id: string) => {
    setSelectedMetrics(selectedMetrics.filter((m) => m !== id));
  };

  const availableToAdd = ALL_METRICS.filter((m) => !selectedMetrics.includes(m.id));

  if (ads.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No creatives yet. Sync metrics to pull ad data from Meta.
      </p>
    );
  }

  return (
    <div className="space-y-5">
      {/* Toolbar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="h-8 text-[12px] gap-1.5 rounded-lg border-dashed border-border font-medium">
                <Plus className="h-3.5 w-3.5" strokeWidth={1.8} />
                Add metric
              </Button>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-[180px] p-1.5 rounded-xl border-border/70">
              {availableToAdd.length === 0 ? (
                <p className="px-2 py-2 text-xs text-muted-foreground">All metrics added</p>
              ) : (
                availableToAdd.map((m) => (
                  <button
                    key={m.id}
                    onClick={() => addMetric(m.id)}
                    className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] hover:bg-muted/60 transition-colors text-left"
                  >
                    <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: m.color }} />
                    {m.label}
                  </button>
                ))
              )}
            </PopoverContent>
          </Popover>

          {selectedMetrics.map((id, idx) => {
            const m = METRIC_MAP.get(id);
            if (!m) return null;
            return (
              <div
                key={id}
                className="inline-flex items-center gap-1.5 rounded-full border border-border/70 bg-white pl-1.5 pr-1 py-0.5 text-[12px] font-medium"
              >
                <span
                  className="flex h-[18px] w-[18px] items-center justify-center rounded-full text-[9px] font-bold text-white"
                  style={{ backgroundColor: m.color }}
                >
                  {idx + 1}
                </span>
                <span className="text-foreground">{m.label}</span>
                <button
                  onClick={() => removeMetric(id)}
                  className="ml-0.5 rounded-full p-0.5 text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            );
          })}
        </div>

        {/* View toggle */}
        <div className="flex w-full items-center justify-between rounded-xl border border-border/70 bg-white p-1 sm:w-auto sm:justify-start">
          <ViewBtn active={view === "card"} onClick={() => setView("card")} icon={<LayoutGrid className="h-3.5 w-3.5" strokeWidth={1.8} />} label="Cards" />
          <ViewBtn active={view === "bar"}  onClick={() => setView("bar")}  icon={<BarChart3 className="h-3.5 w-3.5" strokeWidth={1.8} />}  label="Bar" />
          <ViewBtn active={view === "line"} onClick={() => setView("line")} icon={<TrendingUp className="h-3.5 w-3.5" strokeWidth={1.8} />} label="Line" />
        </div>
      </div>

      {view === "card" && <CardView ads={ads} metrics={selectedMetrics} onAdClick={onAdClick} />}
      {view === "bar"  && <BarView ads={ads} metrics={selectedMetrics} />}
      {view === "line" && <LineView ads={ads} metrics={selectedMetrics} />}
    </div>
  );
}

function ViewBtn({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12px] font-medium transition-all duration-150 ${
        active
          ? "bg-[hsl(250,60%,55%)] text-white shadow-sm"
          : "text-muted-foreground hover:text-foreground"
      }`}
    >
      {icon}
      <span className="hidden sm:inline">{label}</span>
    </button>
  );
}

// ── Card View ──

function CardView({ ads, metrics, onAdClick }: { ads: AdSummary[]; metrics: string[]; onAdClick?: (ad: AdSummary) => void }) {
  const activeDefs = metrics.map((id) => METRIC_MAP.get(id)).filter(Boolean) as MetricDef[];

  return (
    <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
      {ads.map((ad) => {
        const imgSrc = ad.image_url || ad.thumbnail_url;
        return (
          <div
            key={ad.ad_id}
            onClick={() => onAdClick?.(ad)}
            className="group rounded-2xl border border-border/70 bg-white overflow-hidden transition-shadow duration-200 hover:shadow-[0_4px_20px_rgba(0,0,0,0.06)] cursor-pointer"
          >
            <div className="relative aspect-[4/5] bg-muted/40">
              {imgSrc ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={imgSrc} alt={ad.ad_name} className="h-full w-full object-contain" />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-muted-foreground/40 text-sm">
                  No preview
                </div>
              )}
              <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-black/40 to-transparent" />
              <span className={`absolute bottom-3 left-3 inline-flex items-center rounded-md px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${
                ad.creative_type === "video" ? "bg-amber-500 text-white" :
                ad.creative_type === "image" ? "bg-emerald-500 text-white" :
                "bg-zinc-500 text-white"
              }`}>
                {ad.creative_type}
              </span>
            </div>

            <div className="p-4 space-y-3">
              <div>
                <p className="font-semibold text-[14px] leading-snug truncate text-foreground">{ad.ad_name}</p>
                <p className="text-[12px] text-muted-foreground truncate mt-0.5">
                  {ad.adset_name || ad.campaign_name || "—"}
                </p>
              </div>
              <div className="space-y-2 pt-1 border-t border-border/50">
                {activeDefs.map((m) => (
                  <div key={m.id} className="flex items-center justify-between text-[13px]">
                    <span className="text-muted-foreground">{m.label}</span>
                    <span className="font-semibold tabular-nums text-foreground">{m.format(m.accessor(ad))}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Bar Chart View ──

function BarView({ ads, metrics }: { ads: AdSummary[]; metrics: string[] }) {
  const activeDefs = metrics.map((id) => METRIC_MAP.get(id)).filter(Boolean) as MetricDef[];
  const chartData = ads.map((ad) => {
    const row: Record<string, string | number> = { name: ad.ad_name, ad_id: ad.ad_id };
    for (const m of activeDefs) row[m.id] = Number(m.accessor(ad).toFixed(2));
    return row;
  });

  return (
    <div className="rounded-2xl border border-border/70 bg-white p-4 sm:p-6">
      <div className="h-[260px] sm:h-[380px]">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} barCategoryGap="25%">
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
            <XAxis
              dataKey="name"
              tick={(props: Record<string, unknown>) => {
                const x = Number(props.x ?? 0);
                const y = Number(props.y ?? 0);
                const payload = props.payload as { value: string; index: number } | undefined;
                const idx = payload?.index ?? 0;
                const value = payload?.value ?? "";
                const ad = ads[idx];
                const imgSrc = ad?.image_url || ad?.thumbnail_url;
                return (
                  <g transform={`translate(${x},${y + 10})`}>
                    {imgSrc ? (
                      <image href={imgSrc} x={-18} y={0} width={36} height={36} clipPath="inset(0 round 8px)" />
                    ) : (
                      <rect x={-18} y={0} width={36} height={36} rx={8} fill="hsl(var(--muted))" />
                    )}
                    <text x={0} y={50} textAnchor="middle" fill="hsl(var(--muted-foreground))" fontSize={10}>
                      {value.length > 18 ? value.slice(0, 16) + "…" : value}
                    </text>
                  </g>
                );
              }}
              height={70}
              interval={0}
            />
            <YAxis tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} width={55} />
            <RechartsTooltip
              contentStyle={{ backgroundColor: "#fff", border: "1px solid hsl(var(--border))", borderRadius: 12, fontSize: 12, boxShadow: "0 4px 16px rgba(0,0,0,0.06)" }}
              formatter={(value: unknown, name: unknown) => {
                const m = METRIC_MAP.get(String(name));
                return [m ? m.format(Number(value)) : Number(value), m?.label ?? String(name)];
              }}
            />
            <Legend formatter={(v: unknown) => METRIC_MAP.get(String(v))?.label ?? String(v)} wrapperStyle={{ fontSize: 11, paddingTop: 12 }} />
            {activeDefs.map((m) => (
              <Bar key={m.id} dataKey={m.id} fill={m.color} radius={[6, 6, 0, 0]} maxBarSize={44} />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

// ── Line Chart View ──

function LineView({ ads, metrics }: { ads: AdSummary[]; metrics: string[] }) {
  const activeDefs = metrics.map((id) => METRIC_MAP.get(id)).filter(Boolean) as MetricDef[];
  const chartData = ads.map((ad) => {
    const row: Record<string, string | number> = { name: ad.ad_name };
    for (const m of activeDefs) row[m.id] = Number(m.accessor(ad).toFixed(2));
    return row;
  });

  return (
    <div className="rounded-2xl border border-border/70 bg-white p-4 sm:p-6">
      <div className="h-[260px] sm:h-[380px]">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
            <XAxis dataKey="name" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} interval={0} angle={-15} textAnchor="end" height={55} />
            <YAxis tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} width={55} />
            <RechartsTooltip
              contentStyle={{ backgroundColor: "#fff", border: "1px solid hsl(var(--border))", borderRadius: 12, fontSize: 12, boxShadow: "0 4px 16px rgba(0,0,0,0.06)" }}
              formatter={(value: unknown, name: unknown) => {
                const m = METRIC_MAP.get(String(name));
                return [m ? m.format(Number(value)) : Number(value), m?.label ?? String(name)];
              }}
            />
            <Legend formatter={(v: unknown) => METRIC_MAP.get(String(v))?.label ?? String(v)} wrapperStyle={{ fontSize: 11, paddingTop: 12 }} />
            {activeDefs.map((m) => (
              <Line key={m.id} type="monotone" dataKey={m.id} stroke={m.color} strokeWidth={2.5} dot={{ r: 5, fill: m.color, strokeWidth: 2, stroke: "#fff" }} activeDot={{ r: 7, strokeWidth: 0 }} />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
