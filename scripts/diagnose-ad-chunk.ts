#!/usr/bin/env npx tsx
/**
 * Diagnose ad chunk overlap for a specific ad_id.
 * Reads HTML from file (avoid Playwright OOM) and runs diagnoseAdChunkOverlap.
 *
 * Usage:
 *   npx tsx scripts/diagnose-ad-chunk.ts --html=path/to/page.html --page_id=617324415443569 --ad_id=1120053313555435
 *
 * To get HTML: Save the Ads Library page from browser (Cmd+S) or use a minimal capture.
 */

import { diagnoseAdChunkOverlap } from "../backend/src/adspy/ads-library-extract";
import * as fs from "fs";
import * as path from "path";

function parseArgs(): { html: string; page_id: string; ad_id: string; output: string | null } {
  const args = process.argv.slice(2);
  let html = "";
  let page_id = "617324415443569";
  let ad_id = "1120053313555435";
  let output: string | null = null;

  for (const arg of args) {
    if (arg.startsWith("--html=")) html = arg.split("=").slice(1).join("=").trim();
    else if (arg.startsWith("--page_id=")) page_id = arg.split("=")[1] ?? page_id;
    else if (arg.startsWith("--ad_id=")) ad_id = arg.split("=")[1] ?? ad_id;
    else if (arg.startsWith("--output=")) output = arg.split("=").slice(1).join("=").trim() || null;
  }

  return { html, page_id, ad_id, output };
}

async function main(): Promise<void> {
  const { html: htmlPath, page_id, ad_id, output } = parseArgs();

  if (!htmlPath) {
    console.error("Usage: npx tsx scripts/diagnose-ad-chunk.ts --html=path/to/page.html --page_id=617324415443569 --ad_id=1120053313555435 [--output=result.txt]");
    process.exit(1);
  }

  const resolved = path.resolve(process.cwd(), htmlPath);
  if (!fs.existsSync(resolved)) {
    console.error("HTML file not found:", resolved);
    process.exit(1);
  }

  const html = fs.readFileSync(resolved, "utf-8");
  console.log(`[diagnose] Loaded HTML: ${html.length} chars`);
  console.log(`[diagnose] page_id=${page_id} ad_id=${ad_id}\n`);

  const result = diagnoseAdChunkOverlap(html, page_id, ad_id);

  const lines: string[] = [];

  if (!result.found) {
    lines.push("Ad not found in HTML.");
    const out = lines.join("\n");
    if (output) fs.writeFileSync(path.resolve(process.cwd(), output), out, "utf-8");
    else console.log(out);
    process.exit(0);
  }

  lines.push("=== AD CHUNK OVERLAP DIAGNOSIS ===\n");
  lines.push(`Target ad: ${result.target_ad_id} at index ${result.target_index}`);
  lines.push(`Prev ad: ${result.prev_ad_id ?? "none"}`);
  lines.push(`Next ad: ${result.next_ad_id ?? "none"}`);
  lines.push(`\nChunk: [${result.chunk_start}, ${result.chunk_end}] size=${result.chunk_size} chars`);
  lines.push(`Text chunk: [${result.text_chunk_start}, ${result.text_chunk_end}]`);

  lines.push(`\nAds in chunk: ${result.ads_in_chunk.length}`);
  for (const a of result.ads_in_chunk) {
    const dist = Math.abs(a.index - result.target_index);
    const marker = a.ad_id === result.target_ad_id ? " <-- TARGET" : "";
    lines.push(`  - ${a.ad_id} at ${a.index} (dist from target: ${dist})${marker}`);
  }

  lines.push(`\nVideo matches in chunk: ${result.video_matches_in_chunk.length}`);
  for (let i = 0; i < Math.min(10, result.video_matches_in_chunk.length); i++) {
    const v = result.video_matches_in_chunk[i];
    lines.push(`  [${i}] pos=${v.position_in_html} dist=${v.distance_from_ad_id} is_first=${v.is_first_match}`);
    lines.push(`      url: ${v.url_preview}...`);
  }
  if (result.video_matches_in_chunk.length > 10) {
    lines.push(`  ... and ${result.video_matches_in_chunk.length - 10} more`);
  }

  if (result.video_we_pick) {
    lines.push(`\n*** VIDEO WE PICK (first match): dist=${result.video_we_pick.distance_from_ad_id}`);
    lines.push(`    url: ${result.video_we_pick.url_preview}...`);
  }

  lines.push(`\nText matches in text chunk: ${result.text_matches_in_text_chunk.length}`);
  for (let i = 0; i < Math.min(5, result.text_matches_in_text_chunk.length); i++) {
    const t = result.text_matches_in_text_chunk[i];
    lines.push(`  [${i}] pos=${t.position_in_html} dist=${t.distance_from_ad_id} pattern=${t.pattern}`);
    lines.push(`      text: ${t.text_preview}...`);
  }

  if (result.text_we_pick) {
    lines.push(`\n*** TEXT WE PICK (first match): pattern=${result.text_we_pick.pattern}`);
    lines.push(`    text: ${result.text_we_pick.text_preview}...`);
  }

  const nearestVideo = result.video_matches_in_chunk
    .filter((v) => v.distance_from_ad_id > 0)
    .sort((a, b) => a.distance_from_ad_id - b.distance_from_ad_id)[0];
  if (nearestVideo && result.video_we_pick && nearestVideo.distance_from_ad_id !== result.video_we_pick.distance_from_ad_id) {
    lines.push("\n*** ROOT CAUSE: We pick the FIRST video in chunk, but the NEAREST to ad_id is at dist=" + nearestVideo.distance_from_ad_id);
    lines.push("    The first match may belong to a different ad (chunk overlap).");
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
