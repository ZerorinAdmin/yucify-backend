"use client";

import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";

type HealthRule = {
  id: string;
  label: string;
  triggered: boolean;
};

type AdHealthResult = {
  ad_id: string;
  ad_name: string;
  status: "HEALTHY" | "DECLINING" | "FATIGUED";
  rules: HealthRule[];
};

const STATUS_STYLE = {
  HEALTHY: "bg-green-100 text-green-700 hover:bg-green-100",
  DECLINING: "bg-yellow-100 text-yellow-700 hover:bg-yellow-100",
  FATIGUED: "bg-red-100 text-red-700 hover:bg-red-100",
};

export function CreativeHealthPanel() {
  const [results, setResults] = useState<AdHealthResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [fetched, setFetched] = useState(false);

  const fetchHealth = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/meta/health");
      const data = await res.json();
      if (res.ok) {
        setResults(data.results);
        setFetched(true);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchHealth();
  }, []);

  if (!fetched && loading) {
    return (
      <div className="rounded-lg border bg-card p-4">
        <p className="text-sm text-muted-foreground">Analyzing creative health…</p>
      </div>
    );
  }

  if (results.length === 0) return null;

  const summary = {
    healthy: results.filter((r) => r.status === "HEALTHY").length,
    declining: results.filter((r) => r.status === "DECLINING").length,
    fatigued: results.filter((r) => r.status === "FATIGUED").length,
  };

  return (
    <TooltipProvider>
      <div className="rounded-lg border bg-card p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold">Health Monitor</h3>
          <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={fetchHealth} disabled={loading}>
            {loading ? "…" : "Refresh"}
          </Button>
        </div>

        {/* Summary bar */}
        <div className="flex items-center gap-6 text-sm">
          <div className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full bg-green-500" />
            <span className="font-medium">{summary.healthy}</span>
            <span className="text-muted-foreground">Healthy</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full bg-yellow-500" />
            <span className="font-medium">{summary.declining}</span>
            <span className="text-muted-foreground">Declining</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full bg-red-500" />
            <span className="font-medium">{summary.fatigued}</span>
            <span className="text-muted-foreground">Fatigued</span>
          </div>
        </div>

        {/* Individual ad badges */}
        <div className="flex flex-wrap gap-2">
          {results.map((result) => {
            const style = STATUS_STYLE[result.status];
            const triggered = result.rules.filter((r) => r.triggered);

            return (
              <Tooltip key={result.ad_id}>
                <TooltipTrigger asChild>
                  <Badge
                    variant="secondary"
                    className={`${style} cursor-default text-xs py-1 px-2.5`}
                  >
                    {result.ad_name}
                    <span className="ml-1.5 opacity-70">{result.status}</span>
                  </Badge>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="max-w-xs">
                  <p className="font-medium text-xs mb-1">{result.ad_name}</p>
                  <ul className="space-y-0.5 text-xs">
                    {result.rules.map((rule) => (
                      <li key={rule.id} className="flex items-center gap-1">
                        <span>{rule.triggered ? "⚠" : "✓"}</span>
                        <span className={rule.triggered ? "font-medium" : "opacity-60"}>
                          {rule.label}
                        </span>
                      </li>
                    ))}
                  </ul>
                  {triggered.length === 0 && (
                    <p className="text-xs opacity-60 mt-1">All rules passing</p>
                  )}
                </TooltipContent>
              </Tooltip>
            );
          })}
        </div>
      </div>
    </TooltipProvider>
  );
}
