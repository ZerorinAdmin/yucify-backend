"use client";

import { useState, useEffect, useRef } from "react";
import {
  DollarSign,
  Eye,
  Users,
  MousePointerClick,
  TrendingUp,
  BarChart3,
  Repeat,
  Play,
  Image as ImageIcon,
  Calendar,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
} from "lucide-react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  Legend,
} from "recharts";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Info } from "lucide-react";
import type { AdSummary } from "@/app/(dashboard)/dashboard/page";

type MetricRow = {
  ad_id: string;
  date: string;
  spend: number;
  impressions: number;
  reach: number;
  clicks: number;
  ctr: number;
  cpc: number;
  frequency: number;
  roas: number;
};

type ActionData = { count: number; value: number };

type PlacementRow = { platform: string; position: string; impressions: number; spend: number; clicks: number; reach: number };
type DemoRow = { age: string; gender: string; impressions: number; spend: number; clicks: number; reach: number };
type VideoData = {
  plays: number;
  p25: number;
  p50: number;
  p75: number;
  p100: number;
  avg_time_seconds?: number;
  impressions?: number;
  hook_rate?: number | null;
  hold_rate?: number | null;
};
type BreakdownData = { placements: PlacementRow[]; demographics: DemoRow[]; video: VideoData } | null;

function formatCurrency(n: number): string {
  if (n >= 1000) return `₹${(n / 1000).toFixed(2)}K`;
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(n);
}

function formatCompact(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}

function formatDate(d: string): string {
  return new Date(d + "T00:00:00").toLocaleDateString("en-IN", { month: "short", day: "numeric" });
}

function formatVideoTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

/** Meta often returns a plugin URL instead of a raw MP4 `source`. */
function isFacebookVideoEmbedUrl(url: string): boolean {
  const u = url.toLowerCase();
  return u.includes("facebook.com/plugins/") || u.includes("connect.facebook.net");
}

