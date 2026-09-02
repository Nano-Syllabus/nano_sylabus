-- Connect community structure to the existing indexed-subject and student
-- learning engines. All changes are additive so legacy teacher courses keep
-- working while a community receives one hidden compatibility course.

alter table public.communities
  add column if not exists study_course_id uuid references public.teacher_courses(id) on delete set null,
  add column if not exists learning_status text not null default 'pending',
  add column if not exists learning_error text,
  add column if not exists learning_ready_at timestamptz;

alter table public.communities
  drop constraint if exists communities_learning_status_check;
alter table public.communities
  add constraint communities_learning_status_check
  check (learning_status in ('pending', 'ready', 'error'));

create unique index if not exists communities_study_course_unique
  on public.communities (study_course_id)
  where study_course_id is not null;

alter table public.community_subjects
  add column if not exists teacher_id uuid references public.teachers(id) on delete set null,
  add column if not exists external_subject_slug text,
  add column if not exists folder_path text not null default '',
  add column if not exists topic_sync_status text not null default 'pending',
  add column if not exists topic_synced_at timestamptz,
  add column if not exists topic_sync_error text;

alter table public.community_subjects
  drop constraint if exists community_subjects_topic_sync_status_check;
alter table public.community_subjects
  add constraint community_subjects_topic_sync_status_check
  check (topic_sync_status in ('pending', 'ready', 'empty', 'error'));

create unique index if not exists community_subjects_external_owner_unique
  on public.community_subjects (teacher_id, external_subject_slug)
  where teacher_id is not null and external_subject_slug is not null;

create table if not exists public.community_subject_topics (
  id uuid primary key default gen_random_uuid(),
  community_subject_id uuid not null references public.community_subjects(id) on delete cascade,
  topic_key text not null,
  title text not null,
  blurb text not null default '',
  unit_number text,
  position integer not null default 0 check (position >= 0),
  source text not null default 'indexed_material',
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now()),
  unique (community_subject_id, topic_key)
);

create index if not exists community_subject_topics_order_idx
  on public.community_subject_topics (community_subject_id, position);

create table if not exists public.student_xp_ledger (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  event_key text not null,
  points integer not null check (points between -10000 and 10000 and points <> 0),
  reason text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc'::text, now()),
  unique (user_id, event_key)
);

create index if not exists student_xp_ledger_user_idx
  on public.student_xp_ledger (user_id, created_at desc);

create table if not exists public.community_posts (
  id uuid primary key default gen_random_uuid(),
  community_id uuid not null references public.communities(id) on delete cascade,
  subject_id uuid not null references public.community_subjects(id) on delete cascade,
  author_id uuid not null references auth.users(id) on delete cascade,
  post_type text not null default 'resource',
  title text not null check (char_length(trim(title)) between 3 and 160),
  body text not null default '' check (char_length(body) <= 4000),
  shelf text not null default 'Question Bank',
  attachment_bucket text,
  attachment_path text,
  attachment_name text,
  attachment_mime_type text,
  attachment_size_bytes bigint check (attachment_size_bytes is null or attachment_size_bytes >= 0),
  status text not null default 'pending',
  vote_count integer not null default 0 check (vote_count >= 0),
  threshold_reached_at timestamptz,
  merged_at timestamptz,
  merge_error text,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now()),
  constraint community_posts_scope_fk foreign key (subject_id, community_id)
    references public.community_subjects(id, community_id) on delete cascade,
  constraint community_posts_type_check check (post_type in ('resource', 'discussion')),
  constraint community_posts_shelf_check check (shelf in ('Syllabus', 'Notes', 'Question Bank')),
  constraint community_posts_status_check check (status in ('pending', 'merge_pending', 'merged', 'merge_error', 'hidden'))
);

create index if not exists community_posts_subject_idx
  on public.community_posts (subject_id, created_at desc);

