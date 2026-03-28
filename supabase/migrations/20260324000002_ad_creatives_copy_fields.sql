alter table public.ad_creatives add column if not exists headline text not null default '';
alter table public.ad_creatives add column if not exists description text not null default '';
alter table public.ad_creatives add column if not exists cta_type text not null default '';
