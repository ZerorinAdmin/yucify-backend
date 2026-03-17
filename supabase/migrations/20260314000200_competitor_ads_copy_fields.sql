alter table public.competitor_ads
  add column if not exists ad_headline text,
  add column if not exists ad_description text;