create table if not exists public.community_post_votes (
  post_id uuid not null references public.community_posts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default timezone('utc'::text, now()),
  primary key (post_id, user_id)
);

create table if not exists public.community_post_reports (
  post_id uuid not null references public.community_posts(id) on delete cascade,
  reporter_id uuid not null references auth.users(id) on delete cascade,
  reason text not null check (char_length(trim(reason)) between 3 and 500),
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now()),
  primary key (post_id, reporter_id)
);

create table if not exists public.community_merge_events (
  id uuid primary key default gen_random_uuid(),
  community_id uuid not null references public.communities(id) on delete cascade,
  subject_id uuid not null references public.community_subjects(id) on delete cascade,
  post_id uuid not null references public.community_posts(id) on delete cascade,
  event_type text not null check (event_type in ('threshold_reached', 'merge_started', 'merged', 'merge_failed', 'hidden')),
  actor_id uuid references auth.users(id) on delete set null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc'::text, now())
);

create index if not exists community_merge_events_post_idx
  on public.community_merge_events (post_id, created_at);

insert into storage.buckets (id, name, public, file_size_limit)
values ('community-contributions', 'community-contributions', false, 20971520)
on conflict (id) do update
set public = false, file_size_limit = excluded.file_size_limit;

create or replace function public.vote_community_post(
  target_user_id uuid,
  target_post_id uuid
)
returns table (post_id uuid, vote_count integer, threshold integer, should_merge boolean, status text)
language plpgsql
security definer
set search_path = public
as $$
declare
  matched_post public.community_posts%rowtype;
  required_votes integer;
  inserted_vote integer;
  crossed boolean := false;
begin
  select post.* into matched_post
  from public.community_posts post
  where post.id = target_post_id
  for update;

  if matched_post.id is null or matched_post.status = 'hidden' then
    raise exception 'Post not found.' using errcode = 'P0002';
  end if;
  if not exists (
    select 1 from public.community_memberships membership
    where membership.community_id = matched_post.community_id
      and membership.user_id = target_user_id
      and membership.status = 'active'
  ) then
    raise exception 'Join the community before voting.' using errcode = '42501';
  end if;

  insert into public.community_post_votes (post_id, user_id)
  values (target_post_id, target_user_id)
  on conflict do nothing;
  get diagnostics inserted_vote = row_count;

  select count(*)::integer into matched_post.vote_count
  from public.community_post_votes vote
  where vote.post_id = target_post_id;
  select contribution_threshold into required_votes
  from public.communities where id = matched_post.community_id;

  if matched_post.vote_count >= required_votes
    and matched_post.post_type = 'resource'
    and matched_post.attachment_path is not null
    and (
      (inserted_vote = 1 and matched_post.status = 'pending')
      or matched_post.status = 'merge_error'
    ) then
    crossed := true;
    update public.community_posts
    set vote_count = matched_post.vote_count,
        status = 'merge_pending',
        threshold_reached_at = coalesce(threshold_reached_at, timezone('utc'::text, now())),
        merge_error = null,
        updated_at = timezone('utc'::text, now())
    where id = target_post_id;
    if matched_post.threshold_reached_at is null then
      insert into public.community_merge_events (
        community_id, subject_id, post_id, event_type, actor_id,
        details
      ) values (
        matched_post.community_id, matched_post.subject_id, matched_post.id,
        'threshold_reached', target_user_id,
        jsonb_build_object('votes', matched_post.vote_count, 'threshold', required_votes)
      );
    end if;
  else
    update public.community_posts
    set vote_count = matched_post.vote_count,
        updated_at = timezone('utc'::text, now())
    where id = target_post_id;
  end if;

  return query select target_post_id, matched_post.vote_count, required_votes, crossed,
    case when crossed then 'merge_pending' else matched_post.status end;
end;
$$;

