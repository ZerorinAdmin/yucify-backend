"use client";

import { useEffect, useState } from "react";
import {
  DollarSign,
  Eye,
  Users,
  MousePointerClick,
  TrendingUp,
  TrendingDown,
  Minus,
  BarChart3,
  Repeat,
  ShoppingCart,
  Download,
  UserPlus,
  Target,
} from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { AdSummary } from "@/app/(dashboard)/dashboard/page";
import type { MetricChange } from "@/lib/weekly/summary";

function formatCurrency(n: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(n);
}

type StatCardProps = {
  label: string;
  value: string;
  subtext?: string;
  icon: React.ReactNode;
  accent?: string;
  hero?: boolean;
  weeklyChange?: MetricChange | "no_data";
};

function WeeklyChangeBadge({
  change,
  hero,
}: {
  change: MetricChange;
  hero?: boolean;
}) {
  const isFlat = change.direction === "flat";
  const Icon =
    change.direction === "up"
      ? TrendingUp
      : change.direction === "down"
        ? TrendingDown
        : Minus;
  const baseClass = "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium shrink-0";
  const colorClass = hero
    ? change.direction === "up"
      ? "bg-white/25 text-white"
      : change.direction === "down"
        ? "bg-white/25 text-white"
        : "bg-white/15 text-white/70"
    : change.direction === "up"
      ? "text-emerald-600 bg-emerald-50"
      : change.direction === "down"
        ? "text-rose-600 bg-rose-50"
        : "text-muted-foreground bg-muted";

  const displayValue = isFlat ? "—" : `${Math.abs(change.changePct).toFixed(1)}%`;

  const badge = (
    <span className={`${baseClass} ${colorClass}`}>
      <Icon className="h-3 w-3" strokeWidth={2} />
      {displayValue}
    </span>
  );

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="cursor-help">{badge}</span>
      </TooltipTrigger>
      <TooltipContent>
        <p>Weekly change</p>
      </TooltipContent>
    </Tooltip>
  );
}

function WeeklyChangePlaceholder({ hero }: { hero?: boolean }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          className={`cursor-help inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium shrink-0 ${
            hero ? "bg-white/15 text-white/70" : "text-muted-foreground bg-muted/80"
          }`}
        >
          <Minus className="h-3 w-3" strokeWidth={2} />
          —
        </span>
      </TooltipTrigger>
      <TooltipContent>
        <p>Weekly change</p>
        <p className="text-[11px] opacity-90 mt-0.5">
          Sync metrics for the last 14 days to see week-over-week comparison
        </p>
      </TooltipContent>
    </Tooltip>
  );
}

