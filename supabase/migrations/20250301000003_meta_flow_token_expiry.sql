-- Store real token_expiry from OAuth in flow so we can persist it to meta_accounts
alter table public.meta_connect_flow
  add column if not exists token_expiry timestamptz;
