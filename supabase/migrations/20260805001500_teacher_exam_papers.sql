create table if not exists public.teacher_exam_papers (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references public.teachers(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  external_paper_id text not null,
  subject_slug text not null,
  subject_name text not null,
  title text not null,
  total_marks numeric not null default 0,
  pass_marks numeric not null default 0,
  share_url text not null default '',
  paper jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc'::text, now()),
  unique (teacher_id, external_paper_id)
);

create index if not exists teacher_exam_papers_teacher_created_idx
  on public.teacher_exam_papers (teacher_id, created_at desc);

create index if not exists teacher_exam_papers_subject_idx
  on public.teacher_exam_papers (teacher_id, subject_slug, created_at desc);

alter table public.teacher_exam_papers enable row level security;

-- This table includes teacher-only reference answers. No browser RLS policies
-- are intentionally created; teacher API routes access it with the service role.
