-- The practice API computes a chapter-wise `evaluation` on every grade call and
-- stores nothing, so a student's knowledge graph has to be kept here. These two
-- tables are what Today reads: mastery drives "Chapters still red" and "Worth an
-- hour today", attempts drive "Your average so far".

create table if not exists public.student_topic_mastery (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  subject_slug text not null,
  subject_name text not null default '',
  topic_key text not null,
  topic_title text not null default '',
  -- Mirrors the tenant's own verdict: strong | developing | weak | not_attempted
  status text not null default 'not_attempted',
  -- Exponentially smoothed so a single bad sitting does not erase a chapter.
  percentage numeric not null default 0,
  -- Share of a paper's whole marks dropped here — how "Worth an hour today" ranks.
  lost_weightage numeric not null default 0,
  marks_lost numeric not null default 0,
  attempts integer not null default 0,
  last_attempted_at timestamptz,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now()),
  unique (user_id, subject_slug, topic_key)
);

create index if not exists student_topic_mastery_user_idx
  on public.student_topic_mastery (user_id, status);

create table if not exists public.student_practice_attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  subject_slug text not null,
  subject_name text not null default '',
  -- practice = ephemeral sitting, teacher_exam = an assigned paper
  source text not null default 'practice',
  session_id text not null default '',
  total_score numeric not null default 0,
  total_marks numeric not null default 0,
  evaluation jsonb,
  created_at timestamptz not null default timezone('utc'::text, now())
);

create index if not exists student_practice_attempts_user_idx
  on public.student_practice_attempts (user_id, created_at desc);

alter table public.student_topic_mastery enable row level security;
alter table public.student_practice_attempts enable row level security;

-- Students may read their own record. Writes happen only in server routes using
-- the service role, after the tenant has graded the sitting.
drop policy if exists "student_topic_mastery_select_own" on public.student_topic_mastery;
create policy "student_topic_mastery_select_own"
  on public.student_topic_mastery for select
  using (auth.uid() = user_id);

drop policy if exists "student_practice_attempts_select_own" on public.student_practice_attempts;
create policy "student_practice_attempts_select_own"
  on public.student_practice_attempts for select
  using (auth.uid() = user_id);
