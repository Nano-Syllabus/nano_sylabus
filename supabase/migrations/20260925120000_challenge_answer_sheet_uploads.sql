-- A challenge's handwritten answer sheet, collected before it is submitted.
--
-- Pages arrive from the desktop's own file picker OR from a phone that scanned
-- the QR on the upload screen: the phone holds only a short-lived bearer token
-- (stored hashed here, like billing_receipt_upload_sessions) and never signs in.
-- A sheet is several photos or one PDF. Files go straight from the device to
-- the private `challenge-answer-sheets` bucket through signed upload URLs, so a
-- 20 MB PDF never passes through an app request body.
--
-- On submit the photos are joined into one PDF, graded, and the session keeps
-- `sheet_path`: the answer sheet stays attached to the challenge it answered.

create table if not exists public.challenge_answer_sheet_sessions (
  id uuid primary key default gen_random_uuid(),
  token_hash text not null unique,
  challenge_id uuid not null references public.student_challenges(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'open'
    check (status in ('open', 'submitted', 'expired')),
  -- The PDF that was graded: the uploaded one, or the photos joined into one.
  sheet_path text,
  expires_at timestamptz not null,
  submitted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists challenge_answer_sheet_sessions_challenge_idx
  on public.challenge_answer_sheet_sessions(user_id, challenge_id, created_at desc);

drop trigger if exists set_challenge_answer_sheet_sessions_updated_at
  on public.challenge_answer_sheet_sessions;
create trigger set_challenge_answer_sheet_sessions_updated_at
before update on public.challenge_answer_sheet_sessions
for each row execute procedure public.set_current_timestamp_updated_at();

-- One row per file. A row of its own rather than a JSON array on the session:
-- the phone and the desktop add pages at the same time, and two appends to one
-- array race where two inserts do not.
create table if not exists public.challenge_answer_sheet_pages (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.challenge_answer_sheet_sessions(id) on delete cascade,
  storage_path text not null unique,
  mime_type text not null check (mime_type in ('image/jpeg', 'application/pdf')),
  original_name text not null default '',
  size_bytes integer not null default 0,
  -- `pending` from the moment an upload URL is handed out until the device says
  -- the file landed and the server has checked it is there.
  status text not null default 'pending' check (status in ('pending', 'ready')),
  source text not null default 'desktop' check (source in ('desktop', 'phone')),
  created_at timestamptz not null default now()
);

create index if not exists challenge_answer_sheet_pages_session_idx
  on public.challenge_answer_sheet_pages(session_id, created_at);

alter table public.challenge_answer_sheet_sessions enable row level security;
alter table public.challenge_answer_sheet_pages enable row level security;

-- No browser-facing policies: the signed-in desktop API and the token-
-- authenticated phone API check access themselves and use the service role.
revoke all on public.challenge_answer_sheet_sessions from anon, authenticated;
revoke all on public.challenge_answer_sheet_pages from anon, authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'challenge-answer-sheets',
  'challenge-answer-sheets',
  false,
  20971520,
  array['image/jpeg', 'application/pdf']
)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;
