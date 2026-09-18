-- A daily-prize entry belongs to the challenge's assigned Nepal calendar day.
-- Completing an older challenge today must not qualify for today's draw.
create or replace function public.capture_cash_prize_daily_entry()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  qualified_time timestamptz;
  qualified_day date;
  snapshot_name text;
  snapshot_email text;
begin
  if new.status <> 'completed' then
    return new;
  end if;

  if tg_op = 'UPDATE' and old.status = 'completed' then
    return new;
  end if;

  qualified_time := coalesce(new.completed_at, timezone('utc'::text, now()));
  qualified_day := (qualified_time at time zone 'Asia/Kathmandu')::date;

  -- Only the challenge assigned for this Nepal day can enter this day's draw.
  if new.challenge_date <> qualified_day then
    return new;
  end if;

  select
    coalesce(
      nullif(btrim(profile.full_name), ''),
      nullif(btrim(account.raw_user_meta_data->>'full_name'), ''),
      nullif(split_part(account.email, '@', 1), ''),
      'Student'
    ),
    coalesce(account.email, '')
  into snapshot_name, snapshot_email
  from auth.users account
  left join public.student_profiles profile on profile.user_id = account.id
  where account.id = new.user_id;

  insert into public.cash_prize_daily_entries (
    entry_date,
    user_id,
    student_name,
    student_email,
    qualified_at,
    challenge_id
  )
  values (
    new.challenge_date,
    new.user_id,
    coalesce(snapshot_name, 'Student'),
    coalesce(snapshot_email, ''),
    qualified_time,
    new.id
  )
  on conflict (entry_date, user_id) do nothing;

  return new;
end;
$$;

-- Remove entries created from a challenge completed outside its assigned day.
delete from public.cash_prize_daily_entries entry
using public.student_challenges challenge
where entry.challenge_id = challenge.id
  and (
    entry.entry_date <> challenge.challenge_date
    or challenge.completed_at is null
    or (challenge.completed_at at time zone 'Asia/Kathmandu')::date
      <> challenge.challenge_date
  );

-- Rebuild any valid same-day entries that may have been hidden by an earlier
-- invalid entry for the same user/day.
insert into public.cash_prize_daily_entries (
  entry_date,
  user_id,
  student_name,
  student_email,
  qualified_at,
  challenge_id
)
select
  candidate.entry_date,
  candidate.user_id,
  candidate.student_name,
  candidate.student_email,
  candidate.qualified_at,
  candidate.challenge_id
from (
  select distinct on (challenge.user_id, challenge.challenge_date)
    challenge.challenge_date as entry_date,
    challenge.user_id,
    coalesce(
      nullif(btrim(profile.full_name), ''),
      nullif(btrim(account.raw_user_meta_data->>'full_name'), ''),
      nullif(split_part(account.email, '@', 1), ''),
      'Student'
    ) as student_name,
    coalesce(account.email, '') as student_email,
    challenge.completed_at as qualified_at,
    challenge.id as challenge_id
  from public.student_challenges challenge
  join auth.users account on account.id = challenge.user_id
  left join public.student_profiles profile on profile.user_id = challenge.user_id
  where challenge.status = 'completed'
    and challenge.completed_at is not null
    and (challenge.completed_at at time zone 'Asia/Kathmandu')::date
      = challenge.challenge_date
  order by
    challenge.user_id,
    challenge.challenge_date,
    challenge.completed_at,
    challenge.id
) candidate
on conflict (entry_date, user_id) do nothing;

revoke all on function public.capture_cash_prize_daily_entry() from public, anon, authenticated;
grant execute on function public.capture_cash_prize_daily_entry() to service_role;

notify pgrst, 'reload schema';
