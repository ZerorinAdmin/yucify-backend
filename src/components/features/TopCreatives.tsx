"use client";

import { Badge } from "@/components/ui/badge";
import type { AdSummary } from "@/app/(dashboard)/dashboard/page";

function formatCurrency(n: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(n);
}

const TYPE_COLORS: Record<string, string> = {
  video: "bg-amber-500 text-white",
  image: "bg-emerald-500 text-white",
  unknown: "bg-zinc-500 text-white",
};

export function TopCreatives({ ads }: { ads: AdSummary[] }) {
  if (ads.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No creatives yet. Sync metrics to pull ad data from Meta.
      </p>
    );
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {ads.map((ad) => {
        const imgSrc = ad.image_url || ad.thumbnail_url;
        const typeColor = TYPE_COLORS[ad.creative_type] ?? TYPE_COLORS.unknown;

        return (
          <div
            key={ad.ad_id}
            className="group rounded-xl border bg-card shadow-sm transition-shadow hover:shadow-md overflow-hidden"
          >
            {/* Creative image */}
            <div className="relative aspect-[4/5] bg-muted">
              {imgSrc ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={imgSrc}
                  alt={ad.ad_name}
                  className="h-full w-full object-contain"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-muted-foreground text-sm">
                  No preview
                </div>
              )}
              {/* Type badge overlay */}
              <Badge
                className={`absolute bottom-2 left-2 ${typeColor} border-0 text-[11px] capitalize shadow-sm`}
              >
                {ad.creative_type}
              </Badge>
            </div>

            {/* Ad info + metrics */}
            <div className="p-3 space-y-2.5">
              <div>
                <p className="font-semibold text-sm leading-tight truncate">
                  {ad.ad_name}
                </p>
                <p className="text-xs text-muted-foreground truncate mt-0.5">
                  {ad.adset_name || ad.campaign_name || "—"}
                </p>
              </div>

              <div className="grid grid-cols-2 gap-y-1.5 text-xs">
                <MetricLine label="ROAS" value={ad.avg_roas > 0 ? `${ad.avg_roas.toFixed(2)}x` : "—"} />
                <MetricLine label="Spend" value={formatCurrency(ad.total_spend)} />
                <MetricLine label="CPC" value={ad.avg_cpc > 0 ? formatCurrency(ad.avg_cpc) : "—"} />
                <MetricLine label="CTR" value={`${ad.avg_ctr.toFixed(2)}%`} highlight={ad.avg_ctr >= 2} />
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function MetricLine({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div className="flex items-center justify-between pr-3">
      <span className="text-muted-foreground">{label}</span>
      <span className={highlight ? "font-semibold text-green-600" : "font-medium"}>
        {value}
      </span>
    </div>
  );
}
