-- Cache for first 0–5s ad video transcripts to avoid repeated transcription costs.
-- Scoped per user to stay secure under RLS.

create table if not exists public.ad_video_transcripts_0_5s (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users (id) on delete cascade not null,
  ad_id text not null,
  video_url text not null default '',
  transcript_0_5s text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists ad_video_transcripts_0_5s_user_ad_uidx
  on public.ad_video_transcripts_0_5s (user_id, ad_id);

create index if not exists ad_video_transcripts_0_5s_user_updated_idx
  on public.ad_video_transcripts_0_5s (user_id, updated_at desc);

alter table public.ad_video_transcripts_0_5s enable row level security;

drop policy if exists "Users can view own ad_video_transcripts_0_5s" on public.ad_video_transcripts_0_5s;
drop policy if exists "Users can insert own ad_video_transcripts_0_5s" on public.ad_video_transcripts_0_5s;
drop policy if exists "Users can update own ad_video_transcripts_0_5s" on public.ad_video_transcripts_0_5s;

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

comment on table public.ad_video_transcripts_0_5s is 'Per-user cache of 0–5s ad video transcripts to reduce repeated transcription cost.';

