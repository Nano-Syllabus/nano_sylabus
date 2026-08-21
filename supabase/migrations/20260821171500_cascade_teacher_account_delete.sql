-- Account deletion removes the auth user first. Creator accounts also have a
-- row in public.teachers, and that row owns courses, subjects, files, exams,
-- and classrooms through existing ON DELETE CASCADE constraints.
--
-- Without this cascade, Supabase auth admin deletion is blocked by the
-- teachers.user_id foreign key and /api/account returns a 500.

alter table public.teachers
  drop constraint if exists teachers_user_id_fkey;

alter table public.teachers
  add constraint teachers_user_id_fkey
  foreign key (user_id)
  references auth.users(id)
  on delete cascade;
