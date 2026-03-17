-- Add carousel_urls for multi-image ads (carousel format)
alter table public.competitor_ads
  add column if not exists carousel_urls jsonb not null default '[]'::jsonb;
