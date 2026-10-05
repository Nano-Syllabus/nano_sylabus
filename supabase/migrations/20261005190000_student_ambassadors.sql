-- Student ambassadors: the only people who may create faculties. A super admin
-- adds an email (even before that person has signed up); the check is by the
-- signed-in account's email. Only the service role touches this table.
create table public.student_ambassadors (
  email text primary key check (email = lower(btrim(email)) and email like '%_@_%'),
  added_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.student_ambassadors enable row level security;
revoke all on public.student_ambassadors from public, anon, authenticated;
grant all on public.student_ambassadors to service_role;
notify pgrst, 'reload schema';
