-- Keep every personal practice paper inspectable after the tenant session expires.
-- The parent `student_practice_attempts` row remains the result summary; these
-- tables store the paper, each question, and each graded answer separately.

create table if not exists public.student_practice_attempt_papers (
  attempt_id uuid primary key references public.student_practice_attempts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  external_exam_id text not null default '',
  title text not null default '',
  exam_kind text not null default 'practice',
  duration_minutes integer not null default 0 check (duration_minutes >= 0),
  pass_marks numeric,
  student_name text not null default '',
  handed_in_at timestamptz not null default timezone('utc'::text, now()),
  created_at timestamptz not null default timezone('utc'::text, now())
);

create index if not exists student_practice_attempt_papers_user_idx
  on public.student_practice_attempt_papers (user_id, handed_in_at desc);

create table if not exists public.student_practice_attempt_questions (
  id uuid primary key default gen_random_uuid(),
  attempt_id uuid not null references public.student_practice_attempts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  external_question_id text not null,
  position integer not null check (position >= 0),
  response_type text not null check (response_type in ('choice', 'short', 'long')),
  question_type text not null default '',
  topic text not null default '',
  prompt text not null,
  marks numeric not null default 0 check (marks >= 0),
  options jsonb,
  expected_choice integer,
  marking_scheme jsonb,
  created_at timestamptz not null default timezone('utc'::text, now()),
  unique (attempt_id, external_question_id)
);

create index if not exists student_practice_attempt_questions_attempt_idx
  on public.student_practice_attempt_questions (attempt_id, position);

create table if not exists public.student_practice_attempt_answers (
  id uuid primary key default gen_random_uuid(),
  attempt_id uuid not null references public.student_practice_attempts(id) on delete cascade,
  question_id uuid not null references public.student_practice_attempt_questions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  answer_text text not null default '',
  selected_choice integer,
  score numeric not null default 0 check (score >= 0),
  feedback text not null default '',
  grading_metadata jsonb not null default '{}'::jsonb,
  graded_at timestamptz not null default timezone('utc'::text, now()),
  created_at timestamptz not null default timezone('utc'::text, now()),
  unique (question_id)
);

create index if not exists student_practice_attempt_answers_attempt_idx
  on public.student_practice_attempt_answers (attempt_id);

create table if not exists public.student_practice_answer_sheets (
  attempt_id uuid primary key references public.student_practice_attempts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  storage_path text not null unique,
  original_name text not null,
  mime_type text not null,
  size_bytes bigint not null default 0 check (size_bytes >= 0),
  created_at timestamptz not null default timezone('utc'::text, now())
);

create index if not exists student_practice_answer_sheets_user_idx
  on public.student_practice_answer_sheets (user_id, created_at desc);

