-- Public checklist read: anyone may SELECT competitions, teams, inspection
-- items, and competition assignments for the public tech form / printable PDF.
-- Does NOT expose inspection_results (pass/fail stay private).
-- Run in Supabase SQL Editor after sql/05_attribution_and_rls.sql

-- competitions
drop policy if exists "competitions read approved" on public.competitions;
drop policy if exists "competitions read directory" on public.competitions;
drop policy if exists "competitions read public" on public.competitions;
create policy "competitions read public" on public.competitions
  for select using (true);

-- teams
drop policy if exists "teams read approved" on public.teams;
drop policy if exists "teams read directory" on public.teams;
drop policy if exists "teams read public" on public.teams;
create policy "teams read public" on public.teams
  for select using (true);

-- inspection_items
drop policy if exists "inspection_items read approved" on public.inspection_items;
drop policy if exists "inspection_items read directory" on public.inspection_items;
drop policy if exists "inspection_items read public" on public.inspection_items;
create policy "inspection_items read public" on public.inspection_items
  for select using (true);

-- competition_inspections
drop policy if exists "competition_inspections read approved" on public.competition_inspections;
drop policy if exists "competition_inspections read directory" on public.competition_inspections;
drop policy if exists "competition_inspections read public" on public.competition_inspections;
create policy "competition_inspections read public" on public.competition_inspections
  for select using (true);
