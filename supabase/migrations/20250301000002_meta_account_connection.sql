-- Meta Account Connection (requirements: ad_account_id, encrypted_access_token, token_expiry)
create table public.meta_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users on delete cascade not null,
  ad_account_id text not null,
  encrypted_access_token text not null,
  token_expiry timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id)
);

-- Temporary flow for OAuth: state -> token + ad account list (expires in 10 min)
create table public.meta_connect_flow (
  state text primary key,
  user_id uuid references auth.users on delete cascade not null,
  encrypted_access_token text,
  ad_accounts jsonb not null default '[]',
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

-- RLS: users can only manage their own meta_accounts
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

-- RLS: users can only access their own connect flow row (by state)
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

create index meta_accounts_user_id_idx on public.meta_accounts(user_id);
create index meta_connect_flow_expires_at_idx on public.meta_connect_flow(expires_at);
