-- The tenant's chapter `percentage` has existed in both 0..1 and 0..100
-- forms. Scores and available marks are unambiguous, so rebuild existing
-- mastery percentages from those durable facts using the same 40% smoothing
-- rule as the application writer.
with recursive chapter_scores as (
  select
    attempt.user_id,
    attempt.course_id,
    attempt.subject_slug,
    attempt.created_at,
    attempt.id as attempt_id,
    chapter.value ->> 'topic_key' as topic_key,
    greatest(
      0::numeric,
      least(
        100::numeric,
        case
          when nullif(chapter.value ->> 'marks', '')::numeric > 0
            then nullif(chapter.value ->> 'score', '')::numeric
              / nullif(chapter.value ->> 'marks', '')::numeric * 100
          else 0
        end
      )
    ) as actual_percentage,
    row_number() over (
      partition by
        attempt.user_id,
        attempt.course_id,
        attempt.subject_slug,
        chapter.value ->> 'topic_key'
      order by attempt.created_at, attempt.id
    ) as sitting_number
  from public.student_practice_attempts attempt
  cross join lateral jsonb_array_elements(
    case
      when jsonb_typeof(attempt.evaluation -> 'chapters') = 'array'
        then attempt.evaluation -> 'chapters'
      else '[]'::jsonb
    end
  ) chapter
  where nullif(trim(chapter.value ->> 'topic_key'), '') is not null
    and coalesce(nullif(chapter.value ->> 'marks', '')::numeric, 0) > 0
    and nullif(chapter.value ->> 'score', '') is not null
), smoothed as (
  select
    score.user_id,
    score.course_id,
    score.subject_slug,
    score.topic_key,
    score.sitting_number,
    score.actual_percentage as percentage
  from chapter_scores score
  where score.sitting_number = 1

  union all

  select
    score.user_id,
    score.course_id,
    score.subject_slug,
    score.topic_key,
    score.sitting_number,
    previous.percentage * 0.6 + score.actual_percentage * 0.4
  from smoothed previous
  join chapter_scores score
    on score.user_id = previous.user_id
   and score.course_id is not distinct from previous.course_id
   and score.subject_slug = previous.subject_slug
   and score.topic_key = previous.topic_key
   and score.sitting_number = previous.sitting_number + 1
), latest as (
  select distinct on (user_id, course_id, subject_slug, topic_key)
    user_id,
    course_id,
    subject_slug,
    topic_key,
    percentage
  from smoothed
  order by user_id, course_id, subject_slug, topic_key, sitting_number desc
)
update public.student_topic_mastery mastery
set
  percentage = round(latest.percentage, 4),
  updated_at = timezone('utc'::text, now())
from latest
where mastery.user_id = latest.user_id
  and mastery.course_id is not distinct from latest.course_id
  and mastery.subject_slug = latest.subject_slug
  and mastery.topic_key = latest.topic_key
  and mastery.percentage is distinct from round(latest.percentage, 4);
