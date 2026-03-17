# Media Mismatch Investigation: Ad 1118973763485810

## Issue

Ad **1118973763485810** shows a different video in the dashboard than on Meta Ads Library.

**Additional context:** Ad **1297720635316986** is displaying the incorrect video — that video should have been displayed on ad **1118973763485810**. So the videos are shifted: 1118973763485810 gets the wrong video (from the previous ad), and 1297720635316986 gets 1118973763485810’s correct video.

---

## Root Cause: Nearest-Match Picks Video from Previous Ad

### What We Found

The diagnostic for ad `1118973763485810` shows:

| Video | Position | Distance from ad_id | Direction | Likely owner |
|-------|----------|---------------------|------------|--------------|
| [0] | 1742118 | 3416 | **Before** ad_id | Ad 1816728115937660 (prev) |
| [1] | 1743683 | **1851** | **Before** ad_id | Ad 1816728115937660 (prev) |
| [2] | 1748661 | 3127 | **After** ad_id | **Ad 1118973763485810 (target)** ✓ |
| [3] | 1750224 | 4690 | After ad_id | Ad 1297720635316986 (next) |

**Ad positions in HTML:**
- `1816728115937660` at index 1739002 (previous ad)
- `1118973763485810` at index 1745534 (target)
- `1297720635316986` at index 1752090 (next ad)

### The Bug

`extractAdsFromHtml` uses **nearest-match** for video (sort by distance, pick closest). The nearest video is at position 1743683 with distance **1851** — but that video lies **before** our ad_id, in the block between the previous ad and our ad. It belongs to ad **1816728115937660**, not 1118973763485810.

The **correct** video for 1118973763485810 is at 1748661 (distance 3127) — the first video **after** our ad_id, in the block between our ad and the next ad.

### Why Nearest-by-Distance Fails

When ads are laid out sequentially in HTML:

```
[prev_ad_id] ... [prev_ad's video at 1743683] ... [our_ad_id at 1745534] ... [our video at 1748661] ... [next_ad_id]
```

The previous ad's creative can be **physically closer** (1851 chars) than our ad's creative (3127 chars). Pure nearest-match picks the wrong one.

### Cascade effect

Because 1118973763485810 picks the wrong video (from the previous ad), its correct video at 1748661 is left “unclaimed” in the chunk. Ad 1297720635316986 then picks that video (1748661) — either because it’s the first match in its chunk or because of how the chunk boundaries overlap. So 1297720635316986 ends up showing the video that belongs to 1118973763485810. Fixing the attribution for 1118973763485810 (e.g. by preferring videos after `ad_id`) should also correct 1297720635316986.

---

## Data Flow (No Code Changes)

1. **List page extraction** (`extractAdsFromHtml`): Uses chunk 20k before, 30k after ad_id. Video uses nearest-match by distance.
2. **Snapshot fetch** (when media missing): Uses `extractAdFromSnapshotPage` — which uses **first match** for video. Snapshot pages are single-ad, so first match is usually correct there.
3. **GraphQL/DOM**: When available, these are preferred. GraphQL gets data from `collated_results` (structured), which should be correct.

For ad 1118973763485810, the list-page HTML extraction is the likely source of the wrong video (nearest-match picking prev ad's video).

---

## Fix (Implemented)

**Media matching:** Use only video/image **after** ad_id. No fallback to "before" (avoids picking previous ad's creative). If no match after ad_id, leave null; snapshot/DOM can fill in.

**Carousel:** Improved snapshot wait (`load`, wait for carousel DOM), DOM extraction via `extractCarouselFromSnapshotDom`, and expanded carousel selectors in list-page DOM extraction.

---

## Diagnostic Commands

```bash
npx tsx scripts/diagnose-ad-chunk.ts --html=docs/ads-library.html --page_id=617324415443569 --ad_id=1118973763485810 --output=docs/diagnose-1118973763485810.txt
```

---

## Related

- `docs/ad-id-mismatch-root-cause.md` — original analysis for ad 1120053313555435 (first-match issue)
- `docs/adspy-media-flow.md` — extraction flow
- `src/lib/adspy/ads-library-extract.ts` — `extractAdsFromHtml` (lines 1011–935), video nearest-match (lines 1163–1186)
