alter table public.chat_sessions
  add column if not exists subject_tags text[] not null default '{}';

alter table public.chat_sessions
  add column if not exists subject_context text;

create index if not exists chat_sessions_subject_tags_idx
  on public.chat_sessions using gin (subject_tags);
