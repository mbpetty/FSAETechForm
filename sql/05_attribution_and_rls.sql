-- Attribution, pending-user lockdown, competition delete support
-- Run in Supabase SQL Editor AFTER sql/03_auth.sql

-- ---------------------------------------------------------------------------
-- Inspector attribution on results
-- ---------------------------------------------------------------------------
alter table public.inspection_results
  add column if not exists updated_by uuid references auth.users (id) on delete set null;

alter table public.inspection_results
  add column if not exists updated_by_name text not null default '';

-- ---------------------------------------------------------------------------
-- Signup helpers: anon (no session) may read team/competition names only
-- Authenticated pending users may NOT read inspection data
-- ---------------------------------------------------------------------------
create or replace function public.can_read_directory_tables()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select auth.uid() is null or public.is_approved_user();
$$;

-- competitions
drop policy if exists "competitions read approved" on public.competitions;
create policy "competitions read directory" on public.competitions
  for select using (public.can_read_directory_tables());

-- teams
drop policy if exists "teams read approved" on public.teams;
create policy "teams read directory" on public.teams
  for select using (public.can_read_directory_tables());

-- Re-assert inspection data requires approval (no change in intent, idempotent)
drop policy if exists "inspection_items read approved" on public.inspection_items;
create policy "inspection_items read approved" on public.inspection_items
  for select using (public.is_approved_user());

drop policy if exists "competition_inspections read approved" on public.competition_inspections;
create policy "competition_inspections read approved" on public.competition_inspections
  for select using (public.is_approved_user());

drop policy if exists "inspection_results read" on public.inspection_results;
create policy "inspection_results read" on public.inspection_results
  for select using (
    public.is_approved_user()
    and (
      public.is_inspector_or_admin()
      or (public.my_team_id() is not null and team_id = public.my_team_id())
    )
  );

-- Admins may delete competitions (teams FK may block if teams still assigned)
drop policy if exists "competitions admin write" on public.competitions;
create policy "competitions admin write" on public.competitions
  for all using (public.is_admin()) with check (public.is_admin());
