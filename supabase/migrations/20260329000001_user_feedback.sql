create table if not exists public.user_feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  category text not null check (category in ('bug', 'feature', 'improvement', 'other')),
  message text not null check (char_length(message) > 0 and char_length(message) <= 2000),
  created_at timestamptz not null default now()
);

alter table public.user_feedback enable row level security;

create policy "Users can insert their own feedback"
  on public.user_feedback for insert
  with check (auth.uid() = user_id);

create policy "Users can read their own feedback"
  on public.user_feedback for select
  using (auth.uid() = user_id);
