-- Ad creatives: thumbnail, image, video, carousel, copy fields per ad
create table public.ad_creatives (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users on delete cascade not null,
  ad_id text not null,
  ad_name text not null default '',
  campaign_name text not null default '',
  adset_name text not null default '',
  creative_id text not null default '',
  thumbnail_url text not null default '',
  image_url text not null default '',
  video_url text not null default '',
  carousel_urls jsonb not null default '[]'::jsonb,
  body text not null default '',
  headline text not null default '',
  description text not null default '',
  cta_type text not null default '',
  link_url text not null default '',
  creative_type text not null default 'unknown',
  updated_at timestamptz not null default now(),
  unique(user_id, ad_id)
);

alter table public.ad_creatives enable row level security;

create policy "Users can view own ad_creatives"
  on public.ad_creatives for select
  using (auth.uid() = user_id);

create policy "Users can insert own ad_creatives"
  on public.ad_creatives for insert
  with check (auth.uid() = user_id);

create policy "Users can update own ad_creatives"
  on public.ad_creatives for update
  using (auth.uid() = user_id);

----------------------------------------------------------------------
-- Video transcript cache (first 0-5s) to avoid repeated transcription costs
----------------------------------------------------------------------
create table public.ad_video_transcripts_0_5s (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users (id) on delete cascade not null,
  ad_id text not null,
  video_url text not null default '',
  transcript_0_5s text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index ad_video_transcripts_0_5s_user_ad_uidx
  on public.ad_video_transcripts_0_5s (user_id, ad_id);

create index ad_video_transcripts_0_5s_user_updated_idx
  on public.ad_video_transcripts_0_5s (user_id, updated_at desc);

alter table public.ad_video_transcripts_0_5s enable row level security;

create policy "Users can view own ad_video_transcripts_0_5s"
  on public.ad_video_transcripts_0_5s for select
  using (auth.uid() = user_id);

create policy "Users can insert own ad_video_transcripts_0_5s"
  on public.ad_video_transcripts_0_5s for insert
  with check (auth.uid() = user_id);

create policy "Users can update own ad_video_transcripts_0_5s"
  on public.ad_video_transcripts_0_5s for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

----------------------------------------------------------------------
-- Image overlay text cache (OpenAI Vision OCR) to avoid repeated OCR costs
----------------------------------------------------------------------
create table public.ad_creative_overlay_text (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users (id) on delete cascade not null,
  ad_id text not null,
  creative_key text not null default '',
  ocr_text text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index ad_creative_overlay_text_user_ad_uidx
  on public.ad_creative_overlay_text (user_id, ad_id);

create index ad_creative_overlay_text_user_updated_idx
  on public.ad_creative_overlay_text (user_id, updated_at desc);

alter table public.ad_creative_overlay_text enable row level security;

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
