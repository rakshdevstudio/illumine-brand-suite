
-- Drop existing narrow policies that might conflict
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;

-- Profiles: admins can see all, users see own
CREATE POLICY "Profiles viewable by admins or self" ON public.profiles
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin') OR public.has_role(auth.uid(), 'admin') OR auth.uid() = id);

CREATE POLICY "Profiles updatable by admins" ON public.profiles
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin') OR public.has_role(auth.uid(), 'admin') OR auth.uid() = id);

CREATE POLICY "Profiles insertable" ON public.profiles
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Profiles deletable by super_admin" ON public.profiles
  FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'));

-- User roles: admins can manage
DROP POLICY IF EXISTS "Users can view own roles" ON public.user_roles;

CREATE POLICY "Roles viewable by admins or self" ON public.user_roles
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin') OR public.has_role(auth.uid(), 'admin') OR auth.uid() = user_id);

CREATE POLICY "Roles insertable by admins" ON public.user_roles
  FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'super_admin') OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Roles updatable by super_admin" ON public.user_roles
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'));

CREATE POLICY "Roles deletable by super_admin" ON public.user_roles
  FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'));

-- Update existing admin to super_admin
UPDATE public.user_roles SET role = 'super_admin' WHERE user_id = '9960f3a0-cc16-4299-a3b3-3afcf9681c64';

-- Helper: check if user has any admin-level role
CREATE OR REPLACE FUNCTION public.is_admin(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role IN ('super_admin', 'admin')
  )
$$;

-- Helper: get user role as text
CREATE OR REPLACE FUNCTION public.get_user_role(_user_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role::text FROM public.user_roles WHERE user_id = _user_id LIMIT 1
$$;
