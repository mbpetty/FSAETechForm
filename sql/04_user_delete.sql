-- Admin: permanently delete a user (profile + auth account)
-- Run in Supabase SQL Editor AFTER sql/03_auth.sql

create or replace function public.delete_user_account(target_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if not public.is_admin() then
    raise exception 'Not authorized';
  end if;

  if target_user_id = auth.uid() then
    raise exception 'You cannot delete your own account';
  end if;

  delete from public.profiles where id = target_user_id;
  delete from auth.users where id = target_user_id;
end;
$$;

revoke all on function public.delete_user_account(uuid) from public;
grant execute on function public.delete_user_account(uuid) to authenticated;
