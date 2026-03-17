#!/usr/bin/env npx tsx
/**
 * Comprehensive mismatch diagnostic.
 * Verifies: ad_id occurrences, chunk boundaries, text/video extraction, source tracing.
 *
 * Usage:
 *   npx tsx scripts/diagnose-mismatch.ts --html=docs/ads-library.html --page_id=617324415443569 [--ad_ids=3093932810784164,1957280865133857]
 */

import {
  extractAdsFromHtml,
  diagnoseAdChunkOverlap,
  findAllAdIdOccurrences,
} from "../backend/src/adspy/ads-library-extract";
import * as fs from "fs";
import * as path from "path";

function parseArgs(): {
  html: string;
  page_id: string;
  ad_ids: string[];
  output: string | null;
  quick: boolean;
} {
  const args = process.argv.slice(2);
  let html = "";
  let page_id = "617324415443569";
  let ad_ids = "3093932810784164,1957280865133857,1118973763485810,1297720635316986";
  let output: string | null = null;
  let quick = false;

  for (const arg of args) {
    if (arg.startsWith("--html=")) html = arg.split("=").slice(1).join("=").trim();
    else if (arg.startsWith("--page_id=")) page_id = arg.split("=")[1] ?? page_id;
    else if (arg.startsWith("--ad_ids=")) ad_ids = arg.split("=").slice(1).join("=").trim();
    else if (arg.startsWith("--output=")) output = arg.split("=").slice(1).join("=").trim() || null;
    else if (arg === "--quick") quick = true;
  }

  return {
    html,
    page_id,
    ad_ids: ad_ids.split(",").map((s) => s.trim()).filter(Boolean),
    output,
    quick,
  };
}

