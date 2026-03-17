# AdSpy Debugging Plan: Graphics & Description Inconsistency

Use this checklist to debug missing graphics or descriptions in ad results.

---

## Graphics Debugging Plan

| # | Cause | Check | How to Debug |
|---|-------|-------|--------------|
| **A** | **Data source path (GraphQL vs HTML)** | Which path ads came from; if GraphQL returns ads with empty media | `?test=graphics_cause_a` — Fallback: snapshot page (network capture → HTML → DOM) for ads without media |
| B | Meta JSON structure varies per ad type | Different structures for single/carousel/video | `diagnoseGraphicsUrls` → `html_snippets.sample_json_chunk` |
| C | Lazy loading / DOM not ready | Images use `data-src` or `srcset` only | `diagnoseGraphicsUrls` → `img_elements.with_src` vs `with_srcset` |
| D | HTML chunk boundaries | Media URLs outside chunk around `ad_archive_id` | Inspect chunk size vs URL position in HTML |
| E | `isAdMediaUrl` filtering | Valid URLs rejected by filter | Log URLs in `extractAdsFromHtml` |
| F | Carousel-specific structure | `cards[]`, `child_attachments` not matched | Search `sample_json_chunk` for carousel keys |

---

## Description Debugging Plan

| # | Cause | Check | How to Debug |
|---|-------|-------|--------------|
| **A** | Text in different fields | Meta uses `primary_text`, `body`, `link_description`, arrays | Search `sample_json_chunk` for text keys |
| B | Chunk boundaries | Text far from `ad_archive_id` | Inspect chunk size vs text position |
| C | Variation-specific text | Collated ads have per-variation text | Check `collated_results` structure in GraphQL |
| D | DOM vs HTML merge | Wrong text from DOM (e.g. "No caption") | Compare `h.ad_text` vs `dom.ad_text` per ad |

---

## Media Capture Flow

1. GraphQL ads fetch
2. Scroll library page
3. Capture creatives via network (fbcdn, scontent, video.xx)
4. If creative missing → assign from network pool (list page)
5. If still missing → open snapshot page
6. Extract fallback media (network → HTML → DOM)

## Media Causes 1–18

Run `?test=media_causes&page_id=...&country=...` to verify all 18 potential causes for media fetch failure:

| # | Cause | Status |
|---|-------|--------|
| 1 | HTML chunk too small | pass/fail/unknown |
| 2 | Meta JSON structure changed | pass/fail/unknown |
| 3 | URLs in different fields | pass/fail/unknown |
| 4 | Lazy loading | pass/fail/unknown |
| 5 | DOM structure changed | pass/fail/unknown |
| 6 | No links with ?id= | pass/fail/unknown |
| 7 | isAdMediaUrl too strict | pass/fail/unknown |
| 8 | isAdMediaUrl too loose (truncated) | pass/fail/unknown |
| 9 | graph.facebook.com exclusion | pass |
| 10 | DB column | ruled out |
| 11 | Regex captures partial URL | pass/fail/unknown |
| 12 | Chunk boundary cuts URL | pass/fail/unknown |
| 13 | API/insert truncation | pass/unknown |
| 14 | Images not loaded for correlation | pass/fail/unknown |
| 15 | Network listener timing | pass/fail/unknown |
| 16 | ad_id not in DOM | pass/fail/unknown |
| 17 | Wrong field mapping | manual |
| 18 | Null overwriting | manual |

## Quick Reference

- **Graphics diagnostics**: `?test=graphics&page_id=...`
- **Graphics Cause A (data source)**: `?test=graphics_cause_a&page_id=...`
- **Media causes 1–18**: `?test=media_causes&page_id=...&country=...`
- **Ads sample**: `?test=ads&page_id=...`
- **Page diagnostics**: `?test=diagnose&page_id=...`
