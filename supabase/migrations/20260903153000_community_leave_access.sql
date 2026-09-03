-- Leaving ends membership access, including legacy completed enrollments.
-- Answers, mastery, subjects, documents, and other members are not deleted.
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
  matched public.communities%rowtype;
  matched_role text;
begin
  select * into matched from public.communities
  where id = target_community_id and status = 'active'
  for update;
  if matched.id is null then
    raise exception 'Community not found.' using errcode = 'P0002';
  end if;
  if target_user_id is null or matched.creator_id = target_user_id then
    raise exception 'Community creators cannot leave their own community.' using errcode = '42501';
  end if;

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
  set status = 'left', left_at = now(), current_term_id = null, updated_at = now()
  where community_id = target_community_id and user_id = target_user_id;

  update public.teacher_course_enrollments
  set status = 'cancelled'
  where course_id = matched.study_course_id and student_id = target_user_id
    and status in ('active', 'completed');
end;
$$;

revoke all on function public.leave_community(uuid, uuid) from public, anon, authenticated;
grant execute on function public.leave_community(uuid, uuid) to service_role;
notify pgrst, 'reload schema';
