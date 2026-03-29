"use client";

import { useState, useEffect, useCallback } from "react";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Search, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

export type UsageData = {
  scrape: { used: number; limit: number; remaining: number };
  analysis: { used: number; limit: number; remaining: number };
};

export function UsageBadge() {
  const [usage, setUsage] = useState<UsageData | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchUsage = useCallback(() => {
    setLoading(true);
    fetch("/api/usage")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => data && setUsage(data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    fetchUsage();
    const handler = () => fetchUsage();
    window.addEventListener("adspy-usage-refresh", handler);
    return () => window.removeEventListener("adspy-usage-refresh", handler);
  }, [fetchUsage]);

  if (loading || !usage) {
    return (
      <Badge variant="outline" className="font-normal text-muted-foreground">
        Loading usage…
      </Badge>
    );
  }

  const scrapeLow = usage.scrape.remaining <= 2;
  const analysisLow = usage.analysis.remaining <= 1;

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="flex items-center gap-2">
            <Badge
              variant="outline"
              className={cn(
                "font-normal",
                scrapeLow && usage.scrape.remaining === 0 && "border-amber-500/60 text-amber-700 dark:text-amber-400"
              )}
            >
              <Search className="h-3 w-3 mr-1" />
              {usage.scrape.used}/{usage.scrape.limit} searches
            </Badge>
            <Badge
              variant="outline"
              className={cn(
                "font-normal",
                analysisLow && usage.analysis.remaining === 0 && "border-amber-500/60 text-amber-700 dark:text-amber-400"
              )}
            >
              <Sparkles className="h-3 w-3 mr-1" />
              {usage.analysis.used}/{usage.analysis.limit} analyses
            </Badge>
          </div>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="max-w-[240px]">
          <p className="text-sm">
            Daily limits reset at midnight UTC. Searches and AI analysis count when loading or analyzing ads from the library; cache hits don&apos;t count.
          </p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

