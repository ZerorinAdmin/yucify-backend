-- Index for efficient daily scrape count: user_id + source + created_at
-- Used by getScrapeCountToday to count source='scrape' per user per day.
create index if not exists competitor_requests_user_source_created_idx
  on public.competitor_requests (user_id, source, created_at desc);
