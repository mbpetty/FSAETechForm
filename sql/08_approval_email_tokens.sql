-- Email approval tokens + processing (for Resend + Edge Functions)
-- Run in Supabase SQL Editor AFTER sql/07_feedback_features.sql

create table if not exists public.approval_tokens (
  id uuid primary key default gen_random_uuid(),
  token text not null unique,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  action text not null check (action in ('approve_inspector', 'approve_team_member', 'reject')),
  role text check (role in ('admin', 'inspector', 'team_member')),
  team_id uuid references public.teams (id) on delete set null,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists approval_tokens_profile_idx on public.approval_tokens (profile_id);
create index if not exists approval_tokens_token_idx on public.approval_tokens (token);

alter table public.approval_tokens enable row level security;

-- No client access; edge functions use service role
drop policy if exists "approval tokens deny all" on public.approval_tokens;
create policy "approval tokens deny all" on public.approval_tokens
  for all using (false);

-- Create one-time tokens for a pending signup (service role only)
create or replace function public.create_approval_email_tokens(p_profile_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  prof public.profiles%rowtype;
  tok_inspector text;
  tok_team text;
  tok_reject text;
  exp timestamptz := now() + interval '72 hours';
begin
  select * into prof from public.profiles where id = p_profile_id;
  if not found then
    raise exception 'Profile not found';
  end if;
  if prof.status <> 'pending' then
    raise exception 'Profile is not pending approval';
  end if;

  delete from public.approval_tokens
  where profile_id = p_profile_id and used_at is null;

  tok_inspector := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
  tok_team := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
  tok_reject := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');

  insert into public.approval_tokens (token, profile_id, action, role, team_id, expires_at)
  values
    (tok_inspector, p_profile_id, 'approve_inspector', 'inspector', null, exp),
    (tok_team, p_profile_id, 'approve_team_member', 'team_member', prof.requested_team_id, exp),
    (tok_reject, p_profile_id, 'reject', null, null, exp);

  return jsonb_build_object(
    'approve_inspector', tok_inspector,
    'approve_team_member', tok_team,
    'reject', tok_reject,
    'expires_at', exp,
    'requested_role', prof.requested_role,
    'requested_team_id', prof.requested_team_id
  );
end;
$$;

revoke all on function public.create_approval_email_tokens(uuid) from public;

-- Process a token from an email link (service role only)
create or replace function public.process_approval_token(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  rec public.approval_tokens%rowtype;
  prof public.profiles%rowtype;
  team_label text := '';
begin
  select * into rec
  from public.approval_tokens
  where token = p_token
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'Invalid or unknown approval link.');
  end if;

  if rec.used_at is not null then
    return jsonb_build_object('ok', false, 'error', 'This approval link was already used.');
  end if;

  if rec.expires_at < now() then
    return jsonb_build_object('ok', false, 'error', 'This approval link has expired. Open Admin → Users to approve manually.');
  end if;

  select * into prof from public.profiles where id = rec.profile_id;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'User account no longer exists.');
  end if;

  if prof.status <> 'pending' then
    update public.approval_tokens set used_at = now() where id = rec.id;
    return jsonb_build_object(
      'ok', false,
      'error', format('This user is already %s.', prof.status),
      'email', prof.email,
      'status', prof.status
    );
  end if;

  if rec.action = 'reject' then
    update public.profiles
    set status = 'rejected', role = null, team_id = null
    where id = rec.profile_id;

    update public.approval_tokens set used_at = now() where profile_id = rec.profile_id and used_at is null;

    return jsonb_build_object(
      'ok', true,
      'action', 'reject',
      'email', prof.email,
      'full_name', prof.full_name,
      'message', format('Rejected access for %s.', prof.full_name || prof.email)
    );
  end if;

  if rec.action = 'approve_team_member' then
    if rec.team_id is null then
      return jsonb_build_object(
        'ok', false,
        'error', 'No team was requested. Open Admin → Users to assign a team before approving.'
      );
    end if;

    select format('#%s %s', car_number, team_name) into team_label
    from public.teams where id = rec.team_id;

    update public.profiles
    set
      status = 'approved',
      role = 'team_member',
      team_id = rec.team_id,
      approved_at = now(),
      approved_by = null
    where id = rec.profile_id;
  else
    update public.profiles
    set
      status = 'approved',
      role = 'inspector',
      team_id = null,
      approved_at = now(),
      approved_by = null
    where id = rec.profile_id;
  end if;

  update public.approval_tokens set used_at = now() where profile_id = rec.profile_id and used_at is null;

  return jsonb_build_object(
    'ok', true,
    'action', rec.action,
    'email', prof.email,
    'full_name', prof.full_name,
    'team_label', team_label,
    'message', case
      when rec.action = 'approve_team_member' then
        format('Approved %s as team member (%s).', coalesce(nullif(prof.full_name, ''), prof.email), coalesce(team_label, 'team'))
      else
        format('Approved %s as inspector.', coalesce(nullif(prof.full_name, ''), prof.email))
    end
  );
end;
$$;

revoke all on function public.process_approval_token(text) from public;
