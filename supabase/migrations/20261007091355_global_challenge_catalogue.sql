-- Keep reserve auditing independent of material-revision checks. A restart or
-- a dropped refill must not leave a topic permanently short of unseen papers.
alter table public.challenge_topic_pool add column if not exists reserve_checked_at timestamptz;
create index if not exists challenge_topic_pool_reserve_check_idx
  on public.challenge_topic_pool (reserve_checked_at nulls first, id) where status = 'ready';

-- Discover untouched micro-topics in bounded batches. Only the server can enqueue
-- work; existing ready content, leases and failure backoff are left intact.
create or replace function public.enqueue_global_challenge_catalogue(p_limit integer default 200)
returns integer
language sql
security invoker
set search_path = ''
as $$
  with candidates as (
    select c.study_course_id as course_id, s.teacher_id,
           s.id as community_subject_id, s.external_subject_slug as subject_slug,
           s.name as subject_name, t.topic_key, t.title as topic_title, t.position
    from public.community_subject_topics t
    join public.community_subjects s on s.id = t.community_subject_id
    join public.communities c on c.id = s.community_id
    cross join lateral (
      select trim(regexp_replace(lower(regexp_replace(t.topic_key, '\.[a-zA-Z0-9]{1,8}$', '')), '[^a-z0-9]+', ' ', 'g')) as key_words,
             trim(regexp_replace(lower(regexp_replace(t.title, '\.[a-zA-Z0-9]{1,8}$', '')), '[^a-z0-9]+', ' ', 'g')) as title_words,
             trim(regexp_replace(lower(regexp_replace(s.name, '\.[a-zA-Z0-9]{1,8}$', '')), '[^a-z0-9]+', ' ', 'g')) as subject_words
    ) words
    where c.status = 'active' and c.study_course_id is not null
      and s.status = 'active' and s.publication_status = 'published'
      and s.teacher_id is not null and coalesce(s.external_subject_slug, '') <> ''
      and trim(t.topic_key) <> ''
      and not exists (
        select 1 from unnest(array['qb', 'question bank', 'syllabus', 'text book', 'textbook']) suffix
        where words.key_words in (suffix, words.subject_words || ' ' || suffix)
           or words.title_words in (suffix, words.subject_words || ' ' || suffix)
      )
      and not exists (
        select 1 from public.challenge_topic_pool p
        where p.course_id = c.study_course_id
          and p.subject_slug = s.external_subject_slug and p.topic_key = t.topic_key
      )
    order by t.position, c.id, s.id, t.topic_key
    limit greatest(0, least(coalesce(p_limit, 200), 1000))
  ), inserted as (
    insert into public.challenge_topic_pool (
      course_id, teacher_id, community_subject_id, subject_slug, subject_name,
      topic_key, topic_title, position, priority
    )
    select course_id, teacher_id, community_subject_id, subject_slug, subject_name,
           topic_key, topic_title, position, 10 from candidates
    on conflict (course_id, subject_slug, topic_key) do nothing
    returning id
  )
  select count(*)::integer from inserted;
$$;
revoke all on function public.enqueue_global_challenge_catalogue(integer) from public, anon, authenticated;
grant execute on function public.enqueue_global_challenge_catalogue(integer) to service_role;
