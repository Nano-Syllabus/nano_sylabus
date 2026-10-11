-- Only handoff metadata lives here. JPEGs go directly to private VPS storage;
-- PDFs are assembled in memory and use the existing VPS document upload.
create table public.content_camera_sessions (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references public.teachers(id) on delete cascade,
  token_hash text not null unique check (length(token_hash) = 64),
  title text not null,
  pages jsonb not null default '[]'::jsonb
    check (jsonb_typeof(pages) = 'array' and jsonb_array_length(pages) <= 120),
  revision integer not null default 0 check (revision >= 0),
  closed boolean not null default false,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '2 hours')
);
create index content_camera_sessions_teacher_idx on public.content_camera_sessions (teacher_id);
create index content_camera_sessions_expiry_idx on public.content_camera_sessions (expires_at);
alter table public.content_camera_sessions enable row level security;
-- Bearer links are verified by the server. Browser roles cannot inspect tokens
-- or edit the manifest through PostgREST; service_role is the only caller.
revoke all on public.content_camera_sessions from public, anon, authenticated;
grant all on public.content_camera_sessions to service_role;
