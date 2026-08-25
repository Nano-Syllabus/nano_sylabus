-- A challenge is a durable product object, not an alias for an arbitrary
-- practice attempt. The app assigns it from real topic/mastery data, the
-- tenant supplies grounded learning/exam content, and only a server-side grade
-- can complete it.
create table if not exists public.student_challenges (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  challenge_date date not null,
  position smallint not null default 0 check (position >= 0),
  subject_slug text not null,
  subject_name text not null,
  namespace text not null,
  topic_key text not null,
  topic_title text not null,
  topic_blurb text not null default '',
  title text not null,
  recommendation_reason text not null default '',
  status text not null default 'assigned'
    check (status in ('assigned', 'started', 'completed')),
  external_paper_id text,
  content jsonb,
  total_marks numeric not null default 0,
  pass_marks numeric not null default 0,
  duration_minutes integer not null default 20 check (duration_minutes > 0),
  lesson_read_at timestamptz,
  examples_reviewed_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  attempt_count integer not null default 0 check (attempt_count >= 0),
  last_score numeric,
  last_total_marks numeric,
  last_attempt_id uuid references public.student_practice_attempts(id) on delete set null,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now()),
  unique (user_id, challenge_date, subject_slug, topic_key),
  unique (user_id, challenge_date, position)
);

create index if not exists student_challenges_user_date_idx
  on public.student_challenges (user_id, challenge_date desc, position);
create index if not exists student_challenges_completed_idx
  on public.student_challenges (challenge_date desc, user_id)
  where status = 'completed';

alter table public.student_challenges enable row level security;

drop policy if exists "student_challenges_select_own" on public.student_challenges;
create policy "student_challenges_select_own"
  on public.student_challenges for select
  using (auth.uid() = user_id);

-- Atomically links one graded practice record back to its challenge. This
-- prevents concurrent submissions from losing an attempt-count increment.
create or replace function public.record_student_challenge_grade(
  target_user_id uuid,
  target_challenge_id uuid,
  target_attempt_id uuid,
  earned_score numeric,
  available_marks numeric
)
returns setof public.student_challenges
language sql
security definer
set search_path = public
as $$
  update public.student_challenges
  set
    status = case
      when status = 'completed'
        or (available_marks > 0 and earned_score / available_marks >= 0.4)
        then 'completed'
      else 'started'
    end,
    completed_at = case
      when status = 'completed'
        or (available_marks > 0 and earned_score / available_marks >= 0.4)
        then coalesce(completed_at, timezone('utc'::text, now()))
      else completed_at
    end,
    attempt_count = attempt_count + 1,
    last_score = earned_score,
    last_total_marks = available_marks,
    last_attempt_id = target_attempt_id,
    updated_at = timezone('utc'::text, now())
  where id = target_challenge_id
    and user_id = target_user_id
  returning *;
$$;

revoke all on function public.record_student_challenge_grade(uuid, uuid, uuid, numeric, numeric)
  from public, anon, authenticated;
grant execute on function public.record_student_challenge_grade(uuid, uuid, uuid, numeric, numeric)
  to service_role;

