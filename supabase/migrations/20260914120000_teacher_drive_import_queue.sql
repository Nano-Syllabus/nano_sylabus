-- Importing a Drive link stops being something the creator has to sit and watch.
--
-- It used to run in the browser: resolve the link, then one request per file,
-- each fetching the bytes from Drive and waiting out a synchronous PDF/OCR index
-- on the tenant side. A twenty-file folder therefore meant twenty serial requests
-- with a dialog that could not be closed, and closing it — or a laptop lid, or a
-- dropped connection — lost every file that had not been reached yet.
--
-- The work is now a durable queue. The browser enqueues what it wants and leaves;
-- a drain worker takes one row at a time and does the same import the dialog used
-- to do, writing the outcome back here. The UI reads this table, so progress and
-- failure survive a reload, a redeploy and a different device.

create table if not exists public.teacher_drive_imports (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references public.teachers(id) on delete cascade,

  -- WHAT WAS ASKED FOR. The queue carries the link, the Drive file id and the
  -- destination folder, so a row is a complete instruction: a worker picking it
  -- up needs nothing from the session that enqueued it.
  source_link text not null default '',
  drive_file_id text not null,
  file_name text not null default '',
  mime_type text not null default '',
  size_bytes bigint not null default 0 check (size_bytes >= 0),
  destination_path text not null,
  shelf text not null default '',

  -- WHERE IT GOT TO.
  status text not null default 'queued'
    check (status in ('queued', 'importing', 'done', 'failed')),
  attempts integer not null default 0 check (attempts >= 0),
  error text not null default '',
  warning text not null default '',
  document_id text not null default '',
  job_id text not null default '',

  claimed_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now())
);

-- The drain's own query: oldest queued row first, for this creator.
create index if not exists teacher_drive_imports_pending_idx
  on public.teacher_drive_imports (teacher_id, created_at)
  where status in ('queued', 'importing');

-- What the dialog polls.
create index if not exists teacher_drive_imports_recent_idx
  on public.teacher_drive_imports (teacher_id, created_at desc);

-- A double-submitted dialog must not import the same file into the same folder
-- twice. Scoped to rows still in flight, so importing it again next week — after
-- the creator has replaced it in Drive — is still allowed.
create unique index if not exists teacher_drive_imports_active_unique
  on public.teacher_drive_imports (teacher_id, drive_file_id, destination_path)
  where status in ('queued', 'importing');

alter table public.teacher_drive_imports enable row level security;

-- Every read and write goes through the service role in an API route that has
-- already resolved the creator from their session; there is no client-side path
-- to this table, so no permissive policy is granted.
drop policy if exists "teacher_drive_imports_select_own" on public.teacher_drive_imports;
create policy "teacher_drive_imports_select_own"
  on public.teacher_drive_imports for select
  using (
    exists (
      select 1 from public.teachers
      where teachers.id = teacher_drive_imports.teacher_id
        and teachers.user_id = auth.uid()
    )
  );

/**
 * Take the next import for one creator, atomically.
 *
 * `for update skip locked` is what makes it safe to run more than one drain at a
 * time — two workers racing get two different rows rather than the same one
 * twice. Serverless invocations overlap routinely (a creator enqueues, then
 * enqueues again before the first drain has finished), so this is the normal
 * case and not a corner one.
 *
 * It also reclaims a row left `importing` by a worker that died — a function
 * timeout, a redeploy mid-import. Without that a single killed invocation would
 * park one file forever. `stale_after` is deliberately generous: an import that
 * is merely slow must not be handed to a second worker while the first is still
 * going, because both would then upload the same document.
 */
create or replace function public.claim_teacher_drive_import(
  target_teacher_id uuid,
  stale_after interval default interval '10 minutes'
)
returns setof public.teacher_drive_imports
language sql
volatile
security definer
set search_path = public
as $$
  update public.teacher_drive_imports
  set
    status = 'importing',
    attempts = attempts + 1,
    claimed_at = timezone('utc'::text, now()),
    updated_at = timezone('utc'::text, now())
  where id = (
    select id
    from public.teacher_drive_imports
    where teacher_id = target_teacher_id
      and (
        status = 'queued'
        or (
          status = 'importing'
          and claimed_at is not null
          and claimed_at < timezone('utc'::text, now()) - stale_after
          -- Three goes at a file that keeps killing its worker is enough; after
          -- that it stays put and is reported rather than retried forever.
          and attempts < 3
        )
      )
    order by created_at
    limit 1
    for update skip locked
  )
  returning *;
$$;

revoke all on function public.claim_teacher_drive_import(uuid, interval)
  from public, anon, authenticated;
grant execute on function public.claim_teacher_drive_import(uuid, interval)
  to service_role;

-- A row that was claimed too many times is a failure, not a permanently pending
-- import. Reported to the creator on the next status read.
create or replace function public.expire_teacher_drive_imports(
  target_teacher_id uuid,
  stale_after interval default interval '10 minutes'
)
returns setof public.teacher_drive_imports
language sql
volatile
security definer
set search_path = public
as $$
  update public.teacher_drive_imports
  set
    status = 'failed',
    error = case when error = '' then 'The import stopped partway through. Try it again.' else error end,
    finished_at = timezone('utc'::text, now()),
    updated_at = timezone('utc'::text, now())
  where teacher_id = target_teacher_id
    and status = 'importing'
    and attempts >= 3
    and claimed_at is not null
    and claimed_at < timezone('utc'::text, now()) - stale_after
  returning *;
$$;

revoke all on function public.expire_teacher_drive_imports(uuid, interval)
  from public, anon, authenticated;
grant execute on function public.expire_teacher_drive_imports(uuid, interval)
  to service_role;
