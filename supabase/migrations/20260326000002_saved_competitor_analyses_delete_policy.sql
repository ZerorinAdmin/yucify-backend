drop policy if exists "Users can delete own saved competitor analyses" on public.saved_competitor_analyses;
create policy "Users can delete own saved competitor analyses"
  on public.saved_competitor_analyses
  for delete
  to authenticated
  using (auth.uid() = user_id);