-- The challenge dashboard now measures actual challenge objects. Historical
-- practice attempts remain available in Practice, but no longer masquerade as
-- assigned/completed challenges here.
create or replace function public.get_student_challenge_metrics(target_user_id uuid)
returns table (
  has_practice_history boolean,
  today_completed boolean,
  current_streak integer,
  current_streak_rank bigint,
  personal_best_streak integer,
  platform_best_streak integer,
  days_from_best integer,
  practice_per_day numeric,
  practice_per_day_rank bigint,
  top_practice_per_day numeric,
  passed_this_week bigint,
  passed_this_month bigint,
  attempts_last_30 bigint,
  passed_last_30 bigint,
  practice_score_change numeric
)
language sql
stable
security definer
set search_path = public
as $$
  with params as (
    select (timezone('Asia/Kathmandu', now()))::date as today
  ),
  completed_days as (
    select user_id, challenge_date
    from public.student_challenges
    where status = 'completed'
    group by user_id, challenge_date
  ),
  numbered_days as (
    select
      user_id,
      challenge_date,
      challenge_date - row_number() over (
        partition by user_id order by challenge_date
      )::integer as streak_group
    from completed_days
  ),
  streak_groups as (
    select
      user_id,
      count(*)::integer as streak_length,
      max(challenge_date) as streak_end
    from numbered_days
    group by user_id, streak_group
  ),
  user_streaks as (
    select
      groups.user_id,
      max(groups.streak_length)::integer as best_streak,
      coalesce(max(groups.streak_length) filter (
        where groups.streak_end in (params.today, params.today - 1)
      ), 0)::integer as current_streak
    from streak_groups groups
    cross join params
    group by groups.user_id
  ),
  ranked_streaks as (
    select
      user_id,
      best_streak,
      current_streak,
      rank() over (order by current_streak desc) as current_rank
    from user_streaks
  ),
  weekly_completions as (
    select challenge.user_id, count(*)::bigint as completed
    from public.student_challenges challenge
    cross join params
    where challenge.status = 'completed'
      and challenge.challenge_date between params.today - 6 and params.today
    group by challenge.user_id
  ),
  ranked_weekly as (
    select
      user_id,
      completed,
      rank() over (order by completed desc) as weekly_rank
    from weekly_completions
  ),
  viewer as (
    select
      exists (
        select 1 from public.student_challenges where user_id = target_user_id
      ) as has_history,
      exists (
        select 1
        from public.student_challenges challenge
        cross join params
        where challenge.user_id = target_user_id
          and challenge.challenge_date = params.today
          and challenge.status = 'completed'
      ) as completed_today,
      count(*) filter (
        where challenge.status = 'completed'
          and challenge.challenge_date between params.today - 6 and params.today
      )::bigint as week_passed,
      count(*) filter (
        where challenge.status = 'completed'
          and challenge.challenge_date >= date_trunc('month', params.today)::date
          and challenge.challenge_date <= params.today
      )::bigint as month_passed,
      coalesce(sum(challenge.attempt_count) filter (
        where challenge.challenge_date between params.today - 29 and params.today
      ), 0)::bigint as recent_attempts,
      count(*) filter (
        where challenge.status = 'completed'
          and challenge.challenge_date between params.today - 29 and params.today
      )::bigint as recent_passed,
      avg(
        case when challenge.last_total_marks > 0
          then challenge.last_score / challenge.last_total_marks * 100
        end
      ) filter (
        where challenge.challenge_date between params.today - 6 and params.today
      ) as current_score_average,
      avg(
        case when challenge.last_total_marks > 0
          then challenge.last_score / challenge.last_total_marks * 100
        end
      ) filter (
        where challenge.challenge_date between params.today - 13 and params.today - 7
      ) as previous_score_average
    from params
    left join public.student_challenges challenge on challenge.user_id = target_user_id
    group by params.today
  ),
  platform as (
    select
      coalesce((select max(best_streak) from user_streaks), 0)::integer as historical_best_streak,
      coalesce((select max(completed) from weekly_completions), 0)::bigint as top_weekly
  )
  select
    viewer.has_history,
    viewer.completed_today,
    coalesce(streak.current_streak, 0)::integer,
    case when coalesce(streak.current_streak, 0) > 0 then streak.current_rank else null end,
    coalesce(streak.best_streak, 0)::integer,
    platform.historical_best_streak,
    greatest(platform.historical_best_streak - coalesce(streak.current_streak, 0), 0)::integer,
    viewer.week_passed::numeric / 7,
    weekly.weekly_rank,
    platform.top_weekly::numeric / 7,
    viewer.week_passed,
    viewer.month_passed,
    viewer.recent_attempts,
    viewer.recent_passed,
    case
      when viewer.current_score_average is not null and viewer.previous_score_average is not null
        then viewer.current_score_average - viewer.previous_score_average
      else null
    end
  from viewer
  cross join platform
  left join ranked_streaks streak on streak.user_id = target_user_id
  left join ranked_weekly weekly on weekly.user_id = target_user_id;
$$;

revoke all on function public.get_student_challenge_metrics(uuid) from public, anon, authenticated;
grant execute on function public.get_student_challenge_metrics(uuid) to service_role;
