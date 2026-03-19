/**
 * One-time login script for Facebook.
 * Run locally: node login.js
 * Log in manually, then session is saved to facebook-state.json
 * Upload that file to Fly at /data/facebook-state.json
 */
import { chromium } from "playwright";

(async () => {
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  const page = await context.newPage();

  console.log("👉 Opening Facebook...");
  await page.goto("https://www.facebook.com/");

  console.log("👉 LOGIN MANUALLY (email + password + OTP)");
  await page.pause(); // you login here

  console.log("⏳ Waiting for session to stabilize...");
  await page.waitForTimeout(30000);

  await page.goto("https://www.facebook.com/");
  await page.waitForTimeout(10000);

  const cookies = await context.cookies();
  console.log("👉 Cookies count:", cookies.length);

  const names = cookies.map((c) => c.name);
  console.log("👉 Cookie names:", names);

  if (!names.includes("c_user")) {
    console.error("❌ ERROR: No c_user cookie → login NOT saved");
  } else {
    console.log("✅ c_user cookie found");
  }

  if (!names.includes("xs")) {
    console.warn("⚠️ WARNING: No xs cookie (session token)");
  } else {
    console.log("✅ xs cookie found");
  }

  await context.storageState({ path: "facebook-state.json" });
  console.log("✅ Session saved to facebook-state.json");

  await browser.close();
})();
