CREATE TABLE public.teachers (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id) NOT NULL UNIQUE,
  handle text NOT NULL UNIQUE,
  collection_sk text NOT NULL,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- RLS (Security) Policies
ALTER TABLE public.teachers ENABLE ROW LEVEL SECURITY;

-- User can view own teacher profile
CREATE POLICY "Users can view own teacher profile"
ON public.teachers FOR SELECT
USING (auth.uid() = user_id);

-- The authenticated server action may create only the caller's own profile.
CREATE POLICY "Users can create own teacher profile"
ON public.teachers FOR INSERT
WITH CHECK (auth.uid() = user_id);
