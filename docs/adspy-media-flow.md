# AdSpy Media Capture Flow

## Architecture (GraphQL + DOM + HTML + CDN + Snapshot)

| Step | Method | Purpose |
|------|--------|---------|
| **1** | GraphQL interception | **Primary** – capture ads from GraphQL responses (collated_results, snapshot) |
| **2** | DOM extraction | Fallback – ad_id, media, caption, CTA from rendered list page DOM |
| **3** | HTML extraction | Fallback – when DOM finds 0 ads with id (parse `ad_archive_id` from JSON) |
| **4** | CDN correlation | Media recovery – capture fbcdn/scontent URLs during load, correlate to ad IDs |
| **5** | HTML merge | Fill missing description, video_url, carousel_urls, cta from main page HTML JSON |
| **6** | Snapshot fetch | **Enrichment** – fetch single-ad page for ads missing media, description, or CTA (up to 15) |

## Flow

### 1. GraphQL Extraction (Primary when available)
1. Intercept GraphQL POST responses during page load and scroll
2. Parse `search_results_connection.edges[].node.collated_results[]`
3. Extract ad_archive_id, snapshot (body, images, video, CTA) per ad
4. Use GraphQL ads when available; otherwise fall back to DOM/HTML

### 2. DOM Extraction (Fallback when links have id)
1. Load Ads Library page, wait for feed (`ad_archive_id` or ads/library links)
2. Scroll 10 rounds, force `img.loading = "eager"`, 5 more scrolls, 3s wait
3. `extractAdsFromDomInPage()` – two strategies:
   - **Strategy 1**: Links to ads/library → get smallest container per link, extract all
   - **Strategy 2**: Img with scontent/fbcdn → get container; supplement media for existing or add new
4. If DOM returns ads with `ad_id` → use them

### 3. HTML-First (when links lack id or HTML has more ads)
- Prefer HTML when DOM has 0 ads with `ad_id` OR when HTML has ≥3 more ads than DOM
- HTML has `ad_archive_id` in JSON → full ad count (30+ vs 2 from DOM fallback)
- Logo/small image exclusion via `pickBestImageUrl`; metadata filtered from descriptions
- Text/CTA use ad block only (prevIndex→nextIndex) to avoid chunk overlap
- Full-HTML scan: when chunk has no creative, search for `ad_archive_id` in other script blocks

### 4. CDN Correlation (Media Recovery)
- Capture fbcdn/scontent URLs from network responses during page load and scroll
- For ads without media: `correlateUrlsToAdIds(capturedUrls)` – maps URLs to ad IDs via DOM
- **Positional fallback**: when correlation misses (ad_id not in DOM), assign network image URLs by order

### 5. HTML Merge
- For ads missing description, video_url, carousel_urls, cta → fill from `extractAdsFromHtml` by ad_id
- Invalid CTAs (Filters, Sort, etc.) treated as empty so HTML can replace

### 6. Snapshot Fetch (default on)
- Fetches snapshot for ads missing media, description, or CTA (up to 15 per run)
- Uses `extractAdFromSnapshotPage` for full ad data; `extractMediaFromAdDetailHtml` as fallback
- Set `ADSPY_FETCH_SNAPSHOT=false` to disable

### Extracted Fields
- `ad_id`, `ad_text`, `image_url`, `video_url`, `carousel_urls`, `cta`, `landing_page_url`

## Verification

**Debug endpoints (requires auth):**
```
GET /api/adspy/debug?test=raw_structures&page_id=617324415443569&country=US
GET /api/adspy/debug?test=graphics_cause_a&page_id=...&country=US
```

**CLI (no auth, uses Playwright):**
```bash
PLAYWRIGHT_BROWSERS_PATH=~/Library/Caches/ms-playwright npm run raw_structures -- --page_id=617324415443569 --country=US --output=docs/raw-structures-debug.json
```

Inspect `docs/raw-structures-debug.json`:
- `graphql_structure_sample` – actual Meta GraphQL response shape
- `sample_raw_structures` – video/collation/child_attachments per collated item (when GraphQL has ads)
- `extracted_ads_summary` – video_url, carousel_count per ad
- `html_first_ad_chunk` – whether first ad chunk has video/child_attachments
