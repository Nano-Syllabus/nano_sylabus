begin;

-- The hub remembers the semester each member is currently studying. A trigger
-- keeps older and newly-created memberships on a real term without requiring
-- every caller of join_community to duplicate that logic.
alter table public.community_memberships
  add column if not exists current_term_id uuid;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'community_memberships_current_term_scope_fk'
  ) then
    alter table public.community_memberships
      add constraint community_memberships_current_term_scope_fk
      foreign key (current_term_id, community_id)
      references public.community_terms(id, community_id);
  end if;
end;
$$;

create or replace function public.set_default_community_membership_term()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.status = 'active' and new.current_term_id is null then
    select term.id into new.current_term_id
    from public.community_terms term
    where term.community_id = new.community_id
    order by term.position asc
    limit 1;
  end if;
  return new;
end;
$$;

drop trigger if exists community_memberships_default_term on public.community_memberships;
create trigger community_memberships_default_term
before insert or update on public.community_memberships
for each row execute function public.set_default_community_membership_term();

update public.community_memberships membership
set current_term_id = (
  select candidate.id
  from public.community_terms candidate
  where candidate.community_id = membership.community_id
  order by candidate.position asc
  limit 1
)
where membership.status = 'active'
  and membership.current_term_id is null;

create index if not exists community_memberships_current_term_idx
  on public.community_memberships (current_term_id)
  where status = 'active';

create table if not exists public.community_announcements (
  id uuid primary key default gen_random_uuid(),
  community_id uuid not null references public.communities(id) on delete cascade,
  author_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (char_length(trim(title)) between 3 and 140),
  body text not null check (char_length(trim(body)) between 3 and 2000),
  published_at timestamptz not null default timezone('utc'::text, now()),
  archived_at timestamptz,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now())
);

create index if not exists community_announcements_feed_idx
  on public.community_announcements (community_id, published_at desc)
  where archived_at is null;

drop trigger if exists community_announcements_set_updated_at on public.community_announcements;
create trigger community_announcements_set_updated_at
before update on public.community_announcements
for each row execute function public.set_community_updated_at();

create table if not exists public.community_invites (
  id uuid primary key default gen_random_uuid(),
  community_id uuid not null references public.communities(id) on delete cascade,
  created_by uuid not null references auth.users(id) on delete cascade,
  token uuid not null default gen_random_uuid() unique,
  expires_at timestamptz,
  max_uses integer check (max_uses is null or max_uses between 1 and 10000),
  use_count integer not null default 0 check (use_count >= 0),
  revoked_at timestamptz,
  created_at timestamptz not null default timezone('utc'::text, now())
);

create index if not exists community_invites_community_idx
  on public.community_invites (community_id, created_at desc);

