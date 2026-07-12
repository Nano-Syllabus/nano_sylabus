create or replace function public.set_chat_message_feedback(
  p_message_id uuid,
  p_feedback text
)
returns table(id uuid, feedback text)
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_feedback is not null and p_feedback not in ('up', 'down') then
    raise exception 'Invalid feedback value';
  end if;

  return query
  update public.chat_messages m
  set feedback = p_feedback
  where m.id = p_message_id
    and m.role = 'assistant'
    and exists (
      select 1
      from public.chat_sessions s
      where s.id = m.session_id
        and s.user_id = auth.uid()
    )
  returning m.id, m.feedback;
end;
$$;

revoke all on function public.set_chat_message_feedback(uuid, text) from public;
grant execute on function public.set_chat_message_feedback(uuid, text) to authenticated;
