-- Published invite-only courses stay out of the public catalog but can be
-- joined through one revocable, high-entropy link owned by the course.
alter table public.teacher_courses
  add column if not exists invite_code text,
  add column if not exists invite_created_at timestamptz;

create unique index if not exists teacher_courses_invite_code_unique
  on public.teacher_courses (invite_code)
  where invite_code is not null;

alter table public.teacher_courses
  drop constraint if exists teacher_courses_invite_code_check;

alter table public.teacher_courses
  add constraint teacher_courses_invite_code_check
  check (invite_code is null or invite_code ~ '^[A-Z0-9]{16,64}$');

update public.teacher_courses
set
  invite_code = upper(replace(gen_random_uuid()::text, '-', '')),
  invite_created_at = coalesce(published_at, timezone('utc'::text, now()))
where status = 'published'
  and visibility = 'unlisted'
  and archived_at is null
  and invite_code is null;

-- Course authors manage and preview their own material through the teacher
-- workspace. They are not students in their own course.
delete from public.teacher_course_enrollments enrollment
using public.teacher_courses course, public.teachers teacher
where enrollment.course_id = course.id
  and course.teacher_id = teacher.id
  and enrollment.student_id = teacher.user_id;
