-- The collection Challenge API is the authority on whether a sitting passed.
-- Persist that verdict and the issued threshold instead of reconstructing it
-- later with an app-side hard-coded percentage.
alter table public.student_practice_attempts
  add column if not exists passed boolean,
  add column if not exists pass_marks numeric;

-- Existing challenge sittings were all issued by the app with a 40% target.
-- This is a one-time historical backfill; new rows store the API verdict.
update public.student_practice_attempts
set
  pass_marks = coalesce(pass_marks, total_marks * 0.4),
  passed = coalesce(
    passed,
    total_marks > 0 and total_score / total_marks >= 0.4
  )
where source = 'challenge'
  and (passed is null or pass_marks is null);

drop function if exists public.record_student_challenge_grade(
  uuid, uuid, uuid, numeric, numeric
);

create or replace function public.record_student_challenge_grade(
  target_user_id uuid,
  target_challenge_id uuid,
  target_attempt_id uuid,
  earned_score numeric,
  available_marks numeric,
  did_pass boolean
)
returns setof public.student_challenges
language sql
security definer
set search_path = public
as $$
  update public.student_challenges
  set
    status = case
      when status = 'completed' or did_pass then 'completed'
      else 'started'
    end,
    completed_at = case
      when status = 'completed' or did_pass
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

revoke all on function public.record_student_challenge_grade(
  uuid, uuid, uuid, numeric, numeric, boolean
) from public, anon, authenticated;
grant execute on function public.record_student_challenge_grade(
  uuid, uuid, uuid, numeric, numeric, boolean
) to service_role;

-- Rebuild the dashboard RPC so pass rate comes from the stored API verdict.
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
    select
      user_id,
      (timezone('Asia/Kathmandu', completed_at))::date as completion_date
    from public.student_challenges
    where status = 'completed' and completed_at is not null
    group by user_id, (timezone('Asia/Kathmandu', completed_at))::date
  ),
  numbered_days as (
    select
      user_id,
      completion_date,
      completion_date - row_number() over (
        partition by user_id order by completion_date
      )::integer as streak_group
    from completed_days
  ),
  streak_groups as (
    select
      user_id,
      count(*)::integer as streak_length,
      max(completion_date) as streak_end
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
      and (timezone('Asia/Kathmandu', challenge.completed_at))::date
        between params.today - 6 and params.today
    group by challenge.user_id
  ),
  ranked_weekly as (
    select
      user_id,
      completed,
      rank() over (order by completed desc) as weekly_rank
    from weekly_completions
  ),
  viewer_challenges as (
    select
      exists (
        select 1 from public.student_challenges where user_id = target_user_id
      ) as has_history,
      exists (
        select 1
        from public.student_challenges challenge
        cross join params
        where challenge.user_id = target_user_id
          and (timezone('Asia/Kathmandu', challenge.completed_at))::date = params.today
          and challenge.status = 'completed'
      ) as completed_today,
      count(*) filter (
        where challenge.status = 'completed'
          and (timezone('Asia/Kathmandu', challenge.completed_at))::date
            between params.today - 6 and params.today
      )::bigint as week_passed,
      count(*) filter (
        where challenge.status = 'completed'
          and (timezone('Asia/Kathmandu', challenge.completed_at))::date
            >= date_trunc('month', params.today)::date
          and (timezone('Asia/Kathmandu', challenge.completed_at))::date <= params.today
      )::bigint as month_passed
    from params
    left join public.student_challenges challenge on challenge.user_id = target_user_id
    group by params.today
  ),
  viewer_attempts as (
    select
      count(*) filter (
        where (timezone('Asia/Kathmandu', attempt.created_at))::date
          between params.today - 29 and params.today
      )::bigint as recent_attempts,
      count(*) filter (
        where (timezone('Asia/Kathmandu', attempt.created_at))::date
          between params.today - 29 and params.today
          and attempt.passed is true
      )::bigint as recent_passed,
      avg(attempt.total_score / nullif(attempt.total_marks, 0) * 100) filter (
        where (timezone('Asia/Kathmandu', attempt.created_at))::date
          between params.today - 6 and params.today
      ) as current_score_average,
      avg(attempt.total_score / nullif(attempt.total_marks, 0) * 100) filter (
        where (timezone('Asia/Kathmandu', attempt.created_at))::date
          between params.today - 13 and params.today - 7
      ) as previous_score_average
    from params
    left join public.student_practice_attempts attempt
      on attempt.user_id = target_user_id and attempt.source = 'challenge'
    group by params.today
  ),
  platform as (
    select
      coalesce((select max(best_streak) from user_streaks), 0)::integer as historical_best_streak,
      coalesce((select max(completed) from weekly_completions), 0)::bigint as top_weekly
  )
  select
    challenges.has_history,
    challenges.completed_today,
    coalesce(streak.current_streak, 0)::integer,
    case when coalesce(streak.current_streak, 0) > 0 then streak.current_rank else null end,
    coalesce(streak.best_streak, 0)::integer,
    platform.historical_best_streak,
    greatest(platform.historical_best_streak - coalesce(streak.current_streak, 0), 0)::integer,
    challenges.week_passed::numeric / 7,
    weekly.weekly_rank,
    platform.top_weekly::numeric / 7,
    challenges.week_passed,
    challenges.month_passed,
    attempts.recent_attempts,
    attempts.recent_passed,
    case
      when attempts.current_score_average is not null
        and attempts.previous_score_average is not null
        then attempts.current_score_average - attempts.previous_score_average
      else null
    end
  from viewer_challenges challenges
  cross join viewer_attempts attempts
  cross join platform
  left join ranked_streaks streak on streak.user_id = target_user_id
  left join ranked_weekly weekly on weekly.user_id = target_user_id;
$$;

revoke all on function public.get_student_challenge_metrics(uuid) from public, anon, authenticated;
grant execute on function public.get_student_challenge_metrics(uuid) to service_role;
