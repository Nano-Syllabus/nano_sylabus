-- One user, one faculty PER SUBDOMAIN (user, 2026-10-08): the same person may
-- join ioe.nanosyllabus.com (BCT) and license.nanosyllabus.com (its faculty);
-- joining one site never blocks another, and each site keeps its own faculty.
--
-- The rest of the app still studies in ONE active member faculty at a time
-- (community_memberships_one_active_member_per_user). Which one is active
-- follows the subdomain being used: `activate_exam_enrollment` switches the
-- active membership to that site's enrolled faculty.

alter table public.student_exam_enrollments drop constraint student_exam_enrollments_pkey;
alter table public.student_exam_enrollments add primary key (user_id, exam_slug);

-- Choose (or, with allow_change, change) the faculty for ONE site. Other
-- sites' enrollments are untouched.
create or replace function public.select_exam_faculty(target_user_id uuid, target_exam_slug text, target_community_id uuid,
  preparation_answers jsonb, allow_change boolean default false)
returns void language plpgsql security invoker set search_path = '' as $$
declare previous public.student_exam_enrollments%rowtype; previous_membership record; selected_course_id uuid;
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(target_user_id::text, 731));
  select * into previous from public.student_exam_enrollments
    where user_id = target_user_id and exam_slug = target_exam_slug for update;
  if found then
    if previous.community_id = target_community_id then
      perform public.activate_exam_enrollment(target_user_id, target_exam_slug);
      return;
    end if;
    if not allow_change then raise exception 'Your faculty is locked. Contact an admin.' using errcode = 'P0001'; end if;
  end if;
  perform 1 from public.landing_exam_faculties f
    join public.landing_sites s on s.slug = f.exam_slug
    join public.communities c on c.id = f.community_id
    where f.exam_slug = target_exam_slug and f.community_id = target_community_id and f.is_active
      and s.status = 'live' and coalesce((s.exam_config->>'enabled')::boolean, false)
      and c.status = 'active' and c.visibility = 'public' for share of f, s, c;
  if not found then raise exception 'Unsupported faculty.' using errcode = '22023'; end if;
  if jsonb_typeof(preparation_answers) <> 'object' then raise exception 'Invalid answers.' using errcode = '22023'; end if;
  delete from public.student_exam_enrollments where user_id = target_user_id and exam_slug = target_exam_slug;
  insert into public.student_exam_enrollments(user_id,exam_slug,community_id,preparation_answers)
    values(target_user_id,target_exam_slug,target_community_id,preparation_answers);
  perform public.activate_exam_enrollment(target_user_id, target_exam_slug);
end;
$$;

-- Make this site's enrolled faculty the one the student studies in now: other
-- member faculties are left (their records stay), this one is joined, and its
-- study course enrollment is active. A no-op when it already is.
create or replace function public.activate_exam_enrollment(target_user_id uuid, target_exam_slug text)
returns uuid language plpgsql security invoker set search_path = '' as $$
declare target_community uuid; target_course uuid; previous_membership record;
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(target_user_id::text, 731));
  select community_id into target_community from public.student_exam_enrollments
    where user_id = target_user_id and exam_slug = target_exam_slug;
  if target_community is null then return null; end if;
  if exists(select 1 from public.community_memberships where user_id = target_user_id
      and community_id = target_community and status = 'active') then
    return target_community;
  end if;
  for previous_membership in select m.community_id, c.study_course_id from public.community_memberships m
      join public.communities c on c.id = m.community_id
      where m.user_id = target_user_id and m.role = 'member' and m.status = 'active' and m.community_id <> target_community loop
    update public.community_memberships set status = 'left', left_at = now(), current_term_id = null
      where community_id = previous_membership.community_id and user_id = target_user_id;
    update public.teacher_course_enrollments set status = 'cancelled' where student_id = target_user_id
      and teacher_course_enrollments.course_id = previous_membership.study_course_id and status in ('active','completed');
  end loop;
  perform public.join_community(target_user_id, (select slug from public.communities where id = target_community));
  select study_course_id into target_course from public.communities where id = target_community;
  if target_course is not null then
    insert into public.teacher_course_enrollments(course_id,student_id,status) values(target_course,target_user_id,'active')
      on conflict(course_id,student_id) do update set status = 'active';
  end if;
  return target_community;
end;
$$;

-- The guard now knows a set of enrolled faculties: the active member faculty
-- must be one of them, and an enrolled faculty's membership can't be deleted
-- (leaving it, when another site is active, is fine).
create or replace function public.guard_exam_faculty_membership()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare member_user uuid;
begin
  if tg_op = 'UPDATE' and (new.user_id <> old.user_id or new.community_id <> old.community_id) then
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(old.user_id::text, 731));
    if exists(select 1 from public.student_exam_enrollments where user_id = old.user_id and community_id = old.community_id) then
      raise exception 'Your faculty is locked. Contact an admin.' using errcode = 'P0001';
    end if;
  end if;
  member_user := case when tg_op = 'DELETE' then old.user_id else new.user_id end;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(member_user::text, 731));
  if not exists(select 1 from public.student_exam_enrollments where user_id = member_user) then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;
  if tg_op = 'DELETE' then
    if exists(select 1 from public.student_exam_enrollments where user_id = old.user_id and community_id = old.community_id) then
      -- Deleting the auth account must still be able to cascade its records.
      if not exists(select 1 from auth.users where id = old.user_id) then return old; end if;
      raise exception 'Your faculty is locked. Contact an admin.' using errcode = 'P0001';
    end if;
    return old;
  end if;
  if new.role = 'member' and new.status = 'active'
     and not exists(select 1 from public.student_exam_enrollments where user_id = new.user_id and community_id = new.community_id) then
    raise exception 'Your faculty is locked. Contact an admin.' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

revoke all on function public.activate_exam_enrollment(uuid, text) from public, anon, authenticated;
grant execute on function public.activate_exam_enrollment(uuid, text) to service_role;
revoke all on function public.select_exam_faculty(uuid,text,uuid,jsonb,boolean), public.guard_exam_faculty_membership()
  from public, anon, authenticated;
grant execute on function public.select_exam_faculty(uuid,text,uuid,jsonb,boolean) to service_role;
notify pgrst, 'reload schema';
