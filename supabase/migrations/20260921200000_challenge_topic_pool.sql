-- The global challenge pool: every topic's challenge material, prepared once per
-- course and ahead of the students who will reach it.
--
-- WHY A TABLE
-- -----------
-- A challenge's past questions, worked answers and concepts reading depend on
-- the course and the topic, never on the student. They were nevertheless built
-- per student row, from the request path, and every piece of dedupe that stopped
-- two students paying for the same topic was a per-process Map — lost on every
-- serverless instance and every deploy. The hub's warm-ups were the result: one
-- `past-questions` call per subject per page view, several instances doing it at
-- once, and a tenant API that logged nothing for minutes while it ground through
-- them (see lib/data/student-challenges.ts, `warmupGate`).
--
-- This is the one place that knows, across every instance, which topics are
-- ready, which are being built, and which have failed and when to try again.
-- Students are filled from a `ready` row with no upstream call at all; only the
-- paper, which is theirs alone, is still issued per student.
--
-- WHAT FILLS IT
-- -------------
-- Rows are ENQUEUED from request paths (publishing a subject, a student starting
-- or finishing a challenge, the Challenge Hub loading) and PREPARED by
-- `sweepChallengePool` (lib/data/challenge-pool.ts), which a timer on the app
-- VPS calls through POST /api/internal/challenge-pool/sweep every few minutes.
-- Preparation is `POST /v1/collection/challenge/prepare` on the course API: it
-- either hands back the topic's whole bank (`ready`) or says a job is running
-- (`building`), and the next sweep polls again.
--
-- Nothing here is readable from the browser. Every read and write is the server
-- with the service role.

create table if not exists public.challenge_topic_pool (
  id uuid primary key default gen_random_uuid(),

  -- WHICH TOPIC. The same key a `student_challenges` row carries, so a student's
  -- row finds its topic here by (course_id, subject_slug, topic_key).
  course_id uuid not null references public.teacher_courses(id) on delete cascade,
  -- The creator whose collection the material is read from.
  teacher_id uuid not null references public.teachers(id) on delete cascade,
  community_subject_id uuid references public.community_subjects(id) on delete cascade,
  subject_slug text not null,
  -- What the course API is asked for: the subject by its name, as every other
  -- challenge call names it.
  subject_name text not null default '',
  topic_key text not null,
  topic_title text not null default '',
  -- Syllabus order (`community_subject_topics.position`). Within one priority the
  -- earlier topic is prepared first, which is the order students reach them in.
  position integer not null default 0 check (position >= 0),

  -- WHERE IT GOT TO.
  status text not null default 'queued'
    check (status in ('queued', 'building', 'ready', 'stale', 'failed', 'unavailable')),
  -- Higher first. A topic a student has on screen outranks one a student is
  -- about to reach, which outranks one nobody has reached yet.
  priority smallint not null default 0,

  -- WHAT IT HOLDS. `content` is the whole topic bank as the course API returned
  -- it (past questions, worked answers, reading, topics); a student's challenge
  -- is cut from it. `revision` identifies that bank, `collection_revision` the
  -- material it was built from — a changed material revision makes a ready row
  -- `stale` and it is prepared again.
  revision text,
  collection_revision text,
  content jsonb,
  manifest jsonb,

  -- FAILURE. `attempts` counts failed preparations since the last success; the
  -- sweep backs off exponentially and gives up (`unavailable`) after six.
  attempts integer not null default 0 check (attempts >= 0),
  last_error text,

  requested_at timestamptz not null default now(),
  started_at timestamptz,
  prepared_at timestamptz,
  next_attempt_at timestamptz,
  -- When `collection_revision` was last confirmed against the course API.
  checked_at timestamptz,

  -- THE LEASE. A sweep that claims a row owns it until `lease_expires_at`; a
  -- sweep that died (a timeout, a deploy) simply lets it lapse and the next one
  -- takes the row over.
  lease_owner text,
  lease_expires_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (course_id, subject_slug, topic_key)
);

-- The claim's own order.
create index if not exists challenge_topic_pool_claim_idx
  on public.challenge_topic_pool (status, priority desc, position);

-- The revision check walks the least recently confirmed subjects first.
create index if not exists challenge_topic_pool_checked_idx
  on public.challenge_topic_pool (checked_at nulls first)
  where status in ('ready', 'unavailable');

-- Service role only. RLS on with no policy: an authenticated student has no
-- path to this table at all, and nothing about it belongs in a browser.
alter table public.challenge_topic_pool enable row level security;
revoke all on public.challenge_topic_pool from anon, authenticated;

/**
 * Take up to `p_limit` topics to prepare, atomically.
 *
 * `for update skip locked` is what lets several sweeps run at once — the VPS
 * timer and a sweep kicked from a request can overlap — and still never prepare
 * the same topic twice: a second sweep racing the first is handed different
 * rows, or none. The lease it writes is what keeps a claimed row from being
 * taken again once the transaction commits.
 *
 * Claimable:
 *   - `queued` and `stale` rows, unless they were parked until later;
 *   - `failed` rows whose backoff has elapsed;
 *   - `building` rows whose lease has lapsed — either a sweep that died, or a
 *     row the course API said was still building, whose short lease is how the
 *     next sweep knows to poll it again.
 *
 * `prior_status` is what the row was before this claim, so the caller can tell
 * a first preparation from a refresh of a stale one.
 */
create or replace function public.claim_challenge_topic_pool(
  p_owner text,
  p_limit integer default 6,
  p_lease_seconds integer default 180
)
returns table (
  id uuid,
  course_id uuid,
  teacher_id uuid,
  community_subject_id uuid,
  subject_slug text,
  subject_name text,
  topic_key text,
  topic_title text,
  "position" integer,
  priority smallint,
  status text,
  prior_status text,
  attempts integer,
  revision text,
  collection_revision text,
  prepared_at timestamptz,
  lease_owner text,
  lease_expires_at timestamptz
)
language sql
volatile
security definer
set search_path = public
as $$
  with picked as (
    select pool.id, pool.status as prior_status
    from public.challenge_topic_pool pool
    where (
        pool.status in ('queued', 'stale')
        and (pool.next_attempt_at is null or pool.next_attempt_at <= now())
      )
      or (
        pool.status = 'failed'
        and (pool.next_attempt_at is null or pool.next_attempt_at <= now())
      )
      or (
        pool.status = 'building'
        and (pool.lease_expires_at is null or pool.lease_expires_at <= now())
      )
    order by pool.priority desc, pool.position asc, pool.requested_at asc
    limit greatest(coalesce(p_limit, 0), 0)
    for update skip locked
  )
  update public.challenge_topic_pool pool
  set
    status = 'building',
    lease_owner = p_owner,
    lease_expires_at = now() + make_interval(secs => greatest(coalesce(p_lease_seconds, 180), 30)),
    started_at = now(),
    updated_at = now()
  from picked
  where pool.id = picked.id
  returning
    pool.id,
    pool.course_id,
    pool.teacher_id,
    pool.community_subject_id,
    pool.subject_slug,
    pool.subject_name,
    pool.topic_key,
    pool.topic_title,
    pool.position,
    pool.priority,
    pool.status,
    picked.prior_status,
    pool.attempts,
    pool.revision,
    pool.collection_revision,
    pool.prepared_at,
    pool.lease_owner,
    pool.lease_expires_at;
$$;

revoke all on function public.claim_challenge_topic_pool(text, integer, integer)
  from public, anon, authenticated;
grant execute on function public.claim_challenge_topic_pool(text, integer, integer)
  to service_role;

notify pgrst, 'reload schema';
