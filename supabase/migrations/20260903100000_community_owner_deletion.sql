-- Owner-requested deletion is reversible storage archival, not data destruction.
-- Reusable teacher subjects, documents, forum records and results remain intact.
create or replace function public.delete_owned_community(
  target_user_id uuid,
  target_community_slug text,
  confirmation_slug text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  matched public.communities%rowtype;
begin
  select * into matched from public.communities
  where slug = target_community_slug
  for update;

  if matched.id is null then
    raise exception 'Community not found.' using errcode = 'P0002';
  end if;
  if target_user_id is null or matched.creator_id <> target_user_id then
    raise exception 'Only the community creator can delete this community.' using errcode = '42501';
  end if;
  if confirmation_slug is null or confirmation_slug <> matched.slug then
    raise exception 'Type the community URL name exactly to confirm deletion.' using errcode = '22023';
  end if;

  -- Retrying after a lost response is safe; always finish revoking access.
  update public.communities set status = 'archived' where id = matched.id;
  update public.community_memberships
  set status = 'left', left_at = coalesce(left_at, now()), updated_at = now()
  where community_id = matched.id and status = 'active';
  update public.community_invites set revoked_at = coalesce(revoked_at, now())
  where community_id = matched.id;

  if matched.study_course_id is not null then
    update public.teacher_courses set status = 'archived' where id = matched.study_course_id;
    update public.teacher_course_enrollments set status = 'cancelled'
    where course_id = matched.study_course_id and status <> 'cancelled';
  end if;
  return matched.id;
end;
$$;

revoke all on function public.delete_owned_community(uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.delete_owned_community(uuid, text, text) to service_role;

-- Serialize active memberships against archival, including concurrent invite redemption.
create or replace function public.require_active_membership_community()
returns trigger language plpgsql set search_path = public as $$
declare community_status text;
begin
  if new.status = 'active' then
    select status into community_status from public.communities
    where id = new.community_id for share;
    if community_status is distinct from 'active' then
      raise exception 'This community is no longer active.' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;
create trigger community_memberships_require_active_community
before insert or update of status, community_id on public.community_memberships
for each row execute function public.require_active_membership_community();

-- A join request already in flight must not recreate legacy course access.
create or replace function public.require_active_enrollment_community()
returns trigger language plpgsql set search_path = public as $$
declare community_status text;
begin
  if new.status = 'active' then
    select status into community_status from public.communities
    where study_course_id = new.course_id for share;
    if found and community_status <> 'active' then
      raise exception 'This community is no longer active.' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;
create trigger teacher_enrollments_require_active_community
before insert or update of status, course_id on public.teacher_course_enrollments
for each row execute function public.require_active_enrollment_community();