create table if not exists public.community_invite_redemptions (
  invite_id uuid not null references public.community_invites(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  redeemed_at timestamptz not null default timezone('utc'::text, now()),
  primary key (invite_id, user_id)
);

create index if not exists community_invite_redemptions_user_idx
  on public.community_invite_redemptions (user_id, redeemed_at desc);

create or replace function public.set_community_current_term(
  target_user_id uuid,
  target_community_id uuid,
  target_term_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1
    from public.community_memberships membership
    where membership.community_id = target_community_id
      and membership.user_id = target_user_id
      and membership.status = 'active'
  ) then
    raise exception 'Join the community before choosing a semester.' using errcode = '42501';
  end if;

  if not exists (
    select 1
    from public.community_terms term
    where term.id = target_term_id
      and term.community_id = target_community_id
  ) then
    raise exception 'Choose a semester from this community.' using errcode = '22023';
  end if;

  update public.community_memberships
  set current_term_id = target_term_id,
      updated_at = timezone('utc'::text, now())
  where community_id = target_community_id
    and user_id = target_user_id;
end;
$$;

create or replace function public.leave_community(
  target_user_id uuid,
  target_community_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  matched_role text;
begin
  select membership.role into matched_role
  from public.community_memberships membership
  where membership.community_id = target_community_id
    and membership.user_id = target_user_id
    and membership.status = 'active'
  for update;

  if matched_role is null then
    raise exception 'Active community membership not found.' using errcode = 'P0002';
  end if;
  if matched_role = 'creator' then
    raise exception 'Community creators cannot leave their own community.' using errcode = '42501';
  end if;

  update public.community_memberships
  set status = 'left',
      left_at = timezone('utc'::text, now()),
      current_term_id = null,
      updated_at = timezone('utc'::text, now())
  where community_id = target_community_id
    and user_id = target_user_id;

  update public.teacher_course_enrollments enrollment
  set status = 'cancelled'
  from public.communities community
  where community.id = target_community_id
    and community.study_course_id = enrollment.course_id
    and enrollment.student_id = target_user_id
    and enrollment.status = 'active';
end;
$$;

create or replace function public.redeem_community_invite(
  target_user_id uuid,
  target_token uuid
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  matched_invite public.community_invites%rowtype;
  matched_community public.communities%rowtype;
  inserted_redemption integer := 0;
  default_term_id uuid;
begin
  select invite.* into matched_invite
  from public.community_invites invite
  where invite.token = target_token
  for update;

  if matched_invite.id is null then
    raise exception 'Invite not found.' using errcode = 'P0002';
  end if;
  if matched_invite.revoked_at is not null
    or (matched_invite.expires_at is not null and matched_invite.expires_at <= timezone('utc'::text, now()))
    or (matched_invite.max_uses is not null and matched_invite.use_count >= matched_invite.max_uses) then
    raise exception 'This invite is no longer active.' using errcode = '42501';
  end if;

  select community.* into matched_community
  from public.communities community
  where community.id = matched_invite.community_id
    and community.status = 'active';
  if matched_community.id is null then
    raise exception 'Community not found.' using errcode = 'P0002';
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

  select term.id into default_term_id
  from public.community_terms term
  where term.community_id = matched_community.id
  order by term.position asc
  limit 1;

  insert into public.community_memberships (
    community_id, user_id, role, status, current_term_id, joined_at, left_at
  ) values (
    matched_community.id,
    target_user_id,
    case when matched_community.creator_id = target_user_id then 'creator' else 'member' end,
    'active',
    default_term_id,
    timezone('utc'::text, now()),
    null
  )
  on conflict (community_id, user_id) do update
  set role = case
        when matched_community.creator_id = excluded.user_id then 'creator'
        else community_memberships.role
      end,
      status = 'active',
      current_term_id = coalesce(community_memberships.current_term_id, excluded.current_term_id),
      left_at = null,
      updated_at = timezone('utc'::text, now());

  insert into public.community_invite_redemptions (invite_id, user_id)
  values (matched_invite.id, target_user_id)
  on conflict do nothing;
  get diagnostics inserted_redemption = row_count;

  if inserted_redemption = 1 then
    update public.community_invites
    set use_count = use_count + 1
    where id = matched_invite.id;
  end if;

  return matched_community.slug;
end;
$$;

revoke all on function public.set_community_current_term(uuid, uuid, uuid)
  from public, anon, authenticated;
revoke all on function public.leave_community(uuid, uuid)
  from public, anon, authenticated;
revoke all on function public.redeem_community_invite(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.set_community_current_term(uuid, uuid, uuid) to service_role;
grant execute on function public.leave_community(uuid, uuid) to service_role;
grant execute on function public.redeem_community_invite(uuid, uuid) to service_role;

alter table public.community_announcements enable row level security;
alter table public.community_invites enable row level security;
alter table public.community_invite_redemptions enable row level security;

drop policy if exists community_announcements_select_members on public.community_announcements;
create policy community_announcements_select_members
  on public.community_announcements for select
  using (exists (
    select 1
    from public.community_memberships membership
    where membership.community_id = community_announcements.community_id
      and membership.user_id = auth.uid()
      and membership.status = 'active'
  ));

drop policy if exists community_invites_select_own on public.community_invites;
create policy community_invites_select_own
  on public.community_invites for select
  using (created_by = auth.uid());

drop policy if exists community_invite_redemptions_select_own on public.community_invite_redemptions;
create policy community_invite_redemptions_select_own
  on public.community_invite_redemptions for select
  using (user_id = auth.uid());

notify pgrst, 'reload schema';

commit;
