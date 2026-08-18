-- This migration is intentionally self-contained because some production
-- projects were created before teacher_subject_profiles was introduced.
create table if not exists public.teacher_subject_profiles (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references public.teachers(id) on delete cascade,
  subject_slug text not null,
  subject_name text not null,
  subject_code text not null default '',
  university text not null default '',
  programme text not null default '',
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now()),
  unique (teacher_id, subject_slug)
);

alter table public.teacher_subject_profiles
  add column if not exists visibility text not null default 'private',
  add column if not exists folder_path text not null default '';

alter table public.teacher_subject_profiles
  drop constraint if exists teacher_subject_profiles_visibility_check;

alter table public.teacher_subject_profiles
  add constraint teacher_subject_profiles_visibility_check
  check (visibility in ('public', 'private'));

-- Subjects already packaged into a course are public course content. Everything
-- else remains private to its creator until it is explicitly attached.
do $$
begin
  if to_regclass('public.teacher_course_subjects') is not null then
    execute $sql$
      update public.teacher_subject_profiles as profile
      set visibility = 'public'
      where exists (
        select 1
        from public.teacher_course_subjects as course_subject
        where course_subject.teacher_id = profile.teacher_id
          and course_subject.subject_slug = profile.subject_slug
      )
    $sql$;
  end if;
end
$$;

update public.teacher_subject_profiles
set folder_path = subject_name
where folder_path = '';

create index if not exists teacher_subject_profiles_owner_visibility_idx
  on public.teacher_subject_profiles (teacher_id, visibility, updated_at desc);

create index if not exists teacher_subject_profiles_teacher_idx
  on public.teacher_subject_profiles (teacher_id, created_at desc);

alter table public.teacher_subject_profiles enable row level security;