function StatCard({ label, value, subtext, icon, accent, hero, weeklyChange }: StatCardProps) {
  const valueRow = (
    <div className="flex items-baseline gap-2 min-w-0 flex-wrap">
      <p className={`font-bold leading-none tracking-tight ${hero ? "text-[22px] text-white sm:text-[28px]" : `text-[20px] sm:text-[24px] ${accent ?? "text-foreground"}`}`}>
        {value}
      </p>
      {weeklyChange === "no_data" && <WeeklyChangePlaceholder hero={hero} />}
      {weeklyChange != null && weeklyChange !== "no_data" && (
        <WeeklyChangeBadge change={weeklyChange} hero={hero} />
      )}
    </div>
  );

  if (hero) {
    return (
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-[hsl(250,60%,55%)] to-[hsl(250,50%,45%)] p-5 text-white min-w-0">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-2 min-w-0 flex-1">
            <p className="text-[12px] font-medium uppercase tracking-wider text-white/70">
              {label}
            </p>
            {valueRow}
            {subtext && (
              <p className="text-[12px] text-white/60">{subtext}</p>
            )}
          </div>
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/15">
            {icon}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-border/70 bg-white p-5 transition-shadow duration-200 hover:shadow-[0_2px_12px_rgba(0,0,0,0.04)] min-w-0">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-2 min-w-0 flex-1">
          <p className="text-[12px] font-medium uppercase tracking-wider text-muted-foreground">
            {label}
          </p>
          {valueRow}
          {subtext && (
            <p className="text-[12px] text-muted-foreground">{subtext}</p>
          )}
        </div>
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-muted/60">
          {icon}
        </div>
      </div>
    </div>
  );
}

type ActionData = { count: number; value: number };

const ACTION_CARD_CONFIG: {
  types: string[];
  label: string;
  icon: React.ReactNode;
  showValue?: boolean;
}[] = [
  {
    types: ["purchase", "omni_purchase", "offsite_conversion.fb_pixel_purchase"],
    label: "Purchases",
    icon: <ShoppingCart className="h-[18px] w-[18px] text-muted-foreground" strokeWidth={1.8} />,
    showValue: true,
  },
  {
    types: ["app_install", "mobile_app_install"],
    label: "Installs",
    icon: <Download className="h-[18px] w-[18px] text-muted-foreground" strokeWidth={1.8} />,
  },
  {
    types: ["lead", "offsite_conversion.fb_pixel_lead"],
    label: "Leads",
    icon: <UserPlus className="h-[18px] w-[18px] text-muted-foreground" strokeWidth={1.8} />,
  },
  {
    types: ["complete_registration", "offsite_conversion.fb_pixel_complete_registration"],
    label: "Registrations",
    icon: <Target className="h-[18px] w-[18px] text-muted-foreground" strokeWidth={1.8} />,
  },
  {
    types: ["add_to_cart", "offsite_conversion.fb_pixel_add_to_cart"],
    label: "Add to Cart",
    icon: <ShoppingCart className="h-[18px] w-[18px] text-muted-foreground" strokeWidth={1.8} />,
  },
];

type WeeklyStatus = "loading" | "ready" | "no_data";

export function OverallMetrics({ ads }: { ads: AdSummary[] }) {
  const [actionTotals, setActionTotals] = useState<Map<string, ActionData>>(new Map());
  const [weeklyChanges, setWeeklyChanges] = useState<Map<string, MetricChange>>(new Map());
  const [weeklyStatus, setWeeklyStatus] = useState<WeeklyStatus>("loading");

  useEffect(() => {
    fetch("/api/meta/actions")
      .then((res) => res.json())
      .then((data) => {
        if (!data.actions) return;
        const totals = new Map<string, ActionData>();
        for (const adActions of Object.values(data.actions) as Record<string, ActionData>[]) {
          for (const [type, d] of Object.entries(adActions)) {
            const existing = totals.get(type) ?? { count: 0, value: 0 };
            existing.count += d.count;
            existing.value += d.value;
            totals.set(type, existing);
          }
        }
        setActionTotals(totals);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetch("/api/meta/weekly-summary")
      .then((res) => {
        if (!res.ok) {
          setWeeklyStatus("no_data");
          return null;
        }
        return res.json();
      })
      .then((data) => {
        if (!data?.metricChanges || data.metricChanges.length === 0) {
          setWeeklyStatus("no_data");
          return;
        }
        const map = new Map<string, MetricChange>();
        for (const c of data.metricChanges as MetricChange[]) {
          map.set(c.metric, c);
        }
        setWeeklyChanges(map);
        setWeeklyStatus("ready");
      })
      .catch(() => setWeeklyStatus("no_data"));
  }, []);

  if (ads.length === 0) return null;

  const totalSpend = ads.reduce((s, a) => s + a.total_spend, 0);
  const totalImpressions = ads.reduce((s, a) => s + a.total_impressions, 0);
  const totalReach = ads.reduce((s, a) => s + a.total_reach, 0);
  const totalClicks = ads.reduce((s, a) => s + a.total_clicks, 0);
  const overallCtr = totalImpressions > 0 ? (totalClicks / totalImpressions) * 100 : 0;
  const avgCpc = totalClicks > 0 ? totalSpend / totalClicks : 0;
  const avgRoas = ads.reduce((s, a) => s + a.avg_roas, 0) / ads.length;
  const avgFrequency = ads.reduce((s, a) => s + a.avg_frequency, 0) / ads.length;

  const actionCards: StatCardProps[] = [];
  for (const config of ACTION_CARD_CONFIG) {
    let totalCount = 0;
    let totalValue = 0;
    for (const type of config.types) {
      const d = actionTotals.get(type);
      if (d) { totalCount += d.count; totalValue += d.value; }
    }
    if (totalCount > 0) {
      actionCards.push({
        label: config.label,
        value: totalCount % 1 === 0 ? totalCount.toLocaleString() : totalCount.toFixed(2),
        subtext: config.showValue && totalValue > 0 ? `Value: ${formatCurrency(totalValue)}` : undefined,
        icon: config.icon,
      });
    }
  }

  const getChange = (metric: string): MetricChange | "no_data" | undefined => {
    if (weeklyStatus === "loading") return undefined;
    if (weeklyStatus === "no_data") return "no_data";
    return weeklyChanges.get(metric);
  };

  return (
    <TooltipProvider>
      <div className="grid min-w-0 grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
        <StatCard
          hero
          label="Total Spend"
          value={formatCurrency(totalSpend)}
          subtext={`across ${ads.length} ads`}
          icon={<DollarSign className="h-5 w-5 text-white/80" strokeWidth={1.8} />}
          weeklyChange={getChange("Spend")}
        />
        <StatCard
          label="Impressions"
          value={totalImpressions.toLocaleString()}
          icon={<Eye className="h-[18px] w-[18px] text-muted-foreground" strokeWidth={1.8} />}
          weeklyChange={getChange("Impressions")}
        />
        <StatCard
          label="Reach"
          value={totalReach.toLocaleString()}
          icon={<Users className="h-[18px] w-[18px] text-muted-foreground" strokeWidth={1.8} />}
          weeklyChange={getChange("Reach")}
        />
        <StatCard
          label="Clicks"
          value={totalClicks.toLocaleString()}
          icon={<MousePointerClick className="h-[18px] w-[18px] text-muted-foreground" strokeWidth={1.8} />}
          weeklyChange={getChange("Clicks")}
        />
        <StatCard
          label="CTR"
          value={`${overallCtr.toFixed(2)}%`}
          accent={overallCtr >= 2 ? "text-emerald-600" : undefined}
          icon={<TrendingUp className="h-[18px] w-[18px] text-muted-foreground" strokeWidth={1.8} />}
          weeklyChange={getChange("CTR")}
        />
        <StatCard
          label="Avg CPC"
          value={formatCurrency(avgCpc)}
          icon={<MousePointerClick className="h-[18px] w-[18px] text-muted-foreground" strokeWidth={1.8} />}
          weeklyChange={getChange("CPC")}
        />
        <StatCard
          label="ROAS"
          value={avgRoas > 0 ? `${avgRoas.toFixed(2)}x` : "—"}
          icon={<BarChart3 className="h-[18px] w-[18px] text-muted-foreground" strokeWidth={1.8} />}
          weeklyChange={getChange("ROAS")}
        />
        <StatCard
          label="Frequency"
          value={avgFrequency.toFixed(2)}
          accent={avgFrequency > 3 ? "text-rose-600" : undefined}
          icon={<Repeat className="h-[18px] w-[18px] text-muted-foreground" strokeWidth={1.8} />}
          weeklyChange={getChange("Frequency")}
        />
        {actionCards.map((card) => (
          <StatCard key={card.label} {...card} />
        ))}
      </div>
    </TooltipProvider>
  );
}
