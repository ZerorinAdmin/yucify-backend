# Scraping System Requirements
Project: Competitor Ad Analysis Tool

## Objective
Build a scraping system that retrieves Facebook Ads Library ads for a specific competitor page when a user requests analysis. The system must minimize scraping frequency by caching results for 24 hours.

The scraper will collect ads only for the selected competitor page, not for the entire ads library.

---

# Core User Flow

1. User searches competitor name
2. Backend fetches page suggestions from Ads Library
3. User selects correct page
4. Backend checks cache
5. If ads were scraped within last 24 hours:
   return cached data
6. If not:
   run scraper
7. Store scraped ads in database
8. Return data for analysis

---

# Functional Requirements

## Competitor Search

User types competitor name.

Backend must fetch page suggestions containing:

- page_name
- page_id
- page_icon
- verified_status

Return these results to frontend dropdown.

Example response:

[
  {
    "page_name": "Nike",
    "page_id": "15087023444",
    "icon": "url"
  }
]

---

# Ads Scraping

Once a page is selected, scraper must open:

https://www.facebook.com/ads/library/?view_all_page_id={page_id}

Scraper must collect between **20 and 40 ads maximum**.

Do not scrape entire ad library.

---

# Data Fields To Extract

For each ad collect:

- ad_id
- page_id
- ad_text
- image_url
- video_url
- call_to_action
- landing_page_url
- ad_start_date
- ad_snapshot_url
- scraped_at timestamp

---

# Persistent Browser Profile (One-Time Login)

Facebook shows a login wall for unauthenticated requests. Use a persistent Playwright profile so the scraper reuses your logged-in session.

## Setup Steps (One Time Only)

1. **Set env vars** in `.env.local`:
   ```
   ADSPY_FACEBOOK_PROFILE=./facebook-profile
   ADSPY_HEADLESS=false
   ```

2. **Run the app** (or trigger any AdSpy search/ads request). The browser opens visibly.

3. **Log in to Facebook** manually in the opened browser. The scraper waits up to 3 minutes for you to log in before proceeding.

4. **Close the browser** when done (or let the scraper finish). The session is stored in `facebook-profile/`.

5. **Switch to headless** for normal use:
   ```
   ADSPY_HEADLESS=true
   ```
   (or remove `ADSPY_HEADLESS` — it defaults to `true`)

6. Run scraper normally. Ads load because the profile has a valid session.

## How It Works

- `launchPersistentContext("./facebook-profile", { headless: true })` uses a real Chrome-like profile.
- Cookies and login state persist across restarts.
- No need to reload cookies manually.

---

# Scraping Safety Rules

To avoid Facebook blocking:

1. Maximum ads collected per run:
   40

2. Scroll delay between actions:
   2-4 seconds

3. Maximum concurrent scraper workers:
   2

4. User rate limit:
   One competitor analysis every 10 seconds

5. Use random user agent per browser session

---

# Cache Strategy

Before running scraper check:

competitor_ads table

Query:

SELECT scraped_at
FROM competitor_ads
WHERE page_id = ?
ORDER BY scraped_at DESC
LIMIT 1

Logic:

if scraped_at < 24 hours
    return cached ads
else
    run scraper

---

# Database Schema

## Table: competitor_ads

Fields:

id (uuid)
page_id (text)
ad_id (text unique)
ad_text (text)
image_url (text)
video_url (text)
cta (text)
landing_page_url (text)
ad_start_date (timestamp)
ad_snapshot_url (text)
scraped_at (timestamp)

Unique constraint on ad_id.

---

## Table: competitors

Stores competitor metadata.

Fields:

page_id
page_name
page_icon
first_scraped_at

---

## Table: competitor_requests

Tracks usage and scraping metrics.

Fields:

id
user_id
page_id
source (cache or scrape)
created_at

---

# Logging

Every analysis request must log:

user_id
page_id
source
timestamp

Source values:

cache
scrape

---

# Queue System

Scraping jobs must run through a queue system.

Flow:

User request
→ Cache check
→ If needed create scraping job
→ Worker runs scraper
→ Store results
→ Return analysis

---

# Technology Stack

Backend: Node.js  
Scraper: Playwright  
Queue: BullMQ or Redis queue  
Database: PostgreSQL or Supabase  

---

# Performance Targets

Expected capacity:

100 users
200 competitor analyses per day

With caching enabled:

Only ~50 scraping runs per day.

---

# Output

Scraper must return structured JSON:

{
  "page_id": "...",
  "ads": [
    {
      "ad_id": "...",
      "ad_text": "...",
      "image_url": "...",
      "video_url": "...",
      "cta": "...",
      "landing_page": "...",
      "start_date": "..."
    }
  ]
}