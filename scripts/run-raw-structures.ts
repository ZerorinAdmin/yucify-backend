#!/usr/bin/env npx tsx
/**
 * Capture raw GraphQL/HTML structures from Meta Ads Library.
 * Use to verify what Meta actually returns: video fields, collation_id, child_attachments.
 *
 * Usage:
 *   npx tsx scripts/run-raw-structures.ts
 *   npx tsx scripts/run-raw-structures.ts --page_id=617324415443569 --country=US
 *   npm run raw_structures -- --page_id=617324415443569 --country=US --output=raw.json
 *
 * Env:
 *   ADSPY_FACEBOOK_PROFILE - path to persistent browser profile (for login)
 *   ADSPY_HEADLESS=false    - show browser (useful for login setup)
 */

import { captureRawStructures } from "../src/lib/adspy/scraper";
import * as path from "path";
import * as fs from "fs";

function parseArgs(): { page_id: string; country: string; output: string | null; diagnose_ad_id: string | null } {
  const args = process.argv.slice(2);
  let page_id = "617324415443569";
  let country = "US";
  let output: string | null = null;
  let diagnose_ad_id: string | null = null;

  for (const arg of args) {
    if (arg.startsWith("--page_id=")) page_id = arg.split("=")[1] ?? page_id;
    else if (arg.startsWith("--country=")) country = arg.split("=")[1] ?? country;
    else if (arg.startsWith("--output=")) output = arg.split("=")[1] ?? null;
    else if (arg.startsWith("--diagnose_ad_id=")) diagnose_ad_id = arg.split("=")[1] ?? null;
  }

  return { page_id, country, output, diagnose_ad_id };
}

