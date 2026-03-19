"use client";

import { useState } from "react";
import { CalendarRange } from "lucide-react";
import { OverallMetrics } from "@/components/features/OverallMetrics";
import { CreativeVisualizer } from "@/components/features/CreativeVisualizer";
import { AdsTable } from "@/components/features/AdsTable";
import { AdDetailPanel } from "@/components/features/AdDetailPanel";
import type { AdSummary } from "@/app/(dashboard)/dashboard/page";

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

function formatDateDisplay(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function EmptyDateRangeState({ dateFrom, dateTo }: { dateFrom: string; dateTo: string }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-border/60 bg-white py-20 px-8">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-muted/50">
        <CalendarRange className="h-8 w-8 text-muted-foreground" strokeWidth={1.5} />
      </div>
      <h3 className="mt-6 text-[18px] font-bold text-foreground">No data for this date range</h3>
      <p className="mt-2 text-[14px] text-muted-foreground text-center max-w-md">
        There are no ads with activity between{" "}
        <span className="font-semibold text-foreground">{formatDateDisplay(dateFrom)}</span>
        {" "}and{" "}
        <span className="font-semibold text-foreground">{formatDateDisplay(dateTo)}</span>.
      </p>
      <p className="mt-4 text-[13px] text-muted-foreground text-center max-w-md">
        Try selecting a different date range using the date picker in the top right and click <b>"SYNC"</b>.
      </p>
    </div>
  );
}

export function DashboardClient({
  ads,
  metrics,
  dateFrom,
  dateTo,
}: {
  ads: AdSummary[];
  metrics: MetricRow[];
  dateFrom: string;
  dateTo: string;
}) {
  const [selectedAd, setSelectedAd] = useState<AdSummary | null>(null);

  if (ads.length === 0) {
    return <EmptyDateRangeState dateFrom={dateFrom} dateTo={dateTo} />;
  }

  return (
    <>
      <OverallMetrics ads={ads} />
      <CreativeVisualizer ads={ads} onAdClick={setSelectedAd} />
      <AdsTable ads={ads} metrics={metrics} onAdClick={setSelectedAd} />
      <AdDetailPanel
        ad={selectedAd}
        metrics={metrics}
        open={!!selectedAd}
        onClose={() => setSelectedAd(null)}
      />
    </>
  );
}