function PlacementIcon({ platform, x, y }: { platform: string; x: number; y: number }) {
  const p = platform.toLowerCase();
  if (p === "instagram") {
    return (
      <svg x={x - 6} y={y - 6} width="12" height="12" viewBox="0 0 24 24" fill="none">
        <rect x="2" y="2" width="20" height="20" rx="5" stroke="#E1306C" strokeWidth="2" />
        <circle cx="12" cy="12" r="5" stroke="#E1306C" strokeWidth="2" />
        <circle cx="18" cy="6" r="1.5" fill="#E1306C" />
      </svg>
    );
  }
  if (p === "facebook") {
    return (
      <svg x={x - 6} y={y - 6} width="12" height="12" viewBox="0 0 24 24" fill="none">
        <path d="M18 2h-3a5 5 0 00-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 011-1h3z" stroke="#1877F2" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }
  if (p.includes("audience")) {
    return (
      <svg x={x - 6} y={y - 6} width="12" height="12" viewBox="0 0 24 24" fill="none">
        <circle cx="9" cy="7" r="4" stroke="#4267B2" strokeWidth="2" />
        <path d="M2 21v-2a4 4 0 014-4h6a4 4 0 014 4v2" stroke="#4267B2" strokeWidth="2" />
        <circle cx="19" cy="7" r="3" stroke="#4267B2" strokeWidth="1.5" />
        <path d="M19 15a4 4 0 013 4v2" stroke="#4267B2" strokeWidth="1.5" />
      </svg>
    );
  }
  return (
    <svg x={x - 6} y={y - 6} width="12" height="12" viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="10" stroke="hsl(var(--muted-foreground))" strokeWidth="1.5" />
      <text x="12" y="16" textAnchor="middle" fontSize="10" fill="hsl(var(--muted-foreground))">{platform.charAt(0)}</text>
    </svg>
  );
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}

function formatPosition(s: string): string {
  return s
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

const STAT_ITEMS = [
  { key: "total_spend" as const, label: "Spend", icon: DollarSign, format: formatCurrency, iconColor: "text-violet-500", bg: "bg-violet-50" },
  { key: "total_impressions" as const, label: "Impressions", icon: Eye, format: formatCompact, iconColor: "text-amber-500", bg: "bg-amber-50" },
  { key: "total_reach" as const, label: "Reach", icon: Users, format: formatCompact, iconColor: "text-teal-500", bg: "bg-teal-50" },
  { key: "total_clicks" as const, label: "Clicks", icon: MousePointerClick, format: formatCompact, iconColor: "text-rose-500", bg: "bg-rose-50" },
  { key: "avg_ctr" as const, label: "CTR", icon: TrendingUp, format: (n: number) => `${n.toFixed(2)}%`, iconColor: "text-sky-500", bg: "bg-sky-50" },
  { key: "avg_cpc" as const, label: "CPC", icon: MousePointerClick, format: formatCurrency, iconColor: "text-pink-500", bg: "bg-pink-50" },
  { key: "avg_roas" as const, label: "ROAS", icon: BarChart3, format: (n: number) => n > 0 ? `${n.toFixed(2)}x` : "—", iconColor: "text-blue-500", bg: "bg-blue-50" },
  { key: "avg_frequency" as const, label: "Frequency", icon: Repeat, format: (n: number) => n.toFixed(2), iconColor: "text-purple-500", bg: "bg-purple-50" },
];

type ChartMetric = "spend" | "impressions" | "reach" | "clicks";

const CHART_OPTIONS: { id: ChartMetric; label: string; color: string }[] = [
  { id: "spend", label: "Spend", color: "#7C5CFC" },
  { id: "impressions", label: "Impressions", color: "#34d399" },
  { id: "reach", label: "Reach", color: "#14b8a6" },
  { id: "clicks", label: "Clicks", color: "#f43f5e" },
];

/* ── Carousel ── */
function CarouselViewer({ images }: { images: string[] }) {
  const [idx, setIdx] = useState(0);
  const total = images.length;
  const prev = () => setIdx((i) => (i - 1 + total) % total);
  const next = () => setIdx((i) => (i + 1) % total);

  return (
    <div className="relative h-full w-full group/carousel">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={images[idx]} alt={`Slide ${idx + 1}`} className="h-full w-full object-contain transition-opacity duration-300" />
      {total > 1 && (
        <>
          <button type="button" onClick={prev} className="absolute left-3 top-1/2 -translate-y-1/2 rounded-full bg-black/40 p-2 text-white opacity-100 transition-opacity hover:bg-black/60 sm:opacity-0 sm:group-hover/carousel:opacity-100">
            <ChevronLeft className="h-5 w-5" />
          </button>
          <button type="button" onClick={next} className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full bg-black/40 p-2 text-white opacity-100 transition-opacity hover:bg-black/60 sm:opacity-0 sm:group-hover/carousel:opacity-100">
            <ChevronRight className="h-5 w-5" />
          </button>
          <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-1.5">
            {images.map((_, i) => (
              <button type="button" key={i} onClick={() => setIdx(i)} className={`h-2 rounded-full transition-all ${i === idx ? "w-5 bg-white" : "w-2 bg-white/50"}`} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function VideoAnalysisSection({
  video,
  chartGradientId,
}: {
  video: VideoData;
  chartGradientId: string;
}) {
  const plays = video.plays || 1;
  const videoStats = [
    {
      label: "Video plays",
      value: formatCompact(video.plays),
      tooltip: "Total number of videos that started playing",
    },
    {
      label: "Video average play time",
      value: video.avg_time_seconds != null ? formatVideoTime(video.avg_time_seconds) : "—",
      tooltip: "Average time viewers watched the video",
    },
    {
      label: "Hook rate",
      value: video.hook_rate != null ? `${video.hook_rate}%` : "—",
      tooltip: "3-second video views ÷ impressions. Matches Meta Ads Manager.",
    },
    {
      label: "Hold rate",
      value: video.hold_rate != null ? `${video.hold_rate}%` : "—",
      tooltip: "ThruPlays (15s or completion) ÷ 3-second video views. Matches Meta Ads Manager custom metric.",
    },
  ];
  const retentionData = [
    { time: 0, timeLabel: "00:00", pct: 100 },
    { time: 25, timeLabel: "00:04", pct: Math.round((video.p25 / plays) * 100) },
    { time: 50, timeLabel: "00:08", pct: Math.round((video.p50 / plays) * 100) },
    { time: 75, timeLabel: "00:12", pct: Math.round((video.p75 / plays) * 100) },
    { time: 100, timeLabel: "00:15", pct: Math.round((video.p100 / plays) * 100) },
  ];

  return (
    <div className="rounded-xl border border-border/50 bg-white p-5">
      <div className="mb-4 flex items-center justify-between gap-2">
        <h4 className="text-[15px] font-bold text-foreground">Video analysis</h4>
        <div className="relative shrink-0">
          <select
            className="h-8 cursor-pointer appearance-none rounded-lg border border-border/70 bg-white pl-3 pr-8 text-[13px] text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            defaultValue="retention"
            aria-label="Video analysis view"
          >
            <option value="retention">Audience retention</option>
          </select>
          <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        </div>
      </div>
      <TooltipProvider>
        <div className="mb-5 grid grid-cols-2 gap-4 lg:grid-cols-4">
          {videoStats.map((stat) => (
            <div key={stat.label}>
              <div className="flex items-center gap-1.5">
                <span className="text-[12px] text-muted-foreground">{stat.label}</span>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Info className="h-3.5 w-3.5 cursor-help text-muted-foreground" />
                  </TooltipTrigger>
                  <TooltipContent side="top" className="max-w-[200px] rounded-lg">
                    {stat.tooltip}
                  </TooltipContent>
                </Tooltip>
              </div>
              <p className="mt-0.5 text-[18px] font-bold tabular-nums text-foreground">{stat.value}</p>
            </div>
          ))}
        </div>
      </TooltipProvider>
      <div className="h-[200px]">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={retentionData} margin={{ top: 8, right: 8, left: 8, bottom: 8 }}>
            <defs>
              <linearGradient id={chartGradientId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#9f85fd" stopOpacity={0.4} />
                <stop offset="100%" stopColor="#9f85fd" stopOpacity={0.05} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={true} vertical={false} />
            <XAxis
              dataKey="timeLabel"
              tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              domain={[0, 100]}
              tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
              tickFormatter={(n) => `${n}%`}
              width={40}
              axisLine={false}
              tickLine={false}
            />
            <RechartsTooltip
              contentStyle={{
                backgroundColor: "#fff",
                border: "1px solid hsl(var(--border))",
                borderRadius: 12,
                fontSize: 13,
                boxShadow: "0 4px 12px rgba(0,0,0,0.06)",
              }}
              formatter={(value: unknown) => [`${value}%`, "Viewers"]}
              labelFormatter={(_, payload) => payload?.[0]?.payload?.timeLabel ?? ""}
            />
            <Area
              type="monotone"
              dataKey="pct"
              stroke="#9f85fd"
              strokeWidth={2}
              fill={`url(#${chartGradientId})`}
              dot={false}
              activeDot={{ r: 4, fill: "#9f85fd", strokeWidth: 2, stroke: "#fff" }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

/* ── Main panel ── */
export function AdDetailPanel({
  ad,
  metrics,
  open,
  onClose,
}: {
  ad: AdSummary | null;
  metrics: MetricRow[];
  open: boolean;
  onClose: () => void;
}) {
  const [chartMetric, setChartMetric] = useState<ChartMetric>("spend");
  const [actions, setActions] = useState<Record<string, ActionData>>({});
  const [breakdowns, setBreakdowns] = useState<BreakdownData>(null);
  const [breakdownsLoading, setBreakdownsLoading] = useState(false);
  const [tab, setTab] = useState<"overview" | "performance">("overview");
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (!ad) return;
    setTab("overview");
    setBreakdowns(null);

    fetch("/api/meta/actions")
      .then((r) => r.json())
      .then((data) => setActions(data.actions?.[ad.ad_id] ?? {}))
      .catch(() => setActions({}));

    setBreakdownsLoading(true);
    fetch(`/api/meta/ad-breakdowns?ad_id=${encodeURIComponent(ad.ad_id)}`)
      .then((r) => r.json())
      .then((data) => {
        if (!data.error) setBreakdowns(data);
      })
      .catch(() => {})
      .finally(() => setBreakdownsLoading(false));
  }, [ad]);

  if (!ad) return null;

  const adMetrics = metrics
    .filter((m) => m.ad_id === ad.ad_id)
    .sort((a, b) => a.date.localeCompare(b.date));

  const chartData = adMetrics.map((m) => ({
    date: formatDate(m.date),
    spend: Number(m.spend),
    impressions: Number(m.impressions),
    reach: Number(m.reach),
    clicks: Number(m.clicks),
  }));

  const imgSrc = ad.image_url || ad.thumbnail_url;
  const isVideo = ad.creative_type === "video";
  const isCarousel = ad.creative_type === "carousel" && ad.carousel_urls?.length > 1;
  const activeChart = CHART_OPTIONS.find((c) => c.id === chartMetric) ?? CHART_OPTIONS[0];
  const actionEntries = Object.entries(actions).filter(([, v]) => v.count > 0);

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="left-0 top-0 flex h-[100dvh] max-h-[100dvh] w-full max-w-full translate-x-0 translate-y-0 flex-col gap-0 overflow-hidden overflow-x-hidden rounded-none border-0 p-0 sm:left-[50%] sm:top-[50%] sm:h-[88vh] sm:max-h-[88vh] sm:w-[min(1320px,92vw)] sm:max-w-[92vw] sm:translate-x-[-50%] sm:translate-y-[-50%] sm:rounded-2xl sm:border sm:border-border/40">

        {/* Accessible header */}
        <DialogHeader className="sr-only">
          <DialogTitle>{ad.ad_name}</DialogTitle>
          <DialogDescription>{ad.campaign_name}</DialogDescription>
        </DialogHeader>

        <div className="flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-y-auto overscroll-y-contain [-webkit-overflow-scrolling:touch] lg:flex-row lg:overflow-hidden">

          {/* ── Left: Creative (scrolls with page on mobile; own scroll on lg) ── */}
          <div className="w-full min-w-0 shrink-0 overflow-x-hidden border-b border-border/40 bg-white lg:w-[440px] lg:max-w-[440px] lg:min-h-0 lg:overflow-y-auto lg:border-b-0 lg:border-r">
            <div className="space-y-5 p-4 pr-12 sm:p-6 sm:pr-14">

              {/* Ad info */}
              <div className="min-w-0">
                <h2 className="break-words text-[18px] font-bold leading-snug text-foreground">{ad.ad_name}</h2>
                <p className="mt-1 break-words text-[13px] text-muted-foreground">
                  {ad.campaign_name}
                  {ad.adset_name && ad.adset_name !== ad.campaign_name ? ` · ${ad.adset_name}` : ""}
                </p>
                <div className="mt-3 flex flex-wrap items-center gap-2 sm:gap-3">
                  <Badge className={`text-[11px] font-semibold uppercase tracking-wider border-0 ${
                    isVideo ? "bg-amber-100 text-amber-700" :
                    isCarousel ? "bg-indigo-100 text-indigo-700" :
                    "bg-emerald-100 text-emerald-700"
                  }`}>
                    {isVideo && <Play className="h-3.5 w-3.5 mr-1" />}
                    {ad.creative_type}
                  </Badge>
                  <span className="flex min-w-0 items-center gap-1.5 text-[13px] text-muted-foreground">
                    <Calendar className="h-3.5 w-3.5 shrink-0" strokeWidth={1.5} />
                    <span className="break-words">
                      {ad.days_count} days · since {ad.first_date && formatDate(ad.first_date)}
                    </span>
                  </span>
                </div>
              </div>

              {/* Media */}
              <div className="relative max-w-full overflow-hidden rounded-xl bg-muted/20">
                {isVideo && ad.video_url && isFacebookVideoEmbedUrl(ad.video_url) ? (
                  <iframe
                    title={`Video: ${ad.ad_name}`}
                    src={ad.video_url}
                    className="aspect-video min-h-[200px] w-full max-h-[min(56dvh,520px)] rounded-xl border-0 bg-black sm:max-h-none"
                    allow="autoplay; clipboard-write; encrypted-media; picture-in-picture; web-share"
                    allowFullScreen
                  />
                ) : isVideo && ad.video_url ? (
                  <video
                    ref={videoRef}
                    src={ad.video_url}
                    poster={imgSrc}
                    controls
                    playsInline
                    className="max-h-[min(56dvh,520px)] w-full rounded-xl bg-black object-contain sm:max-h-none"
                  />
                ) : isCarousel && ad.carousel_urls?.length > 1 ? (
                  <div className="aspect-[4/5] max-w-full">
                    <CarouselViewer images={ad.carousel_urls} />
                  </div>
                ) : imgSrc ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={imgSrc} alt={ad.ad_name} className="max-h-[min(56dvh,520px)] w-full rounded-xl object-contain sm:max-h-none" />
                ) : (
                  <div className="flex aspect-square items-center justify-center text-muted-foreground/30">
                    <ImageIcon className="h-16 w-16" strokeWidth={0.8} />
                  </div>
                )}
              </div>

              {isVideo && !ad.video_url && (
                <Alert className="border-amber-200/80 bg-amber-50/90 text-amber-950 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-100">
                  <AlertDescription className="text-[13px] leading-snug">
                    Showing thumbnail only — Meta didn&apos;t return a playable file URL for this creative yet. Use{" "}
                    <strong>Sync</strong> on the dashboard to refresh creatives; if it persists, the asset may be restricted by Meta.
                  </AlertDescription>
                </Alert>
              )}

              {/* Ad copy directly below the image */}
              {ad.body && (
                <p className="break-words text-[14px] leading-relaxed text-foreground/80">{ad.body}</p>
              )}
            </div>
          </div>

          {/* ── Right: Data (single scroll on mobile via parent; pane scroll on lg) ── */}
          <div className="flex min-w-0 shrink-0 flex-col overflow-x-hidden bg-white lg:min-h-0 lg:shrink lg:flex-1">

            {/* Tabs */}
            <div className="flex shrink-0 overflow-x-auto border-b border-border/40 px-3 sm:px-6">
              {(["overview", "performance"] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  className={`shrink-0 px-4 py-3 text-[14px] font-semibold capitalize transition-colors border-b-2 sm:px-5 sm:py-3.5 sm:text-[15px] ${
                    tab === t
                      ? "border-foreground text-foreground"
                      : "border-transparent text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>

            {/* Scrollable content (lg only; mobile scrolls the outer flex wrapper) */}
            <div className="space-y-6 p-4 sm:p-6 lg:min-h-0 lg:flex-1 lg:overflow-y-auto lg:overscroll-y-contain">
              {tab === "overview" && (
                <>
                  {/* Stat grid */}
                  <div className="grid grid-cols-2 gap-2 sm:gap-3 md:grid-cols-4">
                    {STAT_ITEMS.map((s) => {
                      const Icon = s.icon;
                      const value = ad[s.key];
                      return (
                        <div key={s.key} className={`rounded-xl ${s.bg} p-3 sm:p-4`}>
                          <div className="flex items-center gap-2 mb-2">
                            <Icon className={`h-4 w-4 ${s.iconColor}`} strokeWidth={1.8} />
                            <span className="text-[12px] font-semibold text-foreground/45 uppercase tracking-wide">{s.label}</span>
                          </div>
                          <p className="text-[18px] font-extrabold tabular-nums leading-tight text-foreground sm:text-[22px]">{s.format(value)}</p>
                        </div>
                      );
                    })}
                  </div>

                  {/* Spend trend */}
                  {chartData.length > 1 && (
                    <div className="rounded-xl border border-border/50 bg-white p-5">
                      <h4 className="text-[15px] font-bold text-foreground mb-4">Spend Trend</h4>
                      <div className="h-[180px]">
                        <ResponsiveContainer width="100%" height="100%">
                          <AreaChart data={chartData}>
                            <defs>
                              <linearGradient id="overviewFill" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="#7C5CFC" stopOpacity={0.12} />
                                <stop offset="95%" stopColor="#7C5CFC" stopOpacity={0} />
                              </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                            <XAxis dataKey="date" tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }} />
                            <YAxis tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }} width={50} />
                            <RechartsTooltip
                              contentStyle={{ backgroundColor: "#fff", border: "1px solid hsl(var(--border))", borderRadius: 12, fontSize: 13, boxShadow: "0 4px 12px rgba(0,0,0,0.06)" }}
                              formatter={(value: unknown) => [formatCurrency(Number(value)), "Spend"]}
                            />
                            <Area type="monotone" dataKey="spend" stroke="#7C5CFC" strokeWidth={2} fill="url(#overviewFill)" dot={false} />
                          </AreaChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                  )}

                  {/* Video analysis (same data as Performance tab) */}
                  {isVideo && breakdowns?.video && breakdowns.video.plays > 0 && (
                    <VideoAnalysisSection video={breakdowns.video} chartGradientId="ad-detail-vid-overview" />
                  )}

                  {/* Breakdowns loading */}
                  {breakdownsLoading && (
                    <p className="text-[13px] text-muted-foreground text-center py-4">Loading breakdowns…</p>
                  )}

                  {/* ── Placement Breakdown ── */}
                  {breakdowns?.placements && breakdowns.placements.length > 0 && (() => {
                    const placementData = breakdowns.placements
                      .map((p) => {
                        const plat = p.platform.toLowerCase();
                        const raw = p.position.toLowerCase().replace(/_/g, " ");
                        const cleaned = raw.replace(plat, "").trim();
                        const label = cleaned ? cleaned.replace(/\b\w/g, (c) => c.toUpperCase()) : formatPosition(p.position);
                        return {
                          name: `${plat}|${label}`,
                          Impressions: p.impressions,
                          Spend: p.spend,
                        };
                      })
                      .sort((a, b) => b.Impressions - a.Impressions);

                    return (
                      <div className="rounded-xl border border-border/50 bg-white p-5">
                        <h4 className="text-[15px] font-bold text-foreground mb-4">Placement Breakdown</h4>
                        <div className="h-[320px]">
                          <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={placementData} barCategoryGap="20%" margin={{ left: 10, right: 30, bottom: 10 }}>
                              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                              <XAxis
                                dataKey="name"
                                interval={0}
                                tick={(props: Record<string, unknown>) => {
                                  const { x, y, payload } = props as { x: number; y: number; payload: { value: string } };
                                  const [platform, position] = String(payload.value).split("|");
                                  const lbl = (position ?? "").length > 12 ? (position ?? "").slice(0, 11) + "…" : (position ?? "");
                                  return (
                                    <g transform={`translate(${x},${y + 4})`}>
                                      <PlacementIcon platform={platform ?? ""} x={0} y={0} />
                                      <text x={0} y={18} textAnchor="end" fontSize={10} fill="hsl(var(--muted-foreground))" transform="rotate(-35)">{lbl}</text>
                                    </g>
                                  );
                                }}
                                tickLine={false}
                                axisLine={false}
                                height={80}
                              />
                              <YAxis tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }} width={52} />
                              <RechartsTooltip
                                contentStyle={{ backgroundColor: "#fff", border: "1px solid hsl(var(--border))", borderRadius: 12, fontSize: 13, boxShadow: "0 4px 12px rgba(0,0,0,0.06)" }}
                                labelFormatter={(label) => { const [p, pos] = String(label ?? "").split("|"); return `${capitalize(p ?? "")} · ${pos}`; }}
                              />
                              <Legend wrapperStyle={{ fontSize: 13, paddingTop: 8 }} />
                              <Bar dataKey="Impressions" fill="#7C5CFC" radius={[4, 4, 0, 0]} maxBarSize={24} name="Impressions" />
                              <Bar dataKey="Spend" fill="#f43f5e" radius={[4, 4, 0, 0]} maxBarSize={24} name="Spend" />
                            </BarChart>
                          </ResponsiveContainer>
                        </div>
                      </div>
                    );
                  })()}

                  {/* ── Gender & Age Breakdown ── */}
                  {breakdowns?.demographics && breakdowns.demographics.length > 0 && (() => {
                    const genderAgg = new Map<string, { male: number; female: number; unknown: number }>();
                    for (const d of breakdowns.demographics) {
                      const existing = genderAgg.get(d.age) ?? { male: 0, female: 0, unknown: 0 };
                      if (d.gender === "male") existing.male += d.impressions;
                      else if (d.gender === "female") existing.female += d.impressions;
                      else existing.unknown += d.impressions;
                      genderAgg.set(d.age, existing);
                    }
                    const demoData = Array.from(genderAgg.entries())
                      .map(([age, vals]) => ({ age, Male: vals.male, Female: vals.female }))
                      .sort((a, b) => a.age.localeCompare(b.age));

                    if (demoData.length === 0) return null;

                    return (
                      <div className="rounded-xl border border-border/50 bg-white p-5">
                        <h4 className="text-[15px] font-bold text-foreground mb-4">Gender & Age Breakdown</h4>
                        <div className="h-[220px]">
                          <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={demoData} barCategoryGap="20%">
                              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                              <XAxis dataKey="age" tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }} />
                              <YAxis tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }} width={52} />
                              <RechartsTooltip
                                contentStyle={{ backgroundColor: "#fff", border: "1px solid hsl(var(--border))", borderRadius: 12, fontSize: 13, boxShadow: "0 4px 12px rgba(0,0,0,0.06)" }}
                              />
                              <Legend wrapperStyle={{ fontSize: 13, paddingTop: 8 }} />
                              <Bar dataKey="Male" fill="#7C5CFC" radius={[4, 4, 0, 0]} maxBarSize={24} name="Male" />
                              <Bar dataKey="Female" fill="#f43f5e" radius={[4, 4, 0, 0]} maxBarSize={24} name="Female" />
                            </BarChart>
                          </ResponsiveContainer>
                        </div>
                      </div>
                    );
                  })()}

                  {/* Actions */}
                  {actionEntries.length > 0 && (
                    <div>
                      <h4 className="text-[15px] font-bold text-foreground mb-3">Conversions & Actions</h4>
                      <div className="grid grid-cols-2 gap-2.5">
                        {actionEntries.map(([type, data]) => (
                          <div key={type} className="flex items-center justify-between rounded-xl bg-muted/40 px-4 py-3">
                            <span className="text-[13px] text-muted-foreground truncate mr-3">{formatActionLabel(type)}</span>
                            <div className="text-right shrink-0">
                              <span className="text-[15px] font-bold tabular-nums text-foreground">
                                {data.count % 1 === 0 ? data.count.toLocaleString() : data.count.toFixed(2)}
                              </span>
                              {data.value > 0 && (
                                <p className="text-[11px] text-muted-foreground">{formatCurrency(data.value)}</p>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}

              {tab === "performance" && (
                <>
                  {/* Metric pills */}
                  <div className="flex items-center gap-2.5 flex-wrap">
                    {CHART_OPTIONS.map((opt) => (
                      <button
                        key={opt.id}
                        onClick={() => setChartMetric(opt.id)}
                        className={`rounded-full px-4 py-2 text-[14px] font-semibold transition-all ${
                          chartMetric === opt.id
                            ? "text-white shadow-sm"
                            : "bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground"
                        }`}
                        style={chartMetric === opt.id ? { backgroundColor: opt.color } : undefined}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>

                  {/* Area chart */}
                  {chartData.length > 1 ? (
                    <div className="rounded-xl border border-border/50 bg-white p-5">
                      <h4 className="text-[15px] font-bold text-foreground mb-4">Daily {activeChart.label}</h4>
                      <div className="h-[240px]">
                        <ResponsiveContainer width="100%" height="100%">
                          <AreaChart data={chartData}>
                            <defs>
                              <linearGradient id="perfFill" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor={activeChart.color} stopOpacity={0.15} />
                                <stop offset="95%" stopColor={activeChart.color} stopOpacity={0} />
                              </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                            <XAxis dataKey="date" tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }} />
                            <YAxis tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }} width={52} />
                            <RechartsTooltip
                              contentStyle={{ backgroundColor: "#fff", border: "1px solid hsl(var(--border))", borderRadius: 12, fontSize: 13, boxShadow: "0 4px 12px rgba(0,0,0,0.06)" }}
                              formatter={(value: unknown) => {
                                const n = Number(value);
                                if (chartMetric === "spend") return [formatCurrency(n), activeChart.label];
                                return [formatCompact(n), activeChart.label];
                              }}
                            />
                            <Area
                              type="monotone"
                              dataKey={chartMetric}
                              stroke={activeChart.color}
                              strokeWidth={2.5}
                              fill="url(#perfFill)"
                              dot={{ r: 3, fill: activeChart.color, strokeWidth: 2, stroke: "#fff" }}
                              activeDot={{ r: 6, strokeWidth: 0 }}
                            />
                          </AreaChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                  ) : (
                    <div className="rounded-xl border border-border/50 bg-white p-6 text-center">
                      <p className="text-[14px] text-muted-foreground">Not enough daily data for a trend chart</p>
                    </div>
                  )}

                  {/* Bar breakdown */}
                  {chartData.length > 0 && (
                    <div className="rounded-xl border border-border/50 bg-white p-5">
                      <h4 className="text-[15px] font-bold text-foreground mb-4">Spend vs Clicks</h4>
                      <div className="h-[220px]">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={chartData} barCategoryGap="20%">
                            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                            <XAxis dataKey="date" tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }} />
                            <YAxis tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }} width={52} />
                            <RechartsTooltip
                              contentStyle={{ backgroundColor: "#fff", border: "1px solid hsl(var(--border))", borderRadius: 12, fontSize: 13, boxShadow: "0 4px 12px rgba(0,0,0,0.06)" }}
                            />
                            <Legend wrapperStyle={{ fontSize: 13, paddingTop: 8 }} />
                            <Bar dataKey="spend" fill="#7C5CFC" radius={[4, 4, 0, 0]} maxBarSize={24} name="Spend" />
                            <Bar dataKey="clicks" fill="#f43f5e" radius={[4, 4, 0, 0]} maxBarSize={24} name="Clicks" />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                  )}

                  {/* ── Video Analysis (Audience retention curve) ── */}
                  {isVideo && breakdowns?.video && breakdowns.video.plays > 0 && (
                    <VideoAnalysisSection video={breakdowns.video} chartGradientId="ad-detail-vid-perf" />
                  )}

                </>
              )}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function formatActionLabel(type: string): string {
  const map: Record<string, string> = {
    purchase: "Purchases",
    omni_purchase: "Purchases",
    app_install: "App Installs",
    mobile_app_install: "App Installs",
    lead: "Leads",
    complete_registration: "Registrations",
    add_to_cart: "Add to Cart",
    initiate_checkout: "Checkouts",
    view_content: "Content Views",
    landing_page_view: "Landing Views",
    link_click: "Link Clicks",
    post_engagement: "Engagements",
    video_view: "Video Views",
    post_reaction: "Reactions",
    comment: "Comments",
    like: "Likes",
  };
  return map[type] ?? type.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}
