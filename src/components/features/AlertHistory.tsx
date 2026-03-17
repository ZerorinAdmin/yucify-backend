"use client";

import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type AlertRow = {
  id: string;
  ad_name: string;
  previous_status: string;
  new_status: string;
  rules_triggered: string[];
  sent: boolean;
  created_at: string;
  sent_at: string | null;
};

export function AlertHistory() {
  const [alerts, setAlerts] = useState<AlertRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  const fetchAlerts = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/alerts/history");
      const data = await res.json();
      if (res.ok) setAlerts(data.alerts ?? []);
    } finally {
      setLoading(false);
    }
  };

  const processQueue = async () => {
    setProcessing(true);
    setResult(null);
    try {
      const res = await fetch("/api/alerts/process", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed");
      setResult(
        `Sent ${data.processed} alert(s)${data.failed > 0 ? `, ${data.failed} failed` : ""}`
      );
      fetchAlerts();
    } catch (e) {
      setResult(e instanceof Error ? e.message : "Failed");
    } finally {
      setProcessing(false);
    }
  };

  useEffect(() => {
    fetchAlerts();
  }, []);

  const pendingCount = alerts.filter((a) => !a.sent).length;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Button
          size="sm"
          onClick={processQueue}
          disabled={processing || pendingCount === 0}
        >
          {processing ? "Sending…" : `Send pending alerts (${pendingCount})`}
        </Button>
        {result && (
          <span className="text-sm text-muted-foreground">{result}</span>
        )}
      </div>

      {loading && alerts.length === 0 ? (
        <p className="text-sm text-muted-foreground">Loading alerts…</p>
      ) : alerts.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No alerts yet. When an ad transitions from Healthy to Declining or Fatigued, an alert will be queued here.
        </p>
      ) : (
        <div className="rounded-md border overflow-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Ad Name</TableHead>
                <TableHead>Transition</TableHead>
                <TableHead>Rules</TableHead>
                <TableHead>Queued</TableHead>
                <TableHead>Sent</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {alerts.map((alert) => (
                <TableRow key={alert.id}>
                  <TableCell className="max-w-[180px] truncate font-medium">
                    {alert.ad_name}
                  </TableCell>
                  <TableCell>
                    <span className="text-green-600">HEALTHY</span>
                    {" → "}
                    <span
                      className={
                        alert.new_status === "FATIGUED"
                          ? "text-destructive"
                          : "text-yellow-600"
                      }
                    >
                      {alert.new_status}
                    </span>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground max-w-[240px] truncate">
                    {(alert.rules_triggered ?? []).join("; ") || "—"}
                  </TableCell>
                  <TableCell className="text-sm">
                    {new Date(alert.created_at).toLocaleDateString()}
                  </TableCell>
                  <TableCell>
                    {alert.sent ? (
                      <Badge variant="default" className="bg-green-600 hover:bg-green-700 text-white">
                        Sent
                      </Badge>
                    ) : (
                      <Badge variant="secondary">Pending</Badge>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
