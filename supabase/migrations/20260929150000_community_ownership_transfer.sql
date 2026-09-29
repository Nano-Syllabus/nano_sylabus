-- A creator hands a faculty to one of its active members. The member is
-- emailed a one-time link and ownership moves only when THEY accept it.
--
-- Only management moves: communities.creator_id and the two membership roles.
-- Subjects keep their teacher_id and the hidden study course keeps its
-- teacher, because challenges read material from the collection that hosts
-- each subject (collectionKeyForTeacher). Moving those would orphan content.

create table if not exists public.community_ownership_transfers (
  id uuid primary key default gen_random_uuid(),
  community_id uuid not null references public.communities(id) on delete cascade,
  from_user_id uuid not null references auth.users(id) on delete cascade,
  to_user_id uuid not null references auth.users(id) on delete cascade,
  -- sha256 of the emailed token; the token itself is never stored.
  token_hash text not null unique,
  status text not null default 'pending'
    check (status in ('pending', 'accepted', 'declined', 'cancelled')),
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  check (from_user_id <> to_user_id)
);

-- One live offer per faculty; sending again cancels the previous one first.
create unique index if not exists community_ownership_transfers_one_pending
  on public.community_ownership_transfers (community_id)
  where status = 'pending';

-- Service role only: every read and write goes through the app's admin client.
alter table public.community_ownership_transfers enable row level security;

create or replace function public.accept_community_ownership_transfer(
  target_user_id uuid,
  target_token_hash text
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  offer public.community_ownership_transfers%rowtype;
  matched public.communities%rowtype;
begin
  select * into offer from public.community_ownership_transfers
  where token_hash = target_token_hash
  for update;

  if offer.id is null then
    raise exception 'This transfer link is not valid.' using errcode = 'P0002';
  end if;
  if offer.to_user_id <> target_user_id then
    raise exception 'This transfer was sent to a different account.' using errcode = '42501';
  end if;
  if offer.status <> 'pending' then
    raise exception 'This transfer is no longer open.' using errcode = '22023';
  end if;
  if offer.expires_at <= now() then
    raise exception 'This transfer link has expired.' using errcode = '22023';
  end if;

  select * into matched from public.communities
  where id = offer.community_id
  for update;

  if matched.id is null or matched.status <> 'active' then
    raise exception 'This community is no longer active.' using errcode = '22023';
  end if;
  -- The sender must still own it (no earlier transfer went through).
  if matched.creator_id <> offer.from_user_id then
    raise exception 'This transfer is no longer open.' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.community_memberships
    where community_id = matched.id and user_id = target_user_id and status = 'active'
  ) then
    raise exception 'Only an active member can take over this community.' using errcode = '42501';
  end if;

  update public.communities
  set creator_id = target_user_id, updated_at = now()
  where id = matched.id;

  update public.community_memberships
  set role = 'creator', updated_at = now()
  where community_id = matched.id and user_id = target_user_id;

  -- The previous creator stays on as a member, unless they already study in
  -- another faculty: a student holds one active member faculty at a time
  -- (community_memberships_one_active_member_per_user), so they leave instead.
  if exists (
    select 1 from public.community_memberships
    where user_id = offer.from_user_id
      and role = 'member'
      and status = 'active'
      and community_id <> matched.id
  ) then
    update public.community_memberships
    set role = 'member', status = 'left', left_at = coalesce(left_at, now()), updated_at = now()
    where community_id = matched.id and user_id = offer.from_user_id;
  else
    update public.community_memberships
    set role = 'member', updated_at = now()
    where community_id = matched.id and user_id = offer.from_user_id;
  end if;

  update public.community_ownership_transfers
  set status = 'accepted', responded_at = now()
  where id = offer.id;

  return matched.slug;
end;
$$;

revoke all on function public.accept_community_ownership_transfer(uuid, text)
  from public, anon, authenticated;
grant execute on function public.accept_community_ownership_transfer(uuid, text) to service_role;
