# Mismatch Diagnostic Findings

## Summary

Ran `scripts/diagnose-mismatch.ts --quick` on `docs/ads-library.html` for ads 3093932810784164, 1957280865133857, 1118973763485810.

---

## 1. Ad ID Occurrences

| Ad ID | Occurrences | Index Used (last) |
|-------|-------------|-------------------|
| 3093932810784164 | 1 | 1810091 |
| 1957280865133857 | 1 | 1816671 |
| 1118973763485810 | 1 | 1745534 |

**Finding:** Each ad appears once. No "last occurrence in wrong context" issue for these ads.

---

## 2. Extracted vs Meta (Expected)

| Ad ID | Our ad_text | Our video | Meta (from user screenshot) |
|-------|-------------|-----------|-----------------------------|
| **3093932810784164** | "HYROS is the dominant tracking solution for coaching courses..." | AQMeGQ3bp0aH82... | "Our Tracking + AI factually improves ad ROI. By a lot. Verified by 5000+ businesses..." |
| **1957280865133857** | "Our Tracking + AI factually improves ad ROI. By a lot. Verified by 5000+ businesses..." | null | (same text; video expected) |
| **1118973763485810** | "Our Tracking + AI factually improves ad ROI...Verified by 3000+ businesses" | AQOlP_15iph... | ✓ (correct) |

---

## 3. Root Cause

### Description mismatch (3093932810784164)

- **Our extraction:** "HYROS is the dominant tracking solution..." (belongs to **previous** ad 1696855494351710)
- **Correct for 3093932810784164:** "Our Tracking + AI factually improves ad ROI..."
- **Cause:** `textChunk = [prevIndex, nextIndex]` spans two ads. `textChunk.match(re)` returns **first** match, which is from the previous ad.

### Media mismatch (3093932810784164 ↔ 1957280865133857)

- **3093932810784164** has video (AQMeGQ3bp0aH82) – may belong to **1957280865133857**
- **1957280865133857** has video null – we use only "after" ad_id; if its video is before its ad_id or in a tight block, we miss it
- **Cause:** Either (a) 3093932810784164 is picking a video from the block between 1696855494351710 and itself (before its ad_id – we shouldn't do that anymore), or (b) chunk boundaries / position mapping is wrong for this pair.

### Text chunk patterns

- Diagnostic reported "First primary_text: none", "First ad_creative_body: none" – our bodyPatterns may use different keys (e.g. `body`, `ad_copy`). Text is still being extracted from other patterns.

---

## 4. Recommended Fixes

| Issue | Fix |
|-------|-----|
| **Description first-match** | Use prefer-after for text (same as video): prefer text after `ad_id`, fallback to before only if none after. *(User asked not to change description for now.)* |
| **Video on 3093932810784164** | Confirm whether AQMeGQ3bp0aH82 is before or after 3093932810784164. If before, we should not pick it (we already removed before-fallback). If after, it may be correct. |
| **Video null on 1957280865133857** | Its video may be in the block after 3093932810784164. With "after only", 1957280865133857 would look in [1816671, 1828746]. If the video is before 1816671 (in 3093932810784164's block), we correctly skip it for 1957280865133857. The video might be getting assigned to 3093932810784164 from its "after" block – need to verify which ad that video belongs to on Meta. |

---

## 5. How to Run

```bash
# Quick (skips slow chunk overlap)
npx tsx scripts/diagnose-mismatch.ts --html=docs/ads-library.html --page_id=617324415443569 --ad_ids=3093932810784164,1957280865133857 --quick --output=docs/diagnose-mismatch-result.txt

# Full (includes chunk overlap – may OOM on large HTML)
npx tsx scripts/diagnose-mismatch.ts --html=docs/ads-library.html --page_id=617324415443569 --ad_ids=3093932810784164 --output=docs/diagnose-full.txt
```

---

## 6. Source Tracing (Implemented)

When `ADSPY_DEBUG_SOURCE=1` or `?debug_source=1` on the debug API, each ad gets `_debug_source`:

- `ad_text`: graphql | dom | html | snapshot | merge
- `image_url` / `video_url` / `carousel_urls`: graphql | dom | html | snapshot | cdn_correlation | positional
- `cta`: graphql | dom | html | snapshot | merge

**Usage:**
```bash
# Env var (scraper + terminal logs)
ADSPY_DEBUG_SOURCE=1 npx tsx -e "require('./src/lib/adspy/scraper').scrapePageAds('617324415443569','US').then(r=>console.log(JSON.stringify(r.ads[0]._debug_source)))"

# Debug API
GET /api/adspy/debug?test=ads&page_id=617324415443569&debug_source=1
```
