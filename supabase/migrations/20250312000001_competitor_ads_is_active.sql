-- Add is_active to competitor_ads (true = active, false = expired)
alter table public.competitor_ads
  add column if not exists is_active boolean;
