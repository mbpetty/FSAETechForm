-- Auth, roles, and row-level security
-- Run in Supabase SQL Editor AFTER 01_schema.sql (and 02 if needed)

-- ---------------------------------------------------------------------------
-- Profiles (linked to Supabase Auth users)
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  full_name text not null default '',
  role text check (role in ('admin', 'inspector', 'team_member')),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  requested_role text not null default 'inspector' check (requested_role in ('inspector', 'team_member')),
  team_id uuid references public.teams (id) on delete set null,
  requested_team_id uuid references public.teams (id) on delete set null,
  approved_at timestamptz,
  approved_by uuid references auth.users (id),
  created_at timestamptz not null default now()
);

create index if not exists profiles_status_idx on public.profiles (status);
create index if not exists profiles_email_idx on public.profiles (email);

alter table public.profiles enable row level security;

-- Auto-create profile when a new auth user signs up
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name, requested_role, requested_team_id, status)
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    coalesce(nullif(new.raw_user_meta_data->>'requested_role', ''), 'inspector'),
    nullif(new.raw_user_meta_data->>'requested_team_id', '')::uuid,
    'pending'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Role helper functions (security definer — used by RLS policies)
-- ---------------------------------------------------------------------------
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and status = 'approved' and role = 'admin'
  );
$$;

create or replace function public.is_inspector_or_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and status = 'approved' and role in ('admin', 'inspector')
  );
$$;

create or replace function public.is_approved_user()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles where id = auth.uid() and status = 'approved'
  );
$$;

create or replace function public.my_team_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select team_id from public.profiles
  where id = auth.uid() and status = 'approved' and role = 'team_member';
$$;

-- ---------------------------------------------------------------------------
-- Profiles policies
-- ---------------------------------------------------------------------------
drop policy if exists "profiles read own" on public.profiles;
drop policy if exists "profiles admin read all" on public.profiles;
drop policy if exists "profiles admin update" on public.profiles;

create policy "profiles read own" on public.profiles
  for select using (auth.uid() = id);

create policy "profiles admin read all" on public.profiles
  for select using (public.is_admin());

create policy "profiles admin update" on public.profiles
  for update using (public.is_admin());

-- ---------------------------------------------------------------------------
-- Replace open policies with role-based access
-- ---------------------------------------------------------------------------

-- competitions
drop policy if exists "competitions all" on public.competitions;
drop policy if exists "competitions read approved" on public.competitions;
drop policy if exists "competitions admin write" on public.competitions;

create policy "competitions read approved" on public.competitions
  for select using (true);

create policy "competitions admin write" on public.competitions
  for all using (public.is_admin()) with check (public.is_admin());

-- teams
drop policy if exists "teams all" on public.teams;
drop policy if exists "teams read approved" on public.teams;
drop policy if exists "teams admin write" on public.teams;

create policy "teams read approved" on public.teams
  for select using (
    true
  );

create policy "teams admin write" on public.teams
  for all using (public.is_admin()) with check (public.is_admin());

-- inspection_items
drop policy if exists "inspection_items all" on public.inspection_items;
drop policy if exists "inspection_items read approved" on public.inspection_items;
drop policy if exists "inspection_items admin write" on public.inspection_items;

create policy "inspection_items read approved" on public.inspection_items
  for select using (public.is_approved_user());

create policy "inspection_items admin write" on public.inspection_items
  for all using (public.is_admin()) with check (public.is_admin());

-- competition_inspections
drop policy if exists "competition_inspections all" on public.competition_inspections;
drop policy if exists "competition_inspections read approved" on public.competition_inspections;
drop policy if exists "competition_inspections admin write" on public.competition_inspections;

create policy "competition_inspections read approved" on public.competition_inspections
  for select using (public.is_approved_user());

create policy "competition_inspections admin write" on public.competition_inspections
  for all using (public.is_admin()) with check (public.is_admin());

-- inspection_results
drop policy if exists "inspection_results all" on public.inspection_results;
drop policy if exists "inspection_results read" on public.inspection_results;
drop policy if exists "inspection_results write inspector" on public.inspection_results;

create policy "inspection_results read" on public.inspection_results
  for select using (
    public.is_inspector_or_admin()
    or (public.my_team_id() is not null and team_id = public.my_team_id())
  );

create policy "inspection_results write inspector" on public.inspection_results
  for all using (public.is_inspector_or_admin())
  with check (public.is_inspector_or_admin());

-- ---------------------------------------------------------------------------
-- Bootstrap your first admin (run AFTER you sign up once via the app)
-- Replace the email below, then run this block:
--
--   update public.profiles
--   set role = 'admin', status = 'approved', approved_at = now()
--   where email = 'you@example.com';
-- ---------------------------------------------------------------------------
