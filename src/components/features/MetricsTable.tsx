import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type MetricRow = {
  ad_id: string;
  ad_name: string;
  campaign_name?: string;
  adset_name?: string;
  date: string;
  spend: number;
  impressions: number;
  clicks: number;
  ctr: number;
  cpc: number;
  frequency: number;
  roas: number;
};

export function MetricsTable({ rows }: { rows: MetricRow[] }) {
  if (rows.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No metrics yet. Click "Sync metrics" to pull data from Meta.
      </p>
    );
  }

  return (
    <div className="rounded-md border overflow-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Date</TableHead>
            <TableHead>Campaign</TableHead>
            <TableHead>Ad Set</TableHead>
            <TableHead>Ad Name</TableHead>
            <TableHead className="text-right">Spend</TableHead>
            <TableHead className="text-right">Impressions</TableHead>
            <TableHead className="text-right">Clicks</TableHead>
            <TableHead className="text-right">CTR</TableHead>
            <TableHead className="text-right">CPC</TableHead>
            <TableHead className="text-right">Frequency</TableHead>
            <TableHead className="text-right">ROAS</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={`${row.ad_id}-${row.date}`}>
              <TableCell>{row.date}</TableCell>
              <TableCell className="max-w-[180px] truncate text-muted-foreground">{row.campaign_name || "—"}</TableCell>
              <TableCell className="max-w-[160px] truncate text-muted-foreground">{row.adset_name || "—"}</TableCell>
              <TableCell className="max-w-[180px] truncate font-medium">{row.ad_name}</TableCell>
              <TableCell className="text-right">${Number(row.spend).toFixed(2)}</TableCell>
              <TableCell className="text-right">{Number(row.impressions).toLocaleString()}</TableCell>
              <TableCell className="text-right">{Number(row.clicks).toLocaleString()}</TableCell>
              <TableCell className="text-right">{Number(row.ctr).toFixed(2)}%</TableCell>
              <TableCell className="text-right">${Number(row.cpc).toFixed(2)}</TableCell>
              <TableCell className="text-right">{Number(row.frequency).toFixed(2)}</TableCell>
              <TableCell className="text-right">{Number(row.roas).toFixed(2)}x</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
