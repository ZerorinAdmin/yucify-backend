-- Carousel image URLs for Meta creatives (jsonb array of strings).
-- Idempotent: safe if 20250301000011_creative_video_carousel.sql already ran.
alter table public.ad_creatives add column if not exists carousel_urls jsonb not null default '[]'::jsonb;
