-- Every durable student trail must retain the course that granted access.
-- Nullable course ids are intentional for a teacher studying their own private
-- subject; those rows are owned through teacher_subject_profiles instead.
alter table public.student_practice_attempts
  add column if not exists course_id uuid references public.teacher_courses(id) on delete cascade;

alter table public.student_topic_mastery
  add column if not exists course_id uuid references public.teacher_courses(id) on delete cascade;

alter table public.chat_sessions
  add column if not exists course_id uuid references public.teacher_courses(id) on delete cascade,
  add column if not exists subject_slug text;

alter table if exists public.student_challenges
  add column if not exists course_id uuid references public.teacher_courses(id) on delete cascade;

create index if not exists student_practice_attempts_user_course_idx
  on public.student_practice_attempts(user_id, course_id, created_at desc);
create index if not exists student_topic_mastery_user_course_idx
  on public.student_topic_mastery(user_id, course_id, subject_slug);
create index if not exists chat_sessions_user_course_idx
  on public.chat_sessions(user_id, course_id, updated_at desc);
create index if not exists student_challenges_user_course_idx
  on public.student_challenges(user_id, course_id, challenge_date desc);

-- Backfill rows whose student still has the original enrollment and subject
-- link. DISTINCT ON makes this deterministic even if legacy data contains the
-- same subject in more than one course.
with matches as (
  select distinct on (attempt.id) attempt.id, link.course_id
  from public.student_practice_attempts attempt
  join public.teacher_course_enrollments enrollment
    on enrollment.student_id = attempt.user_id
   and enrollment.status in ('active', 'completed')
  join public.teacher_course_subjects link
    on link.course_id = enrollment.course_id
   and link.subject_slug = attempt.subject_slug
  order by attempt.id, enrollment.enrolled_at desc
)
update public.student_practice_attempts attempt
set course_id = matches.course_id
from matches
where attempt.id = matches.id and attempt.course_id is null;

with matches as (
  select distinct on (mastery.id) mastery.id, link.course_id
  from public.student_topic_mastery mastery
  join public.teacher_course_enrollments enrollment
    on enrollment.student_id = mastery.user_id
   and enrollment.status in ('active', 'completed')
  join public.teacher_course_subjects link
    on link.course_id = enrollment.course_id
   and link.subject_slug = mastery.subject_slug
  order by mastery.id, enrollment.enrolled_at desc
)
update public.student_topic_mastery mastery
set course_id = matches.course_id
from matches
where mastery.id = matches.id and mastery.course_id is null;

with matches as (
  select distinct on (challenge.id) challenge.id, link.course_id
  from public.student_challenges challenge
  join public.teacher_course_enrollments enrollment
    on enrollment.student_id = challenge.user_id
   and enrollment.status in ('active', 'completed')
  join public.teacher_course_subjects link
    on link.course_id = enrollment.course_id
   and link.subject_slug = challenge.subject_slug
  order by challenge.id, enrollment.enrolled_at desc
)
update public.student_challenges challenge
set course_id = matches.course_id
from matches
where challenge.id = matches.id and challenge.course_id is null;

with normalized_sessions as (
  select
    session.id,
    session.user_id,
    regexp_replace(lower(trim(coalesce(session.subject_context, ''))), '[^a-z0-9]+', '-', 'g') as subject_key
  from public.chat_sessions session
  where nullif(trim(coalesce(session.subject_context, '')), '') is not null
), matches as (
  select distinct on (session.id)
    session.id,
    link.course_id,
    link.subject_slug
  from normalized_sessions session
  join public.teacher_course_enrollments enrollment
    on enrollment.student_id = session.user_id
   and enrollment.status in ('active', 'completed')
  join public.teacher_course_subjects link
    on link.course_id = enrollment.course_id
   and session.subject_key in (
     regexp_replace(lower(trim(link.subject_slug)), '[^a-z0-9]+', '-', 'g'),
     regexp_replace(lower(trim(link.subject_name)), '[^a-z0-9]+', '-', 'g')
   )
  order by session.id, enrollment.enrolled_at desc
)
update public.chat_sessions session
set course_id = matches.course_id, subject_slug = matches.subject_slug
from matches
where session.id = matches.id and session.course_id is null;

