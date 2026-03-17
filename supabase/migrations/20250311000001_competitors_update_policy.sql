-- Allow authenticated users to update competitors (for upsert when re-scraping)
create policy "Authenticated users can update competitors"
  on public.competitors for update
  using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

-- Allow authenticated users to update competitor_ads (for upsert on re-scrape)
create policy "Authenticated users can update competitor_ads"
  on public.competitor_ads for update
  using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');
