-- Activity log, admin invites, inspection image storage
-- Run in Supabase SQL Editor AFTER sql/05_attribution_and_rls.sql

-- ---------------------------------------------------------------------------
-- Activity log
-- ---------------------------------------------------------------------------
create table if not exists public.activity_log (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  actor_id uuid references auth.users (id) on delete set null,
  actor_name text not null default 'System',
  category text not null,
  action text not null,
  summary text not null,
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists activity_log_created_at_idx on public.activity_log (created_at desc);
create index if not exists activity_log_category_idx on public.activity_log (category);
create index if not exists activity_log_action_idx on public.activity_log (action);

alter table public.activity_log enable row level security;

drop policy if exists "activity log admin read" on public.activity_log;
create policy "activity log admin read" on public.activity_log
  for select using (public.is_admin());

create or replace function public.write_activity_log(
  p_category text,
  p_action text,
  p_summary text,
  p_metadata jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id uuid := auth.uid();
  v_actor_name text := 'System';
begin
  if not public.is_admin() then
    raise exception 'Not authorized';
  end if;

  if v_actor_id is not null then
    select coalesce(nullif(trim(full_name), ''), email, 'Unknown user')
    into v_actor_name
    from public.profiles
    where id = v_actor_id;
  end if;

  insert into public.activity_log (actor_id, actor_name, category, action, summary, metadata)
  values (v_actor_id, coalesce(v_actor_name, 'System'), p_category, p_action, p_summary, p_metadata);
end;
$$;

revoke all on function public.write_activity_log(text, text, text, jsonb) from public;
grant execute on function public.write_activity_log(text, text, text, jsonb) to authenticated;

-- Inspection results
create or replace function public.log_inspection_result_activity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_team_num text;
  v_team_name text;
  v_actor text;
  v_summary text;
  v_action text;
  v_meta jsonb;
begin
  select car_number, team_name
  into v_team_num, v_team_name
  from public.teams
  where id = coalesce(new.team_id, old.team_id);

  v_actor := coalesce(
    new.updated_by_name,
    (select coalesce(nullif(trim(full_name), ''), email) from public.profiles where id = auth.uid()),
    'Unknown'
  );

  if tg_op = 'INSERT' then
    v_action := new.status;
    v_summary := format(
      '%s marked %s as %s for #%s %s',
      v_actor, new.item_key, new.status, coalesce(v_team_num, '?'), coalesce(v_team_name, '')
    );
    v_meta := jsonb_build_object(
      'team_id', new.team_id, 'item_key', new.item_key,
      'status', new.status, 'comment', coalesce(new.comment, '')
    );
  elsif tg_op = 'UPDATE' then
    v_action := 'update';
    v_summary := format(
      '%s updated %s (%s → %s) for #%s %s',
      v_actor, new.item_key, old.status, new.status,
      coalesce(v_team_num, '?'), coalesce(v_team_name, '')
    );
    v_meta := jsonb_build_object(
      'team_id', new.team_id, 'item_key', new.item_key,
      'old_status', old.status, 'new_status', new.status,
      'comment', coalesce(new.comment, '')
    );
  else
    v_action := 'clear';
    v_summary := format(
      '%s cleared %s for #%s %s',
      v_actor, old.item_key, coalesce(v_team_num, '?'), coalesce(v_team_name, '')
    );
    v_meta := jsonb_build_object('team_id', old.team_id, 'item_key', old.item_key);
  end if;

  insert into public.activity_log (actor_id, actor_name, category, action, summary, metadata)
  values (auth.uid(), v_actor, 'inspection', v_action, v_summary, v_meta);

  return coalesce(new, old);
end;
$$;

drop trigger if exists inspection_results_activity on public.inspection_results;
create trigger inspection_results_activity
  after insert or update or delete on public.inspection_results
  for each row execute function public.log_inspection_result_activity();

-- Profiles (approve / reject / role change)
create or replace function public.log_profile_activity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor text;
  v_summary text;
  v_action text;
begin
  if tg_op <> 'UPDATE' then
    return new;
  end if;

  v_actor := coalesce(
    (select coalesce(nullif(trim(full_name), ''), email) from public.profiles where id = auth.uid()),
    'Unknown'
  );

  if old.status is distinct from new.status and new.status = 'approved' then
    v_action := 'approve';
    v_summary := format('%s approved %s as %s', v_actor, new.email, coalesce(new.role, new.requested_role));
  elsif old.status is distinct from new.status and new.status = 'rejected' then
    v_action := 'reject';
    v_summary := format('%s rejected %s', v_actor, new.email);
  elsif old.role is distinct from new.role or old.team_id is distinct from new.team_id then
    v_action := 'update';
    v_summary := format('%s updated user %s (role: %s)', v_actor, new.email, coalesce(new.role, '—'));
  else
    return new;
  end if;

  insert into public.activity_log (actor_id, actor_name, category, action, summary, metadata)
  values (
    auth.uid(), v_actor, 'user', v_action, v_summary,
    jsonb_build_object('profile_id', new.id, 'email', new.email, 'role', new.role, 'status', new.status)
  );

  return new;
end;
$$;

drop trigger if exists profiles_activity on public.profiles;
create trigger profiles_activity
  after update on public.profiles
  for each row execute function public.log_profile_activity();

-- Teams
create or replace function public.log_team_activity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor text;
  v_summary text;
  v_action text;
begin
  v_actor := coalesce(
    (select coalesce(nullif(trim(full_name), ''), email) from public.profiles where id = auth.uid()),
    'Unknown'
  );

  if tg_op = 'INSERT' then
    v_action := 'create';
    v_summary := format('%s added team #%s %s', v_actor, new.car_number, new.team_name);
  elsif tg_op = 'UPDATE' then
    v_action := 'update';
    v_summary := format('%s updated team #%s %s', v_actor, new.car_number, new.team_name);
  else
    v_action := 'delete';
    v_summary := format('%s deleted team #%s %s', v_actor, old.car_number, old.team_name);
  end if;

  insert into public.activity_log (actor_id, actor_name, category, action, summary, metadata)
  values (
    auth.uid(), v_actor, 'team', v_action, v_summary,
    jsonb_build_object('team_id', coalesce(new.id, old.id), 'car_number', coalesce(new.car_number, old.car_number))
  );

  return coalesce(new, old);
end;
$$;

drop trigger if exists teams_activity on public.teams;
create trigger teams_activity
  after insert or update or delete on public.teams
  for each row execute function public.log_team_activity();

-- Competitions
create or replace function public.log_competition_activity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor text;
  v_action text;
  v_summary text;
begin
  v_actor := coalesce(
    (select coalesce(nullif(trim(full_name), ''), email) from public.profiles where id = auth.uid()),
    'Unknown'
  );

  if tg_op = 'INSERT' then
    v_action := 'create';
    v_summary := format('%s created competition %s', v_actor, new.label);
  elsif tg_op = 'UPDATE' then
    v_action := 'update';
    v_summary := format('%s renamed competition to %s', v_actor, new.label);
  else
    v_action := 'delete';
    v_summary := format('%s deleted competition %s', v_actor, old.label);
  end if;

  insert into public.activity_log (actor_id, actor_name, category, action, summary, metadata)
  values (auth.uid(), v_actor, 'competition', v_action, v_summary, jsonb_build_object('competition_id', coalesce(new.id, old.id)));

  return coalesce(new, old);
end;
$$;

drop trigger if exists competitions_activity on public.competitions;
create trigger competitions_activity
  after insert or update or delete on public.competitions
  for each row execute function public.log_competition_activity();

-- Inspection items
create or replace function public.log_inspection_item_activity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor text;
  v_action text;
  v_summary text;
begin
  v_actor := coalesce(
    (select coalesce(nullif(trim(full_name), ''), email) from public.profiles where id = auth.uid()),
    'Unknown'
  );

  if tg_op = 'INSERT' then
    v_action := 'create';
    v_summary := format('%s added inspection %s — %s', v_actor, new.item_id, new.title);
  elsif tg_op = 'UPDATE' then
    v_action := 'update';
    v_summary := format('%s updated inspection %s — %s', v_actor, new.item_id, new.title);
  else
    v_action := 'delete';
    v_summary := format('%s deleted inspection %s — %s', v_actor, old.item_id, old.title);
  end if;

  insert into public.activity_log (actor_id, actor_name, category, action, summary, metadata)
  values (auth.uid(), v_actor, 'inspection_item', v_action, v_summary, jsonb_build_object('item_id', coalesce(new.item_id, old.item_id)));

  return coalesce(new, old);
end;
$$;

drop trigger if exists inspection_items_activity on public.inspection_items;
create trigger inspection_items_activity
  after insert or update or delete on public.inspection_items
  for each row execute function public.log_inspection_item_activity();

-- ---------------------------------------------------------------------------
-- Admin invites (pre-configure role; optional auto-approve on first login)
-- ---------------------------------------------------------------------------
create table if not exists public.admin_invites (
  email text primary key,
  full_name text not null default '',
  role text not null check (role in ('admin', 'inspector', 'team_member')),
  team_id uuid references public.teams (id) on delete set null,
  auto_approve boolean not null default true,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.admin_invites enable row level security;

drop policy if exists "admin invites admin" on public.admin_invites;
create policy "admin invites admin" on public.admin_invites
  for all using (public.is_admin()) with check (public.is_admin());

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  inv public.admin_invites%rowtype;
begin
  select * into inv
  from public.admin_invites
  where lower(email) = lower(coalesce(new.email, ''))
  limit 1;

  if inv.email is not null then
    insert into public.profiles (
      id, email, full_name, role, status, requested_role,
      requested_team_id, team_id, approved_at, approved_by
    )
    values (
      new.id,
      coalesce(new.email, ''),
      coalesce(nullif(inv.full_name, ''), coalesce(new.raw_user_meta_data->>'full_name', '')),
      case when inv.auto_approve then inv.role else null end,
      case when inv.auto_approve then 'approved' else 'pending' end,
      case when inv.role = 'team_member' then 'team_member' else 'inspector' end,
      case when inv.role = 'team_member' then inv.team_id else null end,
      case when inv.auto_approve and inv.role = 'team_member' then inv.team_id else null end,
      case when inv.auto_approve then now() else null end,
      case when inv.auto_approve then inv.created_by else null end
    )
    on conflict (id) do nothing;

    delete from public.admin_invites where lower(email) = lower(inv.email);
  else
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
  end if;

  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Storage: inspection detail images
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'inspection-images',
  'inspection-images',
  true,
  524288,
  array['image/jpeg', 'image/png', 'image/gif', 'image/webp']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "inspection images public read" on storage.objects;
create policy "inspection images public read" on storage.objects
  for select using (bucket_id = 'inspection-images');

drop policy if exists "inspection images admin upload" on storage.objects;
create policy "inspection images admin upload" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'inspection-images' and public.is_admin());

drop policy if exists "inspection images admin update" on storage.objects;
create policy "inspection images admin update" on storage.objects
  for update to authenticated
  using (bucket_id = 'inspection-images' and public.is_admin());

drop policy if exists "inspection images admin delete" on storage.objects;
create policy "inspection images admin delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'inspection-images' and public.is_admin());
