-- Landing sites: the text of the landing page, one row per subdomain.
--
-- highschool.nanosyllabus.com → slug 'highschool'; the bare domain is 'main'.
-- Only TEXT is stored; the design is fixed in the app. `draft` is what the
-- admin editor saves, `content` is what visitors see, and Publish copies one
-- over the other. The app fills a missing 'main' row from its shipped
-- wording, so applying this migration changes nothing visible by itself.

create table if not exists public.landing_sites (
  slug text primary key
    check (slug ~ '^[a-z0-9]([a-z0-9-]{0,38}[a-z0-9])?$'),
  name text not null check (char_length(name) between 1 and 80),
  status text not null default 'hidden' check (status in ('live', 'hidden')),
  content jsonb not null default '{}'::jsonb,
  draft jsonb,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);

-- Service role only: the public page and the admin API both read through the
-- app's admin client, so no policies are granted.
alter table public.landing_sites enable row level security;
