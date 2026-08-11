alter table public.revision_notes
  add column if not exists course_id uuid,
  add column if not exists subject_slug text,
  add column if not exists subject_name text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'revision_notes_course_subject_pair_check'
  ) then
    alter table public.revision_notes
      add constraint revision_notes_course_subject_pair_check
      check (
        (course_id is null and subject_slug is null)
        or (course_id is not null and subject_slug is not null)
      );
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'revision_notes_course_subject_fk'
  ) then
    alter table public.revision_notes
      add constraint revision_notes_course_subject_fk
      foreign key (course_id, subject_slug)
      references public.teacher_course_subjects(course_id, subject_slug)
      on update cascade
      on delete set null;
  end if;
end
$$;

create index if not exists revision_notes_user_course_subject_idx
  on public.revision_notes(user_id, course_id, subject_slug, created_at desc)
  where course_id is not null and subject_slug is not null;
