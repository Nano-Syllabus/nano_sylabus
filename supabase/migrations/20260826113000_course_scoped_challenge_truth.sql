-- A subject slug is only unique inside its course. Keep mastery and challenge
-- assignments isolated when a student takes similarly named subjects from
-- multiple courses. NULLS NOT DISTINCT gives teacher-owned private subjects a
-- stable scope as well.
do $$
declare
  constraint_name text;
begin
  select con.conname into constraint_name
  from pg_constraint con
  where con.conrelid = 'public.student_topic_mastery'::regclass
    and con.contype = 'u'
    and pg_get_constraintdef(con.oid) = 'UNIQUE (user_id, subject_slug, topic_key)'
  limit 1;
  if constraint_name is not null then
    execute format(
      'alter table public.student_topic_mastery drop constraint %I',
      constraint_name
    );
  end if;
end
$$;

alter table public.student_topic_mastery
  add constraint student_topic_mastery_course_topic_key
  unique nulls not distinct (user_id, course_id, subject_slug, topic_key);

do $$
declare
  constraint_name text;
begin
  select con.conname into constraint_name
  from pg_constraint con
  where con.conrelid = 'public.student_challenges'::regclass
    and con.contype = 'u'
    and pg_get_constraintdef(con.oid) =
      'UNIQUE (user_id, challenge_date, subject_slug, topic_key)'
  limit 1;
  if constraint_name is not null then
    execute format(
      'alter table public.student_challenges drop constraint %I',
      constraint_name
    );
  end if;
end
$$;

alter table public.student_challenges
  add constraint student_challenges_course_daily_topic_key
  unique nulls not distinct (
    user_id,
    course_id,
    challenge_date,
    subject_slug,
    topic_key
  );

create index if not exists student_challenges_completed_at_idx
  on public.student_challenges (completed_at desc, user_id)
  where status = 'completed';
