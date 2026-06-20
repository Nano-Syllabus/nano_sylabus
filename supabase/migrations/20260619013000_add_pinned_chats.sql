ALTER TABLE public.chat_sessions
ADD COLUMN IF NOT EXISTS is_pinned BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS chat_sessions_user_pinned_updated_idx
ON public.chat_sessions (user_id, is_pinned DESC, updated_at DESC);
