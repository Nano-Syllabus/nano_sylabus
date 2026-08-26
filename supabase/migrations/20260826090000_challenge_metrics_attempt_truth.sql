-- Challenge completion/streak metrics come from durable challenge objects,
-- while pass rate and score movement come from every durable challenge
-- sitting. A challenge that fails twice and passes once is therefore 1/3,
-- not one completed challenge divided by three attempts by accident.
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
          and attempt.total_marks > 0
          and attempt.total_score / attempt.total_marks >= 0.4
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
