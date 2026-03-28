-- Cache for image-ad overlay text extracted via OpenAI Vision to avoid repeated OCR costs.
-- Scoped per user to stay secure under RLS.

create table if not exists public.ad_creative_overlay_text (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users (id) on delete cascade not null,
  ad_id text not null,
  -- Deterministic key built from creative image URLs for cache invalidation.
  creative_key text not null default '',
  -- Extracted overlay text only (excludes packaging/logo text).
  ocr_text text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists ad_creative_overlay_text_user_ad_uidx
  on public.ad_creative_overlay_text (user_id, ad_id);

create index if not exists ad_creative_overlay_text_user_updated_idx
  on public.ad_creative_overlay_text (user_id, updated_at desc);

alter table public.ad_creative_overlay_text enable row level security;

drop policy if exists "Users can view own ad_creative_overlay_text" on public.ad_creative_overlay_text;
drop policy if exists "Users can insert own ad_creative_overlay_text" on public.ad_creative_overlay_text;
drop policy if exists "Users can update own ad_creative_overlay_text" on public.ad_creative_overlay_text;

create policy "Users can view own ad_creative_overlay_text"
  on public.ad_creative_overlay_text for select
  using (auth.uid() = user_id);

create policy "Users can insert own ad_creative_overlay_text"
  on public.ad_creative_overlay_text for insert
  with check (auth.uid() = user_id);

create policy "Users can update own ad_creative_overlay_text"
  on public.ad_creative_overlay_text for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

comment on table public.ad_creative_overlay_text is 'Per-user cache of overlay text extracted from ad images via OpenAI Vision to reduce repeated OCR cost.';