insert into storage.buckets (id, name, public, file_size_limit)
values (
  'student-practice-answer-sheets',
  'student-practice-answer-sheets',
  false,
  15728640
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit;

-- Backfill detailed JSON snapshots saved before these normalized tables existed.
insert into public.student_practice_attempt_papers (
  attempt_id,
  user_id,
  external_exam_id,
  title,
  exam_kind,
  duration_minutes,
  pass_marks,
  student_name,
  handed_in_at
)
select
  attempt.id,
  attempt.user_id,
  coalesce(attempt.evaluation #>> '{attempt_history,exam,id}', ''),
  coalesce(attempt.evaluation #>> '{attempt_history,exam,title}', attempt.subject_name || ' practice'),
  coalesce(attempt.evaluation #>> '{attempt_history,exam,kind}', 'practice'),
  coalesce((attempt.evaluation #>> '{attempt_history,exam,minutes}')::integer, 0),
  nullif(attempt.evaluation #>> '{attempt_history,exam,passMarks}', '')::numeric,
  coalesce(attempt.evaluation #>> '{attempt_history,studentName}', ''),
  coalesce(
    nullif(attempt.evaluation #>> '{attempt_history,handedInAt}', '')::timestamptz,
    attempt.created_at
  )
from public.student_practice_attempts attempt
where jsonb_typeof(attempt.evaluation -> 'attempt_history') = 'object'
on conflict (attempt_id) do nothing;

insert into public.student_practice_attempt_questions (
  attempt_id,
  user_id,
  external_question_id,
  position,
  response_type,
  question_type,
  topic,
  prompt,
  marks,
  options,
  expected_choice,
  marking_scheme
)
select
  attempt.id,
  attempt.user_id,
  question.value ->> 'id',
  question.ordinality - 1,
  case
    when question.value ->> 'type' in ('choice', 'short', 'long')
      then question.value ->> 'type'
    else 'short'
  end,
  coalesce(question.value ->> 'questionType', ''),
  coalesce(question.value ->> 'topic', ''),
  coalesce(question.value ->> 'prompt', ''),
  coalesce((question.value ->> 'marks')::numeric, 0),
  case when jsonb_typeof(question.value -> 'options') = 'array'
    then question.value -> 'options' else null end,
  nullif(question.value ->> 'answer', '')::integer,
  case when jsonb_typeof(question.value -> 'marking') = 'array'
    then question.value -> 'marking' else null end
from public.student_practice_attempts attempt
cross join lateral jsonb_array_elements(
  coalesce(attempt.evaluation #> '{attempt_history,exam,questions}', '[]'::jsonb)
) with ordinality as question(value, ordinality)
where nullif(question.value ->> 'id', '') is not null
on conflict (attempt_id, external_question_id) do nothing;

insert into public.student_practice_attempt_answers (
  attempt_id,
  question_id,
  user_id,
  answer_text,
  selected_choice,
  score,
  feedback,
  graded_at
)
select
  attempt.id,
  question.id,
  attempt.user_id,
  coalesce(result.value ->> 'student_answer', ''),
  nullif(result.value ->> 'selected_choice', '')::integer,
  coalesce((result.value ->> 'score')::numeric, 0),
  coalesce(result.value ->> 'feedback', 'No feedback returned.'),
  coalesce(
    nullif(attempt.evaluation #>> '{attempt_history,handedInAt}', '')::timestamptz,
    attempt.created_at
  )
from public.student_practice_attempts attempt
join public.student_practice_attempt_questions question
  on question.attempt_id = attempt.id
cross join lateral jsonb_array_elements(
  coalesce(attempt.evaluation #> '{attempt_history,results}', '[]'::jsonb)
) as result(value)
where result.value ->> 'question_id' = question.external_question_id
on conflict (question_id) do nothing;

alter table public.student_practice_attempt_papers enable row level security;
alter table public.student_practice_attempt_questions enable row level security;
alter table public.student_practice_attempt_answers enable row level security;
alter table public.student_practice_answer_sheets enable row level security;

-- Grading writes through server routes using the service role. Students can
-- only read the rows belonging to their own authenticated account.
drop policy if exists "student_practice_attempt_papers_select_own"
  on public.student_practice_attempt_papers;
create policy "student_practice_attempt_papers_select_own"
  on public.student_practice_attempt_papers for select
  using (auth.uid() = user_id);

drop policy if exists "student_practice_attempt_questions_select_own"
  on public.student_practice_attempt_questions;
create policy "student_practice_attempt_questions_select_own"
  on public.student_practice_attempt_questions for select
  using (auth.uid() = user_id);

drop policy if exists "student_practice_attempt_answers_select_own"
  on public.student_practice_attempt_answers;
create policy "student_practice_attempt_answers_select_own"
  on public.student_practice_attempt_answers for select
  using (auth.uid() = user_id);

drop policy if exists "student_practice_answer_sheets_select_own"
  on public.student_practice_answer_sheets;
create policy "student_practice_answer_sheets_select_own"
  on public.student_practice_answer_sheets for select
  using (auth.uid() = user_id);
