-- Complete the daily rollup with enough information to calculate honest score
-- movement without loading individual attempts on every dashboard request.
alter table public.student_daily_practice_activity
  add column if not exists graded_attempt_count integer not null default 0
    check (graded_attempt_count >= 0),
  add column if not exists score_percentage_sum numeric not null default 0
    check (score_percentage_sum >= 0);

create or replace function public.record_student_daily_practice_activity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  completed integer;
  graded integer;
  score_percentage numeric;
  old_activity_date date;
  new_activity_date date;
begin
  -- Attempts are normally append-only, but account cleanup can remove them.
  -- Keep the aggregate canonical for inserts, corrections, and deletions.
  if tg_op in ('UPDATE', 'DELETE') then
    old_activity_date := (old.created_at at time zone 'Asia/Kathmandu')::date;
    completed := case
      when old.total_marks > 0 and old.total_score / old.total_marks >= 0.4 then 1
      else 0
    end;
    graded := case when old.total_marks > 0 then 1 else 0 end;
    score_percentage := case
      when old.total_marks > 0 then greatest(0, least(100, old.total_score / old.total_marks * 100))
      else 0
    end;

    update public.student_daily_practice_activity
    set attempt_count = greatest(attempt_count - 1, 0),
        completed_count = greatest(completed_count - completed, 0),
        graded_attempt_count = greatest(graded_attempt_count - graded, 0),
        score_percentage_sum = greatest(score_percentage_sum - score_percentage, 0)
    where user_id = old.user_id and activity_date = old_activity_date;

    delete from public.student_daily_practice_activity
    where user_id = old.user_id
      and activity_date = old_activity_date
      and attempt_count = 0;
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;

  new_activity_date := (new.created_at at time zone 'Asia/Kathmandu')::date;
  completed := case
    when new.total_marks > 0 and new.total_score / new.total_marks >= 0.4 then 1
    else 0
  end;
  graded := case when new.total_marks > 0 then 1 else 0 end;
  score_percentage := case
    when new.total_marks > 0 then greatest(0, least(100, new.total_score / new.total_marks * 100))
    else 0
  end;

  insert into public.student_daily_practice_activity (
    user_id,
    activity_date,
    attempt_count,
    completed_count,
    graded_attempt_count,
    score_percentage_sum
  )
  values (
    new.user_id,
    new_activity_date,
    1,
    completed,
    graded,
    score_percentage
  )
  on conflict (user_id, activity_date) do update
  set attempt_count = student_daily_practice_activity.attempt_count + 1,
      completed_count = student_daily_practice_activity.completed_count + excluded.completed_count,
      graded_attempt_count = student_daily_practice_activity.graded_attempt_count + excluded.graded_attempt_count,
      score_percentage_sum = student_daily_practice_activity.score_percentage_sum + excluded.score_percentage_sum;

  return new;
end;
$$;

drop trigger if exists student_practice_attempt_activity_insert
  on public.student_practice_attempts;
drop trigger if exists student_practice_attempt_activity_change
  on public.student_practice_attempts;
create trigger student_practice_attempt_activity_change
after insert or update or delete on public.student_practice_attempts
for each row execute function public.record_student_daily_practice_activity();

-- Rebuild every rollup row from its canonical attempt history. This also
-- fills the new columns for data that predates the leaderboard feature.
insert into public.student_daily_practice_activity (
  user_id,
  activity_date,
  attempt_count,
  completed_count,
  graded_attempt_count,
  score_percentage_sum
)
select
  attempt.user_id,
  (attempt.created_at at time zone 'Asia/Kathmandu')::date,
  count(*)::integer,
  count(*) filter (
    where attempt.total_marks > 0 and attempt.total_score / attempt.total_marks >= 0.4
  )::integer,
  count(*) filter (where attempt.total_marks > 0)::integer,
  coalesce(sum(
    case
      when attempt.total_marks > 0
        then greatest(0, least(100, attempt.total_score / attempt.total_marks * 100))
      else 0
    end
  ), 0)
