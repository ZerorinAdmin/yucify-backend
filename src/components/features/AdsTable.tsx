"use client";

import { useEffect, useState, useCallback } from "react";
import { Settings2 } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { AdSummary } from "@/app/(dashboard)/dashboard/page";

function formatCurrency(n: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(n);
}

type ActionMeta = { label: string; tip: string };

const ACTION_META: Record<string, ActionMeta> = {
  purchase:                                        { label: "Purchases",          tip: "Total completed purchases attributed to this ad" },
  omni_purchase:                                   { label: "Purchases",          tip: "Total completed purchases across all channels" },
  app_install:                                     { label: "Installs",           tip: "Number of app installs driven by this ad" },
  mobile_app_install:                              { label: "Installs",           tip: "Mobile app installs attributed to this ad" },
  lead:                                            { label: "Leads",              tip: "Lead form submissions or sign-ups from this ad" },
  complete_registration:                           { label: "Registrations",      tip: "Users who completed registration after clicking" },
  add_to_cart:                                     { label: "Add to Cart",        tip: "Items added to cart after engaging with this ad" },
  initiate_checkout:                               { label: "Checkouts",          tip: "Checkout flows started from this ad" },
  add_payment_info:                                { label: "Payment Info",       tip: "Users who added payment info during checkout" },
  view_content:                                    { label: "Content Views",      tip: "Product or page views driven by this ad" },
  search:                                          { label: "Searches",           tip: "Search actions performed after engaging with this ad" },
  landing_page_view:                               { label: "Landing Views",      tip: "Users who loaded your landing page after clicking" },
  link_click:                                      { label: "Link Clicks",        tip: "Clicks on links within this ad to external destinations" },
  post_engagement:                                 { label: "Engagements",        tip: "Total interactions — likes, comments, shares, and clicks" },
  page_engagement:                                 { label: "Page Engagements",   tip: "Actions taken on your Facebook page from this ad" },
  post:                                            { label: "Post Interactions",  tip: "Direct interactions with the ad post itself" },
  comment:                                         { label: "Comments",           tip: "Comments left on this ad" },
  post_reaction:                                   { label: "Reactions",          tip: "Emoji reactions on this ad post" },
  video_view:                                      { label: "Video Views",        tip: "Number of times the video was played (3+ seconds)" },
  photo_view:                                      { label: "Photo Views",        tip: "Number of times the ad image was viewed in detail" },
  like:                                            { label: "Likes",              tip: "Likes on this ad post" },
  onsite_conversion:                               { label: "On-site Conversions",  tip: "Conversions that happened on Facebook/Instagram" },
  "offsite_conversion.fb_pixel_purchase":          { label: "Pixel Purchases",      tip: "Purchases tracked by your Facebook Pixel" },
  "offsite_conversion.fb_pixel_lead":              { label: "Pixel Leads",          tip: "Leads tracked by your Facebook Pixel" },
  "offsite_conversion.fb_pixel_add_to_cart":       { label: "Pixel Add to Cart",    tip: "Add-to-cart events tracked by your Facebook Pixel" },
  "offsite_conversion.fb_pixel_initiate_checkout": { label: "Pixel Checkouts",      tip: "Checkout starts tracked by your Facebook Pixel" },
  "offsite_conversion.fb_pixel_complete_registration": { label: "Pixel Registrations", tip: "Registrations tracked by your Facebook Pixel" },
  "offsite_conversion.fb_pixel_view_content":      { label: "Pixel Content Views",  tip: "Content views tracked by your Facebook Pixel" },
};

