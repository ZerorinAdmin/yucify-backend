# AdSpy Page Resolve Debug Guide

## Error: "Unable to resolve advertiser page ID via GraphQL or Ads Library"

When selecting a page (e.g. Adidas) and the resolver fails, use this guide to debug.

---

## Potential Causes

### 1. **Wrong search term** (e.g. "adidas account" instead of "adidas")
- **Cause**: Facebook search results include badge text ("account", "verified id") in the page name.
- **Fix**: `cleanPageName()` now strips "account", "verified", "verified id", "official page".
- **Verify**: Check terminal for `[resolver] GraphQL failed, trying Ads Library fallback: { searchTerms: [...] }` — terms should be clean (e.g. `["adidas", "AdidasUS"]`).

### 2. **Ads Library keyword search returns retailer ads, not brand**
- **Cause**: Searching "adidas" in India may return Totalsports (retailer) ads first. Our code takes the **first** `view_all_page_id` link — which could be Totalsports, not Adidas.
- **Impact**: We might resolve to wrong page_id (Totalsports) or fail if DOM structure differs.
- **Verify**: Check `[resolver] Ads Library fallback OK` — which page_id was returned?

### 3. **Ads Library DOM structure changed**
- **Cause**: Facebook may have updated the Ads Library HTML. Our selectors look for `a[href*="view_all_page_id"]` or `a[href*="page_id="]`.
- **Verify**: Check `[resolver] Ads Library fallback: no page_id { linkCount: N }` — if `linkCount: 0`, no matching links found.
- **Fix**: Inspect Ads Library page structure; update selectors in `resolveViaAdsLibrary()`.

### 4. **GraphQL finds wrong node first**
- **Cause**: `findPageNode()` recursively scans JSON and returns the **first** object with `id` + `name`/`username`. The viewer (logged-in user) or sidebar content may appear before the page node.
- **Verify**: Check `[resolver] GraphQL page: { id, name }` — is it the correct page or user/sidebar?
- **Fix**: Add context-aware filtering (e.g. prefer nodes matching the URL we're visiting).

### 5. **Content not loaded in time**
- **Cause**: Ads Library is a React SPA; links may load asynchronously. We wait 4s + networkidle + 2 scrolls.
- **Verify**: Increase delays or add explicit wait for `a[href*="view_all_page_id"]`.

### 6. **Login wall or rate limiting**
- **Cause**: Facebook may show login prompt or throttle requests when not logged in / too many requests.
- **Verify**: Run with `ADSPY_HEADLESS=false` and watch the browser. Check for login prompts.
- **Fix**: Use `ADSPY_FACEBOOK_PROFILE` for persistent login.

### 7. **Country filter affects results**
- **Cause**: Ads Library keyword search with `country=IN` may return different advertisers than `country=ALL`. In India, Totalsports (retailer) may rank higher than Adidas (brand).
- **Verify**: Try `country=ALL` for resolution to get more global results.

---

## Debug Steps (Structured)

### Step 1: Run resolve debug endpoint
```bash
# Test resolution for Adidas with India filter
curl "http://localhost:3000/api/adspy/debug?test=resolve&page_url=facebook.com/adidas&page_name=adidas&country=IN" \
  -H "Cookie: <your-auth-cookie>"
```

Watch terminal for:
- `[resolver] GraphQL page:` — did GraphQL find a node?
- `[resolver] GraphQL failed, trying Ads Library fallback:` — which search terms?
- `[resolver] Ads Library fallback OK:` or `no page_id` — result of fallback.

### Step 2: Check search terms
In the logs, `searchTerms` should be `["adidas", "AdidasUS"]` (or similar). If you see `["adidas account"]`, `cleanPageName` is not applied correctly.

### Step 3: Test Ads Library manually
1. Open https://www.facebook.com/ads/library/?search_type=keyword&q=adidas&country=IN
2. Inspect the page: do you see `view_all_page_id=` in any link hrefs?
3. Check if the first ad is from Adidas or a retailer (Totalsports).

### Step 4: Test with known page_id
If you have a known Adidas page_id (e.g. from scraper's KNOWN_PAGES: `205865296158`), skip resolution and use it directly to verify ads load:
```bash
curl "http://localhost:3000/api/adspy/ads?page_id=205865296158&country=IN"
```

### Step 5: Run full flow with visible browser
```bash
ADSPY_HEADLESS=false npm run dev
```
Select Adidas + India, watch the browser. See which URL it opens and what appears.

---

## Quick Fixes Applied

1. **cleanPageName** now removes "account" — "adidas account" → "adidas".
2. **Search terms** — we try `cleanPageName(pageNameHint)` first, then URL-derived term.
3. **Debug logging** — `[resolver]` logs in terminal for each step.
4. **Debug endpoint** — `?test=resolve&page_url=...&page_name=...&country=...` to test resolution in isolation.

---

## Known Page IDs (from scraper fallback)

| Brand    | page_id     |
|----------|-------------|
| Nike     | 15087023444 |
| Coca-Cola| 40796308305 |
| adidas   | 205865296158|

If resolution fails for Adidas, consider adding a fallback to use `205865296158` when search term matches "adidas".
