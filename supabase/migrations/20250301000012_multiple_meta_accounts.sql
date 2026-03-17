-- Support multiple Meta ad accounts per user
-- Drop single-account constraint, add composite unique, add is_active

alter table public.meta_accounts drop constraint if exists meta_accounts_user_id_key;
alter table public.meta_accounts add constraint meta_accounts_user_ad_account_unique unique (user_id, ad_account_id);
alter table public.meta_accounts add column if not exists is_active boolean not null default true;

-- Ensure exactly one active account per user: set first row active, others inactive
-- (For existing single-account users, the one row stays active)
create or replace function public.meta_accounts_ensure_single_active()
returns trigger as $$
begin
  if new.is_active then
    update public.meta_accounts
    set is_active = false
    where user_id = new.user_id and id != new.id;
  end if;
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists meta_accounts_single_active on public.meta_accounts;
create trigger meta_accounts_single_active
  before insert or update of is_active on public.meta_accounts
  for each row when (new.is_active)
  execute function public.meta_accounts_ensure_single_active();

-- Backfill: if multiple rows exist, set first by created_at as active
update public.meta_accounts m
set is_active = (m.id = (
  select id from public.meta_accounts m2
  where m2.user_id = m.user_id
  order by m2.created_at asc
  limit 1
));

create index if not exists meta_accounts_user_active_idx on public.meta_accounts(user_id, is_active) where is_active;
