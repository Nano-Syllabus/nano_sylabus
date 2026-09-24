-- Which kind of questions a community's challenge exams ask.
--
--   qna    — written answers, sat on paper and uploaded as a scan (the original exam)
--   mcq    — multiple choice, answered on screen and marked instantly
--   hybrid — both in one sitting: multiple choice on screen plus one written answer
--
-- A COMMUNITY setting, not a per-student or per-challenge one: changing it moves
-- every student in the community to the new format at their next sitting, because
-- a student's open exam is re-issued when its format no longer matches this.
--
-- `challenge_question_format_set_at` is null until the creator has CHOSEN. Existing
-- communities keep running on 'qna' meanwhile; the creator's upload dialog asks for
-- the choice while it is null, rather than assuming a default was a decision.

alter table public.communities
  add column if not exists challenge_question_format text not null default 'qna',
  add column if not exists challenge_question_format_set_at timestamptz;

alter table public.communities
  drop constraint if exists communities_challenge_question_format_check;
alter table public.communities
  add constraint communities_challenge_question_format_check
  check (challenge_question_format in ('qna', 'mcq', 'hybrid'));

comment on column public.communities.challenge_question_format is
  'Challenge exam format for every student in this community: qna | mcq | hybrid.';
comment on column public.communities.challenge_question_format_set_at is
  'When the creator last chose the format; null means it was never chosen.';
