-- Competitor ads scraping cache (shared across users)
create table public.competitor_ads (
  id uuid primary key default gen_random_uuid(),
  page_id text not null,
  ad_id text not null unique,
  ad_text text not null default '',
  image_url text,
  video_url text,
  cta text,
  landing_page_url text,
  ad_start_date timestamptz,
  ad_snapshot_url text,
  is_active boolean,
  collation_id text,
  collation_count int,
  publisher_platforms text[],
  industry text,
  carousel_urls jsonb not null default '[]'::jsonb,
  display_format text,
  ad_headline text,
  ad_description text,
  scraped_at timestamptz not null default now()
);

alter table public.competitor_ads enable row level security;

create policy "Authenticated users can read competitor_ads"
  on public.competitor_ads for select
  using (auth.role() = 'authenticated');

create policy "Authenticated users can insert competitor_ads"
  on public.competitor_ads for insert
  with check (auth.role() = 'authenticated');

create policy "Authenticated users can update competitor_ads"
  on public.competitor_ads for update
  using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

create index competitor_ads_page_id_idx on public.competitor_ads(page_id);
create index competitor_ads_scraped_at_idx on public.competitor_ads(page_id, scraped_at desc);
create index competitor_ads_collation_id_idx on public.competitor_ads(collation_id) where collation_id is not null;

----------------------------------------------------------------------
-- Competitor pages metadata
----------------------------------------------------------------------
create table public.competitors (
  id uuid primary key default gen_random_uuid(),
  page_id text not null unique,
  page_name text not null default '',
  page_icon text,
  first_scraped_at timestamptz not null default now()
);

alter table public.competitors enable row level security;

create policy "Authenticated users can read competitors"
  on public.competitors for select
  using (auth.role() = 'authenticated');

create policy "Authenticated users can insert competitors"
  on public.competitors for insert
  with check (auth.role() = 'authenticated');

create policy "Authenticated users can update competitors"
  on public.competitors for update
  using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

----------------------------------------------------------------------
-- Per-user scrape request log (for rate-limiting)
----------------------------------------------------------------------
create table public.competitor_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users on delete cascade not null,
  page_id text not null,
  source text not null check (source in ('cache', 'scrape')),
  created_at timestamptz not null default now()
);

alter table public.competitor_requests enable row level security;

create policy "Users can view own competitor_requests"
  on public.competitor_requests for select
  using (auth.uid() = user_id);

create policy "Users can insert own competitor_requests"
  on public.competitor_requests for insert
  with check (auth.uid() = user_id);

create index competitor_requests_user_id_idx on public.competitor_requests(user_id);
create index competitor_requests_user_source_created_idx
  on public.competitor_requests (user_id, source, created_at desc);

----------------------------------------------------------------------
-- Advertiser page discovery cache
----------------------------------------------------------------------
create table public.advertiser_pages (
  id uuid primary key default gen_random_uuid(),
  search_query text not null,
  page_id text not null,
  page_name text not null default '',
  page_url text not null,
  logo text,
  verified boolean not null default false,
  created_at timestamptz not null default now(),
  unique(search_query, page_url)
);

alter table public.advertiser_pages enable row level security;

create policy "Authenticated users can read advertiser_pages"
  on public.advertiser_pages for select
  using (auth.role() = 'authenticated');

create policy "Authenticated users can insert advertiser_pages"
  on public.advertiser_pages for insert
  with check (auth.role() = 'authenticated');

create index advertiser_pages_search_query_idx on public.advertiser_pages(lower(trim(search_query)));
create index advertiser_pages_page_id_idx on public.advertiser_pages(page_id);
