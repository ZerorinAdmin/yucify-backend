alter table public.profiles
  add column if not exists referral_source text;
