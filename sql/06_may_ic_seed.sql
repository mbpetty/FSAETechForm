-- May IC competition + 10 dummy teams (safe to re-run)
-- Run in Supabase SQL Editor after sql/01_schema.sql

insert into public.competitions (id, label) values
  ('may-ic', 'May IC')
on conflict (id) do update set label = excluded.label;

insert into public.teams (car_number, team_name, competition_id)
select v.car_number, v.team_name, v.competition_id
from (
  values
    ('12', 'University of Michigan', 'may-ic'),
    ('13', 'Purdue University', 'may-ic'),
    ('14', 'Penn State University', 'may-ic'),
    ('15', 'University of Illinois', 'may-ic'),
    ('16', 'Clemson University', 'may-ic'),
    ('17', 'Auburn University', 'may-ic'),
    ('18', 'University of Kansas', 'may-ic'),
    ('19', 'Wayne State University', 'may-ic'),
    ('20', 'Rose-Hulman Institute of Technology', 'may-ic'),
    ('21', 'Lawrence Technological University', 'may-ic')
) as v(car_number, team_name, competition_id)
where not exists (
  select 1 from public.teams where competition_id = 'may-ic'
);

-- Assign all master inspections to May IC (same checklist as other comps)
insert into public.competition_inspections (competition_id, item_id)
select 'may-ic', id from public.inspection_items
on conflict (competition_id, item_id) do nothing;
