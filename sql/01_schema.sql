-- Run this in Supabase: SQL Editor → New query → Run
-- Tech Inspection app — shared database + realtime

-- Competitions
create table if not exists public.competitions (
  id text primary key,
  label text not null
);

insert into public.competitions (id, label) values
  ('michigan-june', 'FSAE Michigan — June'),
  ('other', 'Other')
on conflict (id) do nothing;

-- Teams
create table if not exists public.teams (
  id uuid primary key default gen_random_uuid(),
  car_number text not null,
  team_name text not null,
  competition_id text not null references public.competitions (id) on delete restrict,
  created_at timestamptz not null default now()
);

create index if not exists teams_competition_idx on public.teams (competition_id);

-- Master checklist (global — not tied to a competition)
create table if not exists public.inspection_items (
  id uuid primary key default gen_random_uuid(),
  item_id text not null unique,
  title text not null,
  description text not null,
  stations text[] not null default '{}',
  item_key text not null unique,
  created_at timestamptz not null default now()
);

-- Assign inspections to competitions (future admin page)
create table if not exists public.competition_inspections (
  competition_id text not null references public.competitions (id) on delete cascade,
  item_id text not null references public.inspection_items (item_id) on delete cascade,
  primary key (competition_id, item_id)
);

-- Per-team inspection results (shared across inspectors)
create table if not exists public.inspection_results (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams (id) on delete cascade,
  item_key text not null,
  status text not null default 'pending' check (status in ('pending', 'pass', 'fail')),
  comment text not null default '',
  updated_at timestamptz not null default now(),
  unique (team_id, item_key)
);

create index if not exists inspection_results_team_idx on public.inspection_results (team_id);

create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists inspection_results_updated_at on public.inspection_results;
create trigger inspection_results_updated_at
  before update on public.inspection_results
  for each row execute function public.set_updated_at();

alter table public.competitions enable row level security;
alter table public.teams enable row level security;
alter table public.inspection_items enable row level security;
alter table public.inspection_results enable row level security;
alter table public.competition_inspections enable row level security;

create policy "competitions all" on public.competitions for all using (true) with check (true);
create policy "teams all" on public.teams for all using (true) with check (true);
create policy "inspection_items all" on public.inspection_items for all using (true) with check (true);
create policy "inspection_results all" on public.inspection_results for all using (true) with check (true);
create policy "competition_inspections all" on public.competition_inspections for all using (true) with check (true);

alter publication supabase_realtime add table public.inspection_results;
