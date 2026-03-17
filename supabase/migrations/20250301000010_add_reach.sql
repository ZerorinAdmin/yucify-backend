alter table public.ad_metrics add column if not exists reach bigint not null default 0;
