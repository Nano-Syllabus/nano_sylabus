-- A faculty can have one or more student ambassadors (user, 2026-10-08),
-- alongside its creator and the admins of the subdomains that list it. Super
-- admins assign them from the Faculties page. Being a faculty's ambassador
-- also puts the person's email on the global `student_ambassadors` list (the
-- app does that), so they can open the Student Ambassador workspace.
-- Only the service role touches this table.
create table public.faculty_ambassadors (
  community_id uuid not null references public.communities(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  added_by uuid references auth.users(id) on delete set null,
  added_at timestamptz not null default now(),
  primary key (community_id, user_id)
);
create index faculty_ambassadors_user_idx on public.faculty_ambassadors(user_id);

alter table public.faculty_ambassadors enable row level security;
revoke all on public.faculty_ambassadors from public, anon, authenticated;
grant all on public.faculty_ambassadors to service_role;
notify pgrst, 'reload schema';
