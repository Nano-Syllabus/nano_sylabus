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

create index if not exists teacher_subject_profiles_teacher_idx
  on public.teacher_subject_profiles (teacher_id, created_at desc);

alter table public.teacher_subject_profiles enable row level security;

-- Teacher subject metadata is read and written only by authenticated server
-- routes using the service role. Collection isolation is still enforced by
-- the teacher's collection key for files, retrieval and paper generation.
