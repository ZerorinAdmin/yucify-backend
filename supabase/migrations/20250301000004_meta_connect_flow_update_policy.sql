-- meta_connect_flow had no UPDATE policy, so the callback's update was blocked by RLS
-- and encrypted_access_token stayed NULL. Add the missing policy.
-- (Idempotent: drop if exists then create, for existing DBs that ran migration 002 before it included this.)
drop policy if exists "Users can update own meta_connect_flow" on public.meta_connect_flow;
create policy "Users can update own meta_connect_flow"
  on public.meta_connect_flow for update
  using (auth.uid() = user_id);
