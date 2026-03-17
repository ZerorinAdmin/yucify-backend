#!/usr/bin/env npx tsx
/**
 * Run Ads Library Discovery.
 *
 * Captures and documents Meta's real HTML/DOM structure before changing extraction.
 *
 * Usage:
 *   npx tsx scripts/run-discovery.ts
 *   npx tsx scripts/run-discovery.ts --page_id=15087023444 --country=US
 *   npm run discovery -- --page_id=617324415443569 --country=US --output=report.json
 *
 * Env:
 *   ADSPY_FACEBOOK_PROFILE - path to persistent browser profile (for login)
 *   ADSPY_HEADLESS=false    - show browser (useful for login setup)
 */

import { runDiscovery, writeReportToFile, reportToMarkdown } from "../backend/src/adspy/ads-library-discovery";
import * as path from "path";
import * as fs from "fs";

function parseArgs(): { page_id: string; country: string; output: string | null; format: "json" | "md" } {
  const args = process.argv.slice(2);
  let page_id = "15087023444";
  let country = "US";
  let output: string | null = null;
  let format: "json" | "md" = "json";

  for (const arg of args) {
    if (arg.startsWith("--page_id=")) page_id = arg.split("=")[1] ?? page_id;
    else if (arg.startsWith("--country=")) country = arg.split("=")[1] ?? country;
    else if (arg.startsWith("--output=")) output = arg.split("=")[1] ?? null;
    else if (arg.startsWith("--format=")) format = (arg.split("=")[1] as "json" | "md") ?? "json";
  }

  return { page_id, country, output, format };
}

async function main(): Promise<void> {
  const { page_id, country, output, format } = parseArgs();

  console.log("[discovery] Starting Ads Library Discovery...");
  console.log(`[discovery] page_id=${page_id} country=${country}`);

  const report = await runDiscovery(page_id, country);

  console.log("\n[discovery] Summary:");
  console.log(`  Creative on list page: ${report.summary.creative_on_list_page}`);
  console.log(`  Ads with creative in chunk: ${report.summary.ads_with_creative_in_chunk}`);
  console.log(`  Ads without creative in chunk: ${report.summary.ads_without_creative_in_chunk}`);
  console.log(`  DOM vs HTML: ${report.summary.dom_vs_html_ad_count}`);
  console.log(`  Links have ?id=: ${report.summary.links_have_id_param}`);
  console.log(`\n  Recommendation: ${report.summary.recommendation}`);

  if (output) {
    const outPath = path.resolve(process.cwd(), output);
    if (format === "md") {
      const md = reportToMarkdown(report);
      fs.writeFileSync(outPath, md, "utf-8");
      console.log(`\n[discovery] Markdown report written to ${outPath}`);
    } else {
      writeReportToFile(report, outPath);
      console.log(`\n[discovery] JSON report written to ${outPath}`);
    }
  } else {
    const docsDir = path.resolve(process.cwd(), "docs");
    if (!fs.existsSync(docsDir)) fs.mkdirSync(docsDir, { recursive: true });
    const defaultPath = path.join(docsDir, `discovery-report-${page_id}-${Date.now()}.json`);
    writeReportToFile(report, defaultPath);
    console.log(`\n[discovery] JSON report written to ${defaultPath}`);
  }
}

main().catch((err) => {
  console.error("[discovery] Error:", err);
  process.exit(1);
});