-- Preserve teacher-owned private subject trails without pretending the
-- synthetic `private:*` access key is a course UUID.
update public.chat_sessions session
set subject_slug = profile.subject_slug
from public.teachers teacher
join public.teacher_subject_profiles profile on profile.teacher_id = teacher.id
where teacher.user_id = session.user_id
  and session.course_id is null
  and session.subject_slug is null
  and regexp_replace(lower(trim(coalesce(session.subject_context, ''))), '[^a-z0-9]+', '-', 'g') in (
    regexp_replace(lower(trim(profile.subject_slug)), '[^a-z0-9]+', '-', 'g'),
    regexp_replace(lower(trim(profile.subject_name)), '[^a-z0-9]+', '-', 'g')
  );

-- Purge historical rows that can no longer be attributed to either a current
-- course enrollment or the student's own private teacher subject. This is the
-- one-time repair for trails left by the pre-2026-08-18 leave flow. Deleting an
-- attempt cascades its paper/questions/answers and updates daily aggregates.
delete from public.student_practice_attempts attempt
where attempt.course_id is null
  and not exists (
    select 1
    from public.teachers teacher
    join public.teacher_subject_profiles profile on profile.teacher_id = teacher.id
    where teacher.user_id = attempt.user_id
      and profile.subject_slug = attempt.subject_slug
  )
  and not exists (
    select 1
    from public.teacher_classroom_members member
    join public.teacher_classrooms classroom on classroom.id = member.classroom_id
    where member.student_id = attempt.user_id
      and classroom.subject_slug = attempt.subject_slug
  );

delete from public.student_topic_mastery mastery
where mastery.course_id is null
  and not exists (
    select 1
    from public.teachers teacher
    join public.teacher_subject_profiles profile on profile.teacher_id = teacher.id
    where teacher.user_id = mastery.user_id
      and profile.subject_slug = mastery.subject_slug
  )
  and not exists (
    select 1
    from public.teacher_classroom_members member
    join public.teacher_classrooms classroom on classroom.id = member.classroom_id
    where member.student_id = mastery.user_id
      and classroom.subject_slug = mastery.subject_slug
  );

delete from public.student_challenges challenge
where challenge.course_id is null
  and not exists (
    select 1
    from public.teachers teacher
    join public.teacher_subject_profiles profile on profile.teacher_id = teacher.id
    where teacher.user_id = challenge.user_id
      and profile.subject_slug = challenge.subject_slug
  );

delete from public.chat_sessions session
where session.course_id is null
  and nullif(trim(coalesce(session.subject_context, '')), '') is not null
  and session.subject_slug is null;

-- The enrollment is the ownership boundary. These composite constraints are
-- the final race-condition guard: even if grading finishes while another tab
-- leaves the course, no post-leave trail can be inserted, and deleting the
-- enrollment cascades every already-owned row atomically.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'student_practice_attempts_enrollment_fk') then
    alter table public.student_practice_attempts
      add constraint student_practice_attempts_enrollment_fk
      foreign key (course_id, user_id)
      references public.teacher_course_enrollments(course_id, student_id)
      on delete cascade;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'student_topic_mastery_enrollment_fk') then
    alter table public.student_topic_mastery
      add constraint student_topic_mastery_enrollment_fk
      foreign key (course_id, user_id)
      references public.teacher_course_enrollments(course_id, student_id)
      on delete cascade;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'chat_sessions_enrollment_fk') then
    alter table public.chat_sessions
      add constraint chat_sessions_enrollment_fk
      foreign key (course_id, user_id)
      references public.teacher_course_enrollments(course_id, student_id)
      on delete cascade;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'student_challenges_enrollment_fk') then
    alter table public.student_challenges
      add constraint student_challenges_enrollment_fk
      foreign key (course_id, user_id)
      references public.teacher_course_enrollments(course_id, student_id)
      on delete cascade;
  end if;
end
$$;