function getActionLabel(type: string): string {
  return ACTION_META[type]?.label ?? type.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function getActionTip(type: string): string {
  return ACTION_META[type]?.tip ?? `Total ${getActionLabel(type).toLowerCase()} attributed to this ad`;
}

const CORE_COLUMN_TIPS: Record<string, string> = {
  health: "Status of your ad. Healthy, Declining, or Fatigued",
  launch: "First date this ad had recorded activity",
  spend: "Total amount spent on this ad",
  roas: "Average return on ad spend — revenue per unit of spend",
  ctr: "Click-through rate — percentage of impressions that resulted in a click",
  impressions: "Total number of times this ad was shown",
  reach: "Number of unique people who saw this ad",
  clicks: "Total clicks on this ad",
  cpc: "Average cost per click",
  frequency: "Average number of times each person saw this ad",
};

type HealthRule = { id: string; label: string; triggered: boolean };
type AdHealthResult = {
  ad_id: string;
  ad_name: string;
  status: "HEALTHY" | "DECLINING" | "FATIGUED";
  rules: HealthRule[];
};
type ActionData = { count: number; value: number };
type ActionsMap = Record<string, Record<string, ActionData>>;

const STATUS_STYLE: Record<string, string> = {
  HEALTHY: "bg-emerald-100 text-emerald-800 border-0",
  DECLINING: "bg-amber-100 text-amber-800 border-0",
  FATIGUED: "bg-rose-100 text-rose-800 border-0",
};

const PRIORITY_ACTIONS = [
  "purchase", "omni_purchase", "app_install", "mobile_app_install",
  "lead", "complete_registration", "add_to_cart", "initiate_checkout",
  "landing_page_view", "link_click", "post_engagement", "video_view",
];

const CORE_COLUMNS = [
  { id: "health", label: "Health", defaultOn: true },
  { id: "launch", label: "Launch Date", defaultOn: true },
  { id: "spend", label: "Spend", defaultOn: true },
  { id: "roas", label: "ROAS", defaultOn: true },
  { id: "ctr", label: "CTR", defaultOn: true },
  { id: "impressions", label: "Impressions", defaultOn: true },
  { id: "reach", label: "Reach", defaultOn: true },
  { id: "clicks", label: "Clicks", defaultOn: true },
  { id: "cpc", label: "CPC", defaultOn: false },
  { id: "frequency", label: "Frequency", defaultOn: false },
] as const;

const STORAGE_KEY = "repto-table-columns";

type MetricRow = {
  ad_id: string;
  ad_name: string;
  campaign_name?: string;
  adset_name?: string;
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

export function AdsTable({
  ads,
  metrics,
  onAdClick,
}: {
  ads: AdSummary[];
  metrics: MetricRow[];
  onAdClick?: (ad: AdSummary) => void;
}) {
  const [healthMap, setHealthMap] = useState<Map<string, AdHealthResult>>(new Map());
  const [actionsMap, setActionsMap] = useState<ActionsMap>({});
  const [actionTypes, setActionTypes] = useState<string[]>([]);
  const [visibleCols, setVisibleCols] = useState<Set<string>>(
    () => new Set(CORE_COLUMNS.filter((c) => c.defaultOn).map((c) => c.id))
  );
  const [visibleActions, setVisibleActions] = useState<Set<string>>(new Set());
  const [actionsInitialized, setActionsInitialized] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) setVisibleCols(new Set(JSON.parse(saved) as string[]));
    } catch {}
    setHydrated(true);
  }, []);

  const persist = useCallback((cols: Set<string>, actions: Set<string>) => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify([...cols, ...actions]));
    } catch {}
  }, []);

  const toggleCol = (id: string) => {
    setVisibleCols((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      persist(next, visibleActions);
      return next;
    });
  };

  const toggleAction = (type: string) => {
    setVisibleActions((prev) => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type); else next.add(type);
      persist(visibleCols, next);
      return next;
    });
  };

  const selectAllActions = () => { const all = new Set(actionTypes); setVisibleActions(all); persist(visibleCols, all); };
  const deselectAllActions = () => { setVisibleActions(new Set()); persist(visibleCols, new Set()); };

  useEffect(() => {
    fetch("/api/meta/health")
      .then((r) => r.json())
      .then((data) => {
        if (data.results) {
          const map = new Map<string, AdHealthResult>();
          for (const r of data.results as AdHealthResult[]) map.set(r.ad_id, r);
          setHealthMap(map);
        }
      })
      .catch(() => {});

    fetch("/api/meta/actions")
      .then((r) => r.json())
      .then((data) => {
        if (data.actions) setActionsMap(data.actions);
        if (data.action_types) {
          const types = data.action_types as string[];
          const sorted = [
            ...PRIORITY_ACTIONS.filter((t) => types.includes(t)),
            ...types.filter((t) => !PRIORITY_ACTIONS.includes(t)).sort(),
          ];
          setActionTypes(sorted);
          if (!actionsInitialized) {
            try {
              const saved = localStorage.getItem(STORAGE_KEY);
              if (saved) {
                const savedSet = new Set(JSON.parse(saved) as string[]);
                setVisibleActions(new Set(sorted.filter((t) => savedSet.has(t))));
              } else {
                setVisibleActions(new Set(sorted.slice(0, 6)));
              }
            } catch {
              setVisibleActions(new Set(sorted.slice(0, 6)));
            }
            setActionsInitialized(true);
          }
        }
      })
      .catch(() => {});
  }, [actionsInitialized]);

  if (ads.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No ad data yet. Sync metrics to populate this table.
      </p>
    );
  }

  const activeActionCols = actionTypes.filter((t) => visibleActions.has(t));
  const totalCols = [...CORE_COLUMNS.filter((c) => visibleCols.has(c.id))].length + activeActionCols.length;

  return (
    <TooltipProvider>
      <div className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-[16px] font-extrabold text-foreground sm:text-[18px]">Ad Performance</h2>
          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
            <p className="text-[12px] text-muted-foreground">
              {ads.length} ad{ads.length !== 1 ? "s" : ""} &middot; {totalCols} columns
            </p>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="h-8 text-[12px] gap-1.5 rounded-full font-medium px-4">
                  <Settings2 className="h-3.5 w-3.5" strokeWidth={1.8} />
                  Columns
                </Button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-[280px] p-0 rounded-2xl">
              <div className="max-h-[400px] overflow-auto">
                <div className="px-4 py-3 border-b border-border/70">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">Core Metrics</p>
                </div>
                <div className="p-2 space-y-0.5 border-b border-border/70">
                  {CORE_COLUMNS.map((col) => (
                    <label key={col.id} className="flex items-center gap-3 rounded-lg px-3 py-2 text-[13px] hover:bg-muted/50 cursor-pointer transition-colors">
                      <Checkbox checked={visibleCols.has(col.id)} onCheckedChange={() => toggleCol(col.id)} />
                      {col.label}
                    </label>
                  ))}
                </div>
                {actionTypes.length > 0 && (
                  <>
                    <div className="px-4 py-3 border-b border-border/70 flex items-center justify-between">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
                        Actions ({visibleActions.size}/{actionTypes.length})
                      </p>
                      <div className="flex gap-2">
                        <button onClick={selectAllActions} className="text-[11px] text-[hsl(250,60%,55%)] hover:underline font-medium">All</button>
                        <span className="text-muted-foreground/40 text-[11px]">/</span>
                        <button onClick={deselectAllActions} className="text-[11px] text-[hsl(250,60%,55%)] hover:underline font-medium">None</button>
                      </div>
                    </div>
                    <div className="p-2 space-y-0.5">
                      {actionTypes.map((type) => (
                        <label key={type} className="flex items-center gap-3 rounded-lg px-3 py-2 text-[13px] hover:bg-muted/50 cursor-pointer transition-colors">
                          <Checkbox checked={visibleActions.has(type)} onCheckedChange={() => toggleAction(type)} />
                          <span className="truncate">{getActionLabel(type)}</span>
                        </label>
                      ))}
                    </div>
                  </>
                )}
              </div>
            </PopoverContent>
          </Popover>
          </div>
        </div>

        <div className="rounded-[20px] bg-white border border-border/60 overflow-auto">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent border-b border-border/70">
                <TableHead className="sticky left-0 z-10 h-12 w-[min(200px,42vw)] min-w-[min(200px,42vw)] max-w-[min(200px,42vw)] bg-white text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground sm:w-[240px] sm:min-w-[240px] sm:max-w-none">Ad</TableHead>
                {visibleCols.has("health") && <ColHeader label="Health" tip={CORE_COLUMN_TIPS.health} />}
                {visibleCols.has("launch") && <ColHeader label="Launch" tip={CORE_COLUMN_TIPS.launch} />}
                {visibleCols.has("spend") && <ColHeader label="Spend" tip={CORE_COLUMN_TIPS.spend} align="right" />}
                {visibleCols.has("roas") && <ColHeader label="ROAS" tip={CORE_COLUMN_TIPS.roas} align="right" />}
                {visibleCols.has("ctr") && <ColHeader label="CTR" tip={CORE_COLUMN_TIPS.ctr} align="right" />}
                {visibleCols.has("impressions") && <ColHeader label="Impressions" tip={CORE_COLUMN_TIPS.impressions} align="right" />}
                {visibleCols.has("reach") && <ColHeader label="Reach" tip={CORE_COLUMN_TIPS.reach} align="right" />}
                {visibleCols.has("clicks") && <ColHeader label="Clicks" tip={CORE_COLUMN_TIPS.clicks} align="right" />}
                {visibleCols.has("cpc") && <ColHeader label="CPC" tip={CORE_COLUMN_TIPS.cpc} align="right" />}
                {visibleCols.has("frequency") && <ColHeader label="Frequency" tip={CORE_COLUMN_TIPS.frequency} align="right" />}
                {activeActionCols.map((type) => (
                  <ColHeader key={type} label={getActionLabel(type)} tip={getActionTip(type)} align="right" />
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {ads.map((ad, idx) => {
                const imgSrc = ad.image_url || ad.thumbnail_url;
                const ctrHighlight = ad.avg_ctr >= 2;
                const health = healthMap.get(ad.ad_id);
                const adActions = actionsMap[ad.ad_id] ?? {};
                const isLast = idx === ads.length - 1;

                return (
                  <TableRow key={ad.ad_id} onClick={() => onAdClick?.(ad)} className={`group hover:bg-muted/30 transition-colors cursor-pointer ${isLast ? "border-0" : "border-b border-border/50"}`}>
                    <TableCell className="sticky left-0 z-10 w-[min(200px,42vw)] min-w-[min(200px,42vw)] max-w-[min(200px,42vw)] bg-white py-4 transition-colors group-hover:bg-muted/30 sm:w-[240px] sm:min-w-[240px] sm:max-w-none">
                      <div className="flex items-center gap-3">
                        <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded-lg bg-muted/50">
                          {imgSrc ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={imgSrc} alt={ad.ad_name} className="h-full w-full object-contain" />
                          ) : (
                            <div className="flex h-full w-full items-center justify-center text-[10px] text-muted-foreground/50 font-medium">AD</div>
                          )}
                        </div>
                        <div className="min-w-0">
                          <p className="truncate font-semibold text-[13px] text-foreground">{ad.ad_name}</p>
                          <p className="truncate text-[11px] text-muted-foreground">
                            {ad.adset_name || ad.campaign_name || "—"}
                          </p>
                        </div>
                      </div>
                    </TableCell>

                    {visibleCols.has("health") && (
                      <TableCell className="py-4">
                        {health ? (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Badge variant="outline" className={`cursor-default text-[10px] font-semibold px-2.5 py-0.5 rounded-md ${STATUS_STYLE[health.status]}`}>
                                {health.status}
                              </Badge>
                            </TooltipTrigger>
                            <TooltipContent side="bottom" className="max-w-xs rounded-xl">
                              <ul className="space-y-0.5 text-xs">
                                {health.rules.map((rule) => (
                                  <li key={rule.id} className="flex items-center gap-1.5">
                                    <span>{rule.triggered ? "⚠" : "✓"}</span>
                                    <span className={rule.triggered ? "font-medium" : "opacity-60"}>{rule.label}</span>
                                  </li>
                                ))}
                              </ul>
                            </TooltipContent>
                          </Tooltip>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </TableCell>
                    )}

                    {visibleCols.has("launch") && (
                      <TableCell className="text-[13px] text-muted-foreground whitespace-nowrap py-4">
                        {ad.first_date || "—"}
                      </TableCell>
                    )}
                    {visibleCols.has("spend") && (
                      <TableCell className="text-right text-[13px] tabular-nums font-medium py-4">{formatCurrency(ad.total_spend)}</TableCell>
                    )}
                    {visibleCols.has("roas") && (
                      <TableCell className="text-right text-[13px] font-semibold tabular-nums py-4">
                        {ad.avg_roas > 0 ? ad.avg_roas.toFixed(2) : "—"}
                      </TableCell>
                    )}
                    {visibleCols.has("ctr") && (
                      <TableCell className="text-right text-[13px] py-4">
                        {ctrHighlight ? (
                          <span className="inline-block rounded-md bg-emerald-50 px-2 py-0.5 font-semibold text-emerald-700 tabular-nums">
                            {ad.avg_ctr.toFixed(2)}%
                          </span>
                        ) : (
                          <span className="tabular-nums">{ad.avg_ctr.toFixed(2)}%</span>
                        )}
                      </TableCell>
                    )}
                    {visibleCols.has("impressions") && (
                      <TableCell className="text-right text-[13px] tabular-nums py-4">{ad.total_impressions.toLocaleString()}</TableCell>
                    )}
                    {visibleCols.has("reach") && (
                      <TableCell className="text-right text-[13px] tabular-nums py-4">{ad.total_reach.toLocaleString()}</TableCell>
                    )}
                    {visibleCols.has("clicks") && (
                      <TableCell className="text-right text-[13px] tabular-nums py-4">{ad.total_clicks.toLocaleString()}</TableCell>
                    )}
                    {visibleCols.has("cpc") && (
                      <TableCell className="text-right text-[13px] tabular-nums py-4">{formatCurrency(ad.avg_cpc)}</TableCell>
                    )}
                    {visibleCols.has("frequency") && (
                      <TableCell className="text-right text-[13px] tabular-nums py-4">{ad.avg_frequency.toFixed(2)}</TableCell>
                    )}

                    {activeActionCols.map((type) => {
                      const action = adActions[type];
                      if (!action || action.count === 0) {
                        return <TableCell key={type} className="text-right text-muted-foreground text-[13px] py-4">—</TableCell>;
                      }
                      return (
                        <TableCell key={type} className="text-right text-[13px] tabular-nums py-4">
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="cursor-default font-medium">
                                {action.count % 1 === 0 ? action.count.toLocaleString() : action.count.toFixed(2)}
                              </span>
                            </TooltipTrigger>
                            {action.value > 0 && (
                              <TooltipContent side="bottom" className="rounded-xl">
                                <p className="text-xs">Value: {formatCurrency(action.value)}</p>
                              </TooltipContent>
                            )}
                          </Tooltip>
                        </TableCell>
                      );
                    })}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </div>
    </TooltipProvider>
  );
}

function ColHeader({ label, tip, align }: { label: string; tip: string; align?: "right" }) {
  return (
    <TableHead className={`whitespace-nowrap text-[11px] font-bold uppercase tracking-[0.08em] text-muted-foreground h-12 ${align === "right" ? "text-right" : ""}`}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="cursor-default border-b border-dashed border-muted-foreground/30">
            {label}
          </span>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="max-w-[220px] rounded-2xl">
          <p className="text-xs">{tip}</p>
        </TooltipContent>
      </Tooltip>
    </TableHead>
  );
}
