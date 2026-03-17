-- Profiles table: stores provider, provider_user_id, email (per Auth requirements)
create table public.profiles (
  id uuid references auth.users on delete cascade primary key,
  provider text not null,
  provider_user_id text not null,
  email text not null default '',
  updated_at timestamptz not null default now()
);

-- RLS: users can only read/update their own profile
alter table public.profiles enable row level security;

create policy "Users can view own profile"
  on public.profiles for select
  using (auth.uid() = id);

create policy "Users can update own profile"
  on public.profiles for update
  using (auth.uid() = id);

create policy "Users can insert own profile"
  on public.profiles for insert
  with check (auth.uid() = id);

-- Index for lookups
create index profiles_provider_user_id_idx on public.profiles(provider, provider_user_id);
