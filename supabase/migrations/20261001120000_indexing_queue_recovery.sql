-- Retain the original request and uploaded path through retries and expiry.
alter table public.teacher_drive_imports
  add column if not exists queued_at timestamptz not null default now(),
  add column if not exists indexing_started_at timestamptz,
  add column if not exists collection_path text not null default '',
  add column if not exists next_attempt_at timestamptz not null default now(),
  add column if not exists expires_at timestamptz not null default (now() + interval '1 day');

-- Existing activities must not gain an extra day simply because we migrated.
update public.teacher_drive_imports set queued_at = created_at, expires_at = created_at + interval '1 day';
alter table public.teacher_drive_imports drop constraint if exists teacher_drive_imports_status_check;
alter table public.teacher_drive_imports add constraint teacher_drive_imports_status_check
  check (status in ('queued', 'importing', 'indexing', 'retry_wait', 'done', 'failed', 'expired'));
drop index if exists public.teacher_drive_imports_active_unique;
create unique index teacher_drive_imports_active_unique
  on public.teacher_drive_imports (teacher_id, drive_file_id, destination_path)
  where status in ('queued', 'importing', 'indexing', 'retry_wait');
create index if not exists teacher_drive_imports_due_idx
  on public.teacher_drive_imports (next_attempt_at, teacher_id)
  where status in ('queued', 'importing', 'indexing', 'retry_wait');

create or replace function public.expire_teacher_drive_imports(
  target_teacher_id uuid, stale_after interval default interval '10 minutes'
) returns setof public.teacher_drive_imports language plpgsql security definer set search_path = public as $$
begin
  -- A dead invocation is retried even if the UI still says importing. Never delete bytes.
  update teacher_drive_imports set status = 'retry_wait',
    error = 'The import worker stopped. Retrying from the saved file or Drive link.',
    next_attempt_at = now(), updated_at = now()
  where teacher_id = target_teacher_id and status = 'importing'
    and coalesce(claimed_at, created_at) < now() - stale_after and expires_at > now();
  return query update teacher_drive_imports set status = 'expired',
    error = 'This activity expired after 24 hours. Saved files and the Drive link are retained. Retry when ready.',
    finished_at = now(), updated_at = now()
  where teacher_id = target_teacher_id
    and status in ('queued', 'importing', 'indexing', 'retry_wait') and expires_at <= now()
  returning *;
end;
$$;

create or replace function public.claim_teacher_drive_import(
  target_teacher_id uuid, stale_after interval default interval '10 minutes'
) returns setof public.teacher_drive_imports language plpgsql security definer set search_path = public as $$
begin
  -- Serialise admission only, not the downloads. Limit overlapping drains to three globally to bound download memory.
  perform pg_advisory_xact_lock(hashtextextended('drive-import-admission', 0));
  perform public.expire_teacher_drive_imports(target_teacher_id, stale_after);
  if (select count(*) from teacher_drive_imports where status = 'importing'
      and claimed_at > now() - stale_after and expires_at > now()) >= 3 then
    return;
  end if;
  return query update teacher_drive_imports set status = 'importing', attempts = attempts + 1,
    claimed_at = now(), updated_at = now()
  where id = (
    select id from teacher_drive_imports where teacher_id = target_teacher_id
      and status in ('queued', 'retry_wait') and next_attempt_at <= now() and expires_at > now()
    order by queued_at limit 1 for update skip locked
  ) returning *;
end;
$$;
revoke all on function public.claim_teacher_drive_import(uuid, interval) from public, anon, authenticated;
revoke all on function public.expire_teacher_drive_imports(uuid, interval) from public, anon, authenticated;
grant execute on function public.claim_teacher_drive_import(uuid, interval) to service_role;
grant execute on function public.expire_teacher_drive_imports(uuid, interval) to service_role;

-- Student uploads are saved before Gemini triage. Closing a tab cannot cancel them.
create table if not exists public.material_contribution_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  teacher_id uuid not null references public.teachers(id) on delete cascade,
  course_id text,
  subject text not null,
  file_name text not null,
  storage_path text not null unique,
  status text not null default 'queued' check (status in ('uploading','queued','checking','retry_wait','indexing','accepted','rejected','failed','expired')),
  attempts integer not null default 0,
  error text not null default '',
  result jsonb,
  collection_path text not null default '',
  verdict jsonb,
  queued_at timestamptz not null default now(),
  started_at timestamptz,
  updated_at timestamptz not null default now(),
  finished_at timestamptz,
  next_attempt_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '1 day')
);
alter table public.material_contribution_jobs enable row level security;
create index if not exists material_contribution_jobs_pending_idx on public.material_contribution_jobs(next_attempt_at)
  where status in ('queued','checking','retry_wait','indexing');

create or replace function public.claim_material_contribution(target_user_id uuid default null)
returns setof public.material_contribution_jobs language plpgsql security definer set search_path = public as $$
begin
  update material_contribution_jobs set status='expired', finished_at=now(), updated_at=now(),
    error='This activity expired after 24 hours. Your file is saved; retry when ready.'
    where status in ('uploading','queued','checking','retry_wait','indexing') and expires_at <= now();
  update material_contribution_jobs set status='retry_wait', next_attempt_at=now(), updated_at=now()
    where status='checking' and started_at < now() - interval '10 minutes';
  perform pg_advisory_xact_lock(hashtextextended('material-contribution-admission', 0));
  if (select count(*) from material_contribution_jobs where status='checking') >= 3 then
    return;
  end if;
  return query update material_contribution_jobs set status='checking', attempts=attempts+1,
    started_at=now(), updated_at=now()
    where id=(select id from material_contribution_jobs
      where status in ('queued','retry_wait') and next_attempt_at <= now() and expires_at > now()
        and (target_user_id is null or user_id=target_user_id)
      order by queued_at limit 1 for update skip locked)
    returning *;
end;
$$;
revoke all on function public.claim_material_contribution(uuid) from public, anon, authenticated;
grant execute on function public.claim_material_contribution(uuid) to service_role;
