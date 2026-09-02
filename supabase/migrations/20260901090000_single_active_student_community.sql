-- A creator may own any number of communities, but a student can participate
-- as a regular member in only one active community at a time.

with ranked_memberships as (
  select
    community_id,
    user_id,
    row_number() over (
      partition by user_id
      order by joined_at desc, community_id desc
    ) as membership_rank
  from public.community_memberships
  where role = 'member' and status = 'active'
)
update public.community_memberships membership
set
  status = 'left',
  left_at = timezone('utc'::text, now()),
  updated_at = timezone('utc'::text, now())
from ranked_memberships ranked
where membership.community_id = ranked.community_id
  and membership.user_id = ranked.user_id
  and ranked.membership_rank > 1;

create unique index if not exists community_memberships_one_active_member_per_user
  on public.community_memberships (user_id)
  where role = 'member' and status = 'active';

create or replace function public.join_community(
  target_user_id uuid,
  target_community_slug text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  matched_community public.communities%rowtype;
begin
  select * into matched_community
  from public.communities
  where slug = target_community_slug;

  if matched_community.id is null then
    raise exception 'Community not found.' using errcode = 'P0002';
  end if;
  if matched_community.status <> 'active' or matched_community.visibility <> 'public' then
    raise exception 'This community is not open to new members.' using errcode = '42501';
  end if;

  if matched_community.creator_id <> target_user_id and exists (
    select 1
    from public.community_memberships membership
    where membership.user_id = target_user_id
      and membership.role = 'member'
      and membership.status = 'active'
      and membership.community_id <> matched_community.id
  ) then
    raise exception 'Students can join only one active community.' using errcode = 'P0001';
  end if;

  insert into public.community_memberships (
    community_id,
    user_id,
    role,
    status,
    joined_at,
    left_at
  ) values (
    matched_community.id,
    target_user_id,
    case when matched_community.creator_id = target_user_id then 'creator' else 'member' end,
    'active',
    timezone('utc'::text, now()),
    null
  )
  on conflict (community_id, user_id) do update
  set
    role = case
      when matched_community.creator_id = excluded.user_id then 'creator'
      else community_memberships.role
    end,
    status = 'active',
    left_at = null,
    updated_at = timezone('utc'::text, now());

  return matched_community.id;
end;
$$;

revoke all on function public.join_community(uuid, text)
  from public, anon, authenticated;
grant execute on function public.join_community(uuid, text)
  to service_role;
