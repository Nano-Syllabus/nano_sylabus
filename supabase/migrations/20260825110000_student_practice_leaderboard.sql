-- One compact row per student per Kathmandu calendar day. This is the source
-- of truth for challenge leaderboards; individual answer content is never
-- exposed to other students.
create table if not exists public.student_daily_practice_activity (
  user_id uuid not null references auth.users(id) on delete cascade,
  activity_date date not null,
  attempt_count integer not null default 0 check (attempt_count >= 0),
  completed_count integer not null default 0 check (completed_count >= 0),
  primary key (user_id, activity_date)
);

create index if not exists student_daily_practice_activity_date_idx
  on public.student_daily_practice_activity (activity_date desc);

alter table public.student_daily_practice_activity enable row level security;

-- These aggregate rows are read only by authenticated server routes using the
-- service role. Students receive only their own values and anonymous ranks.
create or replace function public.record_student_daily_practice_activity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  completed integer := case
    when new.total_marks > 0 and new.total_score / new.total_marks >= 0.5 then 1
    else 0
  end;
begin
  insert into public.student_daily_practice_activity (
    user_id,
    activity_date,
    attempt_count,
    completed_count
  )
  values (
    new.user_id,
    (new.created_at at time zone 'Asia/Kathmandu')::date,
    1,
    completed
  )
  on conflict (user_id, activity_date) do update
  set attempt_count = student_daily_practice_activity.attempt_count + 1,
      completed_count = student_daily_practice_activity.completed_count + excluded.completed_count;

  return new;
end;
$$;

drop trigger if exists record_student_daily_practice_activity_after_insert
  on public.student_practice_attempts;
create trigger record_student_daily_practice_activity_after_insert
after insert on public.student_practice_attempts
for each row execute function public.record_student_daily_practice_activity();

-- Make leaderboard stats available immediately for attempts made before this
-- feature existed. The upsert keeps this migration safe to rerun.
insert into public.student_daily_practice_activity (
  user_id,
  activity_date,
  attempt_count,
  completed_count
)
select
  attempt.user_id,
  (attempt.created_at at time zone 'Asia/Kathmandu')::date,
  count(*)::integer,
  count(*) filter (
    where attempt.total_marks > 0 and attempt.total_score / attempt.total_marks >= 0.5
  )::integer
from public.student_practice_attempts attempt
group by attempt.user_id, (attempt.created_at at time zone 'Asia/Kathmandu')::date
on conflict (user_id, activity_date) do update
set attempt_count = excluded.attempt_count,
    completed_count = excluded.completed_count;