async function main(): Promise<void> {
  const { html: htmlPath, page_id, ad_ids, output, quick } = parseArgs();

  if (!htmlPath) {
    console.error(
      "Usage: npx tsx scripts/diagnose-mismatch.ts --html=docs/ads-library.html --page_id=617324415443569 [--ad_ids=3093932810784164,1957280865133857] [--output=result.txt]"
    );
    process.exit(1);
  }

  const resolved = path.resolve(process.cwd(), htmlPath);
  if (!fs.existsSync(resolved)) {
    console.error("HTML file not found:", resolved);
    process.exit(1);
  }

  const html = fs.readFileSync(resolved, "utf-8");
  const lines: string[] = [];

  lines.push("=== MISMATCH DIAGNOSTIC ===\n");
  lines.push(`HTML length: ${html.length} chars`);
  lines.push(`page_id: ${page_id}`);
  lines.push(`Target ad_ids: ${ad_ids.join(", ")}\n`);

  // 1. All occurrences of each ad_id
  lines.push("--- 1. AD_ID OCCURRENCES (findAdIdMatches uses LAST) ---\n");
  for (const adId of ad_ids) {
    const occurrences = findAllAdIdOccurrences(html, adId);
    const lastIdx = occurrences.length > 0 ? occurrences[occurrences.length - 1] : -1;
    lines.push(`Ad ${adId}:`);
    lines.push(`  Total occurrences: ${occurrences.length}`);
    if (occurrences.length > 0) {
      lines.push(`  Indices: ${occurrences.slice(0, 5).join(", ")}${occurrences.length > 5 ? ` ... (+${occurrences.length - 5} more)` : ""}`);
      lines.push(`  Index we use (last): ${lastIdx}`);
      if (occurrences.length > 1) {
        lines.push(`  WARNING: Multiple occurrences - last may be in different context (e.g. related ads)`);
      }
    }
    lines.push("");
  }

  // 2. diagnoseAdChunkOverlap for each target (skip if --quick, it's slow)
  if (!quick) {
    lines.push("--- 2. CHUNK OVERLAP DIAGNOSIS (per ad) ---\n");
    for (const adId of ad_ids) {
      const diag = diagnoseAdChunkOverlap(html, page_id, adId);
    if (!diag.found) {
      lines.push(`Ad ${adId}: NOT FOUND in HTML\n`);
      continue;
    }
    lines.push(`Ad ${adId}:`);
    lines.push(`  Target index: ${diag.target_index}`);
    lines.push(`  Prev ad: ${diag.prev_ad_id ?? "none"} | Next ad: ${diag.next_ad_id ?? "none"}`);
    lines.push(`  Chunk: [${diag.chunk_start}, ${diag.chunk_end}] size=${diag.chunk_size}`);
    lines.push(`  Text chunk: [${diag.text_chunk_start}, ${diag.text_chunk_end}]`);
    lines.push(`  Ads in chunk: ${diag.ads_in_chunk.map((a) => a.ad_id).join(", ")}`);

    lines.push(`  Video matches: ${diag.video_matches_in_chunk.length}`);
    const afterTarget = diag.video_matches_in_chunk.filter((v) => v.position_in_html >= diag.target_index);
    const beforeTarget = diag.video_matches_in_chunk.filter((v) => v.position_in_html < diag.target_index);
    lines.push(`    After ad_id: ${afterTarget.length} | Before ad_id: ${beforeTarget.length}`);
    if (afterTarget.length > 0) {
      const nearestAfter = afterTarget.sort((a, b) => a.distance_from_ad_id - b.distance_from_ad_id)[0];
      lines.push(`    Nearest AFTER (what we pick): dist=${nearestAfter.distance_from_ad_id}`);
    } else {
      lines.push(`    NO video after ad_id - we return null (no fallback to before)`);
    }

    lines.push(`  Text matches in text chunk: ${diag.text_matches_in_text_chunk.length}`);
    if (diag.text_we_pick) {
      lines.push(`    Text we pick (first match): "${diag.text_we_pick.text_preview.slice(0, 80)}..."`);
    }
    lines.push("");
  }
  } else {
    lines.push("--- 2. CHUNK OVERLAP (skipped with --quick) ---\n");
  }

  // 3. extractAdsFromHtml output for each target
  lines.push("--- 3. EXTRACTED ADS (extractAdsFromHtml) ---\n");
  const extracted = extractAdsFromHtml(html, page_id);
  for (const adId of ad_ids) {
    const ad = extracted.find((a) => a.ad_id === adId);
    if (!ad) {
      lines.push(`Ad ${adId}: NOT in extracted results\n`);
      continue;
    }
    lines.push(`Ad ${adId}:`);
    lines.push(`  ad_text: "${(ad.ad_text ?? "").slice(0, 120)}..."`);
    lines.push(`  video_url: ${ad.video_url ? ad.video_url.slice(0, 80) + "..." : "null"}`);
    lines.push(`  image_url: ${ad.image_url ? "yes" : "null"}`);
    lines.push(`  carousel_urls: ${ad.carousel_urls?.length ?? 0}`);
    lines.push("");
  }

  // 4. Text chunk overlap check - does textChunk span multiple ads?
  lines.push("--- 4. TEXT CHUNK OVERLAP (first match can be wrong) ---\n");
  const adArchiveRe = /"ad_archive_id"\s*:\s*"(\d+)"/g;
  const allMatches: { adId: string; index: number }[] = [];
  let m: RegExpExecArray | null;
  adArchiveRe.lastIndex = 0;
  while ((m = adArchiveRe.exec(html)) !== null) {
    if (m[1] && m[1].length >= 10 && m[1] !== page_id) allMatches.push({ adId: m[1], index: m.index });
  }
  const byId = new Map<string, number>();
  for (const { adId, index } of allMatches) byId.set(adId, index);
  const sorted = [...byId.entries()].map(([adId, index]) => ({ adId, index })).sort((a, b) => a.index - b.index);

  for (const adId of ad_ids) {
    const idx = sorted.findIndex((x) => x.adId === adId);
    if (idx < 0) continue;
    const prevIndex = idx > 0 ? sorted[idx - 1].index : 0;
    const nextIndex = idx + 1 < sorted.length ? sorted[idx + 1].index : html.length;
    const textChunk = html.slice(prevIndex, nextIndex);
    const primaryTextRe = /"primary_text"\s*:\s*"([^"\\]*(?:\\.[^"\\]*)*)"/;
    const bodyRe = /"ad_creative_body"\s*:\s*"([^"\\]*(?:\\.[^"\\]*)*)"/;
    const firstPrimary = textChunk.match(primaryTextRe);
    const firstBody = textChunk.match(bodyRe);
    lines.push(`Ad ${adId} textChunk [${prevIndex}, ${nextIndex}] (${nextIndex - prevIndex} chars):`);
    lines.push(`  First primary_text: "${(firstPrimary?.[1] ?? "none").slice(0, 80)}..."`);
    lines.push(`  First ad_creative_body: "${(firstBody?.[1] ?? "none").slice(0, 80)}..."`);
    lines.push(`  Prev ad ends at ${prevIndex} - first match could belong to prev ad if it appears before our ad_id`);
    lines.push("");
  }

  const out = lines.join("\n");
  if (output) {
    const outPath = path.resolve(process.cwd(), output);
    fs.writeFileSync(outPath, out, "utf-8");
    console.log(`Diagnosis written to ${outPath}`);
  } else {
    console.log(out);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