from public.student_practice_attempts attempt
group by attempt.user_id, (attempt.created_at at time zone 'Asia/Kathmandu')::date
on conflict (user_id, activity_date) do update
set attempt_count = excluded.attempt_count,
    completed_count = excluded.completed_count,
    graded_attempt_count = excluded.graded_attempt_count,
    score_percentage_sum = excluded.score_percentage_sum;

-- Returns only the viewer's values and anonymous aggregate positions. The
-- service-role-only function avoids exposing another student's identity or
-- answer history while keeping ranks accurate beyond Supabase's row limit.
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
  active_days as (
    select user_id, activity_date
    from public.student_daily_practice_activity
    where completed_count > 0
  ),
  numbered_days as (
    select
      user_id,
      activity_date,
      activity_date - row_number() over (
        partition by user_id order by activity_date
      )::integer as streak_group
    from active_days
  ),
  streak_groups as (
    select
      user_id,
      count(*)::integer as streak_length,
      max(activity_date) as streak_end
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
    select
      activity.user_id,
      sum(activity.completed_count)::bigint as completed
    from public.student_daily_practice_activity activity
    cross join params
    where activity.activity_date between params.today - 6 and params.today
    group by activity.user_id
    having sum(activity.completed_count) > 0
  ),
  ranked_weekly as (
    select
      user_id,
      completed,
      rank() over (order by completed desc) as weekly_rank
    from weekly_completions
  ),
  viewer_activity as (
    select
      exists (
        select 1 from public.student_daily_practice_activity
        where user_id = target_user_id
      ) as has_history,
      coalesce(sum(activity.completed_count) filter (
        where activity.activity_date = params.today
      ), 0) > 0 as completed_today,
      coalesce(sum(activity.completed_count) filter (
        where activity.activity_date between params.today - 6 and params.today
      ), 0)::bigint as week_passed,
      coalesce(sum(activity.completed_count) filter (
        where activity.activity_date >= date_trunc('month', params.today)::date
          and activity.activity_date <= params.today
      ), 0)::bigint as month_passed,
      coalesce(sum(activity.attempt_count) filter (
        where activity.activity_date between params.today - 29 and params.today
      ), 0)::bigint as recent_attempts,
      coalesce(sum(activity.completed_count) filter (
        where activity.activity_date between params.today - 29 and params.today
      ), 0)::bigint as recent_passed,
      sum(activity.score_percentage_sum) filter (
        where activity.activity_date between params.today - 6 and params.today
      ) / nullif(sum(activity.graded_attempt_count) filter (
        where activity.activity_date between params.today - 6 and params.today
      ), 0) as current_score_average,
      sum(activity.score_percentage_sum) filter (
        where activity.activity_date between params.today - 13 and params.today - 7
      ) / nullif(sum(activity.graded_attempt_count) filter (
        where activity.activity_date between params.today - 13 and params.today - 7
      ), 0) as previous_score_average
    from params
    left join public.student_daily_practice_activity activity
      on activity.user_id = target_user_id
    group by params.today
  ),
  platform as (
    select
      coalesce((select max(current_streak) from user_streaks), 0)::integer as best_streak,
      coalesce((select max(completed) from weekly_completions), 0)::bigint as top_weekly
  )
  select
    viewer.has_history,
    viewer.completed_today,
    coalesce(streak.current_streak, 0)::integer,
    case when coalesce(streak.current_streak, 0) > 0 then streak.current_rank else null end,
    coalesce(streak.best_streak, 0)::integer,
    platform.best_streak,
    greatest(platform.best_streak - coalesce(streak.current_streak, 0), 0)::integer,
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
  from viewer_activity viewer
  cross join platform
  left join ranked_streaks streak on streak.user_id = target_user_id
  left join ranked_weekly weekly on weekly.user_id = target_user_id;
$$;

revoke all on function public.get_student_challenge_metrics(uuid) from public, anon, authenticated;
grant execute on function public.get_student_challenge_metrics(uuid) to service_role;
