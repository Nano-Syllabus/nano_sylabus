alter table public.chat_messages
  add column if not exists admin_review_note text,
  add column if not exists admin_reviewed_at timestamptz,
  add column if not exists admin_reviewed_by uuid references auth.users(id) on delete set null;

drop policy if exists "chat_messages_update_own" on public.chat_messages;
