alter table public.student_profiles
  add column if not exists board text not null default '';

