alter table if exists public.chat_sessions
  add column if not exists share_token text,
  add column if not exists shared_at timestamptz;

create unique index if not exists chat_sessions_share_token_idx
  on public.chat_sessions(share_token)
  where share_token is not null;
