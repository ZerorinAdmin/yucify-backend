"use client";

import { Badge } from "@/components/ui/badge";

type Creative = {
  ad_id: string;
  ad_name: string;
  campaign_name: string;
  adset_name: string;
  thumbnail_url: string;
  image_url: string;
  creative_type: string;
  body: string;
};

export function CreativesGallery({ creatives }: { creatives: Creative[] }) {
  if (creatives.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No creatives yet. Click &ldquo;Sync metrics&rdquo; to pull ad data from Meta.
      </p>
    );
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {creatives.map((c) => {
        const imgSrc = c.image_url || c.thumbnail_url;
        return (
          <div
            key={c.ad_id}
            className="rounded-lg border bg-card overflow-hidden"
          >
            {imgSrc ? (
              <div className="relative aspect-video bg-muted">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={imgSrc}
                  alt={c.ad_name}
                  className="w-full h-full object-contain"
                />
              </div>
            ) : (
              <div className="aspect-video bg-muted flex items-center justify-center text-muted-foreground text-sm">
                No preview
              </div>
            )}
            <div className="p-3 space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <p className="font-medium text-sm truncate">{c.ad_name}</p>
                <Badge variant="secondary" className="shrink-0 text-xs">
                  {c.creative_type}
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground truncate">
                {c.campaign_name}
                {c.adset_name ? ` / ${c.adset_name}` : ""}
              </p>
              {c.body && (
                <p className="text-xs text-muted-foreground line-clamp-2">
                  {c.body}
                </p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
