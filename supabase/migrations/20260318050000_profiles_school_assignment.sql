ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS school_id UUID REFERENCES public.schools(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS profiles_school_id_idx
  ON public.profiles(school_id);

CREATE TABLE IF NOT EXISTS public.user_school_map (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
  school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS user_school_map_school_id_idx
  ON public.user_school_map(school_id);

ALTER TABLE public.user_school_map ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "User school map viewable by admins or self" ON public.user_school_map;
CREATE POLICY "User school map viewable by admins or self" ON public.user_school_map
  FOR SELECT
  USING (
    public.has_role(auth.uid(), 'super_admin') OR
    public.has_role(auth.uid(), 'admin') OR
    auth.uid() = user_id
  );

DROP POLICY IF EXISTS "User school map manageable by admins" ON public.user_school_map;
CREATE POLICY "User school map manageable by admins" ON public.user_school_map
  FOR ALL
  USING (
    public.has_role(auth.uid(), 'super_admin') OR
    public.has_role(auth.uid(), 'admin')
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'super_admin') OR
    public.has_role(auth.uid(), 'admin')
  );
