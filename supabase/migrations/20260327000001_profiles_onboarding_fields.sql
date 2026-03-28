alter table public.profiles
  add column if not exists persona text,
  add column if not exists onboarding_step text,
  add column if not exists meta_connected boolean not null default false,
  add column if not exists first_insight_viewed boolean not null default false,
  add column if not exists onboarding_completed_at timestamptz;

alter table public.meta_connect_flow
  add column if not exists return_path text;