-- Replace the grade recorder with the same challenge semantics plus an
-- idempotent +50 XP event the first time a challenge becomes completed.
create or replace function public.record_student_challenge_grade(
  target_user_id uuid,
  target_challenge_id uuid,
  target_attempt_id uuid,
  earned_score numeric,
  available_marks numeric,
  did_pass boolean
)
returns setof public.student_challenges
language plpgsql
security definer
set search_path = public
as $$
declare
  was_completed boolean;
begin
  select status = 'completed' into was_completed
  from public.student_challenges
  where id = target_challenge_id and user_id = target_user_id
  for update;

  if not found then return; end if;

  update public.student_challenges
  set status = case when status = 'completed' or did_pass then 'completed' else 'started' end,
      completed_at = case when status = 'completed' or did_pass
        then coalesce(completed_at, timezone('utc'::text, now())) else completed_at end,
      attempt_count = attempt_count + 1,
      last_score = earned_score,
      last_total_marks = available_marks,
      last_attempt_id = target_attempt_id,
      updated_at = timezone('utc'::text, now())
  where id = target_challenge_id and user_id = target_user_id;

  if did_pass and not coalesce(was_completed, false) then
    insert into public.student_xp_ledger (user_id, event_key, points, reason, metadata)
    values (
      target_user_id,
      'challenge:' || target_challenge_id::text,
      50,
      'Challenge completed',
      jsonb_build_object('challenge_id', target_challenge_id, 'score', earned_score, 'total_marks', available_marks)
    ) on conflict (user_id, event_key) do nothing;
  end if;

  return query select * from public.student_challenges
  where id = target_challenge_id and user_id = target_user_id;
end;
$$;

revoke all on function public.vote_community_post(uuid, uuid) from public, anon, authenticated;
grant execute on function public.vote_community_post(uuid, uuid) to service_role;
revoke all on function public.record_student_challenge_grade(uuid, uuid, uuid, numeric, numeric, boolean)
  from public, anon, authenticated;
grant execute on function public.record_student_challenge_grade(uuid, uuid, uuid, numeric, numeric, boolean)
  to service_role;

alter table public.community_subject_topics enable row level security;
alter table public.student_xp_ledger enable row level security;
alter table public.community_posts enable row level security;
alter table public.community_post_votes enable row level security;
alter table public.community_post_reports enable row level security;
alter table public.community_merge_events enable row level security;

drop policy if exists community_subject_topics_select_members on public.community_subject_topics;
create policy community_subject_topics_select_members on public.community_subject_topics for select
using (exists (
  select 1 from public.community_subjects subject
  join public.community_memberships membership on membership.community_id = subject.community_id
  where subject.id = community_subject_id and membership.user_id = auth.uid() and membership.status = 'active'
));

drop policy if exists student_xp_ledger_select_own on public.student_xp_ledger;
create policy student_xp_ledger_select_own on public.student_xp_ledger for select
using (user_id = auth.uid());

drop policy if exists community_posts_select_members on public.community_posts;
create policy community_posts_select_members on public.community_posts for select
using (exists (
  select 1 from public.community_memberships membership
  where membership.community_id = community_posts.community_id
    and membership.user_id = auth.uid() and membership.status = 'active'
));

drop policy if exists community_post_votes_select_members on public.community_post_votes;
create policy community_post_votes_select_members on public.community_post_votes for select
using (exists (
  select 1 from public.community_posts post
  join public.community_memberships membership on membership.community_id = post.community_id
  where post.id = community_post_votes.post_id
    and membership.user_id = auth.uid() and membership.status = 'active'
));

drop policy if exists community_post_reports_select_own on public.community_post_reports;
create policy community_post_reports_select_own on public.community_post_reports for select
using (reporter_id = auth.uid());

drop policy if exists community_merge_events_select_members on public.community_merge_events;
create policy community_merge_events_select_members on public.community_merge_events for select
using (exists (
  select 1 from public.community_memberships membership
  where membership.community_id = community_merge_events.community_id
    and membership.user_id = auth.uid() and membership.status = 'active'
));
