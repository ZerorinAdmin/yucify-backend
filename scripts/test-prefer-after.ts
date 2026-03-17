#!/usr/bin/env npx tsx
/** Quick test: verify prefer-after picks correct video for ad 1118973763485810 */
import { extractAdsFromHtml } from "../backend/src/adspy/ads-library-extract";
import * as fs from "fs";
import * as path from "path";

const htmlPath = path.resolve(process.cwd(), "docs/ads-library.html");
const html = fs.readFileSync(htmlPath, "utf-8");
const ads = extractAdsFromHtml(html, "617324415443569");

const a1118 = ads.find((x) => x.ad_id === "1118973763485810");
const a1297 = ads.find((x) => x.ad_id === "1297720635316986");

console.log("Ad 1118973763485810 video_url:", a1118?.video_url?.slice(0, 100) + "...");
console.log("Ad 1297720635316986 video_url:", a1297?.video_url?.slice(0, 100) + "...");
console.log("");
console.log("Expected: 1118973763485810 should have AQOlP_15iph (video at 1748661, after ad_id)");
console.log("Wrong:    AQNIsSzsbPY9PmrqrrN or AQNf67S2i (videos before ad_id, from prev ad)");
const hasCorrect = a1118?.video_url?.includes("AQOlP_15iph");
const hasWrong =
  a1118?.video_url?.includes("AQNIsSzsbPY9PmrqrrN") || a1118?.video_url?.includes("AQNf67S2i-r");
console.log("");
console.log(hasCorrect ? "✓ PASS: 1118973763485810 has correct video" : "✗ FAIL: 1118973763485810 has wrong or no video");
console.log(hasWrong ? "✗ FAIL: 1118973763485810 still has prev ad's video" : "✓ PASS: 1118973763485810 does not have prev ad's video");
