-- Page Discovery cache: store search results per query to avoid re-scraping
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

create index advertiser_pages_search_query_idx on public.advertiser_pages(lower(trim(search_query)));
create index advertiser_pages_page_id_idx on public.advertiser_pages(page_id);

alter table public.advertiser_pages enable row level security;

create policy "Authenticated users can read advertiser_pages"
  on public.advertiser_pages for select
  using (auth.role() = 'authenticated');

create policy "Authenticated users can insert advertiser_pages"
  on public.advertiser_pages for insert
  with check (auth.role() = 'authenticated');
