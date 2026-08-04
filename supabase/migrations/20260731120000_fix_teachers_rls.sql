DROP POLICY IF EXISTS "Service role can manage teachers" ON public.teachers;
DROP POLICY IF EXISTS "Users can create own teacher profile" ON public.teachers;

CREATE POLICY "Users can create own teacher profile"
ON public.teachers
FOR INSERT
WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own teacher profile" ON public.teachers;

CREATE POLICY "Users can update own teacher profile"
ON public.teachers
FOR UPDATE
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);
