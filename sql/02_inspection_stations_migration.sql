-- Migration: inspections without competition, multiple stations
-- Run in Supabase SQL Editor AFTER 01_schema.sql (safe to re-run most steps)

-- Allow creating competitions from admin
drop policy if exists "competitions read" on public.competitions;
create policy "competitions all" on public.competitions for all using (true) with check (true);

-- Add stations array column
alter table public.inspection_items add column if not exists stations text[] not null default '{}';

-- Copy legacy single station into array
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'inspection_items' and column_name = 'station'
  ) then
    update public.inspection_items
    set stations = array[station]
    where station is not null and (stations is null or stations = '{}');
  end if;
end $$;

-- Normalize item_key to item_id
update public.inspection_items set item_key = item_id where item_key is distinct from item_id;

-- Drop old constraints / columns tied to competition + single station
alter table public.inspection_items drop constraint if exists inspection_items_competition_id_station_item_id_key;
alter table public.inspection_items drop constraint if exists inspection_items_item_id_key;
drop index if exists inspection_items_competition_idx;

alter table public.inspection_items drop column if exists competition_id;
alter table public.inspection_items drop column if exists station;

-- One row per inspection item globally
alter table public.inspection_items drop constraint if exists inspection_items_item_id_unique;
alter table public.inspection_items add constraint inspection_items_item_id_unique unique (item_id);

-- Future: assign inspections to competitions (separate admin page)
create table if not exists public.competition_inspections (
  competition_id text not null references public.competitions (id) on delete cascade,
  item_id text not null references public.inspection_items (item_id) on delete cascade,
  primary key (competition_id, item_id)
);

alter table public.competition_inspections enable row level security;
drop policy if exists "competition_inspections all" on public.competition_inspections;
create policy "competition_inspections all" on public.competition_inspections for all using (true) with check (true);
