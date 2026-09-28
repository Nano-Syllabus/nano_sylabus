-- A subtopic a student has COMPLETED is never assigned to them again.
--
-- The daily-queue unique key is (user, course, date, subject, topic), so the
-- database allowed the same subtopic on every new Nepal day. The app compared
-- recommendations with today's rows only, and a student who passed "Data Types"
-- on 2026-09-25 was handed it again on 09-26 (completed twice) and 09-27.
--
-- A unique index over completed rows would fail a student's grading the moment
-- they finished one of the already-duplicated open rows, so the guard sits on
-- INSERT: a new row whose subtopic (by key, or by title — `/start` can rewrite
-- the key) already has a completed row for this user/course/subject is refused
-- with unique_violation (23505), which every insert path already treats as
-- "someone else assigned it, re-read the list".
--
-- Existing duplicates are left in place as history; the app hides open rows on
-- a completed subtopic.

create index if not exists student_challenges_completed_topic_idx
  on public.student_challenges (user_id, subject_slug, topic_key)
  where status = 'completed';

create or replace function public.student_challenges_reject_completed_topic()
returns trigger
language plpgsql
as $$
begin
  if exists (
    select 1
    from public.student_challenges done
    where done.user_id = new.user_id
      and done.status = 'completed'
      and done.course_id is not distinct from new.course_id
      and lower(done.subject_slug) = lower(new.subject_slug)
      and (
        done.topic_key = new.topic_key
        or lower(btrim(done.topic_title)) = lower(btrim(new.topic_title))
      )
  ) then
    raise exception 'subtopic % already completed by this student', new.topic_key
      using errcode = 'unique_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists student_challenges_reject_completed_topic
  on public.student_challenges;
create trigger student_challenges_reject_completed_topic
  before insert on public.student_challenges
  for each row execute function public.student_challenges_reject_completed_topic();
