begin;

-- A self-editable profile must never become an admin credential.
-- Role changes are restricted to trusted database/server operations.
create or replace function public.protect_profile_admin_role()
returns trigger language plpgsql set search_path = public as $$
begin
  if current_user in ('anon', 'authenticated') then
    if tg_op = 'INSERT' then
      if new.role <> 'student' then
        raise exception 'Role assignment requires a trusted administrator' using errcode = '42501';
      end if;
    elsif new.role is distinct from old.role or new.user_id is distinct from old.user_id then
      raise exception 'Profile ownership and role cannot be changed here' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists protect_profile_admin_role on public.student_profiles;
create trigger protect_profile_admin_role before insert or update on public.student_profiles
for each row execute function public.protect_profile_admin_role();

-- Operational metadata only: no prompts, answers, keys, URLs, or personal data.
create table if not exists public.platform_api_requests (
  id uuid primary key default gen_random_uuid(),
  service text not null check (service in ('tenant', 'collection')),
  started_at timestamptz not null,
  recorded_at timestamptz not null default now(),
  succeeded boolean not null,
  duration_ms integer not null check (duration_ms >= 0)
);
create index if not exists platform_api_requests_started_idx
  on public.platform_api_requests (started_at);
alter table public.platform_api_requests enable row level security;
revoke all on public.platform_api_requests from public, anon, authenticated;
grant select, insert on public.platform_api_requests to service_role;

