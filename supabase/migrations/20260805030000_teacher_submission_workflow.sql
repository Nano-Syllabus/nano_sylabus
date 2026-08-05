alter table public.teacher_exam_assignments
  add column if not exists max_attempts integer not null default 1
  check (max_attempts between 1 and 10);

alter table public.teacher_exam_submissions
  add column if not exists attempt_no integer not null default 1,
  add column if not exists updated_at timestamptz not null default timezone('utc'::text, now());

with ranked as (
  select id,
         row_number() over (
           partition by assignment_id, student_id
           order by created_at asc, id asc
         ) as next_attempt
  from public.teacher_exam_submissions
  where assignment_id is not null and student_id is not null
)
update public.teacher_exam_submissions as submission
set attempt_no = ranked.next_attempt
from ranked
where submission.id = ranked.id;

drop index if exists public.teacher_exam_submissions_assignment_student_uidx;

create unique index if not exists teacher_exam_submissions_assignment_student_attempt_uidx
  on public.teacher_exam_submissions (assignment_id, student_id, attempt_no)
  where assignment_id is not null and student_id is not null;

create index if not exists teacher_exam_submissions_attempt_history_idx
  on public.teacher_exam_submissions (assignment_id, student_id, attempt_no desc);

create table if not exists public.teacher_classroom_activity (
  id uuid primary key default gen_random_uuid(),
  classroom_id uuid not null references public.teacher_classrooms(id) on delete cascade,
  actor_id uuid,
  actor_kind text not null default 'teacher' check (actor_kind in ('teacher', 'student', 'system')),
  event_type text not null,
  summary text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc'::text, now())
);

create index if not exists teacher_classroom_activity_created_idx
  on public.teacher_classroom_activity (classroom_id, created_at desc);

alter table public.teacher_classroom_activity enable row level security;

-- Teacher workflow data stays server-only. Authenticated app routes use the
-- service role and enforce classroom membership/lead permissions.
