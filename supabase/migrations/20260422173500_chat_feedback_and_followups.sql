alter table public.chat_messages
  add column if not exists feedback text check (feedback in ('up', 'down')),
  add column if not exists follow_up_suggestions text[] not null default '{}';

drop policy if exists "chat_messages_update_own" on public.chat_messages;
create policy "chat_messages_update_own"
on public.chat_messages
for update
to authenticated
using (
  exists (
    select 1
    from public.chat_sessions s
    where s.id = session_id
      and s.user_id = auth.uid()
  )
)
with check (
  exists (
    select 1
    from public.chat_sessions s
    where s.id = session_id
      and s.user_id = auth.uid()
  )
);

