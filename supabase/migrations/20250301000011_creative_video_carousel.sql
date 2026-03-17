alter table public.ad_creatives add column if not exists video_url text not null default '';
alter table public.ad_creatives add column if not exists carousel_urls jsonb not null default '[]'::jsonb;
