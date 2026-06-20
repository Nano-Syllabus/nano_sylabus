DROP POLICY IF EXISTS "chat_sessions_delete_own" ON public.chat_sessions;

CREATE POLICY "chat_sessions_delete_own"
ON public.chat_sessions
FOR DELETE
TO authenticated
USING (auth.uid() = user_id);
