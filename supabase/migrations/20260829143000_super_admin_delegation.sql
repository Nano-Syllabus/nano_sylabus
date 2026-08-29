begin;

-- The founder identity is immutable. Delegated super admins are also retained
-- by email so deleting and recreating their auth account does not silently
-- remove their access.
alter table public.platform_admin_identities
  add column if not exists is_owner boolean not null default false,
  add column if not exists granted_by uuid references auth.users(id) on delete set null,
  add column if not exists updated_at timestamptz not null default now();

update public.platform_admin_identities
set is_owner = true,
    updated_at = now()
where email = 'theshumanhere@gmail.com';

create or replace function public.set_platform_user_roles(
  p_actor_user_id uuid,
  p_target_user_ids uuid[],
  p_role text
)
returns integer
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  target_user_id uuid;
  target_email text;
  target_name text;
  updated_count integer := 0;
begin
  perform pg_advisory_xact_lock(hashtext('platform-user-role-management'));

  if not exists (
    select 1
    from public.student_profiles profile
    where profile.user_id = p_actor_user_id
      and profile.role = 'super_admin'
  ) then
    raise exception 'Super admin access is required.' using errcode = '42501';
  end if;

  if p_role not in ('student', 'admin', 'super_admin') then
    raise exception 'Invalid platform role.' using errcode = '22023';
  end if;

  if coalesce(array_length(p_target_user_ids, 1), 0) = 0 then
    raise exception 'At least one target user is required.' using errcode = '22023';
  end if;

  if array_length(p_target_user_ids, 1) > 200 then
    raise exception 'A maximum of 200 users can be updated at once.' using errcode = '22023';
  end if;

  for target_user_id in
    select distinct value
    from unnest(p_target_user_ids) as value
  loop
    select
      lower(btrim(coalesce(account.email, ''))),
      coalesce(
        nullif(btrim(account.raw_user_meta_data->>'full_name'), ''),
        nullif(btrim(account.raw_user_meta_data->>'name'), ''),
        nullif(split_part(lower(account.email), '@', 1), ''),
        'Student'
      )
    into target_email, target_name
    from auth.users account
    where account.id = target_user_id;

    if not found or target_email = '' then
      raise exception 'Target user % was not found.', target_user_id using errcode = 'P0002';
    end if;

    if target_user_id = p_actor_user_id and p_role <> 'super_admin' then
      raise exception 'You cannot remove your own super admin access.' using errcode = '42501';
    end if;

    if p_role <> 'super_admin' and exists (
      select 1
      from public.platform_admin_identities identity
      where identity.email = target_email
        and identity.is_owner
    ) then
      raise exception 'The platform owner cannot be demoted.' using errcode = '42501';
    end if;

    insert into public.student_profiles (user_id, full_name, role)
    values (target_user_id, target_name, p_role)
    on conflict (user_id) do update
      set role = excluded.role,
          full_name = coalesce(nullif(public.student_profiles.full_name, ''), excluded.full_name);

    if p_role = 'super_admin' then
      insert into public.platform_admin_identities (email, is_owner, granted_by, updated_at)
      values (target_email, false, p_actor_user_id, now())
      on conflict (email) do update
        set granted_by = case
              when public.platform_admin_identities.is_owner then public.platform_admin_identities.granted_by
              else excluded.granted_by
            end,
            updated_at = now();
    else
      delete from public.platform_admin_identities identity
      where identity.email = target_email
        and not identity.is_owner;
    end if;

    updated_count := updated_count + 1;
  end loop;

  return updated_count;
end;
$$;

revoke all on function public.set_platform_user_roles(uuid, uuid[], text)
  from public, anon, authenticated;
grant execute on function public.set_platform_user_roles(uuid, uuid[], text)
  to service_role;

notify pgrst, 'reload schema';

commit;
