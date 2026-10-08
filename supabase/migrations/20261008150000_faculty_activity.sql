-- Who did what to a faculty, and through which subdomain (user, 2026-10-08:
-- "the faculty is managed by whom and who can add to that faculty should be
-- all tracked").
--
-- Written by the server with the service role (lib/data/faculty-activity.ts)
-- after it has checked the actor's scope, plus one trigger for subjects so a
-- subject added from ANY path (creator workspace, admin panel) is recorded with
-- its `created_by`. Names are copied onto the row so the history still reads
-- after a faculty, site or person is gone.

create table if not exists public.faculty_activity (
  id bigint generated always as identity primary key,
  community_id uuid references public.communities(id) on delete set null,
  community_name text,
  -- No FK: a deleted subdomain's history stays.
  site_slug text,
  actor_id uuid references auth.users(id) on delete set null,
  action text not null check (char_length(action) between 3 and 60),
  summary text not null check (char_length(summary) between 1 and 500),
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists faculty_activity_community_idx
  on public.faculty_activity (community_id, created_at desc);
create index if not exists faculty_activity_site_idx
  on public.faculty_activity (site_slug, created_at desc);
create index if not exists faculty_activity_actor_idx
  on public.faculty_activity (actor_id, created_at desc);
create index if not exists faculty_activity_recent_idx
  on public.faculty_activity (created_at desc);

alter table public.faculty_activity enable row level security;
revoke all on public.faculty_activity from anon, authenticated;
grant all on public.faculty_activity to service_role;

-- Subjects: every insert, and archive/restore, whoever made it.
create or replace function public.log_community_subject_activity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  faculty_name text;
begin
  select name into faculty_name from public.communities where id = new.community_id;
  if tg_op = 'INSERT' then
    insert into public.faculty_activity (community_id, community_name, actor_id, action, summary, details)
    values (
      new.community_id, faculty_name, new.created_by, 'subject.added',
      format('Added subject %s', new.name),
      jsonb_build_object('subjectId', new.id, 'subject', new.name, 'termId', new.term_id)
    );
  elsif tg_op = 'UPDATE' and new.status is distinct from old.status then
    insert into public.faculty_activity (community_id, community_name, actor_id, action, summary, details)
    values (
      new.community_id, faculty_name, null,
      case when new.status = 'active' then 'subject.restored' else 'subject.archived' end,
      format('%s subject %s', case when new.status = 'active' then 'Restored' else 'Archived' end, new.name),
      jsonb_build_object('subjectId', new.id, 'subject', new.name, 'from', old.status, 'to', new.status)
    );
  end if;
  return new;
end;
$$;

drop trigger if exists community_subjects_activity on public.community_subjects;
create trigger community_subjects_activity
  after insert or update of status on public.community_subjects
  for each row execute function public.log_community_subject_activity();

-- Ownership: whoever ends up holding the faculty, by any path (emailed
-- transfer, support fix). The new owner is the actor — they accepted it.
create or replace function public.log_community_owner_activity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.creator_id is distinct from old.creator_id then
    insert into public.faculty_activity (community_id, community_name, actor_id, action, summary, details)
    values (
      new.id, new.name, new.creator_id, 'faculty.owner_changed',
      format('Ownership of %s moved to a new creator', new.name),
      jsonb_build_object('fromUserId', old.creator_id, 'userId', new.creator_id)
    );
  end if;
  return new;
end;
$$;

drop trigger if exists communities_owner_activity on public.communities;
create trigger communities_owner_activity
  after update of creator_id on public.communities
  for each row execute function public.log_community_owner_activity();

-- History that already exists in other tables, so the page is not empty on day one.
insert into public.faculty_activity (community_id, community_name, actor_id, action, summary, created_at)
select c.id, c.name, c.creator_id, 'faculty.created', format('Created faculty %s', c.name), c.created_at
from public.communities c
where not exists (
  select 1 from public.faculty_activity a where a.community_id = c.id and a.action = 'faculty.created'
);

insert into public.faculty_activity (community_id, community_name, actor_id, action, summary, details, created_at)
select s.community_id, c.name, s.created_by, 'subject.added', format('Added subject %s', s.name),
       jsonb_build_object('subjectId', s.id, 'subject', s.name, 'termId', s.term_id), s.created_at
from public.community_subjects s
join public.communities c on c.id = s.community_id
where not exists (
  select 1 from public.faculty_activity a
  where a.action = 'subject.added' and a.details->>'subjectId' = s.id::text
);

insert into public.faculty_activity (community_id, community_name, actor_id, action, summary, details, created_at)
select s.community_id, c.name, null, 'subject.published', format('Published subject %s', s.name),
       jsonb_build_object('subjectId', s.id, 'subject', s.name), s.published_at
from public.community_subjects s
join public.communities c on c.id = s.community_id
where s.published_at is not null
  and not exists (
    select 1 from public.faculty_activity a
    where a.action = 'subject.published' and a.details->>'subjectId' = s.id::text
  );

insert into public.faculty_activity (site_slug, actor_id, action, summary, details, created_at)
select sa.site_slug, sa.assigned_by, 'site.admin_added', 'Added a subdomain admin',
       jsonb_build_object('userId', sa.user_id), sa.assigned_at
from public.landing_site_admins sa
where not exists (
  select 1 from public.faculty_activity a
  where a.action = 'site.admin_added' and a.site_slug = sa.site_slug
    and a.details->>'userId' = sa.user_id::text
);