-- One consistent snapshot. This function is NOT callable with a browser key.
-- No missing-table catch, fake sample data, or zero-on-error behavior.
create or replace function public.get_platform_admin_analytics()
returns jsonb language sql stable security definer set search_path = public, pg_temp as $$
with
clock as (select now() as at, (now() at time zone 'Asia/Kathmandu')::date as today),
users as (
  select id, (created_at at time zone 'Asia/Kathmandu')::date as day
  from auth.users, clock where created_at <= clock.at and not coalesce(is_anonymous, false)
),
growth as (
  select days,
    (select count(*) from users, clock where day between today - (days - 1) and today) as current_count,
    (select count(*) from users, clock where day between today - (2 * days - 1) and today - days) as previous_count
  from (values (1), (7), (30)) as windows(days)
),
passed as (
  select c.id, c.user_id, (c.completed_at at time zone 'Asia/Kathmandu')::date as day
  from public.student_challenges c, clock
  where c.status = 'completed' and c.completed_at is not null and c.completed_at <= clock.at
),
challenge_attempts as (
  select passed, (created_at at time zone 'Asia/Kathmandu')::date as day
  from public.student_practice_attempts, clock
  where source = 'challenge' and passed is not null and created_at <= clock.at
),
teacher_grades as (
  select id, student_id as user_id, created_at,
    case when jsonb_typeof(grade->'total_score') = 'number' then (grade->>'total_score')::numeric end as score,
    case when jsonb_typeof(grade->'total_marks') = 'number' then (grade->>'total_marks')::numeric end as marks
  from public.teacher_exam_submissions
  where grade->>'graded' = 'true'
),
exams as (
  -- Teacher mastery mirrors are deliberately excluded; count the original once.
  -- Challenge sittings have their own metrics, not Mock Exam metrics.
  select user_id, (created_at at time zone 'Asia/Kathmandu')::date as day,
    total_score as score, total_marks as marks, 'practice' as source
  from public.student_practice_attempts, clock
  where source = 'practice' and created_at <= clock.at
  union all
  select user_id, (created_at at time zone 'Asia/Kathmandu')::date, score, marks, 'teacher_exam'
  from teacher_grades, clock where created_at <= clock.at
),
valid_scores as (
  select *, score * 100.0 / marks as percentage from exams
  where marks > 0 and score >= 0 and score <= marks
),
payments as (
  select i.id, i.amount, i.currency,
    (p.reviewed_at at time zone 'Asia/Kathmandu')::date as day
  from public.invoices i
  join public.payment_submissions p on p.invoice_id = i.id
  cross join clock
  where i.status = 'paid' and p.status = 'approved' and i.amount > 0
    and p.reviewed_at is not null and p.reviewed_at <= clock.at
),
daily as (
  select today - offset_days as day from clock, generate_series(0, 29) as offset_days
),
weekly_people as (
  select user_id, count(*) as n from passed, clock
  where day between today - 6 and today group by user_id
)
select jsonb_build_object(
  'generatedAt', clock.at,
  'timezone', 'Asia/Kathmandu',
  'users', jsonb_build_object(
    'total', (select count(*) from users),
    'growth', (select jsonb_agg(jsonb_build_object('days', days, 'current', current_count,
      'previous', previous_count, 'percentChange',
      (current_count - previous_count) * 100.0 / nullif(previous_count, 0)) order by days) from growth)
  ),
  'content', jsonb_build_object(
    'subjects', (select count(*) from public.teacher_subject_profiles),
    'courses', (select count(*) from public.teacher_courses),
    'publishedCourses', (select count(*) from public.teacher_courses where status = 'published'),
    'subjectsPerUser', (select count(*) from public.teacher_subject_profiles)::numeric / nullif((select count(*) from users), 0)
  ),
  'requests', jsonb_build_object(
    'recorded', (select count(*) from public.platform_api_requests),
    'failed', (select count(*) from public.platform_api_requests where not succeeded),
    'trackedSince', (select min(started_at) from public.platform_api_requests),
    'chatMessages', (select count(*) from public.chat_messages where role = 'user')
  ),
  'challenges', jsonb_build_object(
    'passed', (select count(*) from passed),
    'today', (select count(*) from passed where day = clock.today),
    'last7', (select count(*) from passed where day between today - 6 and today),
    'averagePerDay', (select count(*) from passed where day between today - 6 and today) / 7.0,
    'topStudentPerDay', coalesce((select max(n) / 7.0 from weekly_people), 0),
    'bestDay', coalesce((select max(n) from (select count(*) n from passed group by day) counts), 0),
    'gradedAttempts30', (select count(*) from challenge_attempts where day between today - 29 and today),
    'passedAttempts30', (select count(*) from challenge_attempts where day between today - 29 and today and passed)
  ),
  'exams', jsonb_build_object(
    'completed', (select count(*) from exams),
    'today', (select count(*) from exams where day = clock.today),
    'practice', (select count(*) from exams where source = 'practice'),
    'teacher', (select count(*) from exams where source = 'teacher_exam'),
    'perUser', (select count(*) from exams where user_id in (select id from users))::numeric / nullif((select count(*) from users), 0),
    'averagePercent', (select avg(percentage) from valid_scores),
    'scored', (select count(*) from valid_scores)
  ),
  'revenue', jsonb_build_object(
    'currencies', (select coalesce(jsonb_agg(row order by row->>'currency'), '[]'::jsonb) from (
      select jsonb_build_object('currency', currency, 'total', sum(amount),
        'today', coalesce(sum(amount) filter (where day = clock.today), 0), 'payments', count(*)) as row
      from payments group by currency
    ) totals),
    'unreconciledPaidInvoices', (select count(*) from public.invoices i
      where i.status = 'paid' and i.amount > 0 and not exists (select 1 from payments p where p.id = i.id))
  ),
  'daily', (select jsonb_agg(jsonb_build_object(
    'date', d.day,
    'newUsers', (select count(*) from users where day = d.day),
    'challengesPassed', (select count(*) from passed where day = d.day),
    'examsCompleted', (select count(*) from exams where day = d.day),
    'revenue', (select coalesce(jsonb_agg(jsonb_build_object('currency', currency, 'amount', amount) order by currency), '[]'::jsonb)
      from (select currency, sum(amount) as amount from payments where day = d.day group by currency) sums)
  ) order by d.day desc) from daily d)
) from clock;
$$;

revoke all on function public.get_platform_admin_analytics() from public, anon, authenticated;
grant execute on function public.get_platform_admin_analytics() to service_role;
notify pgrst, 'reload schema';
commit;
