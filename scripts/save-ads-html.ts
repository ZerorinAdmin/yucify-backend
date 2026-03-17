#!/usr/bin/env npx tsx
/**
 * Minimal capture: load Ads Library page, save HTML to file, exit.
 * Use for diagnose-ad-chunk.ts (avoids OOM from full raw_structures).
 *
 * Usage:
 *   npx tsx scripts/save-ads-html.ts --page_id=617324415443569 --country=US --output=docs/ads-library.html
 */

import { chromium } from "playwright";
import path from "path";
import fs from "fs";

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  let page_id = "617324415443569";
  let country = "US";
  let output = "docs/ads-library.html";

  for (const arg of args) {
    if (arg.startsWith("--page_id=")) page_id = arg.split("=")[1] ?? page_id;
    else if (arg.startsWith("--country=")) country = arg.split("=")[1] ?? country;
    else if (arg.startsWith("--output=")) output = arg.split("=")[1] ?? output;
  }

  const profile = process.env.ADSPY_FACEBOOK_PROFILE
    ? path.resolve(process.env.ADSPY_FACEBOOK_PROFILE)
    : undefined;

  const context = await chromium.launchPersistentContext(profile ?? path.join(process.cwd(), ".browser-profile"), {
    headless: process.env.ADSPY_HEADLESS !== "false",
    channel: "chrome",
  });

  try {
    const page = await context.newPage();
    const url = `https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=${country}&is_targeted_country=false&media_type=all&search_type=page&sort_data[direction]=desc&sort_data[mode]=total_impressions&source=fb-logo&view_all_page_id=${page_id}`;
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForTimeout(3000);
    await page.mouse.wheel(0, 2000);
    await page.waitForTimeout(2000);
    const html = await page.content();
    const outPath = path.resolve(process.cwd(), output);
    fs.writeFileSync(outPath, html, "utf-8");
    console.log(`Saved ${html.length} chars to ${outPath}`);
  } finally {
    await context.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
