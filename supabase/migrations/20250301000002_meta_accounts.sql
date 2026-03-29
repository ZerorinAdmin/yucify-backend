-- Meta account connection: supports multiple ad accounts per user with single-active toggle.
-- Includes temporary OAuth flow table (meta_connect_flow).

create table public.meta_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users on delete cascade not null,
  ad_account_id text not null,
  account_name text,
  encrypted_access_token text not null,
  token_expiry timestamptz not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, ad_account_id)
);

alter table public.meta_accounts enable row level security;

create policy "Users can view own meta_accounts"
  on public.meta_accounts for select
  using (auth.uid() = user_id);

create policy "Users can insert own meta_accounts"
  on public.meta_accounts for insert
  with check (auth.uid() = user_id);

create policy "Users can update own meta_accounts"
  on public.meta_accounts for update
  using (auth.uid() = user_id);

create policy "Users can delete own meta_accounts"
  on public.meta_accounts for delete
  using (auth.uid() = user_id);

create index meta_accounts_user_id_idx on public.meta_accounts(user_id);
create index meta_accounts_user_active_idx on public.meta_accounts(user_id, is_active) where is_active;

-- Ensure exactly one active account per user
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

create trigger meta_accounts_single_active
  before insert or update of is_active on public.meta_accounts
  for each row when (new.is_active)
  execute function public.meta_accounts_ensure_single_active();

-- Temporary OAuth flow: state -> token + ad account list (expires in 10 min)
create table public.meta_connect_flow (
  state text primary key,
  user_id uuid references auth.users on delete cascade not null,
  encrypted_access_token text,
  ad_accounts jsonb not null default '[]',
  token_expiry timestamptz,
  return_path text,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

alter table public.meta_connect_flow enable row level security;

create policy "Users can insert own meta_connect_flow"
  on public.meta_connect_flow for insert
  with check (auth.uid() = user_id);

create policy "Users can select own meta_connect_flow"
  on public.meta_connect_flow for select
  using (auth.uid() = user_id);

create policy "Users can update own meta_connect_flow"
  on public.meta_connect_flow for update
  using (auth.uid() = user_id);

create policy "Users can delete own meta_connect_flow"
  on public.meta_connect_flow for delete
  using (auth.uid() = user_id);

create index meta_connect_flow_expires_at_idx on public.meta_connect_flow(expires_at);
