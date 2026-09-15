-- The syllabus unit a challenge's subtopic sits under, carried on the challenge
-- row itself.
--
-- WHY IT CANNOT BE LOOKED UP LATER
-- --------------------------------
-- The revision docs rebuild "Unit 3 → Oscillation" by joining a filed challenge
-- back to the course's published topic catalogue on `topic_key`. That join is
-- not stable: `/start` REWRITES `topic_key` to whatever key the provider
-- resolved the topic to, and a subject that has been re-extracted since the row
-- was assigned renumbers those keys. When the join misses, the topic does not
-- disappear — it files under "Other topics", which is the revision docs quietly
-- losing the syllabus structure they exist to present.
--
-- The unit is known for certain at exactly one moment: when the challenge is
-- assigned, straight off `community_subject_topics.unit_number`. Writing it down
-- then makes it durable, and makes the catalogue join an upgrade rather than a
-- dependency.
--
-- Text, not an integer: syllabi number units "3", "3A" and "IV", and a unit
-- number is a label to print, never arithmetic.
alter table if exists public.student_challenges
  add column if not exists unit_number text not null default '';

comment on column public.student_challenges.unit_number is
  'Syllabus unit this subtopic sits under, captured at assignment. "" when the course catalogue does not number it.';

-- Backfill what the catalogue can still resolve, so docs filed before this
-- column existed group correctly too. Rows the join cannot reach keep '' and
-- fall back to the live catalogue lookup exactly as they do today.
update public.student_challenges challenge
set unit_number = coalesce(topic.unit_number, '')
from public.community_subject_topics topic
join public.community_subjects subject on subject.id = topic.community_subject_id
join public.communities community on community.id = subject.community_id
where challenge.unit_number = ''
  and challenge.course_id is not null
  and community.study_course_id = challenge.course_id
  and subject.external_subject_slug = challenge.subject_slug
  and topic.topic_key = challenge.topic_key
  and coalesce(topic.unit_number, '') <> '';
