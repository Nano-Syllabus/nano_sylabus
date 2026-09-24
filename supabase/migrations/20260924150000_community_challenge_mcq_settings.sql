-- How an MCQ community's challenges are set and marked.
--
--   challenge_mcq_count            — MCQs per challenge (5–30), the creator's choice
--   challenge_mcq_negative_percent — share of a question's marks taken off for a
--                                    WRONG answer; unanswered is never penalised
--
-- Read with the format (`20260924120000_community_challenge_question_format.sql`).
-- The app keeps working without these columns: count 10, no negative marking.

alter table public.communities
  add column if not exists challenge_mcq_count integer not null default 10,
  add column if not exists challenge_mcq_negative_percent integer not null default 0;

alter table public.communities
  drop constraint if exists communities_challenge_mcq_count_check;
alter table public.communities
  add constraint communities_challenge_mcq_count_check
  check (challenge_mcq_count between 5 and 30);

alter table public.communities
  drop constraint if exists communities_challenge_mcq_negative_percent_check;
alter table public.communities
  add constraint communities_challenge_mcq_negative_percent_check
  check (challenge_mcq_negative_percent in (0, 10, 20, 25, 33, 50));
