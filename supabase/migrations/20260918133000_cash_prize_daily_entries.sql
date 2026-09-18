-- Every student who completes at least one challenge in a Nepal calendar day
-- receives exactly one durable daily-prize entry. The trigger keeps this true
-- regardless of which server route records the passing grade.
create table if not exists public.cash_prize_daily_entries (
  id uuid primary key default gen_random_uuid(),
  entry_date date not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  student_name text not null,
  student_email text not null,
  qualified_at timestamptz not null,
  challenge_id uuid references public.student_challenges(id) on delete set null,
  created_at timestamptz not null default timezone('utc'::text, now()),
  unique (entry_date, user_id)
);

create index if not exists cash_prize_daily_entries_date_idx
  on public.cash_prize_daily_entries (entry_date desc, qualified_at asc);

alter table public.cash_prize_daily_entries enable row level security;

drop policy if exists cash_prize_daily_entries_admin_select
  on public.cash_prize_daily_entries;
create policy cash_prize_daily_entries_admin_select
  on public.cash_prize_daily_entries
  for select
  to authenticated
  using (public.is_admin());

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

  if tg_op = 'UPDATE' then
    if old.status = 'completed' then
      return new;
    end if;
  end if;

  qualified_time := coalesce(new.completed_at, timezone('utc'::text, now()));
  qualified_day := (qualified_time at time zone 'Asia/Kathmandu')::date;

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
    qualified_day,
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

drop trigger if exists capture_cash_prize_daily_entry
  on public.student_challenges;
create trigger capture_cash_prize_daily_entry
after insert or update of status, completed_at
on public.student_challenges
for each row
execute function public.capture_cash_prize_daily_entry();

-- Preserve historical eligibility as well. If a student completed multiple
-- challenges that day, the earliest completion is the single lottery entry.
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
  select distinct on (
    challenge.user_id,
    (challenge.completed_at at time zone 'Asia/Kathmandu')::date
  )
    (challenge.completed_at at time zone 'Asia/Kathmandu')::date as entry_date,
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
  order by
    challenge.user_id,
    (challenge.completed_at at time zone 'Asia/Kathmandu')::date,
    challenge.completed_at,
    challenge.id
) candidate
on conflict (entry_date, user_id) do nothing;

revoke all on function public.capture_cash_prize_daily_entry() from public, anon, authenticated;
grant execute on function public.capture_cash_prize_daily_entry() to service_role;

notify pgrst, 'reload schema';
