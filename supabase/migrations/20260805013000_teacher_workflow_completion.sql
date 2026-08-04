alter table public.teacher_exam_papers
  add column if not exists updated_at timestamptz not null default timezone('utc'::text, now()),
  add column if not exists archived_at timestamptz;

create table if not exists public.teacher_exam_submissions (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references public.teachers(id) on delete cascade,
  paper_id uuid not null references public.teacher_exam_papers(id) on delete cascade,
  student_id uuid references auth.users(id) on delete set null,
  external_submission_id text,
  student_name text not null default 'Student',
  source text not null check (source in ('typed', 'upload')),
  grade jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc'::text, now())
);

create index if not exists teacher_exam_submissions_paper_created_idx
  on public.teacher_exam_submissions (paper_id, created_at desc);

create table if not exists public.teacher_subject_syllabi (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references public.teachers(id) on delete cascade,
  subject_slug text not null,
  structure jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default timezone('utc'::text, now()),
  unique (teacher_id, subject_slug)
);

create table if not exists public.teacher_document_files (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references public.teachers(id) on delete cascade,
  external_document_id text,
  collection_path text not null,
  storage_path text not null unique,
  original_name text not null,
  mime_type text not null default 'application/octet-stream',
  size_bytes bigint not null default 0,
  created_at timestamptz not null default timezone('utc'::text, now()),
  unique (teacher_id, collection_path)
);

insert into storage.buckets (id, name, public, file_size_limit)
values ('teacher-documents', 'teacher-documents', false, 52428800)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit;

create table if not exists public.teacher_classrooms (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references public.teachers(id) on delete cascade,
  subject_slug text not null,
  subject_name text not null,
  name text not null,
  join_code text not null unique,
  created_at timestamptz not null default timezone('utc'::text, now()),
  archived_at timestamptz
);

create index if not exists teacher_classrooms_teacher_created_idx
  on public.teacher_classrooms (teacher_id, created_at desc);

create table if not exists public.teacher_classroom_members (
  classroom_id uuid not null references public.teacher_classrooms(id) on delete cascade,
  student_id uuid not null references auth.users(id) on delete cascade,
  joined_at timestamptz not null default timezone('utc'::text, now()),
  primary key (classroom_id, student_id)
);

create index if not exists teacher_classroom_members_student_idx
  on public.teacher_classroom_members (student_id, joined_at desc);

create table if not exists public.teacher_exam_assignments (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references public.teachers(id) on delete cascade,
  paper_id uuid not null references public.teacher_exam_papers(id) on delete cascade,
  classroom_id uuid not null references public.teacher_classrooms(id) on delete cascade,
  opens_at timestamptz,
  closes_at timestamptz,
  created_at timestamptz not null default timezone('utc'::text, now()),
  unique (paper_id, classroom_id)
);

create index if not exists teacher_exam_assignments_classroom_idx
  on public.teacher_exam_assignments (classroom_id, created_at desc);

alter table public.teacher_exam_submissions
  add column if not exists assignment_id uuid references public.teacher_exam_assignments(id) on delete set null;

create unique index if not exists teacher_exam_submissions_assignment_student_uidx
  on public.teacher_exam_submissions (assignment_id, student_id)
  where assignment_id is not null and student_id is not null;

alter table public.teacher_exam_submissions enable row level security;
alter table public.teacher_subject_syllabi enable row level security;
alter table public.teacher_document_files enable row level security;
alter table public.teacher_classrooms enable row level security;
alter table public.teacher_classroom_members enable row level security;
alter table public.teacher_exam_assignments enable row level security;

-- These tables are intentionally accessed only through authenticated server
-- routes using the service role. Reference answers and collection paths never
-- become browser-readable through direct Supabase queries.
