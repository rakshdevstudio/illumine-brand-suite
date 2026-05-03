-- School portal support tables and profile extensions

CREATE OR REPLACE FUNCTION public.current_school_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.school_id
  FROM public.profiles p
  WHERE p.id = auth.uid()
  LIMIT 1;
$$;

ALTER TABLE public.schools
  ADD COLUMN IF NOT EXISTS logo_url text,
  ADD COLUMN IF NOT EXISTS address text,
  ADD COLUMN IF NOT EXISTS coordinator_name text,
  ADD COLUMN IF NOT EXISTS phone text,
  ADD COLUMN IF NOT EXISTS email text,
  ADD COLUMN IF NOT EXISTS gstin text,
  ADD COLUMN IF NOT EXISTS delivery_terms text;

ALTER TABLE public.classes
  ADD COLUMN IF NOT EXISTS section text,
  ADD COLUMN IF NOT EXISTS strength integer,
  ADD COLUMN IF NOT EXISTS class_teacher text;

CREATE TABLE IF NOT EXISTS public.school_uniform_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  rule_type text NOT NULL CHECK (rule_type IN ('mandatory', 'optional', 'seasonal', 'sports', 'house')),
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (school_id, product_id, rule_type)
);

CREATE TABLE IF NOT EXISTS public.school_announcements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  title text NOT NULL,
  message text NOT NULL,
  announcement_type text NOT NULL DEFAULT 'general' CHECK (announcement_type IN ('deadline', 'measurement', 'sports', 'offer', 'general')),
  channel_portal boolean NOT NULL DEFAULT true,
  channel_email boolean NOT NULL DEFAULT false,
  channel_whatsapp boolean NOT NULL DEFAULT false,
  published_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.school_uniform_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.school_announcements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS school_uniform_rules_school_select ON public.school_uniform_rules;
CREATE POLICY school_uniform_rules_school_select ON public.school_uniform_rules
FOR SELECT TO authenticated
USING (
  public.is_illume_team_user()
  OR school_id = public.current_school_id()
);

DROP POLICY IF EXISTS school_uniform_rules_school_write ON public.school_uniform_rules;
CREATE POLICY school_uniform_rules_school_write ON public.school_uniform_rules
FOR ALL TO authenticated
USING (
  public.is_illume_team_user()
  OR school_id = public.current_school_id()
)
WITH CHECK (
  public.is_illume_team_user()
  OR school_id = public.current_school_id()
);

DROP POLICY IF EXISTS school_announcements_school_select ON public.school_announcements;
CREATE POLICY school_announcements_school_select ON public.school_announcements
FOR SELECT TO authenticated
USING (
  public.is_illume_team_user()
  OR school_id = public.current_school_id()
);

DROP POLICY IF EXISTS school_announcements_school_write ON public.school_announcements;
CREATE POLICY school_announcements_school_write ON public.school_announcements
FOR ALL TO authenticated
USING (
  public.is_illume_team_user()
  OR school_id = public.current_school_id()
)
WITH CHECK (
  public.is_illume_team_user()
  OR school_id = public.current_school_id()
);

CREATE INDEX IF NOT EXISTS school_uniform_rules_school_idx ON public.school_uniform_rules(school_id, rule_type, is_active);
CREATE INDEX IF NOT EXISTS school_announcements_school_idx ON public.school_announcements(school_id, published_at DESC);