async function main(): Promise<void> {
  const { page_id, country, output, diagnose_ad_id } = parseArgs();

  console.log("[raw_structures] Capturing Meta Ads Library raw structures...");
  console.log(`[raw_structures] page_id=${page_id} country=${country}`);
  if (diagnose_ad_id) console.log(`[raw_structures] diagnose_ad_id=${diagnose_ad_id}`);

  const raw = await captureRawStructures(page_id, country, { diagnoseAdId: diagnose_ad_id ?? undefined });

  console.log("\n[raw_structures] Summary:");
  console.log(`  GraphQL responses: ${raw.graphql_responses_count}`);
  console.log(`  Collated items (unique): ${raw.collated_items_total}`);
  console.log(`  Extracted ads: ${raw.extracted_ads_summary.length}`);

  const withVideo = raw.extracted_ads_summary.filter((a) => a.video_url).length;
  const withCarousel = raw.extracted_ads_summary.filter((a) => a.carousel_count > 1).length;
  console.log(`  Ads with video_url: ${withVideo}`);
  console.log(`  Ads with carousel > 1: ${withCarousel}`);

  if (raw.sample_raw_structures.length > 0) {
    console.log("\n[raw_structures] Sample raw structure (first item):");
    const first = raw.sample_raw_structures[0];
    console.log(`  ad_id: ${first.ad_id}`);
    console.log(`  has_video_fields: ${first.has_video_fields}`);
    console.log(`  has_collation_fields: ${first.has_collation_fields}`);
    console.log(`  child_attachments_count: ${first.child_attachments_count}`);
    if (first.video_values) console.log(`  video_values: ${JSON.stringify(first.video_values)}`);
    if (first.collation_values) console.log(`  collation_values: ${JSON.stringify(first.collation_values)}`);
    if (first.first_child_keys) console.log(`  first_child_keys: ${JSON.stringify(first.first_child_keys)}`);
  }

  if (raw.html_first_ad_chunk) {
    console.log("\n[raw_structures] HTML first ad chunk:");
    console.log(`  ad_id: ${raw.html_first_ad_chunk.ad_id}`);
    console.log(`  has_video in chunk: ${raw.html_first_ad_chunk.has_video}`);
    console.log(`  has_child_attachments in chunk: ${raw.html_first_ad_chunk.has_child_attachments}`);
  }

  if (raw.html_creative_audit) {
    const a = raw.html_creative_audit;
    console.log("\n[raw_structures] HTML creative audit:");
    console.log("  Creative markers in full HTML:", a.creative_markers);
    console.log(`  Ad IDs found: ${a.ad_archive_id_positions.length}`);
    console.log(`  Ads WITH creative nearby (±60k chars): ${a.ads_with_creative_nearby}`);
    console.log(`  Ads WITHOUT creative nearby: ${a.ads_without_creative_nearby}`);
    if (a.sample_pairings.length > 0) {
      console.log("  Sample ad→nearest marker:", a.sample_pairings);
    }
  }

  if (raw.video_verification) {
    const v = raw.video_verification;
    console.log("\n[raw_structures] Video verification (first ad, ±5k chars):");
    console.log(`  ad_id: ${v.ad_id}, chunk_size: ${v.chunk_size}`);
    console.log(`  Regex any_match: ${v.any_match}`);
    console.log(`  chunk_contains_video_sd_url: ${v.chunk_contains_video_sd_url}`);
    console.log(`  ROOT CAUSE: ${v.root_cause}`);
    if (v.raw_video_format_sample) {
      console.log("  Raw video format sample (use to fix regex):");
      console.log("  ", JSON.stringify(v.raw_video_format_sample));
    }
    if (v.regex_matches?.length > 0) {
      const matched = v.regex_matches.filter((r) => r.matched);
      if (matched.length > 0) console.log("  Matched patterns:", matched.map((r) => r.pattern));
    }
  }

  if (raw.carousel_verification) {
    const c = raw.carousel_verification;
    console.log("\n[raw_structures] Carousel verification (first 5 ads, snapshot pages):");
    console.log(`  snapshots_tested: ${c.snapshots_tested}`);
    console.log(`  any_snapshot_has_carousel: ${c.any_snapshot_has_carousel}`);
    console.log(`  ROOT CAUSE: ${c.root_cause}`);
    for (const r of c.results ?? []) {
      console.log(`  - ${r.ad_id}: child_attachments=${r.child_attachments_count}, carousel_cards=${r.carousel_cards_count}, display_resources=${r.display_resources_count}, has_carousel=${r.has_carousel_data}`);
    }
  }

  if (raw.ad_chunk_diagnosis) {
    const d = raw.ad_chunk_diagnosis;
    console.log("\n[raw_structures] Ad chunk overlap diagnosis:");
    console.log(`  target_ad_id: ${d.target_ad_id}, found: ${d.found}`);
    if (d.found) {
      console.log(`  chunk: [${d.chunk_start}, ${d.chunk_end}] size=${d.chunk_size}`);
      console.log(`  ads_in_chunk: ${d.ads_in_chunk.length} (${d.ads_in_chunk.map((a) => a.ad_id).join(", ")})`);
      console.log(`  video_matches_in_chunk: ${d.video_matches_in_chunk.length}`);
      d.video_matches_in_chunk.slice(0, 5).forEach((v, i) => {
        console.log(`    [${i}] dist=${v.distance_from_ad_id} is_first=${v.is_first_match} url=${v.url_preview.slice(0, 60)}...`);
      });
      if (d.video_we_pick) {
        console.log(`  VIDEO WE PICK: dist=${d.video_we_pick.distance_from_ad_id} (first match in chunk)`);
      }
      console.log(`  text_matches_in_text_chunk: ${d.text_matches_in_text_chunk.length}`);
      d.text_matches_in_text_chunk.slice(0, 5).forEach((t, i) => {
        console.log(`    [${i}] dist=${t.distance_from_ad_id} pattern=${t.pattern} text=${t.text_preview.slice(0, 50)}...`);
      });
      if (d.text_we_pick) {
        console.log(`  TEXT WE PICK: pattern=${d.text_we_pick.pattern}`);
      }
    }
  }

  const outPath = output
    ? path.resolve(process.cwd(), output)
    : path.join(path.resolve(process.cwd(), "docs"), `raw-structures-${page_id}-${Date.now()}.json`);
  fs.writeFileSync(outPath, JSON.stringify(raw, null, 2), "utf-8");
  console.log(`\n[raw_structures] Full output written to ${outPath}`);
}

main().catch((err) => {
  console.error("[raw_structures] Error:", err);
  process.exit(1);
});
