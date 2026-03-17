"use client";

import type { AdSummary } from "@/app/(dashboard)/dashboard/page";

function formatCurrency(n: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(n);
}

export function MetricPills({ ads }: { ads: AdSummary[] }) {
  const totalSpend = ads.reduce((s, a) => s + a.total_spend, 0);
  const totalImpressions = ads.reduce((s, a) => s + a.total_impressions, 0);
  const totalClicks = ads.reduce((s, a) => s + a.total_clicks, 0);
  const avgCtr = ads.length > 0 ? ads.reduce((s, a) => s + a.avg_ctr, 0) / ads.length : 0;
  const avgRoas = ads.length > 0 ? ads.reduce((s, a) => s + a.avg_roas, 0) / ads.length : 0;

  const pills = [
    { label: "ROAS", value: `${avgRoas.toFixed(2)}x`, num: 1 },
    { label: "Spend", value: formatCurrency(totalSpend), num: 2 },
    { label: "Impressions", value: totalImpressions.toLocaleString(), num: 3 },
    { label: "CTR", value: `${avgCtr.toFixed(2)}%`, num: 4 },
    { label: "Clicks", value: totalClicks.toLocaleString(), num: 5 },
  ];

  return (
    <div className="flex flex-wrap gap-2">
      {pills.map((p) => (
        <div
          key={p.label}
          className="inline-flex items-center gap-2 rounded-full border bg-card px-4 py-1.5 text-sm"
        >
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">
            {p.num}
          </span>
          <span className="font-medium">{p.label}</span>
          <span className="text-muted-foreground">{p.value}</span>
        </div>
      ))}
    </div>
  );
}
