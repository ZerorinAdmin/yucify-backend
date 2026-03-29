-- Profiles table: user identity + onboarding state
create table public.profiles (
  id uuid references auth.users on delete cascade primary key,
  provider text not null,
  provider_user_id text not null,
  email text not null default '',
  persona text,
  onboarding_step text,
  meta_connected boolean not null default false,
  first_insight_viewed boolean not null default false,
  onboarding_completed_at timestamptz,
  referral_source text,
  updated_at timestamptz not null default now()
);

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

create index profiles_provider_user_id_idx on public.profiles(provider, provider_user_id);
