-- Two questions asked while a handwritten answer sheet is being graded.
--
-- Grading a scanned sheet takes the better part of a minute, and the student
-- spends it looking at a spinner. That minute is the one moment they have just
-- finished the challenge and have not yet seen their marks — the only time
-- "what do you expect to score?" is an honest question — so it is asked then,
-- alongside how the challenge was to learn from.
--
-- One row per sitting. A student who skips is recorded too: how many choose
-- not to answer is part of what this is collecting.

create table if not exists public.student_challenge_feedback (
  id uuid primary key default gen_random_uuid(),
  challenge_id uuid not null references public.student_challenges(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,

  -- The exam attempt the sheet was submitted to. A retaken challenge is a new
  -- sitting and is asked again; the same sitting is asked once.
  exam_attempt_id text not null default '',

  skipped boolean not null default false,
  -- 1 (poor) to 5 (excellent), chosen from buttons — there is no free text.
  experience_rating smallint check (experience_rating between 1 and 5),
  -- The student's own guess at their percentage, as one of four bands.
  expected_score_band text
    check (expected_score_band in ('0-25', '26-50', '51-75', '76-100')),

  created_at timestamptz not null default timezone('utc'::text, now()),

  -- Answered means BOTH answered: the modal's Submit is disabled until they are,
  -- and the table holds the same line.
  constraint student_challenge_feedback_answered check (
    skipped
    or (experience_rating is not null and expected_score_band is not null)
  )
);

create unique index if not exists student_challenge_feedback_one_per_sitting
  on public.student_challenge_feedback (user_id, challenge_id, exam_attempt_id);

create index if not exists student_challenge_feedback_created_idx
  on public.student_challenge_feedback (created_at desc);

-- Written by the server with the service role after it has checked the
-- challenge is the student's own; nothing reads or writes it from the browser.
alter table public.student_challenge_feedback enable row level security;
