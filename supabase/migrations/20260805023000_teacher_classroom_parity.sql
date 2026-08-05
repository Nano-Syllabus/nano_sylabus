alter table public.teacher_classrooms
  add column if not exists term_key text not null default '2026',
  add column if not exists meeting_schedule text not null default '',
  add column if not exists notice text not null default '',
  add column if not exists notice_updated_at timestamptz;

create index if not exists teacher_classrooms_teacher_term_idx
  on public.teacher_classrooms (teacher_id, term_key desc, created_at desc);

create table if not exists public.teacher_classroom_teachers (
  classroom_id uuid not null references public.teacher_classrooms(id) on delete cascade,
  teacher_id uuid not null references public.teachers(id) on delete cascade,
  role text not null check (role in ('lead', 'helper')) default 'helper',
  joined_at timestamptz not null default timezone('utc'::text, now()),
  primary key (classroom_id, teacher_id)
);

insert into public.teacher_classroom_teachers (classroom_id, teacher_id, role)
select id, teacher_id, 'lead' from public.teacher_classrooms
on conflict (classroom_id, teacher_id) do update set role = 'lead';

create index if not exists teacher_classroom_teachers_teacher_idx
  on public.teacher_classroom_teachers (teacher_id, joined_at desc);

alter table public.teacher_classroom_teachers enable row level security;

-- Classroom and grading data remain server-only. Authenticated API routes use
-- the service role and enforce lead/helper access before returning any row.
