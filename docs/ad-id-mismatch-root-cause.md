# Ad ID Mismatch Root Cause Analysis

## Issue

Ad ID `1120053313555435`:
- **Meta Ads Library:** Carousel ad with copy "HYROS increases ad ROI by at least 15%. Guaranteed..."
- **Our app:** Video ad with copy "SaaS companies on average see a 15%+ increase in ad revenue..."

Same ad_id, wrong creative and description.

---

## Root Cause: Chunk Overlap + First-Match Wins

### 1. Chunk boundaries are too large

In `extractAdsFromHtml` (ads-library-extract.ts):

```ts
const start = Math.max(0, index - 30000);
const end = Math.min(html.length, index + 50000);
let chunk = html.slice(start, end);
```

For ad `1120053313555435` at index `1771041`:
- Chunk = `[1741041, 1821041]` = **80,000 characters**
- This span includes **multiple ads** (from raw-hyros.json ad_archive_id_positions):
  - 10093278074132067 @ 1760170
  - **1120053313555435 @ 1771041** (target)
  - 734381212760182 @ 1783135
  - 1696855494351710 @ 1795285
  - 3093932810784164 @ 1807387
  - 1957280865133857 @ 1813967
  - 1252880530186674 @ 1826042
  - ... and more

So the chunk contains creative data from **6–8 different ads**.

### 2. Video extraction uses first match only

```ts
const videoMatch = chunk.match(re);
if (videoMatch?.[1]) {
  videoUrl = normalizeMediaUrl(videoMatch[1]);
  break;
}
```

`chunk.match(re)` returns the **first** occurrence of `video_sd_url`/`video_hd_url` in the chunk. That first video may belong to:
- The **previous** ad (10093278074132067), or
- Any ad that appears **before** our target in the chunk

The creative audit shows `video_hd_url` appears 176 times in the full HTML. Our 80k chunk likely contains dozens of videos. We pick the first one, which is almost certainly from a different ad.

### 3. Text extraction has the same problem

```ts
const textChunk = html.slice(Math.max(0, prevIndex), nextIndex);
// ...
const bodyMatch = textChunk.match(re);
```

`textChunk` spans from the previous ad to the next ad (~23k chars for our case). It includes content from **both** the previous ad and our target. `textChunk.match(re)` returns the **first** match, which can be from the previous ad.

### 4. Carousel data is absent in listing HTML

The creative audit shows:
- `child_attachments: 0`
- `carousel_cards: 0`
- `display_resources: 0`

So the listing page HTML has **no** carousel structure. The carousel for `1120053313555435` exists on Meta’s snapshot page, but our snapshot verification showed `child_attachments=0` on snapshot pages too (possibly loaded via JS after our capture). We never get carousel data, so we fall back to video—and due to chunk overlap, we pick a video from another ad.

---

## Summary

| Factor | What happens |
|--------|---------------|
| **Chunk size** | 80k chars spans 6–8 ads |
| **Video regex** | `chunk.match()` → first video in chunk |
| **First video** | Belongs to a different ad (e.g. previous) |
| **Text regex** | `textChunk.match()` → first text in block |
| **First text** | Can belong to previous ad |
| **Carousel** | Not present in listing HTML; snapshot has none in our capture |

**Root cause:** We assign the **first** video and **first** text in a large, overlapping chunk to each ad. Because the chunk spans multiple ads, we often assign another ad’s creative to the target ad.

---

## How to verify

1. **Save HTML:**
   ```bash
   npx tsx scripts/save-ads-html.ts --page_id=617324415443569 --country=US --output=docs/ads-library.html
   ```

2. **Run diagnostic:**
   ```bash
   npx tsx scripts/diagnose-ad-chunk.ts --html=docs/ads-library.html --page_id=617324415443569 --ad_id=1120053313555435
   ```

3. **Or use full capture** (may OOM):
   ```bash
   npm run raw_structures -- --page_id=617324415443569 --country=US --diagnose_ad_id=1120053313555435 --output=docs/raw.json
   ```

The diagnostic will show:
- How many ads are in the chunk
- All video matches and their distances from the target ad_id
- Which video we pick (first) vs. which is nearest
- Same for text

---

## Fix direction (for later)

1. **Use nearest match, not first:** For each creative type (video, image, text), find all matches in the chunk and pick the one **closest** to the ad_id index.
2. **Tighten chunk:** Prefer a smaller window (e.g. block between prev/next ad) when it contains creative, and only expand when necessary.
3. **Carousel:** Investigate why snapshot pages show no carousel; may need to wait for JS or use a different extraction approach.
