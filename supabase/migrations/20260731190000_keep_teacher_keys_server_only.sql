-- Collection keys authorize every operation in a teacher's private RAG
-- collection. Keep them behind server actions instead of exposing the row
-- through the browser's authenticated Supabase client.
DROP POLICY IF EXISTS "Users can view own teacher profile" ON public.teachers;
DROP POLICY IF EXISTS "Users can create own teacher profile" ON public.teachers;
DROP POLICY IF EXISTS "Users can update own teacher profile" ON public.teachers;
