-- Add variation grouping and metadata for ad detail panel
alter table public.competitor_ads
  add column if not exists collation_id text,
  add column if not exists collation_count int,
  add column if not exists publisher_platforms text[],
  add column if not exists industry text;

create index if not exists competitor_ads_collation_id_idx on public.competitor_ads(collation_id) where collation_id is not null;

-- Allow upsert (update on conflict)
create policy "Authenticated users can update competitor_ads"
  on public.competitor_ads for update
  using (auth.role() = 'authenticated');
