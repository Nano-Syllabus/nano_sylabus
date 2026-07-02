alter table if exists public.chat_sessions
add column if not exists last_context_summary text not null default '';
