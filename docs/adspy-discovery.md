# Ads Library Discovery (Option B)

Discovery-first approach: capture and document Meta's real HTML/DOM structure **before** changing extraction logic.

## What It Does

1. **Loads** the Ads Library page (same URL as scraper)
2. **Scrolls** to trigger lazy-loaded content
3. **Captures** raw HTML
4. **Analyzes**:
   - Every `ad_archive_id` occurrence: byte offset, surrounding context, script block
   - Whether `display_resources`, `child_attachments`, `video_preview_url` exist in the chunk around each ad
   - Distance from `ad_archive_id` to creative markers
5. **Captures DOM**:
   - Link count, links with `?id=` param
   - Container hierarchy (article, pagelet, group)
   - Ads per container, imgs per container
6. **Produces** a report with recommendation

## How to Run

### CLI (recommended)

```bash
# Default page (Nike), output to docs/discovery-report-*.json
npm run discovery

# Custom page and country
npm run discovery -- --page_id=617324415443569 --country=US

# Save to specific file
npm run discovery -- --page_id=15087023444 --output=my-report.json

# Markdown format
npm run discovery -- --page_id=15087023444 --output=report.md --format=md
```

### Debug API

```
GET /api/adspy/debug?test=discovery&page_id=15087023444&country=US
```

Requires auth. Returns full report in `data`.

## Environment

- `ADSPY_FACEBOOK_PROFILE` — path to persistent browser profile (for logged-in session)
- `ADSPY_HEADLESS=false` — show browser (useful for login setup)

## Report Fields

| Section | Purpose |
|--------|---------|
| `summary.creative_on_list_page` | `yes` / `partial` / `no` |
| `summary.recommendation` | What to do next |
| `html.ad_analyses` | Per-ad: offset, has_creative_in_chunk, distances |
| `html.creative_markers_global` | Counts and offsets of display_resources, child_attachments, video_preview_url |
| `dom.link_details` | Per-link: container, ads_in_same_container, imgs |

## Next Steps After Discovery

1. **If `creative_on_list_page: yes`** — Design extraction for the exact locations in `ad_analyses`
2. **If `partial`** — Use chunk-based extraction + snapshot fallback for ads without creative
3. **If `no`** — Use snapshot-first: list page for IDs only, snapshot for creative
