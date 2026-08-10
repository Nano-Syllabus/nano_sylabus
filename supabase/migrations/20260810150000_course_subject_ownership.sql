-- Upgrade installations that applied the first course migration before
-- subjects became exclusive children of a course.
alter table public.teacher_course_subjects
  add column if not exists teacher_id uuid;

update public.teacher_course_subjects course_subject
set teacher_id = course.teacher_id
from public.teacher_courses course
where course.id = course_subject.course_id
  and course_subject.teacher_id is null;

alter table public.teacher_course_subjects
  alter column teacher_id set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'teacher_courses_id_teacher_unique'
  ) then
    alter table public.teacher_courses
      add constraint teacher_courses_id_teacher_unique unique (id, teacher_id);
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'teacher_course_subjects_course_teacher_fk'
  ) then
    alter table public.teacher_course_subjects
      add constraint teacher_course_subjects_course_teacher_fk
      foreign key (course_id, teacher_id)
      references public.teacher_courses(id, teacher_id)
      on delete cascade;
  end if;
end
$$;

create unique index if not exists teacher_course_subjects_teacher_slug_unique
  on public.teacher_course_subjects (teacher_id, subject_slug);
